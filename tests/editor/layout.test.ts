import ELK from 'elkjs/lib/elk.bundled.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOnt, type Ontology } from '../../src/core';
import { arrowBetween, rectsOverlap, segmentIntersection, type Rect } from '../../src/editor/geometry';
import { LAYOUT_ALGORITHMS, buildElkGraph, computeLayout, layoutClutter, positionsFromElk } from '../../src/editor/layout';

const sample = (name: string): Ontology =>
  parseOnt(readFileSync(join(__dirname, '../../docs/ont-samples', name), 'utf-8'));

/** Fixed-size boxes (the real sizes depend on text measurement in the browser). */
function boxesOf(ont: Ontology, pos?: ReadonlyMap<number, { x: number; y: number }>): Map<number, Rect> {
  return new Map(
    ont.nodes.map((n) => {
      const p = pos?.get(n.id) ?? n;
      return [n.id, { x: p.x, y: p.y, width: 40 + n.name.length * 7, height: 26 }];
    }),
  );
}

function crossings(ont: Ontology, boxes: Map<number, Rect>): number {
  const segs = ont.relations.flatMap((r) => {
    const a = boxes.get(r.sourceId);
    const b = boxes.get(r.destinationId);
    const s = a && b ? arrowBetween(a, b) : null;
    return s ? [s] : [];
  });
  let n = 0;
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const hit = segmentIntersection(segs[i]!.start, segs[i]!.end, segs[j]!.start, segs[j]!.end);
      if (hit && hit.t > 0.01 && hit.t < 0.99 && hit.u > 0.01 && hit.u < 0.99) n++;
    }
  return n;
}

describe('buildElkGraph', () => {
  it('skips relations to missing nodes and self-loops', () => {
    const ont = parseOnt(`{"nodes": [{"id": "1", "name": "A"}, {"id": "2", "name": "B"}], "relations": [
      {"id": "3", "name": "is_a", "source_node_id": "1", "destination_node_id": "2"},
      {"id": "4", "name": "is_a", "source_node_id": "1", "destination_node_id": "9"},
      {"id": "5", "name": "is_a", "source_node_id": "2", "destination_node_id": "2"}]}`);
    const g = buildElkGraph(ont, boxesOf(ont), 'layered');
    expect(g.children).toHaveLength(2);
    expect(g.edges).toEqual([{ id: 'r3', sources: ['1'], targets: ['2'] }]);
  });
});

describe('positionsFromElk', () => {
  it('moves the result to the anchor and rounds the coordinates', () => {
    const result = { id: 'root', children: [{ id: '1', x: 10.4, y: 20, width: 5, height: 5 }, { id: '2', x: 30, y: 40.6, width: 5, height: 5 }] };
    expect(positionsFromElk(result, { x: 100, y: -50 })).toEqual(
      new Map([
        [1, { x: 100, y: -50 }],
        [2, { x: 120, y: -29 }],
      ]),
    );
  });
});

describe('computeLayout', () => {
  const elk = new ELK();

  for (const algorithm of LAYOUT_ALGORITHMS) {
    it(`${algorithm}: places every node, without overlaps, keeping the top-left corner`, async () => {
      const ont = sample('cgraph.ont');
      const boxes = boxesOf(ont);
      const pos = await computeLayout(elk, ont, boxes, algorithm);
      expect(pos.size).toBe(ont.nodes.length);
      const after = [...boxesOf(ont, pos).values()];
      for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) expect(rectsOverlap(after[i]!, after[j]!)).toBe(false);
      const minX = Math.min(...after.map((b) => b.x));
      const minY = Math.min(...after.map((b) => b.y));
      const before = [...boxes.values()];
      expect(minX).toBe(Math.round(Math.min(...before.map((b) => b.x))));
      expect(minY).toBe(Math.round(Math.min(...before.map((b) => b.y))));
    });
  }

  for (const algorithm of ['layered', 'layeredHorizontal'] as const) {
    it(`${algorithm}: reduces the clutter (crossings, arrows through nodes) of the samples`, async () => {
      const dir = join(__dirname, '../../docs/ont-samples');
      let before = 0;
      let after = 0;
      let crossingsBefore = 0;
      let crossingsAfter = 0;
      const zoom: number[] = [];
      for (const name of readdirSync(dir).filter((f) => f.endsWith('.ont'))) {
        const ont = sample(name);
        const boxes = boxesOf(ont);
        const pos = await computeLayout(elk, ont, boxes, algorithm);
        before += layoutClutter(ont, boxes, new Map(ont.nodes.map((n) => [n.id, n])));
        after += layoutClutter(ont, boxes, pos);
        crossingsBefore += crossings(ont, boxes);
        crossingsAfter += crossings(ont, boxesOf(ont, pos));
        // The zoom at which the result fits a 1000x750 view (the larger, the more readable).
        const b = [...boxesOf(ont, pos).values()];
        const w = Math.max(...b.map((r) => r.x + r.width)) - Math.min(...b.map((r) => r.x));
        const h = Math.max(...b.map((r) => r.y + r.height)) - Math.min(...b.map((r) => r.y));
        zoom.push(Math.min(1, 1000 / w, 750 / h));
      }
      zoom.sort((a, b) => a - b);
      console.log(
        `${algorithm}: clutter ${before} -> ${after}, crossings ${crossingsBefore} -> ${crossingsAfter}, ` +
          `fit zoom: worst ${zoom[0]!.toFixed(2)}, median ${zoom[zoom.length >> 1]!.toFixed(2)}`,
      );
      expect(after).toBeLessThan(before / 2);
      expect(crossingsAfter).toBeLessThan(crossingsBefore);
    }, 120000);
  }

  it('layered: arrows point upwards (from the specific term to the general one)', async () => {
    const ont = sample('types.ont');
    const pos = await computeLayout(elk, ont, boxesOf(ont), 'layered');
    const up = ont.relations.filter((r) => pos.get(r.sourceId)!.y > pos.get(r.destinationId)!.y).length;
    expect(up / ont.relations.length).toBeGreaterThan(0.9);
  });
});
