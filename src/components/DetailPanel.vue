<script setup lang="ts">
import { useProjectStore } from '../stores/projectStore'
import { computed, ref } from 'vue'
import { useDialog, NModal, NCard, NInput, NButton } from 'naive-ui'

const store = useProjectStore()
const dialog = useDialog()

// Input Modal State
const showInputModal = ref(false)
const inputModalTitle = ref('')
const inputValue = ref('')
const inputConfirmAction = ref<((val: string) => void) | null>(null)

const openInputModal = (title: string, defaultValue: string, confirmAction: (val: string) => void) => {
  inputModalTitle.value = title
  inputValue.value = defaultValue
  inputConfirmAction.value = confirmAction
  showInputModal.value = true
}

const handleInputConfirm = () => {
  if (inputConfirmAction.value && inputValue.value) {
    inputConfirmAction.value(inputValue.value)
  }
  showInputModal.value = false
}

const selectedElement = computed(() => store.selectedElement)

const task = computed(() => {
  if (selectedElement.value?.type === 'task') return store.tasks.find(t => t.id === selectedElement.value?.id)
  return null
})

const phase = computed(() => {
  if (selectedElement.value?.type === 'phase') return store.phases.find(p => p.id === selectedElement.value?.id)
  return null
})

const swimlane = computed(() => {
  if (selectedElement.value?.type === 'swimlane') return store.swimlanes.find(s => s.id === selectedElement.value?.id)
  return null
})

const dependency = computed(() => {
    if (selectedElement.value?.type === 'dependency') {
        const [sourceId, targetId] = selectedElement.value.id.split('|')
        const sourceTask = store.tasks.find(t => t.id === sourceId)
        const targetTask = store.tasks.find(t => t.id === targetId)
        
        let type = 'curve' // Default
        let controlPointCount = 2
        if (targetTask) {
             const dep = targetTask.dependencies.find(d => (typeof d === 'string' ? d : d.taskId) === sourceId)
             if (dep && typeof dep !== 'string') {
                 if (dep.type) type = dep.type
                 if (dep.controlPointCount) controlPointCount = dep.controlPointCount
             }
        }
        
        return { sourceId, targetId, sourceTask, targetTask, type, controlPointCount }
    }
    return null
})

const port = computed(() => {
    const sel = selectedElement.value
    if (sel?.type === 'port' && sel.taskId) {
        const t = store.tasks.find(t => t.id === sel.taskId)
        if (t && t.ports) {
            const p = t.ports.find(p => p.id === sel.id)
            if (p) return { ...p, task: t }
        }
    }
    return null
})

const close = () => {
  store.clearSelection()
}

const deleteTask = () => {
  if (task.value) {
    dialog.warning({
      title: '确认删除',
      content: '确定删除该任务吗？',
      positiveText: '确定',
      negativeText: '取消',
      positiveButtonProps: { autofocus: true } as any,
      onPositiveClick: () => {
        if (task.value) store.deleteTask(task.value.id)
      }
    })
  }
}

const deletePhase = () => {
  if (phase.value) {
    dialog.warning({
      title: '确认删除',
      content: '确定删除该阶段吗？这将删除该阶段下的所有任务。',
      positiveText: '确定',
      negativeText: '取消',
      positiveButtonProps: { autofocus: true } as any,
      onPositiveClick: () => {
        if (phase.value) {
          store.deletePhase(phase.value.id)
          store.clearSelection()
        }
      }
    })
  }
}

const deleteSwimlane = () => {
  if (swimlane.value) {
    dialog.warning({
      title: '确认删除',
      content: '确定删除该专业吗？这将删除该专业下的所有任务。',
      positiveText: '确定',
      negativeText: '取消',
      positiveButtonProps: { autofocus: true } as any,
      onPositiveClick: () => {
        if (swimlane.value) {
          store.deleteSwimlane(swimlane.value.id)
          store.clearSelection()
        }
      }
    })
  }
}

const removeAttachment = (attId: string) => {
  if (task.value) {
    store.removeAttachment(task.value.id, attId)
  }
}

const updateDependencyType = (e: Event) => {
    const newType = (e.target as HTMLSelectElement).value as 'straight' | 'polyline' | 'curve'
    if (dependency.value && dependency.value.sourceId && dependency.value.targetId) {
        const depVal = dependency.value
        store.updateDependencyType(depVal.sourceId!, depVal.targetId!, newType)
    }
}

const updateDependencyControlPointCount = (e: Event) => {
    const count = parseInt((e.target as HTMLSelectElement).value)
    if (dependency.value && dependency.value.sourceId && dependency.value.targetId) {
        store.updateDependencyControlPointCount(dependency.value.sourceId!, dependency.value.targetId!, count)
    }
}

const deleteDependency = () => {
    if (dependency.value && dependency.value.sourceId && dependency.value.targetId) {
        dialog.warning({
          title: '确认删除',
          content: '确定删除该连线吗？',
          positiveText: '确定',
          negativeText: '取消',
          positiveButtonProps: { autofocus: true } as any,
          onPositiveClick: () => {
            if (dependency.value && dependency.value.sourceId && dependency.value.targetId) {
              store.removeDependency(dependency.value.sourceId, dependency.value.targetId)
              store.clearSelection()
            }
          }
        })
    }
}

const deletePort = () => {
    if (port.value) {
        dialog.warning({
          title: '确认删除',
          content: '确定删除该连接点吗？',
          positiveText: '确定',
          negativeText: '取消',
          positiveButtonProps: { autofocus: true } as any,
          onPositiveClick: () => {
            if (port.value) {
              store.removeTaskPort(port.value.task.id, port.value.id)
              store.selectElement('task', port.value.task.id)
            }
          }
        })
    }
}

const addMockAttachment = () => {
  if (task.value) {
    openInputModal('请输入附件名称', '新文件.txt', (name) => {
      if (task.value) {
        store.addAttachment(task.value.id, {
          id: 'a' + Date.now(),
          name,
          url: '#',
          type: 'file',
          uploadDate: new Date().toISOString().split('T')[0] || ''
        })
      }
    })
  }
}
</script>

<template>
  <div v-if="selectedElement" class="detail-panel">
    
    <!-- Task Detail -->
    <div v-if="task">
      <div class="panel-header">
        <h3>任务详情</h3>
        <button class="close-btn" @click="close">×</button>
      </div>
      <div class="panel-content">
        <div class="field">
          <label>编号:</label>
          <span>{{ task.id }}</span>
        </div>
        <div class="field">
          <label>名称:</label>
          <input v-model="task.name" />
        </div>
        <div class="field">
          <label>负责人:</label>
          <input v-model="task.owner" />
        </div>
        <div class="field">
          <label>状态:</label>
          <select v-model="task.status">
            <option value="pending">未开始</option>
            <option value="in_progress">进行中</option>
            <option value="completed">已完成</option>
            <option value="delayed">延期</option>
          </select>
        </div>
        <div class="field">
          <label>进度:</label>
          <input type="range" v-model.number="task.progress" min="0" max="100" />
          <span>{{ task.progress }}%</span>
        </div>
        <div class="field">
          <label>开始时间:</label>
          <input type="date" v-model="task.startDate" />
        </div>
        <div class="field">
          <label>结束时间:</label>
          <input type="date" v-model="task.endDate" />
        </div>
        
        <div class="field">
          <label>附件:</label>
          <ul class="attachment-list">
            <li v-for="att in task.attachments" :key="att.id">
              <a :href="att.url" target="_blank">{{ att.name }}</a>
              <span class="remove-att" @click="removeAttachment(att.id)" title="删除附件">×</span>
            </li>
          </ul>
          <button class="btn-sm" @click="addMockAttachment">添加附件</button>
        </div>

        <div class="actions">
            <button class="btn-danger" @click="deleteTask">删除任务</button>
        </div>
      </div>
    </div>

    <!-- Phase Detail -->
    <div v-if="phase">
      <div class="panel-header">
        <h3>阶段详情</h3>
        <button class="close-btn" @click="close">×</button>
      </div>
      <div class="panel-content">
        <div class="field">
          <label>名称:</label>
          <input v-model="phase.name" />
        </div>
        <div class="field">
          <label>颜色:</label>
          <input type="color" v-model="phase.color" />
        </div>
        <div class="actions">
            <button class="btn-danger" @click="deletePhase">删除阶段</button>
        </div>
      </div>
    </div>

    <!-- Swimlane Detail -->
    <div v-if="swimlane">
      <div class="panel-header">
        <h3>专业详情</h3>
        <button class="close-btn" @click="close">×</button>
      </div>
      <div class="panel-content">
        <div class="field">
          <label>名称:</label>
          <input v-model="swimlane.name" />
        </div>
        <div class="field">
          <label>颜色:</label>
          <input type="color" v-model="swimlane.color" />
        </div>
        <div class="actions">
            <button class="btn-danger" @click="deleteSwimlane">删除专业</button>
        </div>
      </div>
    </div>

    <!-- Dependency Detail -->
    <div v-if="dependency">
      <div class="panel-header">
        <h3>连线详情</h3>
        <button class="close-btn" @click="close">×</button>
      </div>
      <div class="panel-content">
        <div class="field">
          <label>起点任务:</label>
          <span>{{ dependency.sourceTask?.name || dependency.sourceId }}</span>
        </div>
        <div class="field">
          <label>终点任务:</label>
          <span>{{ dependency.targetTask?.name || dependency.targetId }}</span>
        </div>
        <div class="field">
            <label>连线类型:</label>
            <select :value="dependency.type" @change="updateDependencyType">
                <option value="polyline">折线</option>
                <option value="straight">直线</option>
                <option value="curve">曲线</option>
            </select>
        </div>
        <div class="field" v-if="dependency.type === 'curve'">
            <label>曲线控制点:</label>
            <select :value="dependency.controlPointCount || 2" @change="updateDependencyControlPointCount">
                <option :value="2">2个 (简单)</option>
                <option :value="3">3个 (中等)</option>
                <option :value="4">4个 (复杂)</option>
            </select>
        </div>
        <div class="actions">
            <button class="btn-danger" @click="deleteDependency">删除连线</button>
        </div>
      </div>
    </div>

    <!-- Port Detail -->
    <div v-if="port">
      <div class="panel-header">
        <h3>连接点详情</h3>
        <button class="close-btn" @click="close">×</button>
      </div>
      <div class="panel-content">
        <div class="field">
          <label>所属任务:</label>
          <span>{{ port.task.name }}</span>
        </div>
        <div class="field">
          <label>方向:</label>
          <span>{{ port.side === 'top' ? '上' : port.side === 'bottom' ? '下' : port.side === 'left' ? '左' : '右' }}</span>
        </div>
        <div class="field">
          <label>位置比例:</label>
          <span>{{ (port.percentage * 100).toFixed(0) }}%</span>
        </div>
        <div class="actions">
            <button class="btn-danger" @click="deletePort">删除连接点</button>
        </div>
      </div>
    </div>
  </div>

  <n-modal v-model:show="showInputModal">
    <n-card
      style="width: 400px"
      :title="inputModalTitle"
      :bordered="false"
      size="huge"
      role="dialog"
      aria-modal="true"
    >
      <n-input
        v-model:value="inputValue"
        type="text"
        placeholder="请输入"
        @keydown.enter="handleInputConfirm"
        autofocus
      />
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showInputModal = false">取消</n-button>
          <n-button type="primary" @click="handleInputConfirm">确定</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.detail-panel {
  width: 300px;
  background: white;
  border-left: 1px solid #ccc;
  padding: 20px;
  box-shadow: -2px 0 5px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
}

.field {
  margin-bottom: 15px;
  display: flex;
  flex-direction: column;
}

label {
  font-weight: bold;
  margin-bottom: 5px;
  font-size: 0.9em;
}

input, select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.btn-danger {
  background: #ff4444;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-danger:hover {
  background: #cc0000;
}

.attachment-list {
  list-style: none;
  padding: 0;
  margin: 5px 0 10px 0;
}
.attachment-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px;
  background: #f9f9f9;
  border-radius: 4px;
  margin-bottom: 5px;
  font-size: 0.9em;
}
.attachment-list a {
  text-decoration: none;
  color: #2196F3;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.remove-att {
  cursor: pointer;
  color: #999;
  font-weight: bold;
  padding: 0 5px;
}
.remove-att:hover {
  color: red;
}
.btn-sm {
  background: #eee;
  border: 1px solid #ddd;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  align-self: flex-start;
}
.btn-sm:hover {
  background: #e0e0e0;
}
</style>
