<script setup lang="ts">
/**
 * A text field that edits a value in place: the edit is committed on Enter or when the field
 * loses focus, and reverted on Escape or if the text is invalid. Each commit is one undoable step.
 */
import { ref, watch } from 'vue';

const props = defineProps<{
  value: string;
  /** Returns false for text that must not be committed. */
  validate?: (text: string) => boolean;
  placeholder?: string;
  monospace?: boolean;
}>();
const emit = defineEmits<{ commit: [text: string] }>();

const input = ref<HTMLInputElement | null>(null);
const draft = ref(props.value);
const invalid = ref(false);

watch(
  () => props.value,
  (v) => {
    draft.value = v;
    invalid.value = false;
  },
);

function onInput(): void {
  invalid.value = props.validate ? !props.validate(draft.value) : false;
}

let skipBlurCommit = false;

function commit(): void {
  if (draft.value !== props.value && !invalid.value) emit('commit', draft.value);
  // If the value was rejected (or the commit did not change it), show the current value again.
  draft.value = props.value;
  invalid.value = false;
}

function onEnter(): void {
  commit();
  skipBlurCommit = true;
  input.value?.blur();
  skipBlurCommit = false;
}

function onEscape(): void {
  draft.value = props.value;
  invalid.value = false;
  skipBlurCommit = true;
  input.value?.blur();
  skipBlurCommit = false;
}

function onBlur(): void {
  if (!skipBlurCommit) commit();
}

defineExpose({
  focus: (selectAll = false) => {
    input.value?.focus();
    if (selectAll) input.value?.select();
  },
});
</script>

<template>
  <input
    ref="input"
    v-model="draft"
    class="commit-input"
    :class="{ invalid, monospace }"
    :placeholder="placeholder"
    spellcheck="false"
    @input="onInput"
    @keydown.enter.prevent="onEnter"
    @keydown.esc.prevent.stop="onEscape"
    @blur="onBlur"
  />
</template>

<style scoped>
.commit-input {
  width: 100%;
  min-width: 0;
  padding: 3px 5px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  font: inherit;
  color: inherit;
}
.commit-input:hover {
  border-color: var(--border);
}
.commit-input:focus {
  border-color: var(--accent);
  background: #fff;
  outline: none;
}
.commit-input.invalid {
  border-color: var(--error);
  background: #fff4f4;
}
.monospace {
  font-family: ui-monospace, Menlo, 'DejaVu Sans Mono', monospace;
  font-size: 12px;
}
</style>
