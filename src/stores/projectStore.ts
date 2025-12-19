import { defineStore } from 'pinia'
import type { Phase, Swimlane, Task, ViewSettings, Attachment, TaskPort, TaskDependency, ProjectInfo } from '../types'

export const useProjectStore = defineStore('project', {
  state: () => ({
    projectInfo: {
      code: 'PRJ-2024-001',
      name: '地铁车辆设计项目',
      type: '车辆工程',
      description: '地铁车辆全生命周期设计项目',
      manager: '张三',
      plannedStartDate: '2024-01-01',
      plannedEndDate: '2024-12-31'
    } as ProjectInfo,
    phases: [
      { id: 'p1', name: '概念设计阶段', color: '#E3F2FD' },
      { id: 'p2', name: '方案设计阶段', color: '#E8F5E9' },
      { id: 'p3', name: '详细设计阶段', color: '#FFF3E0' },
      { id: 'p4', name: '设计验证阶段', color: '#F3E5F5' },
    ] as Phase[],
    swimlanes: [
      { id: 'sl1', name: '项目管理', color: '#F5F5F5' },
      { id: 'sl2', name: '机械设计专业', color: '#E1F5FE' },
      { id: 'sl3', name: '电气设计专业', color: '#FFF3E0' },
      { id: 'sl4', name: '软件与控制专业', color: '#E8F5E9' },
      { id: 'sl5', name: '工业设计专业', color: '#F3E5F5' },
      { id: 'sl6', name: '系统集成与验证', color: '#EFEBE9' },
      { id: 'sl7', name: '质量管理', color: '#FFEBEE' },
    ] as Swimlane[],
    tasks: [
      // 概念设计阶段
      { 
        id: 't1_1', 
        name: '项目启动与需求分析', 
        phaseId: 'p1', 
        swimlaneId: 'sl1', 
        status: 'completed', 
        progress: 100, 
        owner: '项目经理', 
        startDate: '2024-01-01', 
        endDate: '2024-01-10', 
        dependencies: [], 
        type: 'task',
        attachments: [
          { id: 'a1', name: '项目章程.pdf', url: '#', type: 'pdf', uploadDate: '2024-01-02' },
          { id: 'a2', name: '需求规格说明书_v1.0.docx', url: '#', type: 'doc', uploadDate: '2024-01-05' }
        ]
      },
      { 
        id: 't1_2', 
        name: '总体方案设计', 
        phaseId: 'p1', 
        swimlaneId: 'sl6', 
        status: 'completed', 
        progress: 100, 
        owner: '总工', 
        startDate: '2024-01-11', 
        endDate: '2024-01-25', 
        dependencies: ['t1_1'], 
        type: 'task',
        attachments: [
          { id: 'a3', name: '总体方案汇报.pptx', url: '#', type: 'ppt', uploadDate: '2024-01-20' }
        ]
      },
      { id: 't1_3', name: '概念评审与冻结', phaseId: 'p1', swimlaneId: 'sl1', status: 'completed', progress: 100, owner: '项目经理', startDate: '2024-01-26', endDate: '2024-01-26', dependencies: ['t1_2'], type: 'milestone' },

      // 方案设计阶段 - 机械
      { id: 't2_1', name: '车体方案设计', phaseId: 'p2', swimlaneId: 'sl2', status: 'completed', progress: 100, owner: '张工', startDate: '2024-02-01', endDate: '2024-02-20', dependencies: ['t1_3'], type: 'task' },
      { id: 't2_2', name: '转向架方案', phaseId: 'p2', swimlaneId: 'sl2', status: 'completed', progress: 100, owner: '陈工', startDate: '2024-02-01', endDate: '2024-02-25', dependencies: ['t1_3'], type: 'task' },
      { id: 't2_3', name: '连接装置设计', phaseId: 'p2', swimlaneId: 'sl2', status: 'completed', progress: 100, owner: '王工', startDate: '2024-02-05', endDate: '2024-02-20', dependencies: ['t1_3'], type: 'task' },
      
      // 方案设计阶段 - 电气
      { id: 't2_4', name: '牵引系统方案', phaseId: 'p2', swimlaneId: 'sl3', status: 'in_progress', progress: 80, owner: '李工', startDate: '2024-02-01', endDate: '2024-02-28', dependencies: ['t1_3'], type: 'task' },
      { id: 't2_5', name: '辅助供电系统', phaseId: 'p2', swimlaneId: 'sl3', status: 'in_progress', progress: 70, owner: '周工', startDate: '2024-02-05', endDate: '2024-02-25', dependencies: ['t1_3'], type: 'task' },
      { id: 't2_6', name: '车载电气布置', phaseId: 'p2', swimlaneId: 'sl3', status: 'pending', progress: 0, owner: '吴工', startDate: '2024-02-10', endDate: '2024-03-01', dependencies: ['t1_3'], type: 'task' },

      // 方案设计阶段 - 软件
      { id: 't2_7', name: '网络控制系统方案', phaseId: 'p2', swimlaneId: 'sl4', status: 'in_progress', progress: 50, owner: '赵工', startDate: '2024-02-01', endDate: '2024-02-28', dependencies: ['t1_3'], type: 'task' },
      { id: 't2_8', name: '车载软件框架', phaseId: 'p2', swimlaneId: 'sl4', status: 'pending', progress: 0, owner: '钱工', startDate: '2024-02-10', endDate: '2024-03-05', dependencies: ['t1_3'], type: 'task' },

      // 方案设计阶段 - 工业设计
      { id: 't2_9', name: '外观造型设计', phaseId: 'p2', swimlaneId: 'sl5', status: 'completed', progress: 100, owner: '孙工', startDate: '2024-02-01', endDate: '2024-02-20', dependencies: ['t1_3'], type: 'task' },
      { id: 't2_10', name: '内饰方案设计', phaseId: 'p2', swimlaneId: 'sl5', status: 'in_progress', progress: 60, owner: '郑工', startDate: '2024-02-15', endDate: '2024-03-10', dependencies: ['t1_3'], type: 'task' },

      // 详细设计阶段 - 机械
      { id: 't3_1', name: '车体详细设计', phaseId: 'p3', swimlaneId: 'sl2', status: 'pending', progress: 0, owner: '张工', startDate: '2024-03-01', endDate: '2024-04-30', dependencies: ['t2_1'], type: 'task' },
      { id: 't3_2', name: '转向架详细设计', phaseId: 'p3', swimlaneId: 'sl2', status: 'pending', progress: 0, owner: '陈工', startDate: '2024-03-01', endDate: '2024-05-15', dependencies: ['t2_2'], type: 'task' },
      { id: 't3_3', name: '内装详细设计', phaseId: 'p3', swimlaneId: 'sl2', status: 'pending', progress: 0, owner: '郑工', startDate: '2024-03-15', endDate: '2024-05-01', dependencies: ['t2_10'], type: 'task' },

      // 详细设计阶段 - 电气
      { id: 't3_4', name: '电气原理设计', phaseId: 'p3', swimlaneId: 'sl3', status: 'pending', progress: 0, owner: '李工', startDate: '2024-03-01', endDate: '2024-04-15', dependencies: ['t2_4'], type: 'task' },
      { id: 't3_5', name: '线束设计', phaseId: 'p3', swimlaneId: 'sl3', status: 'pending', progress: 0, owner: '吴工', startDate: '2024-03-15', endDate: '2024-05-01', dependencies: ['t2_6'], type: 'task' },
      { id: 't3_6', name: '电气柜详细设计', phaseId: 'p3', swimlaneId: 'sl3', status: 'pending', progress: 0, owner: '周工', startDate: '2024-03-10', endDate: '2024-04-30', dependencies: ['t2_6'], type: 'task' },

      // 详细设计阶段 - 软件
      { id: 't3_7', name: '软件模块设计', phaseId: 'p3', swimlaneId: 'sl4', status: 'pending', progress: 0, owner: '钱工', startDate: '2024-03-10', endDate: '2024-05-20', dependencies: ['t2_8'], type: 'task' },
      { id: 't3_8', name: 'HMI界面设计', phaseId: 'p3', swimlaneId: 'sl4', status: 'pending', progress: 0, owner: '孙工', startDate: '2024-03-15', endDate: '2024-05-01', dependencies: ['t2_8'], type: 'task' },
      { id: 't3_9', name: '通信协议实现', phaseId: 'p3', swimlaneId: 'sl4', status: 'pending', progress: 0, owner: '赵工', startDate: '2024-03-05', endDate: '2024-04-20', dependencies: ['t2_7'], type: 'task' },

      // 详细设计阶段 - 系统集成
      { id: 't3_10', name: '机电接口设计', phaseId: 'p3', swimlaneId: 'sl6', status: 'pending', progress: 0, owner: '总工', startDate: '2024-03-01', endDate: '2024-04-01', dependencies: ['t2_1', 't2_4'], type: 'task' },
      { id: 't3_11', name: 'BOM清单编制', phaseId: 'p3', swimlaneId: 'sl6', status: 'pending', progress: 0, owner: '管理员', startDate: '2024-05-01', endDate: '2024-05-30', dependencies: ['t3_1', 't3_4'], type: 'task' },

      // 设计验证阶段
      { id: 't4_1', name: '仿真分析验证', phaseId: 'p4', swimlaneId: 'sl6', status: 'pending', progress: 0, owner: '仿真组', startDate: '2024-06-01', endDate: '2024-07-01', dependencies: ['t3_1', 't3_4'], type: 'task' },
      { id: 't4_2', name: '设计评审', phaseId: 'p4', swimlaneId: 'sl7', status: 'pending', progress: 0, owner: '质量部', startDate: '2024-07-05', endDate: '2024-07-10', dependencies: ['t4_1'], type: 'task' },
      { id: 't4_3', name: '试验大纲编制', phaseId: 'p4', swimlaneId: 'sl6', status: 'pending', progress: 0, owner: '测试组', startDate: '2024-06-15', endDate: '2024-06-30', dependencies: ['t4_1'], type: 'task' },
      { id: 't4_4', name: '原型车试验', phaseId: 'p4', swimlaneId: 'sl6', status: 'pending', progress: 0, owner: '测试组', startDate: '2024-07-15', endDate: '2024-08-30', dependencies: ['t4_3'], type: 'task' },
      { id: 't4_5', name: '问题整改', phaseId: 'p4', swimlaneId: 'sl7', status: 'pending', progress: 0, owner: '各专业', startDate: '2024-09-01', endDate: '2024-09-15', dependencies: ['t4_4'], type: 'task' },
      { id: 't4_6', name: '设计冻结', phaseId: 'p4', swimlaneId: 'sl1', status: 'pending', progress: 0, owner: '项目经理', startDate: '2024-09-20', endDate: '2024-09-20', dependencies: ['t4_5'], type: 'milestone' },
    ] as Task[],
    viewSettings: {
      zoomLevel: 1,
      showDependencies: true,
      filterOwner: '',
      filterStatuses: [],
      filterPhases: [],
      filterSwimlanes: [],
      resetViewTrigger: 0,
      fitViewTrigger: 0,
    } as ViewSettings,
    selectedElement: null as { type: 'task' | 'phase' | 'swimlane' | 'dependency' | 'port', id: string, taskId?: string } | null,
    exportImageHandler: null as null | (() => Promise<void> | void),
    copyImageHandler: null as (() => void) | null,
  }),
  actions: {
    setExportImageHandler(handler: () => Promise<void> | void) {
      this.exportImageHandler = handler
    },
    setCopyImageHandler(handler: () => void) {
      this.copyImageHandler = handler
    },
    resetView() {
      this.viewSettings.zoomLevel = 1
      this.viewSettings.resetViewTrigger = (this.viewSettings.resetViewTrigger || 0) + 1
    },
    fitView() {
      this.viewSettings.fitViewTrigger = (this.viewSettings.fitViewTrigger || 0) + 1
    },
    newProject() {
      this.projectInfo = {
        code: 'NEW-PROJECT',
        name: '新项目',
        type: '通用',
        description: '',
        manager: '',
        plannedStartDate: new Date().toISOString().split('T')[0],
        plannedEndDate: ''
      }
      this.phases = [
        { id: 'p1', name: '阶段1', color: '#E3F2FD' }
      ]
      this.swimlanes = [
        { id: 'sl1', name: '专业1', color: '#F5F5F5' }
      ]
      this.tasks = []
      this.selectedElement = null
      this.viewSettings.zoomLevel = 1
      this.viewSettings.filterStatuses = []
      this.viewSettings.filterPhases = []
      this.viewSettings.filterSwimlanes = []
      this.resetView()
    },
    updateProjectInfo(info: Partial<ProjectInfo>) {
      Object.assign(this.projectInfo, info)
    },
    addPhase(phase: Phase) {
      this.phases.push(phase)
    },
    updatePhase(phase: Phase) {
      const index = this.phases.findIndex(p => p.id === phase.id)
      if (index !== -1) {
        this.phases[index] = phase
      }
    },
    deletePhase(id: string) {
      this.phases = this.phases.filter(p => p.id !== id)
      // Also delete tasks in this phase?
      this.tasks = this.tasks.filter(t => t.phaseId !== id)
    },

    addSwimlane(swimlane: Swimlane) {
      this.swimlanes.push(swimlane)
    },
    updateSwimlane(swimlane: Swimlane) {
      const index = this.swimlanes.findIndex(s => s.id === swimlane.id)
      if (index !== -1) {
        this.swimlanes[index] = swimlane
      }
    },
    deleteSwimlane(id: string) {
      this.swimlanes = this.swimlanes.filter(s => s.id !== id)
      this.tasks = this.tasks.filter(t => t.swimlaneId !== id)
    },

    addTask(task: Task) {
      this.tasks.push(task)
    },
    updateTask(id: string, updates: Partial<Task>) {
      const task = this.tasks.find(t => t.id === id)
      if (task) {
        Object.assign(task, updates)
      }
    },

    batchUpdateTaskPositions(updates: {id: string, x: number, y: number, autoPositioned?: boolean}[]) {
        updates.forEach(update => {
            const task = this.tasks.find(t => t.id === update.id)
            if (task) {
                task.x = update.x
                task.y = update.y
                if (update.autoPositioned !== undefined) {
                  task.autoPositioned = update.autoPositioned
                }
            }
        })
    },

    exportProjectData() {
      const data = {
        projectInfo: this.projectInfo,
        phases: this.phases,
        swimlanes: this.swimlanes,
        tasks: this.tasks
      }
      return JSON.stringify(data, null, 2)
    },

    importProjectData(jsonStr: string) {
      try {
        const data = JSON.parse(jsonStr)
        if (data.projectInfo && data.phases && data.swimlanes && data.tasks) {
          this.projectInfo = data.projectInfo
          this.phases = data.phases
          this.swimlanes = data.swimlanes
          this.tasks = data.tasks
          
          // Reset selection to avoid issues with missing IDs
          this.selectedElement = null
          
          return true
        }
        return false
      } catch (e) {
        console.error('Failed to parse project data', e)
        return false
      }
    },

    deleteTask(id: string) {
      this.tasks = this.tasks.filter(t => t.id !== id)
    },
    moveTask(taskId: string, phaseId: string, swimlaneId: string) {
      this.updateTask(taskId, { phaseId, swimlaneId })
    },
    reorderTask(taskId: string, _newIndex: number, phaseId: string, swimlaneId: string) {
      const task = this.tasks.find(t => t.id === taskId)
      if (!task) return

      // Remove task from list
      const otherTasks = this.tasks.filter(t => t.id !== taskId)
      
      // Update task info
      task.phaseId = phaseId
      task.swimlaneId = swimlaneId
      
      // Insert at new index
      // Filter tasks in target cell to find insertion point
      // This logic is complex for global list, simplified:
      // Just put it at the end for now or implement complex reordering if needed
      this.tasks = [...otherTasks, task]
    },

    addDependency(sourceId: string, targetId: string, sourcePort?: string, targetPort?: string) {
      const targetTask = this.tasks.find(t => t.id === targetId)
      if (targetTask) {
        // Check if dependency already exists
        const existingDep = targetTask.dependencies.find(dep => {
            const depId = typeof dep === 'string' ? dep : dep.taskId;
            return depId === sourceId;
        });

        if (!existingDep && sourceId !== targetId) {
            // Prevent cycles (simple check)
            if (!this.checkCycle(sourceId, targetId)) {
               if (sourcePort || targetPort) {
                   targetTask.dependencies.push({
                       taskId: sourceId,
                       type: 'curve',
                       sourcePort,
                       targetPort
                   });
               } else {
                   targetTask.dependencies.push(sourceId);
               }
            } else {
               throw new Error('无法创建依赖：会导致循环依赖')
            }
        }
      }
    },

    removeDependency(sourceId: string, targetId: string) {
      const targetTask = this.tasks.find(t => t.id === targetId)
      if (targetTask) {
        targetTask.dependencies = targetTask.dependencies.filter(dep => {
            const depId = typeof dep === 'string' ? dep : dep.taskId
            return depId !== sourceId
        })
      }
    },
    
    checkCycle(sourceId: string, targetId: string): boolean {
       // Check if adding source->target creates a cycle
       // Meaning: Is there already a path from target to source?
       const visited = new Set<string>()
       const stack = [sourceId]
       
       while (stack.length > 0) {
         const current = stack.pop()!
         if (current === targetId) return true
         if (visited.has(current)) continue
         visited.add(current)
         
         const task = this.tasks.find(t => t.id === current)
         if (task) {
           // Find tasks that depend on 'current' (reverse dependency)
           // Actually, 'task.dependencies' are parents. 
           // We are looking for children.
           // If we add source->target, we have path source->target.
           // Cycle exists if path target->...->source exists.
           // So we trace dependencies of 'source' to see if 'target' is one of them (ancestor).
         }
       }
       
       // Correct logic:
       // We want to add Dependency: Target depends on Source (Source -> Target).
       // Cycle happens if Source already depends on Target (Target -> ... -> Source).
       // So we check if Target is an ancestor of Source.
       
       return this.isAncestor(targetId, sourceId)
    },
    
    isAncestor(ancestorId: string, taskId: string): boolean {
       const task = this.tasks.find(t => t.id === taskId)
       if (!task) return false
       
       const depIds = task.dependencies.map(d => typeof d === 'string' ? d : d.taskId)
       if (depIds.includes(ancestorId)) return true
       
       for (const depId of depIds) {
         if (this.isAncestor(ancestorId, depId)) return true
       }
       
       return false
    },

    selectElement(type: 'task' | 'phase' | 'swimlane' | 'dependency' | 'port', id: string, taskId?: string) {
      this.selectedElement = { type, id, taskId }
    },
    removeTaskPort(taskId: string, portId: string) {
      const task = this.tasks.find(t => t.id === taskId)
      if (task && task.ports) {
        // 1. Remove port from task
        task.ports = task.ports.filter(p => p.id !== portId)
        
        // 2. Cleanup dependencies where this task is the TARGET (incoming lines)
        // We need to clear 'targetPort' if it matches portId
        task.dependencies = task.dependencies.map(dep => {
            if (typeof dep === 'string') return dep
            if (dep.targetPort === portId) {
                const { targetPort, ...rest } = dep
                return rest as TaskDependency
            }
            return dep
        })

        // 3. Cleanup dependencies where this task is the SOURCE (outgoing lines)
        this.tasks.forEach(t => {
            t.dependencies = t.dependencies.map(dep => {
                const depTaskId = typeof dep === 'string' ? dep : dep.taskId
                if (depTaskId === taskId) {
                    if (typeof dep !== 'string' && dep.sourcePort === portId) {
                         const { sourcePort, ...rest } = dep
                         return rest as TaskDependency
                    }
                }
                return dep
            })
        })
      }
    },
    batchUpdateDependencyPorts(updates: { taskId: string, depTaskId: string, sourcePort: string, targetPort: string }[]) {
      updates.forEach(update => {
        const { taskId, depTaskId, sourcePort, targetPort } = update;
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
          const depIndex = task.dependencies.findIndex(d => 
            (typeof d === 'string' ? d : d.taskId) === depTaskId
          );
          
          if (depIndex !== -1) {
             const existingDep = task.dependencies[depIndex];
             // Convert string dep to object if needed, or update existing object
             if (typeof existingDep === 'string') {
                 task.dependencies[depIndex] = {
                     taskId: existingDep,
                     type: 'curve',
                     sourcePort,
                     targetPort
                 };
             } else if (existingDep) {
                 // Update only if ports are changed to avoid infinite loops
                 if (existingDep.sourcePort !== sourcePort || existingDep.targetPort !== targetPort) {
                     task.dependencies[depIndex] = {
                         ...existingDep,
                         sourcePort,
                         targetPort
                     };
                 }
             }
          }
        }
      });
    },
    clearSelection() {
      this.selectedElement = null
    },
    setZoom(level: number) {
      this.viewSettings.zoomLevel = level
    },
    addAttachment(taskId: string, attachment: Attachment) {
      const task = this.tasks.find(t => t.id === taskId)
      if (task) {
        if (!task.attachments) task.attachments = []
        task.attachments.push(attachment)
      }
    },
    removeAttachment(taskId: string, attachmentId: string) {
      const task = this.tasks.find(t => t.id === taskId)
      if (task && task.attachments) {
        task.attachments = task.attachments.filter(a => a.id !== attachmentId)
      }
    },
    updateTaskDates(taskId: string, start: string, end: string) {
      const task = this.tasks.find(t => t.id === taskId)
      if (task) {
        task.startDate = start
        task.endDate = end
      }
    },
    addTaskPort(taskId: string, port: TaskPort) {
      const task = this.tasks.find(t => t.id === taskId)
      if (task) {
        if (!task.ports) task.ports = []
        task.ports.push(port)
      }
    },
    updateTaskPort(taskId: string, portId: string, percentage: number) {
      const task = this.tasks.find(t => t.id === taskId)
      if (task && task.ports) {
        const port = task.ports.find(p => p.id === portId)
        if (port) {
          port.percentage = percentage
        }
      }
    },
    updateDependencyPort(taskId: string, depTaskId: string, type: 'source' | 'target', port: string) {
      const task = this.tasks.find(t => t.id === taskId)
      if (task) {
        // Find the dependency entry
        const depIndex = task.dependencies.findIndex(d => 
          (typeof d === 'string' ? d : d.taskId) === depTaskId
        )
        
        if (depIndex !== -1) {
          const currentDep = task.dependencies[depIndex]
          
          if (typeof currentDep === 'string') {
            // Convert to object
            const newDep: TaskDependency = {
              taskId: depTaskId,
              [type === 'source' ? 'sourcePort' : 'targetPort']: port
            }
            task.dependencies[depIndex] = newDep
          } else {
            // Update existing object
            const depObj = currentDep as TaskDependency
            if (type === 'source') {
              depObj.sourcePort = port
            } else {
              depObj.targetPort = port
            }
          }
        }
      }
    },
    changeDependencySource(taskId: string, oldSourceId: string, newSourceId: string, newPort?: string) {
      const task = this.tasks.find(t => t.id === taskId)
      if (!task) return

      // Prevent self-dependency
      if (taskId === newSourceId) return

      // Prevent duplicates
      const exists = task.dependencies.some(d => (typeof d === 'string' ? d : d.taskId) === newSourceId)
      if (exists) return // Or maybe merge?

      // Find index
      const idx = task.dependencies.findIndex(d => (typeof d === 'string' ? d : d.taskId) === oldSourceId)
      if (idx !== -1) {
        const oldDep = task.dependencies[idx]
        let newDep: TaskDependency
        if (typeof oldDep === 'string') {
          newDep = { taskId: newSourceId }
          if (newPort) newDep.sourcePort = newPort
        } else {
          newDep = { ...oldDep, taskId: newSourceId }
          if (newPort) newDep.sourcePort = newPort
        }
        task.dependencies[idx] = newDep
      }
    },
    moveDependencyTarget(oldTargetId: string, newTargetId: string, sourceId: string, newPort?: string) {
      const oldTask = this.tasks.find(t => t.id === oldTargetId)
      const newTask = this.tasks.find(t => t.id === newTargetId)
      if (!oldTask || !newTask) return

      // Prevent self-dependency
      if (newTargetId === sourceId) return

      // Remove from old
      const idx = oldTask.dependencies.findIndex(d => (typeof d === 'string' ? d : d.taskId) === sourceId)
      if (idx === -1) return
      
      const oldDep = oldTask.dependencies[idx]
      oldTask.dependencies.splice(idx, 1)

      // Add to new (check duplicate)
      const exists = newTask.dependencies.some(d => (typeof d === 'string' ? d : d.taskId) === sourceId)
      if (!exists) {
        let newDep: TaskDependency
        if (typeof oldDep === 'string') {
          newDep = { taskId: sourceId }
          if (newPort) newDep.targetPort = newPort
        } else {
          newDep = { ...oldDep, taskId: sourceId } as TaskDependency // Keep sourcePort if any
          if (newPort) newDep.targetPort = newPort
        }
        newTask.dependencies.push(newDep)
      }
    },
    updateDependencyType(sourceId: string, targetId: string, type: 'straight' | 'polyline' | 'curve') {
      const targetTask = this.tasks.find(t => t.id === targetId)
      if (!targetTask) return

      const idx = targetTask.dependencies.findIndex(d => (typeof d === 'string' ? d : d.taskId) === sourceId)
      if (idx !== -1) {
        const oldDep = targetTask.dependencies[idx]
        let newDep: TaskDependency
        if (typeof oldDep === 'string') {
            newDep = { taskId: sourceId, type }
        } else {
            const od = oldDep as TaskDependency
            newDep = { ...od, type }
        }
        // Create new array to ensure reactivity
        const newDeps = [...targetTask.dependencies]
        newDeps[idx] = newDep
        targetTask.dependencies = newDeps
      }
    },
    updateDependencyControlPoints(sourceId: string, targetId: string, controlPoints: { x: number, y: number }[]) {
      const targetTask = this.tasks.find(t => t.id === targetId)
      if (!targetTask) return

      const idx = targetTask.dependencies.findIndex(d => (typeof d === 'string' ? d : d.taskId) === sourceId)
      if (idx !== -1) {
        const oldDep = targetTask.dependencies[idx]
        let newDep: TaskDependency
        if (typeof oldDep === 'string') {
            newDep = { taskId: sourceId, controlPoints, controlPointCount: controlPoints.length }
        } else {
            const od = oldDep as TaskDependency
            newDep = { ...od, controlPoints, controlPointCount: controlPoints.length }
        }
        // Create new array to ensure reactivity
        const newDeps = [...targetTask.dependencies]
        newDeps[idx] = newDep
        targetTask.dependencies = newDeps
      }
    },
    updateDependencyControlPointCount(sourceId: string, targetId: string, count: number) {
        const targetTask = this.tasks.find(t => t.id === targetId)
        if (!targetTask) return
  
        const idx = targetTask.dependencies.findIndex(d => (typeof d === 'string' ? d : d.taskId) === sourceId)
        if (idx !== -1) {
          const oldDep = targetTask.dependencies[idx]
          let newDep: TaskDependency
          if (typeof oldDep === 'string') {
              newDep = { taskId: sourceId, controlPointCount: count }
          } else {
              // If changing count, we might want to clear existing points to force regeneration
              // or keep them and let the canvas handle the mismatch.
              // Let's keep them, but if reducing, maybe truncate?
              // Actually, simpler to just set the count and let Canvas handle it.
              const od = oldDep as TaskDependency
              newDep = { ...od, controlPointCount: count }
              
              // If count is changing, we should probably reset controlPoints to trigger recalculation in Canvas
              // OR rely on Canvas mismatch logic.
              // If we don't clear controlPoints, Canvas might see 4 points but count=2.
              // Let's clear controlPoints so Canvas regenerates defaults or upgrades intelligently.
              // But if we want to preserve shape during 2->4 upgrade, we need the points.
              // So let's NOT clear, but ensure Canvas checks count vs length.
          }
          const newDeps = [...targetTask.dependencies]
          newDeps[idx] = newDep
          targetTask.dependencies = newDeps
        }
      }
  }
})
