<script setup lang="ts">
import { onMounted, ref } from 'vue';
import GraphCanvas from './components/GraphCanvas.vue';
import InspectorPanel from './components/InspectorPanel.vue';
import RelationLegend from './components/RelationLegend.vue';
import StatusBar from './components/StatusBar.vue';
import type { EditorSession } from './session';

const props = defineProps<{ session: EditorSession }>();

onMounted(() => void props.session.init());

// --- the resizable inspector -------------------------------------------------------------------

const MIN_WIDTH = 220;
const DEFAULT_WIDTH = 300;
const STORAGE_KEY = 'onted.inspectorWidth';

function clampWidth(w: number): number {
  return Math.round(Math.min(Math.max(w, MIN_WIDTH), window.innerWidth * 0.7));
}

function loadWidth(): number {
  try {
    const w = Number(localStorage.getItem(STORAGE_KEY));
    return w > 0 ? clampWidth(w) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

const inspectorWidth = ref(loadWidth());
const resizing = ref(false);

function startResize(e: PointerEvent): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = inspectorWidth.value;
  resizing.value = true;
  const onMove = (m: PointerEvent) => {
    inspectorWidth.value = clampWidth(startWidth + startX - m.clientX);
  };
  const onUp = () => {
    resizing.value = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    try {
      localStorage.setItem(STORAGE_KEY, String(inspectorWidth.value));
    } catch {
      // Not remembered, which is fine.
    }
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function resetWidth(): void {
  inspectorWidth.value = DEFAULT_WIDTH;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
</script>

<template>
  <div class="app" :class="{ resizing }" :style="{ gridTemplateColumns: `1fr ${inspectorWidth}px` }">
    <main class="canvas-area">
      <GraphCanvas :session="session" />
      <RelationLegend :session="session" class="legend" />
    </main>
    <div class="inspector-area">
      <div
        class="splitter"
        title="Drag to resize; double-click to reset"
        @pointerdown="startResize"
        @dblclick="resetWidth"
      />
      <InspectorPanel :session="session" class="inspector" />
    </div>
    <StatusBar :session="session" class="status" />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: 1fr auto;
  height: 100%;
}
.app.resizing {
  cursor: col-resize;
  user-select: none;
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
.inspector-area {
  position: relative;
  min-height: 0;
  display: flex;
}
.inspector {
  flex: 1;
  min-width: 0;
  border-left: 1px solid var(--border);
}
.splitter {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 7px;
  cursor: col-resize;
  z-index: 10;
}
.splitter:hover,
.app.resizing .splitter {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}
.status {
  grid-column: 1 / span 2;
  border-top: 1px solid var(--border);
}
</style>
