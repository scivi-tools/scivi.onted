<script setup lang="ts">
/**
 * The SVG canvas showing the ontology as a graph. Pan with the mouse, zoom with the wheel.
 * Rendering only for now; the editing interactions come with the next milestone.
 */
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { RELATION_TYPES, isRelationType } from '../../core';
import { arrowBetween, boundingBox, type Point, type Rect } from '../geometry';
import { NODE_HEIGHT, nodeBox } from '../layout-metrics';
import type { EditorSession } from '../session';

const props = defineProps<{ session: EditorSession }>();

const svg = ref<SVGSVGElement | null>(null);
const transform = shallowRef<ZoomTransform>(zoomIdentity);
let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
let unregisterFit: (() => void) | null = null;

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
  color: string;
  marker: string;
  valid: boolean;
}

const INVALID_COLOR = '#888888';

const view = computed(() => {
  const ont = props.session.document.value.ontology;
  const config = props.session.config.value;
  const systemNames = new Set(config.systemNodeNames);
  const selected = new Set(props.session.selection.value);

  const boxes = new Map<number, Rect>();
  const nodes: NodeView[] = ont.nodes.map((n) => {
    const box = nodeBox(n.name, n.x, n.y);
    boxes.set(n.id, box);
    return { id: n.id, name: n.name, box, system: systemNames.has(n.name), selected: selected.has(n.id) };
  });

  const edges: EdgeView[] = [];
  for (const r of ont.relations) {
    const from = boxes.get(r.sourceId);
    const to = boxes.get(r.destinationId);
    if (!from || !to) continue;
    const segment = arrowBetween(from, to);
    if (!segment) continue;
    const type = isRelationType(r.name) ? r.name : null;
    edges.push({
      id: r.id,
      ...segment,
      color: type ? config.relationColors[type] : INVALID_COLOR,
      marker: type ? `arrow-${type}` : 'arrow-invalid',
      valid: type !== null,
    });
  }
  return { nodes, edges, boxes };
});

const markers = computed(() => [
  ...RELATION_TYPES.map((t) => ({ id: `arrow-${t}`, color: props.session.config.value.relationColors[t] })),
  { id: 'arrow-invalid', color: INVALID_COLOR },
]);

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
  const t = zoomIdentity
    .translate(width / 2 - k * (bb.x + bb.width / 2), height / 2 - k * (bb.y + bb.height / 2))
    .scale(k);
  select(el).call(zoomBehavior.transform, t);
}

onMounted(() => {
  const el = svg.value!;
  zoomBehavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.05, 8])
    // Panning starts on the background only; the wheel zooms anywhere.
    .filter((event: MouseEvent | WheelEvent) => {
      if (event.type !== 'wheel' && (event.target as Element).closest('.node')) return false;
      return (!event.ctrlKey || event.type === 'wheel') && !event.button;
    })
    .on('zoom', (event: { transform: ZoomTransform }) => {
      transform.value = event.transform;
    });
  select(el).call(zoomBehavior).on('dblclick.zoom', null);
  unregisterFit = props.session.commands.register({ id: 'view.fit', label: 'Fit to Window', run: fitToWindow });
  fitToWindow();
});

onBeforeUnmount(() => unregisterFit?.());

function onNodeClick(id: number, event: MouseEvent): void {
  const current = props.session.selection.value;
  if (event.shiftKey) {
    props.session.select(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  } else {
    props.session.select([id]);
  }
}

function onBackgroundClick(event: MouseEvent): void {
  if (!(event.target as Element).closest('.node')) props.session.select([]);
}
</script>

<template>
  <svg ref="svg" class="canvas" @click="onBackgroundClick">
    <defs>
      <marker
        v-for="m in markers"
        :id="m.id"
        :key="m.id"
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="10"
        markerHeight="10"
        markerUnits="userSpaceOnUse"
        orient="auto"
      >
        <path d="M0,0 L10,5 L0,10 z" :fill="m.color" />
      </marker>
    </defs>
    <g :transform="transform.toString()">
      <g class="edges">
        <line
          v-for="e in view.edges"
          :key="e.id"
          :x1="e.start.x"
          :y1="e.start.y"
          :x2="e.end.x"
          :y2="e.end.y"
          :stroke="e.color"
          :stroke-dasharray="e.valid ? undefined : '4 3'"
          :marker-end="`url(#${e.marker})`"
          class="edge"
        />
      </g>
      <g class="nodes">
        <g
          v-for="n in view.nodes"
          :key="n.id"
          class="node"
          :class="{ system: n.system, selected: n.selected }"
          :transform="`translate(${n.box.x},${n.box.y})`"
          @click.stop="onNodeClick(n.id, $event)"
        >
          <rect :width="n.box.width" :height="n.box.height" rx="3" />
          <text :x="n.box.width / 2" :y="NODE_HEIGHT / 2">{{ n.name }}</text>
        </g>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--bg);
  cursor: default;
  user-select: none;
}
.edge {
  stroke-width: 1.5;
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
</style>
