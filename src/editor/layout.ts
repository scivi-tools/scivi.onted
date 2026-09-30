/**
 * Auto-layout of the graph with ELK (https://eclipse.dev/elk/). This module only translates between
 * the ontology and ELK's graph format; the engine itself is created in `layout-engine.ts`.
 */
import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import type { Ontology, Position } from '../core';
import { arrowBetween, boundingBox, computeCrossings, countArrowsThroughBoxes, type Point, type Rect } from './geometry';

export type LayoutAlgorithm = 'layered' | 'layeredHorizontal' | 'stress';

export const LAYOUT_ALGORITHMS: readonly LayoutAlgorithm[] = ['layered', 'layeredHorizontal', 'stress'];

export const LAYOUT_LABELS: Record<LayoutAlgorithm, string> = {
  layered: 'Hierarchical Layout (Vertical)',
  layeredHorizontal: 'Hierarchical Layout (Horizontal)',
  stress: 'Organic Layout',
};

/**
 * The ELK options of each algorithm.
 * - Layered: nodes in layers, minimising arrow crossings. Vertically, the arrows point upwards,
 *   as in the existing SciVi ontologies (e.g. `is_a` goes from the specific term up to the general
 *   one). Horizontally, they point to the left (the general terms are on the left); this is much
 *   more compact when a term has many children, as the boxes are wider than they are tall.
 * - Stress: a force-directed ("organic") layout, for graphs without a clear hierarchy.
 */
const LAYERED: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'UP',
  'elk.spacing.nodeNode': '30',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  'elk.spacing.componentComponent': '60',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
};

/**
 * ELK optimises layered layouts for arrows that bend around the nodes, but the editor draws them
 * straight. So several variants are computed, and the one with the fewest crossings and arrows
 * running through other nodes (as drawn by the editor) wins. Measured on the SciVi samples, this
 * works better than any single variant.
 */
const LAYERED_VARIANTS_VERTICAL: readonly Record<string, string>[] = [
  // Keeps the result close to the order of the file.
  { ...LAYERED, 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' },
  { ...LAYERED, 'elk.layered.thoroughness': '100' },
  { ...LAYERED, 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED' },
  { ...LAYERED, 'elk.layered.spacing.nodeNodeBetweenLayers': '100', 'elk.spacing.nodeNode': '40' },
];

const LAYERED_VARIANTS: Record<'layered' | 'layeredHorizontal', readonly Record<string, string>[]> = {
  layered: LAYERED_VARIANTS_VERTICAL,
  layeredHorizontal: LAYERED_VARIANTS_VERTICAL.map((v) => ({
    ...v,
    'elk.direction': 'LEFT',
    // Between the nodes of a layer (now above each other), less space is needed.
    'elk.spacing.nodeNode': String(Number(v['elk.spacing.nodeNode']) / 2),
  })),
};

/** Above this size, only the first variant is computed, to keep the layout quick. */
const MAX_NODES_FOR_VARIANTS = 200;

const OPTIONS: Record<LayoutAlgorithm, Record<string, string>> = {
  layered: LAYERED_VARIANTS_VERTICAL[0]!,
  layeredHorizontal: LAYERED_VARIANTS.layeredHorizontal[0]!,
  stress: {
    'elk.algorithm': 'stress',
    'elk.stress.desiredEdgeLength': '140',
    'elk.spacing.componentComponent': '60',
  },
};

/** ELK's overlap removal (SPOrE), applied after the stress layout. */
const OVERLAP_REMOVAL: Record<string, string> = {
  'elk.algorithm': 'sporeOverlap',
  'elk.spacing.nodeNode': '20',
};

/** Builds ELK's input graph: the nodes with their box sizes, and the relations between existing nodes. */
export function buildElkGraph(
  ont: Ontology,
  boxes: ReadonlyMap<number, Rect>,
  algorithm: LayoutAlgorithm,
): ElkNode {
  const ids = new Set(ont.nodes.map((n) => n.id));
  return {
    id: 'root',
    layoutOptions: OPTIONS[algorithm],
    children: ont.nodes.map((n) => {
      const box = boxes.get(n.id)!;
      return { id: String(n.id), width: box.width, height: box.height };
    }),
    edges: ont.relations
      .filter((r) => ids.has(r.sourceId) && ids.has(r.destinationId) && r.sourceId !== r.destinationId)
      .map((r) => ({ id: `r${r.id}`, sources: [String(r.sourceId)], targets: [String(r.destinationId)] })),
  };
}

/**
 * The node positions (top-left corners) from ELK's result, shifted so that the laid-out graph's
 * top-left corner is at `anchor` (normally where the graph was before), and rounded.
 */
export function positionsFromElk(result: ElkNode, anchor: Point): Map<number, Position> {
  const children = result.children ?? [];
  const bb = boundingBox(
    children.map((c) => ({ x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0 })),
  );
  const dx = anchor.x - (bb?.x ?? 0);
  const dy = anchor.y - (bb?.y ?? 0);
  const positions = new Map<number, Position>();
  for (const c of children) {
    positions.set(Number(c.id), { x: Math.round((c.x ?? 0) + dx), y: Math.round((c.y ?? 0) + dy) });
  }
  return positions;
}

/**
 * How cluttered the graph looks with the given node positions, as drawn by the editor (straight
 * arrows): the number of arrow crossings plus the number of arrows running through other nodes.
 */
export function layoutClutter(
  ont: Ontology,
  boxes: ReadonlyMap<number, Rect>,
  positions: ReadonlyMap<number, Position>,
): number {
  const moved = new Map<number, Rect>();
  for (const [id, b] of boxes) {
    const p = positions.get(id);
    moved.set(id, p ? { ...b, x: p.x, y: p.y } : b);
  }
  const segments = ont.relations.flatMap((r) => {
    const a = moved.get(r.sourceId);
    const b = moved.get(r.destinationId);
    const s = a && b ? arrowBetween(a, b) : null;
    return s ? [{ id: r.id, nodes: [r.sourceId, r.destinationId] as const, ...s }] : [];
  });
  let crossings = 0;
  for (const list of computeCrossings(segments, { endMargin: 1 }).values()) crossings += list.length;
  return crossings + countArrowsThroughBoxes(segments, moved);
}

/** Lays out the whole ontology; returns the new positions of its nodes. */
export async function computeLayout(
  elk: ELK,
  ont: Ontology,
  boxes: ReadonlyMap<number, Rect>,
  algorithm: LayoutAlgorithm,
): Promise<Map<number, Position>> {
  const anchor = boundingBox(boxes.values()) ?? { x: 0, y: 0 };
  if (algorithm === 'stress') {
    const result = await elk.layout(buildElkGraph(ont, boxes, 'stress'));
    // Stress layouts may let boxes overlap: push them apart, keeping the overall shape.
    return positionsFromElk(await elk.layout({ ...result, layoutOptions: OVERLAP_REMOVAL }), anchor);
  }
  const all = LAYERED_VARIANTS[algorithm];
  const variants = ont.nodes.length > MAX_NODES_FOR_VARIANTS ? all.slice(0, 1) : all;
  let best: { positions: Map<number, Position>; clutter: number } | null = null;
  for (const options of variants) {
    const graph = { ...buildElkGraph(ont, boxes, algorithm), layoutOptions: options };
    const positions = positionsFromElk(await elk.layout(graph), anchor);
    const clutter = layoutClutter(ont, boxes, positions);
    if (!best || clutter < best.clutter) best = { positions, clutter };
  }
  return best!.positions;
}
