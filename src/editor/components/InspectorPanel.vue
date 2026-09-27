<script setup lang="ts">
/** The inspector: shows the selected node and its attributes (read-only for now). */
import { computed } from 'vue';
import { findNode, writeJson, type AttributeValue } from '../../core';
import type { EditorSession } from '../session';

const props = defineProps<{ session: EditorSession }>();

const node = computed(() => {
  const selection = props.session.selection.value;
  if (selection.length !== 1) return null;
  return findNode(props.session.document.value.ontology, selection[0]!) ?? null;
});

const attributes = computed(() =>
  node.value ? [...node.value.attributes].map(([key, value]) => ({ key, value })) : [],
);

const TYPE_LABELS: Record<AttributeValue['type'], string> = {
  string: 'string',
  int: 'int',
  float: 'float',
  bool: 'bool',
  json: 'JSON',
};

function formatValue(a: AttributeValue): string {
  return a.type === 'json' ? writeJson(a.value).trim() : String(a.value);
}
</script>

<template>
  <aside class="inspector">
    <template v-if="node">
      <h2>{{ node.name }}</h2>
      <div class="meta">ID {{ node.id }}</div>
      <h3>Attributes</h3>
      <table v-if="attributes.length > 0">
        <tr v-for="a in attributes" :key="a.key">
          <td class="key">{{ a.key }}</td>
          <td class="type">{{ TYPE_LABELS[a.value.type] }}</td>
          <td class="value">{{ formatValue(a.value) }}</td>
        </tr>
      </table>
      <p v-else class="hint">No attributes.</p>
    </template>
    <p v-else-if="session.selection.value.length > 1" class="hint">
      {{ session.selection.value.length }} nodes selected.
    </p>
    <p v-else class="hint">Select a node to see its attributes.</p>
  </aside>
</template>

<style scoped>
.inspector {
  background: var(--panel);
  padding: 12px 14px;
  overflow: auto;
}
h2 {
  font-size: 15px;
  margin: 0 0 2px;
  word-break: break-word;
}
h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin: 16px 0 6px;
}
.meta,
.hint {
  color: var(--muted);
}
table {
  width: 100%;
  border-collapse: collapse;
}
td {
  padding: 3px 4px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.key {
  font-weight: 600;
}
.type {
  color: var(--muted);
  font-size: 11px;
}
.value {
  word-break: break-all;
  font-family: ui-monospace, Menlo, 'DejaVu Sans Mono', monospace;
  font-size: 12px;
}
</style>
