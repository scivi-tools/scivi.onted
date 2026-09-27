<script setup lang="ts">
import { RELATION_TYPES } from '../../core';
import type { EditorSession } from '../session';

defineProps<{ session: EditorSession }>();
</script>

<template>
  <div class="legend">
    <div v-for="(type, i) in RELATION_TYPES" :key="type" class="row">
      <span class="key">⇧{{ i + 1 }}</span>
      <svg width="28" height="10" aria-hidden="true">
        <line x1="0" y1="5" x2="28" y2="5" :stroke="session.config.value.relationColors[type]" stroke-width="3" />
      </svg>
      <span>{{ type }}</span>
    </div>
  </div>
</template>

<style scoped>
.legend {
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 12px;
  pointer-events: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 18px;
}
.key {
  color: var(--muted);
  width: 20px;
  font-variant-numeric: tabular-nums;
}
</style>
