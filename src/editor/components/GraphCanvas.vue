<script setup lang="ts">
/**
 * The SVG canvas: shows the ontology as a graph and handles the direct-manipulation interactions:
 * selecting nodes and relations, dragging nodes, renaming in place, adding nodes, the context menu.
 * Pan by dragging the background, zoom with the wheel.
 */
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { RELATION_TYPES, findNode, isRelationType, type Position } from '../../core';
import { arrowBetween, boundingBox, computeCrossings, jumpPath, type Point, type Rect, type Segment } from '../geometry';
import { NODE_HEIGHT, NODE_PADDING_X, nodeBox } from '../layout-metrics';
import { BACKGROUND_MENU, NODE_MENU, RELATION_MENU, type MenuEntry } from '../menu-model';
import { add, isSelected, selectOnly, toggle } from '../selection';
import type { EditorSession } from '../session';
import ContextMenu from './ContextMenu.vue';

const props = defineProps<{ session: EditorSession }>();

const NEW_NODE_NAME = 'New Term';
/** Length of the arrowheads; lines stop half-way into them, so their ends do not show at the tip. */
const ARROW_LENGTH = 10;
const LINE_INSET = ARROW_LENGTH / 2;
/** Radius of the arcs ("tunnels") by which an arrow jumps over the arrows it crosses. */
const JUMP_RADIUS = 5;
/** No jumps this close to the ends of arrows: at the nodes, and under the arrowheads. */
const JUMP_END_MARGIN = JUMP_RADIUS + ARROW_LENGTH;
/** Arrows crossing at a smaller angle (degrees) do not jump: a tunnel would look like a loop. */
const JUMP_MIN_ANGLE = 15;
/** In larger graphs, the tunnels are recomputed when a drag ends, rather than on every move. */
const LIVE_JUMPS_MAX_ARROWS = 300;
const DRAG_THRESHOLD = 3;
const INVALID_COLOR = '#888888';

const svg = ref<SVGSVGElement | null>(null);
const renameInput = ref<HTMLInputElement | null>(null);
const transform = shallowRef<ZoomTransform>(zoomIdentity);
/** Nodes being dragged, and the offset so far (in graph units). */
const drag = shallowRef<{ ids: ReadonlySet<number>; dx: number; dy: number } | null>(null);
const renaming = shallowRef<{ id: number; text: string } | null>(null);
/** The text in the rename field, as it is being typed. */
const renameDraft = ref('');
const contextMenu = shallowRef<{ x: number; y: number; entries: readonly MenuEntry[] } | null>(null);

let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
/** The last pointer position over the canvas, in graph coordinates. */
let lastPointer: Point | null = null;
/** Where the context menu was opened, in graph coordinates (for "Add Node Here"). */
let contextPoint: Point | null = null;
const cleanups: (() => void)[] = [];

// --- the view model ------------------------------------------------------------------------

interface NodeView {
  id: number;
  name: string;
  box: Rect;
  system: boolean;
  selected: boolean;
}

interface EdgeView {
  id: number;
  start: Point;
  end: Point;
  /** The SVG path of the drawn line: it ends short of `end` (inside the arrowhead) and jumps over crossings. */
  path: string;
  color: string;
  marker: string;
  valid: boolean;
  selected: boolean;
}

const view = computed(() => {
  const ont = props.session.document.value.ontology;
  const config = props.session.config.value;
  const systemNames = new Set(config.systemNodeNames);
  const sel = props.session.selection.value;
  const d = drag.value;

  const boxes = new Map<number, Rect>();
  const nodes: NodeView[] = ont.nodes.map((n) => {
    const moved = d?.ids.has(n.id);
    const box = nodeBox(n.name, moved ? n.x + d!.dx : n.x, moved ? n.y + d!.dy : n.y);
    boxes.set(n.id, box);
    return { id: n.id, name: n.name, box, system: systemNames.has(n.name), selected: sel.nodes.includes(n.id) };
  });

  const segments: (Segment & { color: string; marker: string; valid: boolean; selected: boolean })[] = [];
  for (const r of ont.relations) {
    const from = boxes.get(r.sourceId);
    const to = boxes.get(r.destinationId);
    if (!from || !to) continue;
    const segment = arrowBetween(from, to);
    if (!segment) continue;
    const type = isRelationType(r.name) ? r.name : null;
    segments.push({
      id: r.id,
      nodes: [r.sourceId, r.destinationId],
      ...segment,
      color: type ? config.relationColors[type] : INVALID_COLOR,
      marker: type ? `arrow-${type}` : 'arrow-invalid',
      valid: type !== null,
      selected: sel.relations.includes(r.id),
    });
  }

  const crossings =
    d && segments.length > LIVE_JUMPS_MAX_ARROWS
      ? new Map<number, number[]>()
      : computeCrossings(segments, { endMargin: JUMP_END_MARGIN, minAngle: JUMP_MIN_ANGLE });
  const edges: EdgeView[] = segments.map((e) => {
    const len = Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y);
    const inset = len > LINE_INSET ? LINE_INSET / len : 0;
    const lineEnd = { x: e.end.x - (e.end.x - e.start.x) * inset, y: e.end.y - (e.end.y - e.start.y) * inset };
    return { ...e, path: jumpPath(e.start, lineEnd, crossings.get(e.id) ?? [], JUMP_RADIUS) };
  });
  return { nodes, edges, boxes };
});

const markers = computed(() => [
  ...RELATION_TYPES.map((t) => ({ id: `arrow-${t}`, color: props.session.config.value.relationColors[t] })),
  { id: 'arrow-invalid', color: INVALID_COLOR },
]);

/** Screen position of the rename field, relative to the canvas. */
const renameStyle = computed(() => {
  const r = renaming.value;
  const box = r && view.value.boxes.get(r.id);
  if (!box) return {};
  const t = transform.value;
  // As wide as the node, growing with the text (as the node will), centred on the node.
  const width = Math.max(box.width, nodeBox(renameDraft.value, 0, 0).width) * t.k;
  return {
    left: `${t.applyX(box.x + box.width / 2) - width / 2}px`,
    top: `${t.applyY(box.y)}px`,
    width: `${width}px`,
    height: `${box.height * t.k}px`,
    fontSize: `${13 * t.k}px`,
    padding: `0 ${(NODE_PADDING_X - 2) * t.k}px`,
  };
});

// --- coordinates ---------------------------------------------------------------------------

function toGraph(clientX: number, clientY: number): Point {
  const r = svg.value!.getBoundingClientRect();
  const [x, y] = transform.value.invert([clientX - r.left, clientY - r.top]);
  return { x, y };
}

function viewCenter(): Point {
  const r = svg.value!.getBoundingClientRect();
  return toGraph(r.left + r.width / 2, r.top + r.height / 2);
}

// --- commands owned by the canvas ----------------------------------------------------------

function fitToWindow(): void {
  const el = svg.value;
  if (!el || !zoomBehavior) return;
  const { width, height } = el.getBoundingClientRect();
  const bb = boundingBox(view.value.boxes.values());
  if (!bb || width === 0 || height === 0) {
    select(el).call(zoomBehavior.transform, zoomIdentity.translate(width / 2, height / 2));
    return;
  }
  const margin = 40;
  const k = Math.max(0.05, Math.min(1.5, (width - 2 * margin) / bb.width, (height - 2 * margin) / bb.height));
  select(el).call(
    zoomBehavior.transform,
    zoomIdentity.translate(width / 2 - k * (bb.x + bb.width / 2), height / 2 - k * (bb.y + bb.height / 2)).scale(k),
  );
}

/** Adds a node centred at the given point (or at the centre of the view), and starts renaming it. */
function addNode(at: Point | null): void {
  const p = at ?? viewCenter();
  const box = nodeBox(NEW_NODE_NAME, 0, 0);
  const id = props.session.document.value.addNode(NEW_NODE_NAME, p.x - box.width / 2, p.y - box.height / 2);
  props.session.select(selectOnly('node', id));
  void startRename(id);
}

async function startRename(id: number): Promise<void> {
  const node = findNode(props.session.document.value.ontology, id);
  if (!node) return;
  contextMenu.value = null;
  renaming.value = { id, text: node.name };
  renameDraft.value = node.name;
  await nextTick();
  renameInput.value?.focus();
  renameInput.value?.select();
}

function onRenameBlur(): void {
  // Switching to another application also blurs the field: keep editing then.
  if (document.hasFocus()) finishRename(true);
}

function finishRename(commit: boolean): void {
  const r = renaming.value;
  if (!r) return;
  renaming.value = null;
  const name = renameInput.value?.value ?? r.text;
  if (commit && name !== '') void props.session.runCommandFn(() => props.session.document.value.renameNode(r.id, name));
}

// --- pointer interactions ------------------------------------------------------------------

interface PressState {
  id: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** What a click (a press without dragging) does to the selection. */
  onClick: 'none' | 'deselect' | 'selectOnly';
}

let press: PressState | null = null;

function blurTextFields(): void {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el !== document.body) el.blur();
}

function onNodePointerDown(id: number, e: PointerEvent): void {
  if (e.button !== 0) return;
  blurTextFields();
  const sel = props.session.selection.value;
  const selected = isSelected(sel, 'node', id);
  let onClick: PressState['onClick'] = 'none';
  if (e.shiftKey) {
    if (selected) onClick = 'deselect';
    else props.session.select(add(sel, 'node', id));
  } else if (selected) {
    onClick = 'selectOnly';
  } else {
    props.session.select(selectOnly('node', id));
  }
  press = { id, startX: e.clientX, startY: e.clientY, moved: false, onClick };
  window.addEventListener('pointermove', onPressMove);
  window.addEventListener('pointerup', onPressEnd);
  window.addEventListener('pointercancel', onPressCancel);
}

function onPressMove(e: PointerEvent): void {
  if (!press) return;
  if (!press.moved && Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < DRAG_THRESHOLD) return;
  press.moved = true;
  const k = transform.value.k;
  drag.value = {
    ids: new Set(props.session.selection.value.nodes),
    dx: (e.clientX - press.startX) / k,
    dy: (e.clientY - press.startY) / k,
  };
}

function endPress(): void {
  window.removeEventListener('pointermove', onPressMove);
  window.removeEventListener('pointerup', onPressEnd);
  window.removeEventListener('pointercancel', onPressCancel);
  press = null;
  drag.value = null;
}

function onPressEnd(): void {
  const p = press;
  const d = drag.value;
  endPress();
  if (!p) return;
  if (p.moved && d) {
    const ont = props.session.document.value.ontology;
    const positions = new Map<number, Position>();
    for (const id of d.ids) {
      const n = findNode(ont, id);
      if (n) positions.set(id, { x: n.x + d.dx, y: n.y + d.dy });
    }
    props.session.document.value.moveNodes(positions);
  } else if (p.onClick === 'deselect') {
    props.session.select(toggle(props.session.selection.value, 'node', p.id));
  } else if (p.onClick === 'selectOnly') {
    props.session.select(selectOnly('node', p.id));
  }
}

function onPressCancel(): void {
  endPress();
}

function onNodeDoubleClick(id: number, e: MouseEvent): void {
  if (e.ctrlKey || e.metaKey) {
    props.session.select(selectOnly('node', id));
    void props.session.runCommand('edit.attributes');
  } else {
    void startRename(id);
  }
}

function onEdgePointerDown(id: number, e: PointerEvent): void {
  if (e.button !== 0) return;
  blurTextFields();
  const sel = props.session.selection.value;
  props.session.select(e.shiftKey ? toggle(sel, 'relation', id) : selectOnly('relation', id));
}

function onCanvasPointerDown(e: PointerEvent): void {
  if (!(e.target as Element).closest('.node, .edge-hit')) blurTextFields();
}

function onCanvasPointerMove(e: PointerEvent): void {
  lastPointer = toGraph(e.clientX, e.clientY);
}

function onBackgroundClick(e: MouseEvent): void {
  if (!(e.target as Element).closest('.node, .edge-hit') && !e.shiftKey) props.session.select({ nodes: [], relations: [] });
}

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  contextPoint = toGraph(e.clientX, e.clientY);
  const target = e.target as Element;
  const sel = props.session.selection.value;
  const nodeEl = target.closest<SVGElement>('.node');
  const edgeEl = target.closest<SVGElement>('.edge-hit');
  let entries: readonly MenuEntry[];
  if (nodeEl) {
    const id = Number(nodeEl.dataset.id);
    if (!isSelected(sel, 'node', id)) props.session.select(selectOnly('node', id));
    entries = NODE_MENU;
  } else if (edgeEl) {
    const id = Number(edgeEl.dataset.id);
    if (!isSelected(sel, 'relation', id)) props.session.select(selectOnly('relation', id));
    entries = RELATION_MENU;
  } else {
    entries = BACKGROUND_MENU;
  }
  contextMenu.value = { x: e.clientX, y: e.clientY, entries };
}

// --- lifecycle -----------------------------------------------------------------------------

onMounted(() => {
  const el = svg.value!;
  zoomBehavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.05, 8])
    // Panning starts on the background only; the wheel zooms anywhere.
    .filter((event: MouseEvent | WheelEvent) => {
      if (event.type !== 'wheel' && (event.target as Element).closest('.node, .edge-hit')) return false;
      return (!event.ctrlKey || event.type === 'wheel') && !event.button;
    })
    .on('zoom', (event: { transform: ZoomTransform }) => {
      transform.value = event.transform;
    });
  select(el).call(zoomBehavior).on('dblclick.zoom', null);

  // Back from another application: continue renaming where it was left.
  const onWindowFocus = () => {
    if (renaming.value) renameInput.value?.focus();
  };
  window.addEventListener('focus', onWindowFocus);
  cleanups.push(() => window.removeEventListener('focus', onWindowFocus));

  const c = props.session.commands;
  cleanups.push(
    c.register({ id: 'view.fit', label: 'Fit to Window', run: fitToWindow }),
    // At the pointer when invoked by the keyboard; at the centre of the view from the main menu.
    c.register({ id: 'edit.addNode', label: 'Add Node', run: () => addNode(lastPointer) }),
    // From the context menu: where the menu was opened.
    c.register({ id: 'edit.addNodeHere', label: 'Add Node Here', run: () => addNode(contextPoint) }),
    c.register({
      id: 'edit.rename',
      label: 'Rename Node',
      isEnabled: () => props.session.selection.value.nodes.length === 1,
      run: () => startRename(props.session.selection.value.nodes[0]!),
    }),
  );
  fitToWindow();
});

onBeforeUnmount(() => {
  endPress();
  for (const f of cleanups) f();
});
</script>

<template>
  <div class="canvas-wrap">
    <svg
      ref="svg"
      class="canvas"
      :class="{ dragging: drag !== null }"
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerleave="lastPointer = null"
      @click="onBackgroundClick"
      @contextmenu="onContextMenu"
    >
      <defs>
        <marker
          v-for="m in markers"
          :id="m.id"
          :key="m.id"
          :viewBox="`0 0 ${ARROW_LENGTH} 10`"
          :refX="ARROW_LENGTH - LINE_INSET"
          refY="5"
          :markerWidth="ARROW_LENGTH"
          markerHeight="10"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path :d="`M0,0 L${ARROW_LENGTH},5 L0,10 z`" :fill="m.color" />
        </marker>
      </defs>
      <g :transform="transform.toString()">
        <g class="edges">
          <g v-for="e in view.edges" :key="e.id">
            <path v-if="e.selected" :d="e.path" class="edge-halo" />
            <path
              :d="e.path"
              :stroke="e.color"
              :stroke-dasharray="e.valid ? undefined : '4 3'"
              :marker-end="`url(#${e.marker})`"
              class="edge"
              :class="{ selected: e.selected }"
            />
            <path
              :d="e.path"
              class="edge-hit"
              :data-id="e.id"
              @pointerdown="onEdgePointerDown(e.id, $event)"
            />
          </g>
        </g>
        <g class="nodes">
          <g
            v-for="n in view.nodes"
            :key="n.id"
            class="node"
            :class="{ system: n.system, selected: n.selected }"
            :data-id="n.id"
            :transform="`translate(${n.box.x},${n.box.y})`"
            @pointerdown="onNodePointerDown(n.id, $event)"
            @dblclick="onNodeDoubleClick(n.id, $event)"
          >
            <rect :width="n.box.width" :height="n.box.height" rx="3" />
            <text :x="n.box.width / 2" :y="NODE_HEIGHT / 2">{{ n.name }}</text>
          </g>
        </g>
      </g>
    </svg>
    <input
      v-if="renaming"
      ref="renameInput"
      class="rename"
      :style="renameStyle"
      :value="renameDraft"
      spellcheck="false"
      @input="renameDraft = ($event.target as HTMLInputElement).value"
      @keydown.enter.prevent="finishRename(true)"
      @keydown.esc.prevent="finishRename(false)"
      @blur="onRenameBlur"
    />
    <ContextMenu
      v-if="contextMenu"
      :session="session"
      :entries="contextMenu.entries"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @close="contextMenu = null"
    />
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--bg);
  cursor: default;
  user-select: none;
}
.canvas.dragging,
.canvas.dragging .node {
  cursor: grabbing;
}
.edge {
  fill: none;
  stroke-width: 1.5;
  pointer-events: none;
}
.edge.selected {
  stroke-width: 2.5;
}
.edge-halo {
  fill: none;
  stroke: var(--accent);
  stroke-opacity: 0.3;
  stroke-width: 8;
  stroke-linecap: round;
  pointer-events: none;
}
.edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 10;
  pointer-events: stroke;
}
.node rect {
  fill: var(--node-fill);
  stroke: var(--node-stroke);
  stroke-width: 1;
}
.node.system rect {
  fill: var(--node-system-fill);
}
.node.selected rect {
  stroke: var(--accent);
  stroke-width: 2.5;
}
.node text {
  font-family: system-ui, -apple-system, 'Segoe UI', Ubuntu, sans-serif;
  font-size: 13px;
  text-anchor: middle;
  dominant-baseline: central;
  fill: var(--text);
  pointer-events: none;
}
.rename {
  position: absolute;
  box-sizing: border-box;
  padding: 0 6px;
  border: 2px solid var(--accent);
  border-radius: 3px;
  font-family: system-ui, -apple-system, 'Segoe UI', Ubuntu, sans-serif;
  text-align: center;
  outline: none;
  background: #fff;
}
</style>
