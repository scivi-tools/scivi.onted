<script setup lang="ts">
/** A context menu built from command IDs (HTML, so that it also works outside Electron). */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { MenuEntry } from '../menu-model';
import type { EditorSession } from '../session';
import { shortcutHint } from '../shortcuts';

const props = defineProps<{
  session: EditorSession;
  entries: readonly MenuEntry[];
  x: number;
  y: number;
  /** Nested menus are positioned by their parent; only the root listens for outside clicks. */
  nested?: boolean;
  /** For a nested menu: the x to align its right edge to if it does not fit on the right. */
  flipX?: number;
}>();
const emit = defineEmits<{ close: [] }>();

const root = ref<HTMLElement | null>(null);
const left = ref(props.x);
const top = ref(props.y);
const openSubmenu = ref<number | null>(null);
const submenuPos = ref({ x: 0, y: 0, flipX: 0 });

function enabled(id: string): boolean {
  return props.session.commands.isEnabled(id);
}

function label(entry: MenuEntry & { kind: 'command' }): string {
  return entry.label ?? props.session.commands.label(entry.id);
}

function run(id: string): void {
  if (!enabled(id)) return;
  emit('close');
  void props.session.runCommand(id);
}

function showSubmenu(index: number, event: MouseEvent): void {
  const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
  submenuPos.value = { x: r.right - 2, y: r.top - 4, flipX: r.left + 2 };
  openSubmenu.value = index;
}

function onOutside(e: Event): void {
  if (!(e.target as Element).closest?.('.context-menu')) emit('close');
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    emit('close');
  }
}

onMounted(async () => {
  await nextTick();
  // Keep the menu inside the window.
  const r = root.value!.getBoundingClientRect();
  if (r.right > window.innerWidth) {
    left.value = props.nested && props.flipX !== undefined ? props.flipX - r.width : Math.max(0, window.innerWidth - r.width - 4);
  }
  if (r.bottom > window.innerHeight) top.value = Math.max(0, window.innerHeight - r.height - 4);
  if (!props.nested) {
    window.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', () => emit('close'), { once: true });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onOutside, true);
  window.removeEventListener('keydown', onKey, true);
});
</script>

<template>
  <div ref="root" class="context-menu" :style="{ left: `${left}px`, top: `${top}px` }" @contextmenu.prevent>
    <template v-for="(entry, i) in entries" :key="i">
      <div v-if="entry.kind === 'separator'" class="separator" />
      <div
        v-else-if="entry.kind === 'command'"
        class="item"
        :class="{ disabled: !enabled(entry.id) }"
        @mouseenter="openSubmenu = null"
        @click="run(entry.id)"
      >
        <span>{{ label(entry) }}</span>
        <span class="hint">{{ shortcutHint(entry.id) }}</span>
      </div>
      <div v-else class="item submenu" :class="{ open: openSubmenu === i }" @mouseenter="showSubmenu(i, $event)">
        <span>{{ entry.label }}</span>
        <span class="hint">▸</span>
      </div>
    </template>
    <ContextMenu
      v-if="openSubmenu !== null && entries[openSubmenu]?.kind === 'submenu'"
      :key="openSubmenu"
      :session="session"
      :entries="(entries[openSubmenu] as MenuEntry & { kind: 'submenu' }).entries"
      :x="submenuPos.x"
      :y="submenuPos.y"
      :flip-x="submenuPos.flipX"
      nested
      @close="emit('close')"
    />
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 100;
  min-width: 200px;
  padding: 4px 0;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
  font-size: 13px;
  user-select: none;
}
.item {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 4px 14px;
  cursor: default;
  white-space: nowrap;
}
.item:hover:not(.disabled),
.item.open {
  background: var(--accent);
  color: #fff;
}
.item:hover:not(.disabled) .hint,
.item.open .hint {
  color: #fff;
}
.item.disabled {
  color: var(--muted);
  opacity: 0.6;
}
.hint {
  color: var(--muted);
}
.separator {
  height: 1px;
  margin: 4px 0;
  background: var(--border);
}
</style>
