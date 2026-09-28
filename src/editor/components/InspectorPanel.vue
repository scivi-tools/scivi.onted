<script setup lang="ts">
/**
 * The inspector: edits the selected node (name, typed attributes) or the selected relations (type).
 * Every change is a separate undoable step.
 */
import { computed, nextTick, onBeforeUpdate, ref, watch } from 'vue';
import {
  ATTRIBUTE_TYPES,
  RELATION_TYPES,
  attributeFromText,
  attributeToText,
  convertAttribute,
  findNode,
  findRelation,
  isRelationType,
  type AttributeType,
  type AttributeValue,
  type RelationType,
} from '../../core';
import type { EditorSession } from '../session';
import CommitInput from './CommitInput.vue';

const props = defineProps<{ session: EditorSession }>();

const TYPE_LABELS: Record<AttributeType, string> = {
  string: 'string',
  int: 'int',
  float: 'float',
  bool: 'bool',
  json: 'JSON',
};

const doc = () => props.session.document.value;
const run = (action: () => void) => void props.session.runCommandFn(action);

/**
 * A snapshot of the selected node. The model is not reactive by itself (the document ref is
 * triggered on every change), so a fresh object is built each time for Vue to notice changes.
 */
const node = computed(() => {
  const sel = props.session.selection.value;
  if (sel.nodes.length !== 1 || sel.relations.length > 0) return null;
  const n = findNode(props.session.document.value.ontology, sel.nodes[0]!);
  if (!n) return null;
  return {
    id: n.id,
    name: n.name,
    keys: new Set(n.attributes.keys()),
    attributes: [...n.attributes].map(([key, value]) => ({ key, value })),
  };
});

const isSystem = computed(() => !!node.value && props.session.config.value.systemNodeNames.includes(node.value.name));

const attributes = computed(() => node.value?.attributes ?? []);

/** The selected relations, if only relations are selected. */
const relations = computed(() => {
  const sel = props.session.selection.value;
  if (sel.nodes.length > 0 || sel.relations.length === 0) return [];
  const ont = props.session.document.value.ontology;
  return sel.relations.map((id) => findRelation(ont, id)).filter((r) => r !== undefined);
});

const relationInfo = computed(() => {
  const rs = relations.value;
  if (rs.length === 0) return null;
  const ont = props.session.document.value.ontology;
  const types = new Set(rs.map((r) => r.name));
  const common = types.size === 1 ? rs[0]!.name : null;
  const single = rs.length === 1 ? rs[0]! : null;
  return {
    count: rs.length,
    type: common,
    invalidType: common !== null && !isRelationType(common) ? common : null,
    source: single ? (findNode(ont, single.sourceId)?.name ?? `#${single.sourceId}`) : null,
    destination: single ? (findNode(ont, single.destinationId)?.name ?? `#${single.destinationId}`) : null,
    id: single?.id,
  };
});

// --- node editing --------------------------------------------------------------------------

function renameNode(name: string): void {
  if (node.value && name !== '') run(() => doc().renameNode(node.value!.id, name));
}

function renameAttribute(oldKey: string, newKey: string): void {
  if (node.value) run(() => doc().renameAttribute(node.value!.id, oldKey, newKey));
}

function isFreeKey(key: string, current: string): boolean {
  return key !== '' && (key === current || !node.value?.keys.has(key));
}

function setValue(key: string, value: AttributeValue | null): void {
  if (node.value && value) run(() => doc().setAttribute(node.value!.id, key, value));
}

function setType(key: string, value: AttributeValue, type: AttributeType): void {
  setValue(key, convertAttribute(value, type));
}

function deleteAttribute(key: string): void {
  if (node.value) run(() => doc().deleteAttribute(node.value!.id, key));
}

// Template refs of the rows' inputs (plain containers: component instances must not be made reactive).
const keyInputs = new Map<string, InstanceType<typeof CommitInput>>();
let valueInputs: (HTMLElement | InstanceType<typeof CommitInput>)[] = [];
onBeforeUpdate(() => {
  valueInputs = [];
});
const addButton = ref<HTMLButtonElement | null>(null);

async function addAttribute(): Promise<void> {
  const n = node.value;
  if (!n) return;
  let key = 'attribute';
  for (let i = 2; n.keys.has(key); i++) key = `attribute${i}`;
  run(() => doc().setAttribute(n.id, key, { type: 'string', value: '' }));
  await nextTick();
  keyInputs.get(key)?.focus(true);
}

function setKeyInput(key: string, el: unknown): void {
  if (el) keyInputs.set(key, el as InstanceType<typeof CommitInput>);
  else keyInputs.delete(key);
}

function setValueInput(i: number, el: unknown): void {
  if (el) valueInputs[i] = el as HTMLElement | InstanceType<typeof CommitInput>;
}

// "Edit Attributes" (Enter, Ctrl+double-click): focus the first value, or the "Add" button.
watch(
  () => props.session.inspectorFocusRequest.value,
  async () => {
    await nextTick();
    const first = valueInputs[0];
    if (!first) addButton.value?.focus();
    else if (first instanceof HTMLElement) first.focus();
    else first.focus(true);
  },
);

// --- relation editing ----------------------------------------------------------------------

function setRelationType(type: string): void {
  if (isRelationType(type)) {
    const ids = relations.value.map((r) => r.id);
    run(() => doc().setRelationType(ids, type as RelationType));
  }
}
</script>

<template>
  <aside class="inspector">
    <template v-if="node">
      <div class="title-row">
        <CommitInput class="name" :value="node.name" :validate="(s) => s !== ''" @commit="renameNode" />
      </div>
      <div class="meta">
        ID {{ node.id }}<span v-if="isSystem" class="badge">system node</span>
      </div>

      <h3>Attributes</h3>
      <table v-if="attributes.length > 0" class="attributes">
        <tr v-for="(a, i) in attributes" :key="i">
          <td class="key">
            <CommitInput
              :ref="(el) => setKeyInput(a.key, el)"
              :value="a.key"
              :validate="(s) => isFreeKey(s, a.key)"
              @commit="(k) => renameAttribute(a.key, k)"
            />
          </td>
          <td class="type">
            <select :value="a.value.type" @change="setType(a.key, a.value, ($event.target as HTMLSelectElement).value as AttributeType)">
              <option v-for="t in ATTRIBUTE_TYPES" :key="t" :value="t">{{ TYPE_LABELS[t] }}</option>
            </select>
          </td>
          <td class="value">
            <input
              v-if="a.value.type === 'bool'"
              :ref="(el) => setValueInput(i, el)"
              type="checkbox"
              :checked="a.value.value"
              @change="setValue(a.key, { type: 'bool', value: ($event.target as HTMLInputElement).checked })"
            />
            <CommitInput
              v-else
              :ref="(el) => setValueInput(i, el)"
              :value="attributeToText(a.value)"
              :validate="(s) => attributeFromText(s, a.value.type) !== null"
              :monospace="a.value.type !== 'string'"
              :placeholder="a.value.type === 'string' ? '(empty)' : ''"
              @commit="(s) => setValue(a.key, attributeFromText(s, a.value.type))"
            />
          </td>
          <td class="actions">
            <button class="icon" title="Delete attribute" @click="deleteAttribute(a.key)">✕</button>
          </td>
        </tr>
      </table>
      <p v-else class="hint">No attributes.</p>
      <button ref="addButton" class="add" @click="addAttribute">+ Add attribute</button>
    </template>

    <template v-else-if="relationInfo">
      <h2>{{ relationInfo.count === 1 ? 'Relation' : `${relationInfo.count} relations` }}</h2>
      <div v-if="relationInfo.id !== undefined" class="meta">ID {{ relationInfo.id }}</div>
      <p v-if="relationInfo.source" class="endpoints">
        {{ relationInfo.source }} <span class="arrow">→</span> {{ relationInfo.destination }}
      </p>
      <h3>Type</h3>
      <select class="relation-type" :value="relationInfo.type ?? ''" @change="setRelationType(($event.target as HTMLSelectElement).value)">
        <option v-if="relationInfo.type === null" value="" disabled>(mixed)</option>
        <option v-if="relationInfo.invalidType !== null" :value="relationInfo.invalidType" disabled>
          {{ relationInfo.invalidType === '' ? '(empty — invalid)' : `${relationInfo.invalidType} (invalid)` }}
        </option>
        <option v-for="(t, i) in RELATION_TYPES" :key="t" :value="t">{{ t }} (⇧{{ i + 1 }})</option>
      </select>
    </template>

    <template v-else-if="session.selection.value.nodes.length + session.selection.value.relations.length > 1">
      <h2>{{ session.selection.value.nodes.length }} nodes, {{ session.selection.value.relations.length }} relations</h2>
      <p v-if="session.selection.value.nodes.length >= 2" class="hint">
        Press ⇧1…⇧8 to link each selected node to the last selected one.
      </p>
    </template>

    <p v-else class="hint">Select a node to edit its name and attributes, or a relation to change its type.</p>
  </aside>
</template>

<style scoped>
.inspector {
  background: var(--panel);
  padding: 12px 10px;
  overflow: auto;
}
.name {
  font-size: 15px;
  font-weight: 600;
}
h2 {
  font-size: 15px;
  margin: 0 5px 2px;
}
h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin: 16px 5px 6px;
}
.meta,
.hint,
.endpoints {
  color: var(--muted);
  margin: 2px 5px;
}
.endpoints {
  color: var(--text);
  margin-top: 8px;
}
.arrow {
  color: var(--muted);
}
.badge {
  margin-left: 8px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--node-system-fill);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 11px;
}
.attributes {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.attributes td {
  padding: 1px 0;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.key {
  width: 34%;
  font-weight: 600;
}
.type {
  width: 62px;
}
.type select {
  width: 100%;
  font-size: 11px;
  color: var(--muted);
  border: none;
  background: transparent;
}
.actions {
  width: 22px;
  text-align: right;
}
.icon {
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
  padding: 2px 4px;
}
.icon:hover {
  color: var(--error);
}
.add {
  margin: 8px 5px;
  padding: 3px 8px;
  border: 1px dashed var(--border);
  border-radius: 4px;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
}
.add:hover,
.add:focus {
  border-color: var(--accent);
}
.relation-type {
  margin: 0 5px;
  font: inherit;
  padding: 3px;
}
</style>
