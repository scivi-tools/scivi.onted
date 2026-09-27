<script setup lang="ts">
import { computed } from 'vue';
import type { EditorSession } from '../session';

const props = defineProps<{ session: EditorSession }>();

const stats = computed(() => {
  const doc = props.session.document.value;
  return {
    file: props.session.file.value?.name ?? 'Untitled',
    modified: doc.isModified,
    nodes: doc.ontology.nodes.length,
    relations: doc.ontology.relations.length,
  };
});

const problems = computed(() => [
  ...props.session.issues.value.map((i) => `${i.severity === 'error' ? 'Error' : 'Warning'}: ${i.message}`),
  ...props.session.configWarnings.value.map((w) => `Config: ${w}`),
]);
</script>

<template>
  <footer class="status">
    <span>{{ stats.file }}<span v-if="stats.modified"> (modified)</span></span>
    <span class="muted">{{ stats.nodes }} nodes, {{ stats.relations }} relations</span>
    <span class="spacer" />
    <span v-if="problems.length > 0" class="problems" :title="problems.join('\n')">
      ⚠ {{ problems.length }} {{ problems.length === 1 ? 'problem' : 'problems' }}
    </span>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  gap: 16px;
  padding: 4px 12px;
  background: var(--panel);
  font-size: 12px;
}
.muted {
  color: var(--muted);
}
.spacer {
  flex: 1;
}
.problems {
  color: var(--warning);
  cursor: help;
}
</style>
