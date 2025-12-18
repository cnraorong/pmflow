<script setup lang="ts">
import LeaferCanvas from './components/LeaferCanvas.vue'
import DetailPanel from './components/DetailPanel.vue'
import Controls from './components/Controls.vue'
// import { useProjectStore } from './stores/projectStore'

// const store = useProjectStore()
</script>

<template>
  <div class="app-container">
    <Controls />
    <div class="main-content">
      <div class="chart-area">
        <LeaferCanvas />
      </div>
      <DetailPanel />
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.chart-area {
  flex: 1;
  overflow: hidden; /* FlowchartLayout handles scrolling */
}
</style>
