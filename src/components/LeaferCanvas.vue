<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useDialog } from "naive-ui";
import {
  App,
  Rect,
  Text,
  Group,
  Box,
  PointerEvent,
  DragEvent,
  Ellipse,
  Line,
  Path,
} from "leafer-ui";
import "@leafer-in/export"; // Import export plugin
import { useProjectStore } from "../stores/projectStore";

const store = useProjectStore();
const dialog = useDialog();
const containerRef = ref<HTMLElement | null>(null);
let leaferApp: App | null = null;
let animationFrameId: number;
const animatingLines: Path[] = [];

// Connection Interaction State
const isConnecting = ref(false);
const connectingSourceId = ref<string | null>(null);
const connectingStartX = ref(0);
const connectingStartY = ref(0);
const selectedLine = ref<{ taskId: string; depId: string } | null>(null);
const handleGroup = new Group({ zIndex: 1005 });

watch(
  () => store.selectedElement,
  (newVal) => {
    if (!newVal || newVal.type !== "dependency") {
      selectedLine.value = null;
      handleGroup.clear();
    }
  }
);

// tempLine is now defined below

// Animation Loop
const startAnimationLoop = () => {
  const animate = () => {
    if (animatingLines.length > 0) {
      animatingLines.forEach((line) => {
        // Decrease offset to create flow effect
        const speed = 1;
        const current = line.dashOffset || 0;
        const next = current - speed;

        line.dashOffset = next;
      });
    }
    animationFrameId = requestAnimationFrame(animate);
  };
  animate();
};

// Constants
// const CANVAS_WIDTH = 2400
const HEADER_HEIGHT = 50;
const LANE_HEADER_WIDTH = 180;
// const LANE_HEIGHT = 200 // Minimum height, but fixed for now
const TASK_WIDTH = 140;
const TASK_HEIGHT = 80;
const TASK_GAP = 15;
const TURN_MARGIN = 30;

// Layout Calculation State
// We need to store task positions to draw lines
const lineMap = new Map<
  string,
  Array<{
    line: Path;
    arrow: Path;
    type: "incoming" | "outgoing";
    otherId: string;
  }>
>();
const taskPositions = new Map<
  string,
  { x: number; y: number; width: number; height: number; phaseId: string }
>();
const phaseBoundaries = new Map<string, { x: number; width: number }>();
const swimlaneBoundaries = new Map<string, { y: number; height: number }>();
let chartGroup: Group | null = null;
let currentGuideGroup: Group | null = null;
let lastContentWidth = 0;
let lastContentHeight = 0;
void lastContentWidth;
void lastContentHeight;

const initLeafer = () => {
  if (!containerRef.value) return;

  leaferApp = new App({
    view: containerRef.value,
    tree: {}, // Start with empty tree
    fill: "#f9f9f9", // Background color
    move: { scroll: true }, // Enable panning
    // zoom: { min: 0.2, max: 3 }, // Disable default zoom to handle it manually with wheel
  });

  // Enable canvas panning by dragging background
  leaferApp.tree.draggable = true;
  leaferApp.tree.add(handleGroup);

  // Add Wheel Event Listener for scrolling and zooming
  if (containerRef.value) {
    containerRef.value.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        e.preventDefault();

        if (e.ctrlKey || e.metaKey) {
          // Zoom
          const delta = -e.deltaY;
          const scaleStep = 0.1;
          const oldScale = leaferApp!.tree.scaleX || 1;
          let newScale = oldScale + (delta > 0 ? scaleStep : -scaleStep);
          newScale = Math.max(0.2, Math.min(3, newScale));

          // Zoom centered on mouse pointer
          const mouseX = e.offsetX;
          const mouseY = e.offsetY;

          // Calculate world point under mouse before zoom
          const currentX = leaferApp!.tree.x || 0;
          const currentY = leaferApp!.tree.y || 0;

          const worldX = (mouseX - currentX) / oldScale;
          const worldY = (mouseY - currentY) / oldScale;

          // Apply new scale
          leaferApp!.tree.scaleX = newScale;
          leaferApp!.tree.scaleY = newScale;

          // Adjust position to keep world point under mouse
          leaferApp!.tree.x = mouseX - worldX * newScale;
          leaferApp!.tree.y = mouseY - worldY * newScale;

          store.viewSettings.zoomLevel = newScale;
        } else {
          // Scroll (Pan)
          // Support horizontal scroll with Shift key if deltaX is 0 (standard mouse wheel)
          if (e.shiftKey && e.deltaX === 0) {
            if (leaferApp && leaferApp.tree)
              leaferApp.tree.x = (leaferApp.tree.x || 0) - e.deltaY;
          } else {
            if (leaferApp && leaferApp.tree) {
              leaferApp.tree.x = (leaferApp.tree.x || 0) - e.deltaX;
              leaferApp.tree.y = (leaferApp.tree.y || 0) - e.deltaY;
            }
          }
        }
      },
      { passive: false }
    );
  }

  // Sync zoom level from store
  leaferApp.tree.scaleX = store.viewSettings.zoomLevel;
  leaferApp.tree.scaleY = store.viewSettings.zoomLevel;

  leaferApp.tree.hitChildren = true;

  // Register Global Events for Connection once
  leaferApp.on(PointerEvent.MOVE, (e: PointerEvent) => {
    if (isConnecting.value && tempLine && leaferApp && leaferApp.tree) {
      // Convert view coordinates to world coordinates
      const inner = leaferApp.tree.getInnerPoint(e);

      const startX = connectingStartX.value;
      const startY = connectingStartY.value;
      const endX = inner.x;
      const endY = inner.y;
      const startSide = connectingStartSide.value;

      // Determine endSide based on direction
      const dx = endX - startX;
      const dy = endY - startY;
      let endSide = "left";
      if (Math.abs(dx) > Math.abs(dy)) {
        endSide = dx > 0 ? "left" : "right";
      } else {
        endSide = dy > 0 ? "top" : "bottom";
      }

      const cps = getCurveControlPoints(
        startX,
        startY,
        endX,
        endY,
        startSide,
        endSide
      );
      const pathData = getCurvePathData(startX, startY, endX, endY, cps);

      tempLine.path = pathData;

      // Update arrow
      if (tempArrow) {
        // Calculate angle from last control point
        let angle = 0;
        if (cps.length > 0) {
          const lastCP = cps[cps.length - 1]!;
          angle =
            (Math.atan2(endY - lastCP.y, endX - lastCP.x) * 180) / Math.PI;
        } else {
          angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;
        }

        const headLen = 12;
        const headAngle = Math.PI / 6; // 30 degrees
        const rad = (angle * Math.PI) / 180;

        const tipX = endX;
        const tipY = endY;

        const leftX = endX - headLen * Math.cos(rad - headAngle);
        const leftY = endY - headLen * Math.sin(rad - headAngle);

        const rightX = endX - headLen * Math.cos(rad + headAngle);
        const rightY = endY - headLen * Math.sin(rad + headAngle);

        tempArrow.x = 0;
        tempArrow.y = 0;
        tempArrow.rotation = 0;
        tempArrow.path = `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`;
      }
    }
  });

  leaferApp.on(PointerEvent.UP, (e: PointerEvent) => {
    if (isConnecting.value) {
      // Check if dropped on a port
      const target = e.target;
      if (target && target.data && target.data.type === "port") {
        const targetTaskId = target.data.taskId;
        if (connectingSourceId.value) {
          try {
            store.addDependency(connectingSourceId.value, targetTaskId);
          } catch (e: any) {
            dialog.error({
              title: "错误",
              content: e.message,
              positiveText: "确定",
              positiveButtonProps: { autofocus: true } as any,
            });
          }
        }
      }

      // Reset
      isConnecting.value = false;
      connectingSourceId.value = null;
      if (tempLine) tempLine.visible = false;
      if (tempArrow) tempArrow.visible = false;

      if (leaferApp && leaferApp.tree) {
        leaferApp.tree.draggable = true;
      }
    }
  });

  drawChart();
};

const updateHandleGroup = () => {
  // Ensure handleGroup is visible and in tree
  handleGroup.visible = true;
  handleGroup.zIndex = 2005; // Ensure it's above everything including tooltip/dragLayer if needed

  if (leaferApp && leaferApp.tree) {
    // Always bring to front when updating
    if (handleGroup.parent) {
      handleGroup.parent.remove(handleGroup);
    }
    leaferApp.tree.add(handleGroup);
  }

  handleGroup.clear();

  if (!selectedLine.value) return;

  const { taskId, depId } = selectedLine.value;
  // taskId is target, depId is source

  const task = store.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const sourceTask = store.tasks.find((t) => t.id === depId);
  if (!sourceTask) return;

  const dep = task.dependencies.find(
    (d) => (typeof d === "string" ? d : d.taskId) === depId
  );

  const sourcePos = taskPositions.get(depId);
  const targetPos = taskPositions.get(taskId);

  if (!sourcePos || !targetPos) return;

  // Explicitly handle dependency object vs string
  let forcedSource, forcedTarget, depType;
  let depObj = null;

  if (dep && typeof dep === "object") {
    forcedSource = dep.sourcePort;
    forcedTarget = dep.targetPort;
    depType = dep.type || "curve";
    depObj = dep;
  } else {
    // Default for string dependency
    depType = "curve";
  }

  const points = getBestConnectionPoints(
    sourcePos,
    targetPos,
    forcedSource,
    forcedTarget,
    sourceTask,
    task
  );

  if (depType === "curve") {
    // Curve Logic: Show Control Points
    const cps = getCurveControlPoints(
      points.startX,
      points.startY,
      points.endX,
      points.endY,
      points.startSide,
      points.endSide,
      depObj?.controlPoints,
      depObj?.controlPointCount
    );

    // Debug: Ensure we have points
    if (cps.length === 0) {
      console.warn("No control points generated for curve");
    }

    const r = 5;
    const handles: Ellipse[] = [];

    // Helper Lines
    // If 2 points: Start -> CP1, CP2 -> End
    // If 4 points: Start -> CP1, CP2 -> CP3, CP4 -> End (CP2 and CP3 are inner points, usually we connect CP1-CP2 and CP3-CP4? No, cubic bezier structure)
    // Actually, for 4 points (2 combined beziers):
    // Segment 1: Start -> CP1 -> CP2 -> Mid
    // Segment 2: Mid -> CP3 -> CP4 -> End
    // But visual helpers usually connect Control Point to its Anchor.
    // CP1 is for Start, CP2 is for Mid (incoming), CP3 is for Mid (outgoing), CP4 is for End.
    // So: Start -> CP1, CP2 -> CP3 (connected at mid?), CP4 -> End.

    // Let's simplify helpers:
    // CP1 connected to Start
    // CP4 connected to End
    // CP2 and CP3? They control the midpoint. Maybe connect CP2 -> CP3?

    const helperLine1 = new Line({
      points: [],
      stroke: "#E91E63",
      strokeWidth: 1,
      dashPattern: [3, 3],
    });
    const helperLine2 = new Line({
      points: [],
      stroke: "#E91E63",
      strokeWidth: 1,
      dashPattern: [3, 3],
    });
    const helperLine3 = new Line({
      points: [],
      stroke: "#E91E63",
      strokeWidth: 1,
      dashPattern: [3, 3],
    }); // For mid section if needed

    if (cps.length === 2) {
      const cp0 = cps[0]!;
      const cp1 = cps[1]!;
      helperLine1.points = [points.startX, points.startY, cp0.x, cp0.y];
      helperLine2.points = [points.endX, points.endY, cp1.x, cp1.y];
      handleGroup.add(helperLine1);
      handleGroup.add(helperLine2);
    } else if (cps.length === 3) {
      // 3 points: Start -> CP1, CP2 -> CP3, CP3 -> End
      // Helpers:
      // Line 1: Start -> CP1
      // Line 2: CP1 -> CP2 (Visual connection for Quad 1)
      // Line 3: CP2 -> CP3 (Visual connection for Quad 2)
      // Line 4: CP3 -> End
      // Let's use 2 lines:
      // 1: Start -> CP1 -> CP2
      // 2: CP2 -> CP3 -> End
      const cp0 = cps[0]!;
      const cp1 = cps[1]!;
      const cp2 = cps[2]!;
      helperLine1.points = [
        points.startX,
        points.startY,
        cp0.x,
        cp0.y,
        cp1.x,
        cp1.y,
      ];
      helperLine2.points = [
        cp1.x,
        cp1.y,
        cp2.x,
        cp2.y,
        points.endX,
        points.endY,
      ];
      handleGroup.add(helperLine1);
      handleGroup.add(helperLine2);
    } else if (cps.length === 4) {
      const cp0 = cps[0]!;
      const cp1 = cps[1]!;
      const cp2 = cps[2]!;
      const cp3 = cps[3]!;
      helperLine1.points = [points.startX, points.startY, cp0.x, cp0.y];
      helperLine2.points = [cp1.x, cp1.y, cp2.x, cp2.y];
      helperLine3.points = [cp3.x, cp3.y, points.endX, points.endY];
      handleGroup.add(helperLine1);
      handleGroup.add(helperLine2);
      handleGroup.add(helperLine3);
    }

    cps.forEach((cp) => {
      const handle = new Ellipse({
        x: cp.x - r,
        y: cp.y - r,
        width: r * 2,
        height: r * 2,
        fill: "#fff",
        stroke: "#E91E63",
        strokeWidth: 2,
        cursor: "move",
        zIndex: 12,
      });
      handles.push(handle);
      handleGroup.add(handle);
    });

    // Drag Logic for CP
    const setupCPDrag = (handle: Ellipse, index: number) => {
      let isDragging = false;

      handle.on(DragEvent.START, () => {
        if (leaferApp && leaferApp.tree) leaferApp.tree.draggable = false;
        isDragging = true;
      });

      handle.on(DragEvent.DRAG, (e: DragEvent) => {
        if (!isDragging) return;
        const scale = store.viewSettings.zoomLevel;
        handle.x = (handle.x || 0) + e.moveX / scale;
        handle.y = (handle.y || 0) + e.moveY / scale;

        // Update helpers
        const hRadius = r;
        if (cps.length === 2) {
          if (index === 0) {
            helperLine1.points = [
              points.startX,
              points.startY,
              (handle.x || 0) + hRadius,
              (handle.y || 0) + hRadius,
            ];
          } else {
            helperLine2.points = [
              points.endX,
              points.endY,
              (handle.x || 0) + hRadius,
              (handle.y || 0) + hRadius,
            ];
          }
        } else if (cps.length === 3) {
          // Update 3 points helpers
          // Line 1: Start -> CP1 -> CP2
          // Line 2: CP2 -> CP3 -> End
          if (index === 0) {
            // CP1 moved
            const pts = helperLine1.points || [];
            if (pts.length >= 6) {
              // [sx, sy, c1x, c1y, c2x, c2y]
              pts[2] = (handle.x || 0) + hRadius;
              pts[3] = handle.y + hRadius;
              helperLine1.points = pts;
            }
          } else if (index === 1) {
            // CP2 moved (shared)
            const pts1 = helperLine1.points || [];
            if (pts1.length >= 6) {
              pts1[4] = (handle.x || 0) + hRadius;
              pts1[5] = handle.y + hRadius;
              helperLine1.points = pts1;
            }
            const pts2 = helperLine2.points || [];
            if (pts2.length >= 6) {
              // [c2x, c2y, c3x, c3y, ex, ey]
              pts2[0] = (handle.x || 0) + hRadius;
              pts2[1] = handle.y + hRadius;
              helperLine2.points = pts2;
            }
          } else if (index === 2) {
            // CP3 moved
            const pts = helperLine2.points || [];
            if (pts.length >= 6) {
              pts[2] = (handle.x || 0) + hRadius;
              pts[3] = handle.y + hRadius;
              helperLine2.points = pts;
            }
          }
        } else {
          if (index === 0) {
            // CP1 -> Update Helper 1
            helperLine1.points = [
              points.startX,
              points.startY,
              (handle.x || 0) + hRadius,
              (handle.y || 0) + hRadius,
            ];
          } else if (index === 1) {
            // CP2 -> Update Helper 2 start
            const pts = helperLine2.points || [];
            if (pts.length >= 4) {
              pts[0] = (handle.x || 0) + hRadius;
              pts[1] = handle.y + hRadius;
              helperLine2.points = pts;
            }
          } else if (index === 2) {
            // CP3 -> Update Helper 2 end
            const pts = helperLine2.points || [];
            if (pts.length >= 4) {
              pts[2] = (handle.x || 0) + hRadius;
              pts[3] = handle.y + hRadius;
              helperLine2.points = pts;
            }
          } else if (index === 3) {
            // CP4 -> Update Helper 3
            helperLine3.points = [
              (handle.x || 0) + hRadius,
              (handle.y || 0) + hRadius,
              points.endX,
              points.endY,
            ];
          }
        }

        // Real-time update of curve
        const lines = lineMap.get(taskId);
        const lineObj = lines?.find(
          (l) => l.otherId === depId && l.type === "incoming"
        );
        if (lineObj && lineObj.line) {
          // Gather all current handle positions
          const currentCPs = handles.map((h) => ({
            x: (h.x || 0) + r,
            y: (h.y || 0) + r,
          }));

          const pathData = getCurvePathData(
            points.startX,
            points.startY,
            points.endX,
            points.endY,
            currentCPs
          );
          lineObj.line.path = pathData;

          // Update Arrow Rotation
          const lastCP = currentCPs[currentCPs.length - 1];
          const angle = lastCP
            ? (Math.atan2(points.endY - lastCP.y, points.endX - lastCP.x) *
                180) /
              Math.PI
            : 0;
          if (lineObj.arrow) {
            lineObj.arrow.rotation = angle;
            lineObj.arrow.x = points.endX;
            lineObj.arrow.y = points.endY;
          }
        }
      });

      handle.on(DragEvent.END, () => {
        isDragging = false;
        if (leaferApp && leaferApp.tree) leaferApp.tree.draggable = true;

        // Save to store
        const offsets = handles.map((h, i) => {
          const hx = (h.x || 0) + r;
          const hy = (h.y || 0) + r;

          if (handles.length === 2) {
            // 2 points: CP1 rel to Start, CP2 rel to End
            if (i === 0)
              return { x: hx - points.startX, y: hy - points.startY };
            else return { x: hx - points.endX, y: hy - points.endY };
          } else if (handles.length === 3) {
            // 3 points: CP1, CP2 rel to Start, CP3 rel to End
            if (i < 2) {
              return { x: hx - points.startX, y: hy - points.startY };
            } else {
              return { x: hx - points.endX, y: hy - points.endY };
            }
          } else {
            // 4 points: CP1, CP2 rel to Start? Or CP1, CP2 to Start and CP3, CP4 to End?
            // Consistent with getCurveControlPoints reconstruction:
            // CP1, CP2 stored relative to Start
            // CP3, CP4 stored relative to End
            if (i < 2) {
              return { x: hx - points.startX, y: hy - points.startY };
            } else {
              return { x: hx - points.endX, y: hy - points.endY };
            }
          }
        });

        store.updateDependencyControlPoints(depId, taskId, offsets);
      });
    };

    handles.forEach((h, i) => setupCPDrag(h, i));
  }

  const r = 6;
  const startHandle = new Ellipse({
    x: points.startX - r,
    y: points.startY - r,
    width: r * 2,
    height: r * 2,
    fill: "#fff",
    stroke: "#2196F3",
    strokeWidth: 2,
    cursor: "crosshair",
    zIndex: 10,
  });

  const endHandle = new Ellipse({
    x: points.endX - r,
    y: points.endY - r,
    width: r * 2,
    height: r * 2,
    fill: "#fff",
    stroke: "#2196F3",
    strokeWidth: 2,
    cursor: "crosshair",
    zIndex: 10,
  });

  // Drag Logic Helper
  const setupDrag = (handle: Ellipse, type: "source" | "target") => {
    let isDragging = false;
    let ghost: Ellipse | null = null;
    let feedbackGroup: Group | null = null;

    handle.on(DragEvent.START, () => {
      if (leaferApp && leaferApp.tree) {
        leaferApp.tree.draggable = false;
      }
      isDragging = true;
      ghost = new Ellipse({
        x: handle.x || 0,
        y: handle.y || 0,
        width: handle.width,
        height: handle.height,
        fill: "transparent",
        stroke: "#f00",
        strokeWidth: 2,
      });
      handleGroup.add(ghost);

      // Create feedback group for target highlights
      feedbackGroup = new Group({ zIndex: 1004 });
      handleGroup.add(feedbackGroup);
    });

    handle.on(DragEvent.DRAG, (e: DragEvent) => {
      if (!isDragging || !ghost) return;
      const scale = store.viewSettings.zoomLevel;
      ghost.x = (ghost.x || 0) + e.moveX / scale;
      ghost.y = (ghost.y || 0) + e.moveY / scale;

      // Real-time feedback: Find task under ghost
      const gx = (ghost.x || 0) + r;
      const gy = (ghost.y || 0) + r;

      feedbackGroup?.clear();

      // Iterate all tasks to find if we are over one
      let hoveredTask: string | null = null;
      void hoveredTask; // Suppress unused

      for (const [tid, pos] of taskPositions.entries()) {
        if (
          gx >= pos.x &&
          gx <= pos.x + pos.width &&
          gy >= pos.y &&
          gy <= pos.y + pos.height
        ) {
          hoveredTask = tid;

          // Show ports for this task
          const hTask = store.tasks.find((t) => t.id === tid);
          const ports = getAllTaskPorts(pos, hTask);

          ports.forEach((p) => {
            feedbackGroup?.add(
              new Ellipse({
                x: p.x - 4,
                y: p.y - 4,
                width: 8,
                height: 8,
                fill: "#2196F3",
                opacity: 0.5,
              })
            );
          });

          // Highlight Task Border
          feedbackGroup?.add(
            new Rect({
              x: pos.x,
              y: pos.y,
              width: pos.width,
              height: pos.height,
              stroke: "#2196F3",
              strokeWidth: 2,
              fill: "transparent",
            })
          );

          break;
        }
      }
    });

    handle.on(DragEvent.END, () => {
      if (leaferApp && leaferApp.tree) {
        leaferApp.tree.draggable = true;
      }
      isDragging = false;
      feedbackGroup?.remove();
      feedbackGroup = null;

      if (ghost) {
        const gx = (ghost.x || 0) + r;
        const gy = (ghost.y || 0) + r;

        // Find which task we dropped on
        let droppedTaskId: string | null = null;
        let droppedTaskPos: any = null;

        for (const [tid, pos] of taskPositions.entries()) {
          if (
            gx >= pos.x &&
            gx <= pos.x + pos.width &&
            gy >= pos.y &&
            gy <= pos.y + pos.height
          ) {
            droppedTaskId = tid;
            droppedTaskPos = pos;
            break;
          }
        }

        const targetTaskPos =
          droppedTaskPos || (type === "source" ? sourcePos : targetPos);
        const targetIdToCheck =
          droppedTaskId || (type === "source" ? depId : taskId);
        const targetTaskToCheck = store.tasks.find(
          (t) => t.id === targetIdToCheck
        );

        const ports = getAllTaskPorts(targetTaskPos, targetTaskToCheck);

        let closest = null;
        let minDst = 50;

        ports.forEach((p) => {
          const dst = Math.sqrt(Math.pow(p.x - gx, 2) + Math.pow(p.y - gy, 2));
          if (dst < minDst) {
            minDst = dst;
            closest = p.id;
          }
        });

        if (closest) {
          // Logic for changing connection
          if (type === "source") {
            // Dragging Source Handle
            // If we dropped on a new task, we are changing the Source ID
            if (droppedTaskId && droppedTaskId !== depId) {
              // Change Source: Target (taskId) now depends on NewSource (droppedTaskId)
              store.changeDependencySource(
                taskId,
                depId,
                droppedTaskId,
                closest as any
              );
              // Update selection to new line
              // We need to wait for render? Or manually update
              // Ideally, selection should clear or update
              store.clearSelection();
            } else {
              // Same task, just updating port
              store.updateDependencyPort(taskId, depId, type, closest as any);
            }
          } else {
            // Dragging Target Handle
            // If we dropped on a new task, we are changing the Target ID
            if (droppedTaskId && droppedTaskId !== taskId) {
              // Move Dependency: Remove from OldTarget (taskId), Add to NewTarget (droppedTaskId)
              store.moveDependencyTarget(
                taskId,
                droppedTaskId,
                depId,
                closest as any
              );
              store.clearSelection();
            } else {
              // Same task, just updating port
              store.updateDependencyPort(taskId, depId, type, closest as any);
            }
          }
          drawChart();
        } else {
          updateHandleGroup(); // Reset
        }

        ghost.remove();
        ghost = null;
      }
    });
  };

  setupDrag(startHandle, "source");
  setupDrag(endHandle, "target");

  handleGroup.add(startHandle);
  handleGroup.add(endHandle);
};

const drawChart = () => {
  if (!leaferApp) return;

  // Remove old chart group to avoid clearing the whole tree (which destroys dragLayer)
  if (chartGroup) {
    chartGroup.destroy();
    chartGroup = null;
  }

  animatingLines.length = 0;
  lineMap.clear();
  taskPositions.clear();
  phaseBoundaries.clear();
  swimlaneBoundaries.clear();

  // Create new chart group
  chartGroup = new Group();
  const mainGroup = chartGroup;

  currentGuideGroup = new Group({ zIndex: 9999 });
  mainGroup.add(currentGuideGroup);

  // 0. Calculate visible tasks and structural filters
  const statuses = store.viewSettings.filterStatuses;
  const phases = store.viewSettings.filterPhases;
  const swimlanes = store.viewSettings.filterSwimlanes;
  const visibleTasks = store.tasks.filter((t) => {
    if (statuses && statuses.length && !statuses.includes(t.status))
      return false;
    if (phases && phases.length && !phases.includes(t.phaseId)) return false;
    if (swimlanes && swimlanes.length && !swimlanes.includes(t.swimlaneId))
      return false;
    return true;
  });

  const isFiltering =
    (statuses && statuses.length) ||
    (phases && phases.length) ||
    (swimlanes && swimlanes.length);

  let visiblePhases = store.phases;
  let visibleSwimlanes = store.swimlanes;

  if (isFiltering) {
    const activePhaseIds = new Set(visibleTasks.map((t) => t.phaseId));
    const activeSwimlaneIds = new Set(visibleTasks.map((t) => t.swimlaneId));

    visiblePhases = store.phases.filter((p) => activePhaseIds.has(p.id));
    visibleSwimlanes = store.swimlanes.filter((s) =>
      activeSwimlaneIds.has(s.id)
    );
  }

  // 1. Calculate Phase Widths based on task count
  const phaseWidths: number[] = [];

  visiblePhases.forEach((phase) => {
    const tasksInPhase = visibleTasks.filter((t) => t.phaseId === phase.id);

    let phaseRequiredWidth = 0;
    visibleSwimlanes.forEach((lane) => {
      const tasksInCell = tasksInPhase.filter((t) => t.swimlaneId === lane.id);
      let manualExtent = 0;
      let flowCount = 0;
      tasksInCell.forEach((t) => {
        if (t.x !== undefined && !t.autoPositioned) {
          manualExtent = Math.max(manualExtent, t.x + TASK_WIDTH);
        } else {
          flowCount++;
        }
      });
      const manualWidth = manualExtent;
      const flowWidth = flowCount > 0 ? flowCount * (TASK_WIDTH + TASK_GAP) : 0;
      const cellRequired = Math.max(manualWidth, flowWidth);
      phaseRequiredWidth = Math.max(phaseRequiredWidth, cellRequired);
    });
    const minWidth = 60;
    phaseWidths.push(Math.max(phaseRequiredWidth + TURN_MARGIN, minWidth));
  });

  // 1.5 Calculate Swimlane Heights
  const swimlaneHeights: number[] = [];
  const MIN_LANE_HEIGHT = 100;

  visibleSwimlanes.forEach((lane) => {
    let maxLaneHeight = MIN_LANE_HEIGHT;

    // Check all tasks in this swimlane across all phases
    visiblePhases.forEach((phase, phaseIndex) => {
      void phaseIndex; // Suppress unused
      const tasks = visibleTasks.filter(
        (t) => t.phaseId === phase.id && t.swimlaneId === lane.id
      );

      tasks.forEach((t) => {
        if (t.y !== undefined) {
          maxLaneHeight = Math.max(maxLaneHeight, t.y + TASK_HEIGHT + 15);
        }
      });

      if (tasks.length > 0) {
        maxLaneHeight = Math.max(maxLaneHeight, TASK_HEIGHT + 15);
      }
    });

    swimlaneHeights.push(maxLaneHeight);
  });

  // Calculate total content width
  const totalPhaseWidth = phaseWidths.reduce((sum, w) => sum + w, 0);

  const bgGroup = new Group(); // For Grid, Headers
  const lineGroup = new Group(); // For Dependency Lines
  const arrowGroup = new Group(); // For Dependency Arrows (Top Layer)
  const nodeGroup = new Group(); // For Tasks

  const backdrop = new Rect({
    x: 0,
    y: 0,
    width: LANE_HEADER_WIDTH + totalPhaseWidth,
    height: HEADER_HEIGHT + swimlaneHeights.reduce((s, h) => s + h, 0),
    fill: "transparent",
  });
  backdrop.on(PointerEvent.TAP, () => {
    store.clearSelection();
  });
  bgGroup.add(backdrop);

  lastContentWidth = LANE_HEADER_WIDTH + totalPhaseWidth;
  lastContentHeight =
    HEADER_HEIGHT + swimlaneHeights.reduce((s, h) => s + h, 0);

  // Draw Phase Headers Background
  // const contentWidth = CANVAS_WIDTH - LANE_HEADER_WIDTH // Legacy

  let currentX = LANE_HEADER_WIDTH;
  visiblePhases.forEach((phase, index) => {
    const width = phaseWidths[index] || 0;
    // const width = (phase.widthPercent / 100) * contentWidth // Legacy
    phaseBoundaries.set(phase.id, { x: currentX, width }); // Store phase boundary

    // Phase Header
    const headerGroup = new Group({
      x: currentX,
      y: 0,
      cursor: "pointer",
    });

    const isSelected =
      store.selectedElement?.type === "phase" &&
      store.selectedElement.id === phase.id;

    const headerRect = new Box({
      width: width,
      height: HEADER_HEIGHT,
      fill: phase.color,
      stroke: isSelected ? "#2196F3" : "#ddd",
      strokeWidth: isSelected ? 3 : 1,
    });

    const headerText = new Text({
      x: width / 2,
      y: HEADER_HEIGHT / 2,
      text: phase.name,
      textAlign: "center",
      verticalAlign: "middle",
      fontSize: 14,
      fontWeight: "bold",
      fill: "#333",
    });

    headerGroup.add(headerRect);
    headerGroup.add(headerText);

    headerGroup.on(PointerEvent.TAP, () => {
      store.selectElement("phase", phase.id);
    });

    bgGroup.add(headerGroup);

    currentX += width;
  });

  // Corner Cell
  const cornerGroup = new Group({ x: 0, y: 0 });

  // Background
  cornerGroup.add(
    new Box({
      width: LANE_HEADER_WIDTH,
      height: HEADER_HEIGHT,
      fill: "#eee",
      stroke: "#bbb",
      strokeWidth: 1,
    })
  );

  // Diagonal Line (Top-Left to Bottom-Right)
  cornerGroup.add(
    new Line({
      points: [0, 0, LANE_HEADER_WIDTH, HEADER_HEIGHT],
      stroke: "#bbb",
      strokeWidth: 1,
    })
  );

  // Text "阶段" (Top-Right / Right of diagonal)
  cornerGroup.add(
    new Text({
      x: LANE_HEADER_WIDTH * 0.65,
      y: HEADER_HEIGHT * 0.35,
      text: "阶段",
      textAlign: "center",
      verticalAlign: "middle",
      fontSize: 14,
      fontWeight: "bold",
      fill: "#333",
    })
  );

  // Text "专业" (Bottom-Left / Left of diagonal)
  cornerGroup.add(
    new Text({
      x: LANE_HEADER_WIDTH * 0.35,
      y: HEADER_HEIGHT * 0.65,
      text: "专业",
      textAlign: "center",
      verticalAlign: "middle",
      fontSize: 14,
      fontWeight: "bold",
      fill: "#333",
    })
  );

  bgGroup.add(cornerGroup);

  // Draw Background Grid & Swimlanes
  let currentY = HEADER_HEIGHT;

  // Draw Swimlanes
  visibleSwimlanes.forEach((lane, laneIndex) => {
    const laneHeight = swimlaneHeights[laneIndex] || 100;
    const laneY = currentY;
    swimlaneBoundaries.set(lane.id, { y: laneY, height: laneHeight });

    // Swimlane Header
    const laneHeaderGroup = new Group({
      x: 0,
      y: laneY,
      cursor: "pointer",
    });

    const isSelected =
      store.selectedElement?.type === "swimlane" &&
      store.selectedElement.id === lane.id;

    const laneHeader = new Box({
      width: LANE_HEADER_WIDTH,
      height: laneHeight,
      fill: lane.color,
      stroke: isSelected ? "#2196F3" : "#bbb",
      strokeWidth: isSelected ? 3 : 1,
    });

    const laneText = new Text({
      x: LANE_HEADER_WIDTH / 2,
      y: laneHeight / 2,
      text: lane.name,
      textAlign: "center",
      verticalAlign: "middle",
      fontSize: 14,
      fontWeight: "bold",
      fill: "#333",
    });

    laneHeaderGroup.add(laneHeader);
    laneHeaderGroup.add(laneText);

    laneHeaderGroup.on(PointerEvent.TAP, () => {
      store.selectElement("swimlane", lane.id);
    });

    bgGroup.add(laneHeaderGroup);

    // Swimlane Cells
    let cellX = LANE_HEADER_WIDTH;
    const updates: { id: string; x: number; y: number }[] = [];

    visiblePhases.forEach((phase, index) => {
      const cellWidth = phaseWidths[index] || 0;

      // Cell Background
      const cell = new Rect({
        x: cellX,
        y: laneY,
        width: cellWidth,
        height: laneHeight,
        fill: "white", // Changed from transparent to white
        stroke: "#eee",
        dashPattern: [5, 5],
      });
      cell.on(PointerEvent.TAP, () => {
        store.clearSelection();
      });
      bgGroup.add(cell);

      // Filter Tasks for this cell
      const tasksInCell = visibleTasks.filter(
        (t) => t.phaseId === phase.id && t.swimlaneId === lane.id
      );

      // 1. Identify occupied areas by fixed tasks (manually positioned)
      const occupiedRects: {
        x: number;
        y: number;
        width: number;
        height: number;
      }[] = [];

      tasksInCell.forEach((task) => {
        if (task.x !== undefined && task.y !== undefined) {
          occupiedRects.push({
            x: cellX + task.x,
            y: laneY + task.y,
            width: TASK_WIDTH,
            height: TASK_HEIGHT,
          });
        }
      });

      // 2. Position tasks
      let flowX = cellX + 15;
      let flowY = laneY + 15;

      tasksInCell.forEach((task) => {
        let finalX, finalY;
        const leftMargin = 15;
        const rightMargin = 0;
        void rightMargin; // Suppress unused

        if (task.x !== undefined && task.y !== undefined) {
          // Use stored relative position (only clamp to cell bounds, do not enforce turn margins for manual)
          const pWidth = phaseWidths[index] || 0;
          const relX = Math.max(0, Math.min(task.x, pWidth - TASK_WIDTH));
          finalX = cellX + relX;
          finalY = laneY + task.y;
        } else {
          // Use flow layout with collision avoidance
          // Try to find a spot that doesn't collide with occupiedRects
          let placed = false;

          // Safety counter to prevent infinite loop
          let attempts = 0;
          while (!placed && attempts < 100) {
            attempts++;

            // Check if current flow position fits in cell width
            const cWidth = cellWidth || 0;
            if (flowX < cellX + leftMargin) {
              flowX = cellX + leftMargin;
            }
            if (flowX + TASK_WIDTH > cellX + cWidth) {
              flowX = cellX + 15;
              flowY += TASK_HEIGHT + 15;
            }

            // Check collision with any occupied rect
            const currentRect = {
              x: flowX,
              y: flowY,
              width: TASK_WIDTH,
              height: TASK_HEIGHT,
            };
            let hasCollision = false;

            for (const rect of occupiedRects) {
              // Simple AABB collision
              if (
                currentRect.x < rect.x + rect.width &&
                currentRect.x + currentRect.width > rect.x &&
                currentRect.y < rect.y + rect.height &&
                currentRect.y + currentRect.height > rect.y
              ) {
                hasCollision = true;
                break;
              }
            }

            if (!hasCollision) {
              placed = true;
            } else {
              // Move forward and try again
              flowX += TASK_WIDTH + TASK_GAP;
            }
          }

          finalX = flowX;
          finalY = flowY;

          // Record this new position to occupy it for subsequent flow tasks
          occupiedRects.push({
            x: finalX,
            y: finalY,
            width: TASK_WIDTH,
            height: TASK_HEIGHT,
          });

          // Schedule update to store (persist relative coordinates)
          updates.push({
            id: task.id,
            x: finalX - cellX,
            y: finalY - laneY,
          });

          // Advance flow cursor
          flowX += TASK_WIDTH + TASK_GAP;
        }

        // Draw Task Node
        drawTaskNode(nodeGroup, task, finalX, finalY);

        // Store position for lines
        taskPositions.set(task.id, {
          x: finalX,
          y: finalY,
          width: TASK_WIDTH,
          height: TASK_HEIGHT,
          phaseId: phase.id,
        });
      });

      cellX += cellWidth || 0;
    });

    // Batch update positions if any new calculations
    if (updates.length > 0) {
      // Use timeout to avoid immediate state mutation during render cycle
      setTimeout(() => {
        store.batchUpdateTaskPositions(updates);
      }, 0);
    }

    currentY += laneHeight || 0;
  });

  // 2. Draw Dependency Lines

  visibleTasks.forEach((task) => {
    if (!task.dependencies || !task.dependencies.length) return;
    // if (store.viewSettings.filterStatus && task.status !== store.viewSettings.filterStatus) return // Skip if hidden (Already filtered)

    const endPos = taskPositions.get(task.id);
    if (!endPos) return;

    const endX = endPos.x;
    const endY = endPos.y + endPos.height / 2;

    // Suppress unused
    void endX;
    void endY;

    task.dependencies.forEach((dep) => {
      const depId = typeof dep === "string" ? dep : dep.taskId;

      const forcedSourceSide =
        typeof dep === "object" ? dep.sourcePort : undefined;
      const forcedTargetSide =
        typeof dep === "object" ? dep.targetPort : undefined;

      const startPos = taskPositions.get(depId);
      if (!startPos) return;

      const startTask = store.tasks.find((t) => t.id === depId);

      // Use helper to find best connection points
      const bestPoints = getBestConnectionPoints(
        startPos,
        endPos,
        forcedSourceSide,
        forcedTargetSide,
        startTask,
        task
      );
      const startX = bestPoints.startX;
      const startY = bestPoints.startY;
      const endX = bestPoints.endX;
      const endY = bestPoints.endY;

      const startSide = bestPoints.startSide;
      const endSide = bestPoints.endSide;

      let pathData = "";

      // Orthogonal Routing with Mandatory Perpendicular Exit/Entry
      // We must exit perpendicular to startSide and enter perpendicular to endSide

      // Define exit point (start + offset)
      const exitDist = 20;
      let exitX = startX;
      let exitY = startY;

      if (startSide === "right") exitX += exitDist;
      else if (startSide === "left") exitX -= exitDist;
      else if (startSide === "bottom") exitY += exitDist;
      else if (startSide === "top") exitY -= exitDist;

      // Define entry point (end + offset)
      const entryDist = 20;
      let entryX = endX;
      let entryY = endY;

      if (endSide === "right") entryX += entryDist;
      else if (endSide === "left") entryX -= entryDist;
      else if (endSide === "bottom") entryY += entryDist;
      else if (endSide === "top") entryY -= entryDist;

      // Routing from Exit to Entry
      // Simple 3-segment logic: Exit -> Mid -> Entry

      // Calculate Mid Point
      // If dominant direction matches side direction, use mid on that axis

      let midX = exitX;
      let midY = exitY;

      // Use vars to suppress unused warning (if we don't use complex routing yet)
      void midX;
      void midY;

      // Get dependency type
      const depType = (typeof dep === "object" ? dep.type : "curve") || "curve";
      // console.log('Drawing dependency', depId, task.id, depType)

      // Logic:
      // 1. Move from Start to Exit
      // 2. Route from Exit to Entry (Orthogonal)
      // 3. Move from Entry to End

      // Simplified Universal Orthogonal Router
      // Start -> Exit -> [Intermediates] -> Entry -> End

      // Determine simple mid point between Exit and Entry
      const midX_default = exitX + (entryX - exitX) / 2;
      const midY_default = exitY + (entryY - exitY) / 2;

      // Construct Path
      // M startX startY L exitX exitY ... L entryX entryY L endX endY

      let route = "";

      if (depType === "straight") {
        // Direct line from start to end (ignoring exit/entry stubs usually, but let's keep stubs for consistency?
        // Or true straight? User usually expects straight line between points.
        // But we have ports. Let's do straight from Start to End directly.
        // Override pathData completely later
        // Or just M startX startY L endX endY
      } else if (depType === "curve") {
        // Bezier curve
      } else {
        // Polyline (Default Orthogonal)

        // Check if direct connection is possible (aligned)
        const alignedX = Math.abs(exitX - entryX) < 2;
        const alignedY = Math.abs(exitY - entryY) < 2;

        if (alignedX || alignedY) {
          route = `L ${entryX} ${entryY}`;
        } else {
          // Need intermediate turns
          // Strategy: Try to maintain direction of exit as long as possible

          if (startSide === "left" || startSide === "right") {
            // Horizontal Exit
            if (endSide === "left" || endSide === "right") {
              // Horizontal Entry
              // H -> V -> H
              // Use midX
              route = `L ${midX_default} ${exitY} L ${midX_default} ${entryY} L ${entryX} ${entryY}`;
            } else {
              // Vertical Entry
              // H -> V
              // Intersect: (entryX, exitY)
              route = `L ${entryX} ${exitY} L ${entryX} ${entryY}`;
            }
          } else {
            // Vertical Exit
            // V -> H -> V
            if (endSide === "top" || endSide === "bottom") {
              // Vertical Entry
              // V -> H -> V
              // Use midY
              route = `L ${exitX} ${midY_default} L ${entryX} ${midY_default} L ${entryX} ${entryY}`;
            } else {
              // Horizontal Entry
              // V -> H
              // Intersect: (exitX, entryY)
              route = `L ${exitX} ${entryY} L ${entryX} ${entryY}`;
            }
          }
        }
      }

      if (depType === "straight") {
        pathData = `M ${startX} ${startY} L ${endX} ${endY}`;
      } else if (depType === "curve") {
        // Cubic Bezier with 4 control points support
        const depObj = typeof dep === "object" ? dep : null;
        const cps = getCurveControlPoints(
          startX,
          startY,
          endX,
          endY,
          startSide,
          endSide,
          depObj?.controlPoints,
          depObj?.controlPointCount
        );
        pathData = getCurvePathData(startX, startY, endX, endY, cps);
      } else {
        pathData = `M ${startX} ${startY} L ${exitX} ${exitY} ${route} L ${endX} ${endY}`;
      }

      const isInput =
        store.selectedElement?.type === "task" &&
        store.selectedElement.id === task.id;
      const isOutput =
        store.selectedElement?.type === "task" &&
        store.selectedElement.id === depId;

      const isSelectedDep =
        store.selectedElement?.type === "dependency" &&
        store.selectedElement.id === `${depId}|${task.id}`;

      // Check if line is animating
      // Cache the source task status to avoid repeated lookups if possible, or just look it up
      const sourceTask = store.tasks.find((t) => t.id === depId);
      void sourceTask; // Suppress unused

      // Animation condition:
      // 1. Task flow status: current task is in progress and source is completed
      // 2. Selection interaction: if the line is related to the selected element (input/output/selected itself)
      const isStatusAnimating = false; // Disabled per user request
      const isSelectedAnimating = isInput || isOutput || isSelectedDep;

      const isAnimating = isStatusAnimating || isSelectedAnimating;

      let strokeColor = "#999";
      if (isSelectedDep) strokeColor = "#f00"; // Red for selected
      else if (isInput) strokeColor = "#4CAF50"; // Green for input (incoming)
      else if (isOutput) strokeColor = "#FF9800"; // Orange for output (outgoing)

      const line = new Path({
        path: pathData,
        stroke: strokeColor,
        strokeWidth: isInput || isOutput || isSelectedDep ? 3 : 2,
        // endArrow: 'classic', // Removed to use manual arrow
        zIndex:
          isInput || isOutput || isSelectedDep ? 100 : isAnimating ? 50 : 0,
        cursor: "pointer",
      });

      // Store line reference for real-time updates
      const depKey = `${depId}|${task.id}`;
      // Remove old line if exists in map (though we clear chart usually)

      line.data = {
        type: "dependency",
        id: depKey,
        sourceId: depId,
        targetId: task.id,
      };

      line.on(PointerEvent.TAP, (e: PointerEvent) => {
        e.stop();
        store.selectElement("dependency", depKey);
        selectedLine.value = { taskId: task.id, depId: depId };
        updateHandleGroup();
      });

      // Manual Arrow Head (Triangle)
      // Calculate angle at the end based on entry direction
      let angle = 0;

      if (depType === "straight") {
        angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;
      } else if (depType === "curve") {
        // Re-calculate control points for angle
        const depObj = typeof dep === "object" ? dep : null;
        const cps = getCurveControlPoints(
          startX,
          startY,
          endX,
          endY,
          startSide,
          endSide,
          depObj?.controlPoints,
          depObj?.controlPointCount
        );

        // Use the last control point (CP4) for the angle
        const lastCP = cps[cps.length - 1];
        angle = lastCP
          ? (Math.atan2(endY - lastCP.y, endX - lastCP.x) * 180) / Math.PI
          : 0;
      } else {
        if (endSide === "left") {
          // Entering from left (pointing right) -> 0
          angle = 0;
        } else if (endSide === "right") {
          // Entering from right (pointing left) -> 180
          angle = 180;
        } else if (endSide === "top") {
          // Entering from top (pointing down) -> 90
          angle = 90;
        } else if (endSide === "bottom") {
          // Entering from bottom (pointing up) -> -90 (or 270)
          angle = -90;
        } else {
          // Fallback logic if side not detected (e.g. legacy)
          if (Math.abs(endX - startX) < 20) {
            angle = 0;
          } else {
            angle = 0;
          }
        }
      }

      const arrow = new Path({
        x: endX,
        y: endY,
        rotation: angle,
        path: "M 0 0 L -10 -5 L -10 5 Z",
        fill: strokeColor,
        zIndex: isInput || isOutput || isSelectedDep ? 101 : 1,
      });

      if (isAnimating) {
        // console.log(`Adding animating line: ${depId} -> ${task.id}`)
        line.dashPattern = [10, 5];
        line.dashOffset = 0;
        animatingLines.push(line);
      }

      lineGroup.add(line);
      arrowGroup.add(arrow);

      // Store references for updates
      if (!lineMap.has(task.id)) lineMap.set(task.id, []);
      if (!lineMap.has(depId)) lineMap.set(depId, []);

      lineMap
        .get(task.id)!
        .push({ line, arrow, type: "incoming", otherId: depId });
      lineMap
        .get(depId)!
        .push({ line, arrow, type: "outgoing", otherId: task.id });
    });
  });

  // Assemble Main Group
  mainGroup.add(bgGroup);
  mainGroup.add(lineGroup);
  mainGroup.add(nodeGroup);
  mainGroup.add(arrowGroup);

  leaferApp.tree.add(mainGroup);

  if (dragLayer.parent) {
    dragLayer.parent.remove(dragLayer);
  }

  // Ensure handleGroup is on top of chart but below dragLayer
  if (handleGroup.parent) {
    handleGroup.parent.remove(handleGroup);
  }

  leaferApp.tree.add(mainGroup);
  leaferApp.tree.add(handleGroup);
  leaferApp.tree.add(dragLayer);
  leaferApp.tree.add(tooltipGroup);

  updateHandleGroup();
};

const dragLayer = new Group({
  zIndex: 1000,
  hittable: false,
});

const tooltipGroup = new Group({
  zIndex: 2000,
  visible: false,
  hittable: false,
});
const tooltipBg = new Box({
  fill: "rgba(0, 0, 0, 0.8)",
  cornerRadius: 4,
  shadow: { x: 2, y: 2, blur: 5, color: "rgba(0,0,0,0.2)" },
});
const tooltipText = new Text({
  fill: "white",
  fontSize: 12,
  padding: 8,
});
tooltipGroup.add(tooltipBg);
tooltipGroup.add(tooltipText);

const tempLine = new Path({
  stroke: "#FF9800",
  strokeWidth: 2,
  dashPattern: [5, 5],
  visible: false,
});
const tempArrow = new Path({
  fill: "#FF9800",
  path: "M 0 0 L -10 -5 L -10 5 Z", // Simple triangle pointing right (0,0 is tip)
  visible: false,
});

dragLayer.add(tempLine);
dragLayer.add(tempArrow);

const connectingStartSide = ref<string>("");

const startConnection = (
  sourceId: string,
  startX: number,
  startY: number,
  side: string
) => {
  isConnecting.value = true;
  connectingSourceId.value = sourceId;
  connectingStartX.value = startX;
  connectingStartY.value = startY;
  connectingStartSide.value = side;
  if (leaferApp && leaferApp.tree) {
    leaferApp.tree.draggable = false;
  }

  // Ensure elements are in dragLayer
  dragLayer.add(tempLine);
  dragLayer.add(tempArrow);

  // Initialize line and arrow
  tempLine.path = `M ${startX} ${startY} L ${startX} ${startY}`;
  tempLine.visible = true;

  tempArrow.x = 0;
  tempArrow.y = 0;
  tempArrow.rotation = 0;
  // Initial path (pointing right)
  tempArrow.path = `M ${startX} ${startY} L ${startX - 12} ${startY - 6} L ${
    startX - 12
  } ${startY + 6} Z`;
  tempArrow.visible = true;

  // Ensure dragLayer is on top (remove and add to be sure)
  if (leaferApp && leaferApp.tree) {
    if (leaferApp.tree.children.includes(dragLayer)) {
      leaferApp.tree.remove(dragLayer);
    }
    leaferApp.tree.add(dragLayer);
  }
};

const getCurveControlPoints = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  startSide: string,
  endSide: string,
  existingPoints?: { x: number; y: number }[],
  requestedCount?: number
) => {
  // If we have valid existing points matching the requested count (or no count requested), use them
  if (
    existingPoints &&
    (!requestedCount || existingPoints.length === requestedCount)
  ) {
    if (existingPoints.length === 4) {
      return [
        { x: startX + existingPoints[0]!.x, y: startY + existingPoints[0]!.y },
        { x: startX + existingPoints[1]!.x, y: startY + existingPoints[1]!.y }, // Stored relative to Start
        { x: endX + existingPoints[2]!.x, y: endY + existingPoints[2]!.y }, // Stored relative to End
        { x: endX + existingPoints[3]!.x, y: endY + existingPoints[3]!.y }, // Stored relative to End
      ];
    } else if (existingPoints.length === 3) {
      return [
        { x: startX + existingPoints[0]!.x, y: startY + existingPoints[0]!.y },
        { x: startX + existingPoints[1]!.x, y: startY + existingPoints[1]!.y },
        { x: endX + existingPoints[2]!.x, y: endY + existingPoints[2]!.y },
      ];
    } else if (existingPoints.length === 2) {
      return [
        { x: startX + existingPoints[0]!.x, y: startY + existingPoints[0]!.y },
        { x: endX + existingPoints[1]!.x, y: endY + existingPoints[1]!.y },
      ];
    }
  }

  // Calculate default distances
  const dist = Math.sqrt(
    Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)
  );
  const controlDist = Math.max(dist * 0.5, 50);

  // Default 2 points logic
  let cp1X = startX;
  let cp1Y = startY;
  let cpLastX = endX;
  let cpLastY = endY;

  if (startSide === "left") cp1X -= controlDist;
  else if (startSide === "right") cp1X += controlDist;
  else if (startSide === "top") cp1Y -= controlDist;
  else if (startSide === "bottom") cp1Y += controlDist;

  if (endSide === "left") cpLastX -= controlDist;
  else if (endSide === "right") cpLastX += controlDist;
  else if (endSide === "top") cpLastY -= controlDist;
  else if (endSide === "bottom") cpLastY += controlDist;

  if (requestedCount === 3) {
    // 3 points: Start -> CP1 -> CP2 (mid) -> CP3 -> End
    // We treat this as two Quadratic Beziers joined at CP2 (which is an on-curve point)
    // CP1 is control for first segment, CP3 is control for second segment.

    // If we already have 3 points, reuse them
    if (existingPoints && existingPoints.length === 3) {
      const c1x = startX + existingPoints[0]!.x;
      const c1y = startY + existingPoints[0]!.y;
      const c2x = startX + existingPoints[1]!.x;
      const c2y = startY + existingPoints[1]!.y;
      const c3x = endX + existingPoints[2]!.x;
      const c3y = endY + existingPoints[2]!.y;

      return [
        { x: c1x, y: c1y },
        { x: c2x, y: c2y },
        { x: c3x, y: c3y },
      ];
    }

    // If upgrading from 2:
    if (existingPoints && existingPoints.length === 2) {
      const c1x = startX + existingPoints[0]!.x;
      const c1y = startY + existingPoints[0]!.y;
      const c2x = endX + existingPoints[1]!.x;
      const c2y = endY + existingPoints[1]!.y;

      // Interpolate middle
      const midX = (c1x + c2x) / 2;
      const midY = (c1y + c2y) / 2;

      return [
        { x: c1x, y: c1y },
        { x: midX, y: midY },
        { x: c2x, y: c2y },
      ];
    }

    // If downgrading from 4:
    if (existingPoints && existingPoints.length === 4) {
      const c1x = startX + existingPoints[0]!.x;
      const c1y = startY + existingPoints[0]!.y;
      const c4x = endX + existingPoints[3]!.x;
      const c4y = endY + existingPoints[3]!.y;

      // Use average of inner points for mid?
      const c2x = startX + existingPoints[1]!.x;
      const c2y = startY + existingPoints[1]!.y;
      const c3x = endX + existingPoints[2]!.x;
      const c3y = endY + existingPoints[2]!.y;

      const midX = (c2x + c3x) / 2;
      const midY = (c2y + c3y) / 2;

      return [
        { x: c1x, y: c1y },
        { x: midX, y: midY },
        { x: c4x, y: c4y },
      ];
    }

    // Default 3 points
    const midX = (cp1X + cpLastX) / 2;
    const midY = (cp1Y + cpLastY) / 2;

    return [
      { x: cp1X, y: cp1Y },
      { x: midX, y: midY },
      { x: cpLastX, y: cpLastY },
    ];
  }

  // If we need 2 points (either requested explicitly or defaulting from scratch)
  if (
    requestedCount === 2 ||
    (!requestedCount && (!existingPoints || existingPoints.length !== 4))
  ) {
    // Reuse if we have compatible points (2, 3 or 4 -> take outer ones)
    if (existingPoints && existingPoints.length >= 2) {
      const c1x = startX + existingPoints[0]!.x;
      const c1y = startY + existingPoints[0]!.y;
      const lastIdx = existingPoints.length - 1;
      const clastX = endX + existingPoints[lastIdx]!.x;
      const clastY = endY + existingPoints[lastIdx]!.y;

      return [
        { x: c1x, y: c1y },
        { x: clastX, y: clastY },
      ];
    }

    return [
      { x: cp1X, y: cp1Y },
      { x: cpLastX, y: cpLastY },
    ];
  }

  // If we are here, we need 4 points.
  // If we are upgrading from 2 points
  if (existingPoints && existingPoints.length === 2) {
    const c1x = startX + existingPoints[0]!.x;
    const c1y = startY + existingPoints[0]!.y;
    const c2x = endX + existingPoints[1]!.x;
    const c2y = endY + existingPoints[1]!.y;

    // Interpolate for inner points
    const c1_2x = c1x + (c2x - c1x) * 0.33;
    const c1_2y = c1y + (c2y - c1y) * 0.33;
    const c2_1x = c1x + (c2x - c1x) * 0.66;
    const c2_1y = c1y + (c2y - c1y) * 0.66;

    return [
      { x: c1x, y: c1y },
      { x: c1_2x, y: c1_2y },
      { x: c2_1x, y: c2_1y },
      { x: c2x, y: c2y },
    ];
  }

  // If upgrading from 3 points
  if (existingPoints && existingPoints.length === 3) {
    // Just reuse and add one? Or redistribute?
    // 3 points: 0->Start, 1->Mid, 2->End
    // 4 points: 0->Start, 1->MidL, 2->MidR, 3->End
    const c1x = startX + existingPoints[0]!.x;
    const c1y = startY + existingPoints[0]!.y;
    const c2x = startX + existingPoints[1]!.x; // Approx relative
    const c2y = startY + existingPoints[1]!.y;
    const c3x = endX + existingPoints[2]!.x;
    const c3y = endY + existingPoints[2]!.y;

    // Let's just interpolate
    return [
      { x: c1x, y: c1y },
      {
        x: (c1x + c3x) * 0.33 + c2x * 0.33,
        y: (c1y + c3y) * 0.33 + c2y * 0.33,
      }, // Rough
      {
        x: (c1x + c3x) * 0.66 + c2x * 0.33,
        y: (c1y + c3y) * 0.66 + c2y * 0.33,
      },
      { x: c3x, y: c3y },
    ];
  }

  // Default 4 points from scratch

  // Inner points (CP2, CP3)
  const cp2X = cp1X + (cpLastX - cp1X) * 0.33;
  const cp2Y = cp1Y + (cpLastY - cp1Y) * 0.33;
  const cp3X = cp1X + (cpLastX - cp1X) * 0.66;
  const cp3Y = cp1Y + (cpLastY - cp1Y) * 0.66;

  return [
    { x: cp1X, y: cp1Y },
    { x: cp2X, y: cp2Y },
    { x: cp3X, y: cp3Y },
    { x: cpLastX, y: cpLastY },
  ];
};

const getCurvePathData = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  cps: { x: number; y: number }[]
) => {
  if (cps.length === 4) {
    const cp0 = cps[0]!;
    const cp1 = cps[1]!;
    const cp2 = cps[2]!;
    const cp3 = cps[3]!;
    const midX = (cp1.x + cp2.x) / 2;
    const midY = (cp1.y + cp2.y) / 2;
    return `M ${startX} ${startY} C ${cp0.x} ${cp0.y} ${cp1.x} ${cp1.y} ${midX} ${midY} C ${cp2.x} ${cp2.y} ${cp3.x} ${cp3.y} ${endX} ${endY}`;
  } else if (cps.length === 3) {
    // 3 control points: Start -> CP1, CP2, CP3 -> End
    // Can be 2 quadratic beziers or 1 cubic + 1 quadratic?
    // Let's try 2 Cubic Beziers joined at CP2?
    // Start -> CP1 -> CP2 (Endpoint of first, Start of second) -> CP3 -> End
    // Wait, Cubic needs 2 CPs.
    // Maybe: Start -> CP1 -> (mid between CP1/CP2?) -> CP2 ...
    // Simplest: 2 Quadratic Beziers?
    // Q: Start -> CP1 -> Mid
    // Q: Mid -> CP3 -> End
    // And CP2 is the Mid point?
    // Let's treat CP2 as the anchor point in the middle.
    // Segment 1: Start -> CP1 -> CP2
    // Segment 2: CP2 -> CP3 -> End
    // But Quadratic uses 1 CP. So Start -> CP1 -> CP2 is one curve?
    // No, Q is M sX sY Q cpX cpY eX eY.
    // So: M Start Q CP1 CP2 ? No, CP2 is on curve.
    // Let's assume CP1 and CP3 are control points, CP2 is an on-curve point.
    // So: M Start Q CP1 CP2 Q CP3 End
    const cp0 = cps[0]!;
    const cp1 = cps[1]!;
    const cp2 = cps[2]!;
    return `M ${startX} ${startY} Q ${cp0.x} ${cp0.y} ${cp1.x} ${cp1.y} Q ${cp2.x} ${cp2.y} ${endX} ${endY}`;
  } else if (cps.length === 2) {
    const cp0 = cps[0]!;
    const cp1 = cps[1]!;
    return `M ${startX} ${startY} C ${cp0.x} ${cp0.y} ${cp1.x} ${cp1.y} ${endX} ${endY}`;
  }
  return `M ${startX} ${startY} L ${endX} ${endY}`;
};

const drawTaskNode = (group: Group, task: any, x: number, y: number) => {
  const isTaskSelected =
    store.selectedElement?.type === "task" &&
    store.selectedElement.id === task.id;
  const isAnyPortSelected =
    store.selectedElement?.type === "port" &&
    store.selectedElement.taskId === task.id;
  const isSelected = isTaskSelected || isAnyPortSelected;
  const showPorts = isSelected;

  const nodeGroup = new Group({
    x,
    y,
    cursor: "pointer",
  });

  // Background
  const statusColors: Record<string, string> = {
    completed: "#4CAF50",
    in_progress: "#2196F3",
    delayed: "#F44336",
    pending: "#9E9E9E",
  };
  const color = statusColors[task.status] || "#9E9E9E";

  const bg = new Box({
    width: TASK_WIDTH,
    height: TASK_HEIGHT,
    fill: "white",
    stroke: isSelected ? "#000" : color,
    strokeWidth: isSelected ? 3 : 2,
    cornerRadius: 5,
    shadow: { x: 0, y: 2, blur: 4, color: "rgba(0,0,0,0.1)" },
  });

  // Status Indicator
  const indicator = new Rect({
    x: TASK_WIDTH - 15,
    y: 8,
    width: 8,
    height: 8,
    cornerRadius: 4,
    fill: color,
  });

  // Attachment Icon
  if (task.attachments && task.attachments.length > 0) {
    const attachmentIcon = new Text({
      x: TASK_WIDTH - 30,
      y: 5,
      text: "📎",
      fontSize: 14,
      fill: "#666",
    });
    nodeGroup.add(attachmentIcon);
  }

  // ID Text
  const idText = new Text({
    x: 8,
    y: 8,
    text: task.id,
    fontSize: 10,
    fill: "#666",
  });

  // Name Text
  const nameText = new Text({
    x: 8,
    y: 25,
    text: task.name,
    fontSize: 14,
    fontWeight: "bold",
    fill: "#333",
    width: TASK_WIDTH - 16,
    textOverflow: "...",
  });

  // Owner Text
  const ownerText = new Text({
    x: 8,
    y: 45,
    text: task.owner,
    fontSize: 12,
    fill: "#888",
  });

  // Progress Bar
  const progressBg = new Rect({
    x: 8,
    y: 65,
    width: TASK_WIDTH - 16,
    height: 4,
    fill: "#eee",
    cornerRadius: 2,
  });

  const progressFill = new Rect({
    x: 8,
    y: 65,
    width: (TASK_WIDTH - 16) * (task.progress / 100),
    height: 4,
    fill: color,
    cornerRadius: 2,
  });

  nodeGroup.add(bg);
  nodeGroup.add(indicator);
  nodeGroup.add(idText);
  nodeGroup.add(nameText);
  nodeGroup.add(ownerText);
  nodeGroup.add(progressBg);
  nodeGroup.add(progressFill);

  // --- Connection Ports ---
  const allPorts: Ellipse[] = [];

  // Default Ports
  const defaultPortsConfig = [
    { id: "left", x: -6, y: TASK_HEIGHT / 2 - 6, stroke: "#2196F3" },
    {
      id: "right",
      x: TASK_WIDTH - 6,
      y: TASK_HEIGHT / 2 - 6,
      stroke: "#2196F3",
    },
    { id: "top", x: TASK_WIDTH / 2 - 6, y: -6, stroke: "#2196F3" },
    {
      id: "bottom",
      x: TASK_WIDTH / 2 - 6,
      y: TASK_HEIGHT - 6,
      stroke: "#2196F3",
    },
  ];

  defaultPortsConfig.forEach((cfg) => {
    const port = new Ellipse({
      x: cfg.x,
      y: cfg.y,
      width: 12,
      height: 12,
      fill: "#fff",
      stroke: cfg.stroke,
      strokeWidth: 2,
      // Fixed ports are not draggable for position adjustment, but draggable for connection
      cursor: "crosshair",
      visible: showPorts, // Show if selected
    });
    port.data = {
      type: "port",
      portType: cfg.id,
      taskId: task.id,
      isCustom: false,
    };
    allPorts.push(port);
    nodeGroup.add(port);
  });

  // Custom Ports
  if (task.ports) {
    task.ports.forEach((p: any) => {
      let px = 0,
        py = 0;
      if (p.side === "top") {
        px = TASK_WIDTH * p.percentage;
        py = 0;
      } else if (p.side === "bottom") {
        px = TASK_WIDTH * p.percentage;
        py = TASK_HEIGHT;
      } else if (p.side === "left") {
        px = 0;
        py = TASK_HEIGHT * p.percentage;
      } else if (p.side === "right") {
        px = TASK_WIDTH;
        py = TASK_HEIGHT * p.percentage;
      }

      const isPortSelected =
        store.selectedElement?.type === "port" &&
        store.selectedElement.id === p.id;

      const port = new Ellipse({
        x: px - 6,
        y: py - 6,
        width: 12,
        height: 12,
        fill: isPortSelected ? "#E040FB" : "#fff",
        stroke: isPortSelected ? "#D500F9" : "#9C27B0",
        strokeWidth: isPortSelected ? 3 : 2,
        cursor: "crosshair",
        visible: showPorts,
      });
      port.data = {
        type: "port",
        portType: p.id,
        taskId: task.id,
        isCustom: true,
        side: p.side,
        percentage: p.percentage,
      };

      port.on(PointerEvent.TAP, (e: PointerEvent) => {
        e.stop();
        if (e.ctrlKey) {
          store.selectElement("port", p.id, task.id);
        }
      });

      allPorts.push(port);
      nodeGroup.add(port);
    });
  }

  // Disable node dragging when interacting with ports
  const disableDrag = () => {
    nodeGroup.draggable = false;
  };
  const enableDrag = () => {
    if (!isConnecting.value) {
      nodeGroup.draggable = true;
    }
  };

  // Handle Ctrl Key for Cursor
  nodeGroup.on(PointerEvent.MOVE, (e: PointerEvent) => {
    if (e.ctrlKey) {
      const inner = nodeGroup.getInnerPoint(e);
      const relX = inner.x;
      const relY = inner.y;

      const threshold = 15;
      let nearEdge = false;
      if (
        Math.abs(relY) < threshold ||
        Math.abs(relY - TASK_HEIGHT) < threshold ||
        Math.abs(relX) < threshold ||
        Math.abs(relX - TASK_WIDTH) < threshold
      ) {
        nearEdge = true;
      }

      if (nearEdge) {
        nodeGroup.cursor = "copy"; // Plus sign
      } else {
        nodeGroup.cursor = "pointer";
      }
    } else {
      nodeGroup.cursor = "pointer";
    }
  });

  allPorts.forEach((port) => {
    port.on(PointerEvent.ENTER, (e: PointerEvent) => {
      disableDrag();
      const isSelected =
        store.selectedElement?.type === "port" &&
        store.selectedElement.id === port.data.portType;

      if (e.ctrlKey) {
        if (port.data.isCustom) {
          port.cursor = "move";
        } else {
          port.cursor = "pointer";
        }
      } else {
        if (isSelected && port.data.isCustom) {
          port.cursor = "move";
        } else {
          port.cursor = "crosshair";
        }
      }
    });
    port.on(PointerEvent.LEAVE, enableDrag);

    // Add port interaction
    port.on(PointerEvent.DOWN, (e: PointerEvent) => {
      // If holding Ctrl, stop propagation to prevent adding new port on nodeGroup
      if (e.ctrlKey) {
        e.stop();
        return;
      }

      e.stop(); // Prevent node drag
      nodeGroup.draggable = false;

      // If custom port and NOT starting connection (maybe distinguishing drag vs connect?)
      // The requirement says: "move endpoint position"
      // If we just drag, is it moving port or starting connection?
      // Usually, clicking center starts connection. Dragging moves port?
      // Let's use a flag or check if we are on the edge of port?
      // Simpler: If cursor is 'move' (custom port), we drag the port.
      // But how to connect then?
      // Maybe: Connect is Drag from Center? Move is Drag?
      // Or: Click to start connection?
      // Current connection logic: Drag from port starts connection line.
      // User said: "press and hold circle to move endpoint".
      // This conflicts with "drag to connect".
      // Compromise:
      // If Shift is held -> Move? Or maybe just default behavior is Move, and Connect requires something else?
      // Or: Dragging *away* from task connects. Dragging *along* edge moves?
      // That's complex to detect.
      // Let's use Mode or Modifier.
      // User didn't specify modifier for move. "press and hold circle... move endpoint"
      // Maybe connection should be: Click and drag *out*?
      // Let's implement: If custom port, drag moves it. Connection can be started by clicking?
      // Wait, "connect" is primary action.
      // Let's allow Move if *not* connecting.
      // How about: If I drag along the edge, it moves. If I drag away, it connects?
      // That's hard to implement with standard drag events cleanly.
      // Let's look at cursor. "Show move pointer".
      // If the pointer is move, the action should be move.
      // So for custom ports, primary drag action is MOVE.
      // How to connect then? Maybe right click? Or Modifier?
      // Or maybe dragging the white handle of an *existing* line is how we connect/reconnect?
      // The prompt says: "Select line... display two ends... drag to specify endpoint".
      // It implies connections are managed by lines.
      // But we still need to create new lines.
      // "Add connection point... click to add".
      // Maybe we can assume: To create connection, you drag from a *default* port, or we add a "Connect" mode?
      // Or simpler: We check the drag direction in first few pixels?
      // Let's try: Custom ports are movable. To connect, maybe hold Shift?
      // Or: Move only works if we stay close to edge?
      // Let's try implementing "Move" for custom ports. If this breaks "Create Connection", we can refine.
      // Actually, if I can add ports easily, maybe I don't need to drag to connect *from* them immediately?
      // But usually you add port to connect.
      // Let's make: Custom Ports -> Drag moves them.
      // Default Ports -> Drag creates connection.
      // To connect from custom port: Maybe click it first to select, then... ?
      // Or: Drag with 'Alt' connects?
      // Let's stick to user request: "press and hold circle to move". This implies Moving is the primary action for these circles.

      const isSelected =
        store.selectedElement?.type === "port" &&
        store.selectedElement.id === port.data.portType;

      if (isSelected && port.data.isCustom) {
        // Move Logic
        // Ensure canvas doesn't move
        if (leaferApp && leaferApp.tree) {
          leaferApp.tree.draggable = false;
        }

        const onMove = (me: DragEvent) => {
          // Update percentage
          const inner = nodeGroup.getInnerPoint(me);
          let pct = 0;
          const side = port.data.side;

          if (side === "top" || side === "bottom") {
            pct = inner.x / TASK_WIDTH;
            // Clamp
            pct = Math.max(0.1, Math.min(0.9, pct));

            // Update visual
            port.x = TASK_WIDTH * pct - 6;
            // y is fixed
          } else {
            pct = inner.y / TASK_HEIGHT;
            pct = Math.max(0.1, Math.min(0.9, pct));

            port.y = TASK_HEIGHT * pct - 6;
          }

          // Store new percentage for End
          port.data.newPercentage = pct;
        };

        const onUp = () => {
          if (port.data.newPercentage !== undefined) {
            store.updateTaskPort(
              task.id,
              port.data.portType,
              port.data.newPercentage
            );
            port.data.percentage = port.data.newPercentage;
            delete port.data.newPercentage;
          }
          port.off(DragEvent.DRAG, onMove);
          port.off(DragEvent.END, onUp);
          nodeGroup.draggable = true;

          // Restore canvas dragging (assuming it was true before, or just re-enable default behavior)
          // In initLeafer we usually set tree.draggable = true (or default)
          // If the app is designed to be pannable.
          if (leaferApp && leaferApp.tree) {
            leaferApp.tree.draggable = true;
          }
        };

        port.on(DragEvent.DRAG, onMove);
        port.on(DragEvent.END, onUp);
      } else {
        // Default Port: Create Connection
        const startX = x + (port.x || 0) + 6;
        const startY = y + (port.y || 0) + 6;
        const side = port.data.side || port.data.portType;
        startConnection(task.id, startX, startY, side);
      }
    });
  });

  nodeGroup.on(PointerEvent.ENTER, () => {
    // If selected, they are already visible.
    // If not selected, hover shows them?
    // User said: "When selected... display as circles".
    // Doesn't explicitly say "Only when selected".
    // But standard behavior is hover shows too.
    // Let's keep hover behavior for non-selected too, or just rely on selection?
    // "Select task... all endpoints display".
    // "Not pressing ctrl, mouse move to circle... display move pointer".
    // This implies we can interact with them.
    // I will keep Hover visibility too for convenience.
    allPorts.forEach((p) => (p.visible = true));
    if (!isConnecting.value) {
      nodeGroup.draggable = true;
    }

    // Show Tooltip
    tooltipText.text = task.name;
    tooltipGroup.x = x + 10;
    tooltipGroup.y = y - 30;
    tooltipGroup.visible = true;

    const charWidth = 14;
    const estimatedWidth = Math.max(40, task.name.length * charWidth);
    tooltipBg.width = estimatedWidth;
    tooltipBg.height = 30;
  });

  nodeGroup.on(PointerEvent.LEAVE, () => {
    // Hide if not selected
    const isTaskSelected =
      store.selectedElement?.type === "task" &&
      store.selectedElement.id === task.id;
    const isAnyPortSelected =
      store.selectedElement?.type === "port" &&
      store.selectedElement.taskId === task.id;

    if (!isTaskSelected && !isAnyPortSelected) {
      allPorts.forEach((p) => (p.visible = false));
    }

    tooltipGroup.visible = false;
  });

  // Ctrl+Click to add port
  nodeGroup.on(PointerEvent.DOWN, (e: PointerEvent) => {
    if (e.ctrlKey) {
      // Prevent drag
      nodeGroup.draggable = false;
      e.stop(); // Stop propagation

      const inner = nodeGroup.getInnerPoint(e);
      const relX = inner.x;
      const relY = inner.y;

      // Check distance to edges
      const threshold = 15;
      let side = "";
      let percentage = 0;

      if (Math.abs(relY) < threshold) {
        side = "top";
        percentage = relX / TASK_WIDTH;
      } else if (Math.abs(relY - TASK_HEIGHT) < threshold) {
        side = "bottom";
        percentage = relX / TASK_WIDTH;
      } else if (Math.abs(relX) < threshold) {
        side = "left";
        percentage = relY / TASK_HEIGHT;
      } else if (Math.abs(relX - TASK_WIDTH) < threshold) {
        side = "right";
        percentage = relY / TASK_HEIGHT;
      }

      if (side) {
        // Clamp percentage
        percentage = Math.max(0.1, Math.min(0.9, percentage));

        const newPort = {
          id: `port_${Date.now()}`,
          side: side as any,
          percentage,
        };

        store.addTaskPort(task.id, newPort);
      }
    }
  });

  // Event
  nodeGroup.on(PointerEvent.TAP, () => {
    store.selectElement("task", task.id);
  });

  nodeGroup.draggable = true;

  nodeGroup.on(DragEvent.DRAG, (e: DragEvent) => {
    // e.x and e.y are the pointer coordinates, not the top-left of the group
    // We need to use e.target.x / e.target.y (or e.current.x / e.current.y) for the element position
    const target = e.current as Group;
    let x = target.x || 0;
    let y = target.y || 0;

    // Alignment & Snapping Logic
    if (currentGuideGroup) {
      currentGuideGroup.clear();

      const threshold = 10;

      const myLeft = x;
      const myRight = x + TASK_WIDTH;
      const myCenterX = x + TASK_WIDTH / 2;

      const myTop = y;
      const myBottom = y + TASK_HEIGHT;
      const myCenterY = y + TASK_HEIGHT / 2;

      // Find closest horizontal and vertical matches
      let minDiffX = Infinity;
      let bestX = x;
      let guideX: { x: number; y1: number; y2: number } | null = null;

      let minDiffY = Infinity;
      let bestY = y;
      let guideY: { y: number; x1: number; x2: number } | null = null;

      for (const [otherId, pos] of taskPositions) {
        if (otherId === task.id) continue;

        // X Alignment
        const otherLeft = pos.x;
        const otherRight = pos.x + pos.width;
        const otherCenterX = pos.x + pos.width / 2;

        const checksX = [
          { val: otherLeft, target: "left", diff: otherLeft - myLeft },
          { val: otherLeft, target: "right", diff: otherLeft - myRight },
          { val: otherLeft, target: "center", diff: otherLeft - myCenterX },

          { val: otherRight, target: "left", diff: otherRight - myLeft },
          { val: otherRight, target: "right", diff: otherRight - myRight },
          { val: otherRight, target: "center", diff: otherRight - myCenterX },

          { val: otherCenterX, target: "left", diff: otherCenterX - myLeft },
          { val: otherCenterX, target: "right", diff: otherCenterX - myRight },
          {
            val: otherCenterX,
            target: "center",
            diff: otherCenterX - myCenterX,
          },
        ];

        for (const check of checksX) {
          if (
            Math.abs(check.diff) < threshold &&
            Math.abs(check.diff) < Math.abs(minDiffX)
          ) {
            minDiffX = check.diff;
            // Apply snap
            if (check.target === "left") bestX = check.val;
            if (check.target === "right") bestX = check.val - TASK_WIDTH;
            if (check.target === "center") bestX = check.val - TASK_WIDTH / 2;

            // Guide line range
            const y1 = Math.min(y, pos.y);
            const y2 = Math.max(y + TASK_HEIGHT, pos.y + pos.height);
            guideX = { x: check.val, y1, y2 };
          }
        }

        // Y Alignment
        const otherTop = pos.y;
        const otherBottom = pos.y + pos.height;
        const otherCenterY = pos.y + pos.height / 2;

        const checksY = [
          { val: otherTop, target: "top", diff: otherTop - myTop },
          { val: otherTop, target: "bottom", diff: otherTop - myBottom },
          { val: otherTop, target: "center", diff: otherTop - myCenterY },

          { val: otherBottom, target: "top", diff: otherBottom - myTop },
          { val: otherBottom, target: "bottom", diff: otherBottom - myBottom },
          { val: otherBottom, target: "center", diff: otherBottom - myCenterY },

          { val: otherCenterY, target: "top", diff: otherCenterY - myTop },
          {
            val: otherCenterY,
            target: "bottom",
            diff: otherCenterY - myBottom,
          },
          {
            val: otherCenterY,
            target: "center",
            diff: otherCenterY - myCenterY,
          },
        ];

        for (const check of checksY) {
          if (
            Math.abs(check.diff) < threshold &&
            Math.abs(check.diff) < Math.abs(minDiffY)
          ) {
            minDiffY = check.diff;
            // Apply snap
            if (check.target === "top") bestY = check.val;
            if (check.target === "bottom") bestY = check.val - TASK_HEIGHT;
            if (check.target === "center") bestY = check.val - TASK_HEIGHT / 2;

            // Guide line range
            const x1 = Math.min(x, pos.x);
            const x2 = Math.max(x + TASK_WIDTH, pos.x + pos.width);
            guideY = { y: check.val, x1, x2 };
          }
        }
      }

      if (Math.abs(minDiffX) < threshold) {
        x = bestX;
        target.x = x;
        if (guideX) {
          currentGuideGroup.add(
            new Line({
              points: [guideX.x, guideX.y1 - 20, guideX.x, guideX.y2 + 20],
              stroke: "#2196F3",
              strokeWidth: 1,
              dashPattern: [4, 4],
            })
          );
        }
      }

      if (Math.abs(minDiffY) < threshold) {
        y = bestY;
        target.y = y;
        if (guideY) {
          currentGuideGroup.add(
            new Line({
              points: [guideY.x1 - 20, guideY.y, guideY.x2 + 20, guideY.y],
              stroke: "#2196F3",
              strokeWidth: 1,
              dashPattern: [4, 4],
            })
          );
        }
      }
    }

    taskPositions.set(task.id, {
      x: x,
      y: y,
      width: TASK_WIDTH,
      height: TASK_HEIGHT,
      phaseId: task.phaseId,
    });

    updateConnectedLines(task.id, x, y);
  });

  nodeGroup.on(DragEvent.END, (e: DragEvent) => {
    if (currentGuideGroup) currentGuideGroup.clear();

    const target = e.current as Group;
    // Calculate center of dropped node
    const centerX = (target.x || 0) + TASK_WIDTH / 2;
    const centerY = (target.y || 0) + TASK_HEIGHT / 2;

    let newPhaseId = task.phaseId;
    let newSwimlaneId = task.swimlaneId;

    // Find Phase
    let phaseX = 0;
    for (const [id, bounds] of phaseBoundaries) {
      if (centerX >= bounds.x && centerX < bounds.x + bounds.width) {
        newPhaseId = id;
        phaseX = bounds.x;
        break;
      }
    }

    // Find Swimlane
    let swimlaneY = 0;
    for (const [id, bounds] of swimlaneBoundaries) {
      if (centerY >= bounds.y && centerY < bounds.y + bounds.height) {
        newSwimlaneId = id;
        swimlaneY = bounds.y;
        break;
      }
    }

    // Calculate relative position to the new cell
    const relativeX = (target.x || 0) - phaseX;
    const relativeY = (target.y || 0) - swimlaneY;

    // Update task position in store
    store.updateTask(task.id, {
      phaseId: newPhaseId,
      swimlaneId: newSwimlaneId,
      x: relativeX,
      y: relativeY,
      autoPositioned: false,
    });
  });

  group.add(nodeGroup);
};

const getAllTaskPorts = (
  pos: { x: number; y: number; width: number; height: number },
  task?: { ports?: { id: string; side: string; percentage: number }[] }
) => {
  // Default ports
  const ports = [
    { id: "top", side: "top", x: pos.x + pos.width / 2, y: pos.y },
    {
      id: "bottom",
      side: "bottom",
      x: pos.x + pos.width / 2,
      y: pos.y + pos.height,
    },
    { id: "left", side: "left", x: pos.x, y: pos.y + pos.height / 2 },
    {
      id: "right",
      side: "right",
      x: pos.x + pos.width,
      y: pos.y + pos.height / 2,
    },
  ];

  // Custom ports
  if (task && task.ports) {
    task.ports.forEach((p) => {
      let px = 0,
        py = 0;
      if (p.side === "top") {
        px = pos.x + pos.width * p.percentage;
        py = pos.y;
      } else if (p.side === "bottom") {
        px = pos.x + pos.width * p.percentage;
        py = pos.y + pos.height;
      } else if (p.side === "left") {
        px = pos.x;
        py = pos.y + pos.height * p.percentage;
      } else if (p.side === "right") {
        px = pos.x + pos.width;
        py = pos.y + pos.height * p.percentage;
      }
      ports.push({ id: p.id, side: p.side, x: px, y: py });
    });
  }
  return ports;
};

const getBestConnectionPoints = (
  sourcePos: { x: number; y: number; width: number; height: number },
  targetPos: { x: number; y: number; width: number; height: number },
  forcedSourceSide?: string,
  forcedTargetSide?: string,
  sourceTask?: any,
  targetTask?: any
) => {
  // Get all available ports
  const sPorts = getAllTaskPorts(sourcePos, sourceTask);
  const tPorts = getAllTaskPorts(targetPos, targetTask);

  let start = sPorts.find((p) => p.side === "right") || sPorts[0];
  let end = tPorts.find((p) => p.side === "left") || tPorts[0];

  if (sPorts.length === 0 || tPorts.length === 0 || !start || !end) {
    return {
      startX: sourcePos.x + sourcePos.width / 2,
      startY: sourcePos.y + sourcePos.height / 2,
      endX: targetPos.x + targetPos.width / 2,
      endY: targetPos.y + targetPos.height / 2,
      startSide: "right",
      endSide: "left",
    };
  }

  // 1. Handle Forced Ports (by ID or Side)
  // forcedSourceSide/forcedTargetSide can be 'top'/'bottom'/'left'/'right' OR a specific port ID

  if (forcedSourceSide) {
    // Try finding by ID first
    const pById = sPorts.find((p) => p.id === forcedSourceSide);
    if (pById) {
      start = pById;
    } else {
      // Try finding by Side (if multiple, pick best later? or default center)
      // Legacy behavior: 'top' -> center top
      // If we have multiple 'top' ports, and user passed 'top', we might want the default one (id='top')
      const pBySide =
        sPorts.find(
          (p) => p.side === forcedSourceSide && p.id === forcedSourceSide
        ) || sPorts.find((p) => p.side === forcedSourceSide);
      if (pBySide) start = pBySide;
    }
  }

  if (forcedTargetSide) {
    const pById = tPorts.find((p) => p.id === forcedTargetSide);
    if (pById) {
      end = pById;
    } else {
      const pBySide =
        tPorts.find(
          (p) => p.side === forcedTargetSide && p.id === forcedTargetSide
        ) || tPorts.find((p) => p.side === forcedTargetSide);
      if (pBySide) end = pBySide;
    }
  }

  // 2. Auto Routing (if not both forced)
  if (!forcedSourceSide || !forcedTargetSide) {
    if (forcedSourceSide && !forcedTargetSide) {
      // Find best target port for fixed start
      let minDst = Infinity;
      tPorts.forEach((tp) => {
        const d =
          Math.abs(tp.x - (start?.x || 0)) + Math.abs(tp.y - (start?.y || 0));
        if (d < minDst) {
          minDst = d;
          end = tp;
        }
      });
    } else if (!forcedSourceSide && forcedTargetSide) {
      // Find best source port for fixed end
      let minDst = Infinity;
      sPorts.forEach((sp) => {
        const d =
          Math.abs(sp.x - (end?.x || 0)) + Math.abs(sp.y - (end?.y || 0));
        if (d < minDst) {
          minDst = d;
          start = sp;
        }
      });
    } else {
      // Full Auto: Find best pair
      // Heuristic: Horizontal flow preference
      // Calculate center direction
      const cx1 = sourcePos.x + sourcePos.width / 2;
      const cy1 = sourcePos.y + sourcePos.height / 2;
      const cx2 = targetPos.x + targetPos.width / 2;
      const cy2 = targetPos.y + targetPos.height / 2;
      const dx = cx2 - cx1;
      const dy = cy2 - cy1;

      let preferredSourceSide = "right";
      let preferredTargetSide = "left";

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) {
          preferredSourceSide = "right";
          preferredTargetSide = "left";
        } else {
          preferredSourceSide = "left";
          preferredTargetSide = "right";
        }
      } else {
        if (dy > 0) {
          preferredSourceSide = "bottom";
          preferredTargetSide = "top";
        } else {
          preferredSourceSide = "top";
          preferredTargetSide = "bottom";
        }
      }

      // Try to find ports on preferred sides
      // If multiple, pick closest
      const sCandidates = sPorts.filter((p) => p.side === preferredSourceSide);
      const tCandidates = tPorts.filter((p) => p.side === preferredTargetSide);

      if (sCandidates.length > 0 && tCandidates.length > 0) {
        // Find pair with min distance among preferred
        let minDst = Infinity;
        sCandidates.forEach((sp) => {
          tCandidates.forEach((tp) => {
            const d = Math.abs(sp.x - tp.x) + Math.abs(sp.y - tp.y);
            if (d < minDst) {
              minDst = d;
              start = sp;
              end = tp;
            }
          });
        });
      } else {
        // Fallback: Check all pairs
        let minDst = Infinity;
        sPorts.forEach((sp) => {
          tPorts.forEach((tp) => {
            const d = Math.abs(sp.x - tp.x) + Math.abs(sp.y - tp.y);
            if (d < minDst) {
              minDst = d;
              start = sp;
              end = tp;
            }
          });
        });
      }
    }
  }

  return {
    startX: start?.x || 0,
    startY: start?.y || 0,
    endX: end?.x || 0,
    endY: end?.y || 0,
    startSide: start?.side,
    endSide: end?.side,
  };
};

const updateConnectedLines = (
  movedTaskId: string,
  currentX?: number,
  currentY?: number
) => {
  const lines = lineMap.get(movedTaskId);
  if (!lines) return;

  // If coordinates are provided, use them; otherwise fallback to stored position
  // Note: e.x / e.y in DragEvent are usually world coordinates of the drag target
  // We need to use the passed coordinates for the moved task to ensure real-time accuracy

  const movedPos = taskPositions.get(movedTaskId);
  if (!movedPos) return;

  // Override with current drag coordinates if available
  const activeX = currentX !== undefined ? currentX : movedPos.x;
  const activeY = currentY !== undefined ? currentY : movedPos.y;

  const activePos = { ...movedPos, x: activeX, y: activeY };

  lines.forEach(({ line, arrow, type, otherId }) => {
    const otherPos = taskPositions.get(otherId);
    if (!otherPos) return;

    // Find dependency data to check for forced ports
    let forcedSourceSide: string | undefined;
    let forcedTargetSide: string | undefined;

    let sourceId, targetId;
    if (type === "incoming") {
      sourceId = otherId;
      targetId = movedTaskId;
    } else {
      sourceId = movedTaskId;
      targetId = otherId;
    }

    const sourceTask = store.tasks.find((t) => t.id === sourceId);
    const targetTask = store.tasks.find((t) => t.id === targetId);

    if (sourceTask) {
      const dep = sourceTask.dependencies.find(
        (d) => (typeof d === "string" ? d : d.taskId) === targetId
      );
      if (dep && typeof dep === "object") {
        forcedSourceSide = dep.sourcePort;
        forcedTargetSide = dep.targetPort;
      }
    }

    // Get dependency type
    let depType = "curve";
    if (sourceTask) {
      const dep = sourceTask.dependencies.find(
        (d) => (typeof d === "string" ? d : d.taskId) === targetId
      );
      if (dep && typeof dep === "object" && dep.type) {
        depType = dep.type;
      }
    }

    let startX, startY, endX, endY, startSide, endSide;

    // Determine start and end points based on line direction
    if (type === "incoming") {
      // Line is otherId -> movedTaskId
      // Use helper to find best points between otherPos (Source) and activePos (Target)
      const points = getBestConnectionPoints(
        otherPos,
        activePos,
        forcedSourceSide,
        forcedTargetSide,
        sourceTask,
        targetTask
      );
      startX = points.startX;
      startY = points.startY;
      endX = points.endX;
      endY = points.endY;
      startSide = points.startSide;
      endSide = points.endSide;
    } else {
      // Line is movedTaskId -> otherId
      // Use helper to find best points between activePos (Source) and otherPos (Target)
      const points = getBestConnectionPoints(
        activePos,
        otherPos,
        forcedSourceSide,
        forcedTargetSide,
        sourceTask,
        targetTask
      );
      startX = points.startX;
      startY = points.startY;
      endX = points.endX;
      endY = points.endY;
      startSide = points.startSide;
      endSide = points.endSide;
    }

    let pathData = "";

    if (depType === "straight") {
      pathData = `M ${startX} ${startY} L ${endX} ${endY}`;
    } else if (depType === "curve") {
      // Cubic Bezier
      let cp1X = startX;
      let cp1Y = startY;
      let cp2X = endX;
      let cp2Y = endY;

      const dist = Math.sqrt(
        Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)
      );
      const controlDist = Math.max(dist * 0.5, 50);

      if (startSide === "left") cp1X -= controlDist;
      else if (startSide === "right") cp1X += controlDist;
      else if (startSide === "top") cp1Y -= controlDist;
      else if (startSide === "bottom") cp1Y += controlDist;

      if (endSide === "left") cp2X -= controlDist;
      else if (endSide === "right") cp2X += controlDist;
      else if (endSide === "top") cp2Y -= controlDist;
      else if (endSide === "bottom") cp2Y += controlDist;

      pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y} ${cp2X} ${cp2Y} ${endX} ${endY}`;
    } else {
      // Re-calculate path with Orthogonal Routing respecting sides
      const exitDist = 20;
      let exitX = startX;
      let exitY = startY;
      let entryX = endX;
      let entryY = endY;

      // Calculate Exit Point
      if (startSide === "right") exitX += exitDist;
      else if (startSide === "left") exitX -= exitDist;
      else if (startSide === "bottom") exitY += exitDist;
      else if (startSide === "top") exitY -= exitDist;

      // Calculate Entry Point
      if (endSide === "right") entryX += exitDist;
      else if (endSide === "left") entryX -= exitDist;
      else if (endSide === "bottom") entryY += exitDist;
      else if (endSide === "top") entryY -= exitDist;

      pathData = `M ${startX} ${startY} L ${exitX} ${exitY}`;

      const midX = (exitX + entryX) / 2;
      const midY = (exitY + entryY) / 2;

      const isStartVertical = startSide === "top" || startSide === "bottom";
      const isEndVertical = endSide === "top" || endSide === "bottom";

      if (isStartVertical && isEndVertical) {
        // V -> H -> V
        pathData += ` L ${exitX} ${midY} L ${entryX} ${midY} L ${entryX} ${entryY}`;
      } else if (!isStartVertical && !isEndVertical) {
        // H -> V -> H
        pathData += ` L ${midX} ${exitY} L ${midX} ${entryY} L ${entryX} ${entryY}`;
      } else if (isStartVertical && !isEndVertical) {
        // V -> H
        pathData += ` L ${exitX} ${entryY} L ${entryX} ${entryY}`;
      } else {
        // H -> V
        pathData += ` L ${entryX} ${exitY} L ${entryX} ${entryY}`;
      }

      pathData += ` L ${endX} ${endY}`;
    }

    line.path = pathData;

    // Update Arrow
    arrow.x = endX;
    arrow.y = endY;

    // Calculate rotation based on endSide and line type
    let angle = 0;

    if (depType === "straight") {
      angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;
    } else if (depType === "curve") {
      let depObj: any = null;
      if (sourceTask) {
        const d = sourceTask.dependencies.find(
          (d) => (typeof d === "string" ? d : d.taskId) === targetId
        );
        depObj = d && typeof d === "object" ? d : null;
      }
      const cps = getCurveControlPoints(
        startX,
        startY,
        endX,
        endY,
        startSide,
        endSide,
        depObj?.controlPoints
      );
      if (cps.length > 0) {
        const lastCP = cps[cps.length - 1]!;
        angle = (Math.atan2(endY - lastCP.y, endX - lastCP.x) * 180) / Math.PI;
      }
    } else {
      if (endSide === "left") angle = 0;
      else if (endSide === "right") angle = 180;
      else if (endSide === "top") angle = 90;
      else if (endSide === "bottom") angle = -90;
    }

    arrow.rotation = angle;

    arrow.rotation = angle;
  });
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    // Check if task is selected
    if (store.selectedElement?.type === "task") {
      const taskId = store.selectedElement.id;
      dialog.warning({
        title: "确认删除",
        content: "确定删除该任务吗？",
        positiveText: "确定",
        negativeText: "取消",
        positiveButtonProps: { autofocus: true } as any,
        onPositiveClick: () => {
          store.deleteTask(taskId);
        },
      });
      return;
    }

    if (store.selectedElement?.type === "dependency") {
      const [sourceId, targetId] = store.selectedElement.id.split("|");
      if (sourceId && targetId) {
        dialog.warning({
          title: "确认删除",
          content: "确定删除该连线吗？",
          positiveText: "确定",
          negativeText: "取消",
          positiveButtonProps: { autofocus: true } as any,
          onPositiveClick: () => {
            store.removeDependency(sourceId, targetId);
            store.clearSelection();
          },
        });
      }
      return;
    }
    if (store.selectedElement?.type === "port") {
      if (store.selectedElement.taskId) {
        const taskId = store.selectedElement.taskId;
        const portId = store.selectedElement.id;
        dialog.warning({
          title: "确认删除",
          content: "确定删除该连接点吗？",
          positiveText: "确定",
          negativeText: "取消",
          positiveButtonProps: { autofocus: true } as any,
          onPositiveClick: () => {
            store.removeTaskPort(taskId, portId);
            store.selectElement("task", taskId);
          },
        });
      }
      return;
    }
  }

  if (!store.selectedElement) return;

  // Handle Port Movement
  if (store.selectedElement.type === "port" && store.selectedElement.taskId) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
      return;
    e.preventDefault();

    const taskId = store.selectedElement.taskId;
    const portId = store.selectedElement.id;
    const task = store.tasks.find((t) => t.id === taskId);
    if (task && task.ports) {
      const port = task.ports.find((p) => p.id === portId);
      if (port) {
        let newPct = port.percentage;
        const step = 0.01; // 1%

        if (port.side === "top" || port.side === "bottom") {
          if (e.key === "ArrowLeft") newPct -= step;
          if (e.key === "ArrowRight") newPct += step;
        } else {
          if (e.key === "ArrowUp") newPct -= step;
          if (e.key === "ArrowDown") newPct += step;
        }

        // Clamp
        newPct = Math.max(0.1, Math.min(0.9, newPct));

        store.updateTaskPort(taskId, portId, newPct);
      }
    }
    return;
  }

  if (store.selectedElement.type !== "task") return;

  // Check if arrow key
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
    return;

  e.preventDefault();

  const taskId = store.selectedElement.id;
  const task = store.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const pos = taskPositions.get(taskId);
  if (!pos) return;

  const phaseBounds = phaseBoundaries.get(task.phaseId);
  const laneBounds = swimlaneBoundaries.get(task.swimlaneId);

  if (!phaseBounds || !laneBounds) return;

  // Determine step
  let step = 10;
  if (e.shiftKey) step = 50;
  if (e.ctrlKey || e.metaKey) step = 1;

  // Calculate current relative position if not set
  let currentRelX = task.x;
  let currentRelY = task.y;

  if (currentRelX === undefined) {
    currentRelX = pos.x - phaseBounds.x;
  }
  if (currentRelY === undefined) {
    currentRelY = pos.y - laneBounds.y;
  }

  let newX = currentRelX;
  let newY = currentRelY;

  switch (e.key) {
    case "ArrowUp":
      newY -= step;
      break;
    case "ArrowDown":
      newY += step;
      break;
    case "ArrowLeft":
      newX -= step;
      break;
    case "ArrowRight":
      newX += step;
      break;
  }

  store.updateTask(taskId, {
    x: newX,
    y: newY,
    autoPositioned: false,
  });
};

const checkSelectionVisibility = () => {
  if (!leaferApp || !leaferApp.tree) return;

  if (!store.selectedElement) {
    // If no selection, try to fix empty space
    fixCanvasPosition();
    return;
  }

  const { type, id } = store.selectedElement;
  let targetRect = null;

  if (type === "task") {
    const pos = taskPositions.get(id);
    if (pos) {
      targetRect = { x: pos.x, y: pos.y, width: pos.width, height: pos.height };
    }
  } else if (type === "dependency") {
    // id is "source|target"
    const parts = id.split("|");
    if (parts.length >= 2) {
      const sId = parts[0];
      const tId = parts[1];
      if (sId && tId) {
        const sPos = taskPositions.get(sId);
        const tPos = taskPositions.get(tId);
        if (sPos && tPos) {
          // Union rect of connected tasks
          const minX = Math.min(sPos.x, tPos.x);
          const minY = Math.min(sPos.y, tPos.y);
          const maxX = Math.max(sPos.x + sPos.width, tPos.x + tPos.width);
          const maxY = Math.max(sPos.y + sPos.height, tPos.y + tPos.height);
          targetRect = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };
        }
      }
    }
  }

  if (targetRect) {
    const tree = leaferApp.tree;
    const scale = tree.scaleX || 1;
    const tx = tree.x || 0;
    const ty = tree.y || 0;

    // Screen Coords
    const sx = targetRect.x * scale + tx;
    const sy = targetRect.y * scale + ty;
    const sw = targetRect.width * scale;
    const sh = targetRect.height * scale;

    const vw = leaferApp.width || 0;
    const vh = leaferApp.height || 0;

    const padding = 60;

    let dx = 0;
    let dy = 0;

    if (sx < padding) {
      dx = padding - sx;
    } else if (sx + sw > vw - padding) {
      dx = vw - padding - (sx + sw);
    }

    if (sy < padding) {
      dy = padding - sy;
    } else if (sy + sh > vh - padding) {
      dy = vh - padding - (sy + sh);
    }

    if (dx !== 0 || dy !== 0) {
      tree.x = tx + dx;
      tree.y = ty + dy;
    }
  }
};

const fixCanvasPosition = () => {
  if (!leaferApp || !leaferApp.tree) return;
  const tree = leaferApp.tree;
  const currentX = tree.x ?? 0;

  if (currentX < 0) {
    const vw = leaferApp.width || 0;
    const scale = tree.scaleX || 1;
    const contentRight = currentX + lastContentWidth * scale;

    if (contentRight < vw) {
      const gap = vw - contentRight;
      // Move right to fill gap, but don't move past 0
      const shift = Math.min(gap, -currentX);
      tree.x = currentX + shift;
    }
  }
};

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  initLeafer();
  startAnimationLoop();

  if (containerRef.value) {
    const container = containerRef.value;
    let resizeTimer: any = null;
    resizeObserver = new ResizeObserver((entries) => {
      if (leaferApp) {
        const { width, height } = entries[0]?.contentRect || {
          width: container.clientWidth,
          height: container.clientHeight,
        };
        leaferApp.resize({ width, height });
        
        // Debounce the visibility check to allow for transitions to finish
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          checkSelectionVisibility();
        }, 300);
      }
    });
    resizeObserver.observe(containerRef.value);
  }

  window.addEventListener("keydown", handleKeyDown);
  store.setExportImageHandler(async () => {
    if (!leaferApp) {
      dialog.error({
        title: "导出失败",
        content: "画布未初始化",
        positiveText: "确定",
        positiveButtonProps: { autofocus: true } as any,
      });
      return;
    }
    try {
      if (!chartGroup) {
        dialog.error({
          title: "导出失败",
          content: "图表未绘制",
          positiveText: "确定",
          positiveButtonProps: { autofocus: true } as any,
        });
        return;
      }

      const filename = `project-${store.projectInfo.code}-${
        new Date().toISOString().split("T")[0]
      }.png`;

      console.log("Exporting to:", filename);

      const currentZoom = store.viewSettings.zoomLevel || 1;
      const exportRatio = Math.max(0.5, Math.min(currentZoom, 4));

      console.log(
        `Exporting with ratio: ${exportRatio} (Zoom: ${currentZoom})`
      );

      const result = await chartGroup.export(filename, {
        quality: 1,
        pixelRatio: exportRatio,
      });

      console.log("Export completed", result);
      // If we got here without error, the export (and download) was successful
    } catch (e) {
      console.error(e);
      dialog.error({
        title: "导出失败",
        content: "请查看控制台",
        positiveText: "确定",
        positiveButtonProps: { autofocus: true } as any,
      });
    }
  });

  // Initial draw and fit view
  if (store.tasks.length > 0) {
    drawChart();
    setTimeout(() => {
      store.fitView();
    }, 100);
  }
});

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (leaferApp) {
    leaferApp.destroy();
  }
  cancelAnimationFrame(animationFrameId);
  window.removeEventListener("keydown", handleKeyDown);
});

// Reactivity
watch(() => store.tasks, drawChart, { deep: true });
watch(() => store.phases, drawChart, { deep: true });
watch(() => store.swimlanes, drawChart, { deep: true });
watch(
  () => store.selectedElement,
  () => {
    drawChart();
    // Check visibility when selection changes (in case drawer is already open)
    setTimeout(() => {
      checkSelectionVisibility();
    }, 100);
  },
  { deep: true }
);
watch(
  () => store.viewSettings.zoomLevel,
  (val) => {
    if (leaferApp) {
      // Center zoom? Or just scale?
      // leaferApp.tree.scale = val // Scale tree?
      // Using tree.scale works but origin matters.
      // Let's just use the app zoom config if possible, or manual scale.
      leaferApp.tree.scaleX = val;
      leaferApp.tree.scaleY = val;
    }
  }
);
watch(() => store.viewSettings.filterStatuses, drawChart, { deep: true });
watch(() => store.viewSettings.filterPhases, drawChart, { deep: true });
watch(() => store.viewSettings.filterSwimlanes, drawChart, { deep: true });
watch(
  () => store.viewSettings.resetViewTrigger,
  () => {
    if (leaferApp && leaferApp.tree) {
      leaferApp.tree.x = 0;
      leaferApp.tree.y = 0;
    }
  }
);
watch(
  () => store.viewSettings.fitViewTrigger,
  () => {
    if (leaferApp && containerRef.value) {
      if (lastContentWidth <= 0 || lastContentHeight <= 0) return;

      const containerW = containerRef.value.clientWidth;
      const containerH = containerRef.value.clientHeight;
      const padding = 40;

      const availW = containerW - padding;
      const availH = containerH - padding;

      const scaleX = availW / lastContentWidth;
      const scaleY = availH / lastContentHeight;

      let newScale = Math.min(scaleX, scaleY);
      newScale = Math.max(0.1, Math.min(3, newScale));

      const newX = (containerW - lastContentWidth * newScale) / 2;
      const newY = (containerH - lastContentHeight * newScale) / 2;

      leaferApp.tree.scaleX = newScale;
      leaferApp.tree.scaleY = newScale;
      leaferApp.tree.x = newX;
      leaferApp.tree.y = newY;

      store.viewSettings.zoomLevel = newScale;
    }
  }
);
</script>

<template>
  <div class="leafer-container" ref="containerRef"></div>
</template>

<style scoped>
.leafer-container {
  width: 100% !important;
  height: 100% !important;
  background: #f9f9f9;
}
</style>
