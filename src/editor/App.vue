<script setup lang="ts">
import { onMounted } from 'vue';
import GraphCanvas from './components/GraphCanvas.vue';
import InspectorPanel from './components/InspectorPanel.vue';
import RelationLegend from './components/RelationLegend.vue';
import StatusBar from './components/StatusBar.vue';
import type { EditorSession } from './session';

const props = defineProps<{ session: EditorSession }>();

onMounted(() => void props.session.init());
</script>

<template>
  <div class="app">
    <main class="canvas-area">
      <GraphCanvas :session="session" />
      <RelationLegend :session="session" class="legend" />
    </main>
    <InspectorPanel :session="session" class="inspector" />
    <StatusBar :session="session" class="status" />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: 1fr 300px;
  grid-template-rows: 1fr auto;
  height: 100%;
}
.canvas-area {
  position: relative;
  min-width: 0;
  min-height: 0;
}
.legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
}
.inspector {
  border-left: 1px solid var(--border);
}
.status {
  grid-column: 1 / span 2;
  border-top: 1px solid var(--border);
}
</style>
