import { describe, expect, it } from 'vitest';
import { arrowBetween, boundingBox, exitPoint } from '../../src/editor/geometry';

const box = { x: 0, y: 0, width: 100, height: 20 };

describe('exitPoint', () => {
  it('leaves through the side that the direction hits first', () => {
    expect(exitPoint(box, { x: 200, y: 10 })).toEqual({ x: 100, y: 10 });
    expect(exitPoint(box, { x: 50, y: -100 })).toEqual({ x: 50, y: 0 });
    expect(exitPoint(box, { x: 150, y: 110 })).toEqual({ x: 60, y: 20 });
  });

  it('returns the centre for a target at the centre', () => {
    expect(exitPoint(box, { x: 50, y: 10 })).toEqual({ x: 50, y: 10 });
  });
});

describe('arrowBetween', () => {
  it('connects the borders of two boxes', () => {
    const other = { x: 200, y: 0, width: 100, height: 20 };
    expect(arrowBetween(box, other)).toEqual({ start: { x: 100, y: 10 }, end: { x: 200, y: 10 } });
  });

  it('returns null for overlapping boxes', () => {
    expect(arrowBetween(box, { x: 50, y: 5, width: 100, height: 20 })).toBeNull();
  });
});

describe('boundingBox', () => {
  it('encloses all rectangles', () => {
    expect(boundingBox([box, { x: -10, y: 30, width: 5, height: 5 }])).toEqual({ x: -10, y: 0, width: 110, height: 35 });
    expect(boundingBox([])).toBeNull();
  });
});

import { computeCrossings, jumpPath, segmentIntersection } from '../../src/editor/geometry';

describe('segmentIntersection', () => {
  it('finds a proper crossing', () => {
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toEqual({ t: 0.5, u: 0.5 });
  });

  it('ignores disjoint, parallel, and collinear segments', () => {
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 0 }, { x: 6, y: -1 })).toBeNull();
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBeNull();
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBeNull();
  });
});

describe('computeCrossings', () => {
  const h = { id: 1, start: { x: 0, y: 50 }, end: { x: 100, y: 50 } };
  const v = { id: 2, start: { x: 30, y: 0 }, end: { x: 30, y: 100 } };

  it('makes the arrow with the larger ID jump', () => {
    expect(computeCrossings([h, v], { endMargin: 5 })).toEqual(new Map([[2, [50]]]));
    expect(computeCrossings([{ ...h, id: 3 }, v], { endMargin: 5 })).toEqual(new Map([[3, [30]]]));
  });

  it("ignores crossings near the jumping arrow's head, but not near the other arrow's head", () => {
    // The jumping arrow (ID 2) would get an arc right before its own arrowhead: skipped.
    const nearOwnHead = { id: 2, start: { x: 50, y: 0 }, end: { x: 50, y: 53 } };
    expect(computeCrossings([h, nearOwnHead], { endMargin: 5 }).size).toBe(0);
    // It crosses the other arrow (ID 1) right before that one's head: the arc stays.
    const nearOtherHead = { id: 2, start: { x: 97, y: 0 }, end: { x: 97, y: 100 } };
    expect(computeCrossings([h, nearOtherHead], { endMargin: 5 })).toEqual(new Map([[2, [50]]]));
    const sharedEnd = { id: 2, start: { x: 50, y: 0 }, end: { x: 100, y: 50 } };
    expect(computeCrossings([h, sharedEnd], { endMargin: 5 }).size).toBe(0);
  });

  it('ignores arrows that share a node', () => {
    const a = { ...h, nodes: [1, 2] as const };
    const b = { ...v, nodes: [3, 2] as const };
    expect(computeCrossings([a, b], { endMargin: 5 }).size).toBe(0);
    expect(computeCrossings([a, { ...b, nodes: [3, 4] as const }], { endMargin: 5 }).size).toBe(1);
  });

  it('ignores crossings at shallow angles', () => {
    const shallow = { id: 2, start: { x: 0, y: 45 }, end: { x: 100, y: 55 } }; // ~5.7 degrees
    expect(computeCrossings([h, shallow], { endMargin: 5, minAngle: 15 }).size).toBe(0);
    expect(computeCrossings([h, shallow], { endMargin: 5, minAngle: 5 }).size).toBe(1);
  });

  it('matches the brute-force result on a random graph', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 1000;
    const segs = Array.from({ length: 150 }, (_, i) => ({ id: i, start: { x: rnd(), y: rnd() }, end: { x: rnd(), y: rnd() } }));
    const fast = computeCrossings(segs, { endMargin: 0 });
    let brute = 0;
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++)
        if (segmentIntersection(segs[i]!.start, segs[i]!.end, segs[j]!.start, segs[j]!.end)) brute++;
    const count = [...fast.values()].reduce((n, l) => n + l.length, 0);
    expect(count).toBe(brute);
    expect(brute).toBeGreaterThan(100);
  });
});

describe('jumpPath', () => {
  it('is a straight line without jumps', () => {
    expect(jumpPath({ x: 0, y: 0 }, { x: 10, y: 0 }, [], 5)).toBe('M0,0L10,0');
  });

  it('bulges up on the screen, whatever the direction', () => {
    expect(jumpPath({ x: 0, y: 0 }, { x: 100, y: 0 }, [50], 5)).toBe('M0,0L45,0A5,5 0 0 1 55,0L100,0');
    expect(jumpPath({ x: 100, y: 0 }, { x: 0, y: 0 }, [50], 5)).toBe('M100,0L55,0A5,5 0 0 0 45,0L0,0');
  });

  it('merges close jumps into one (circular) arc', () => {
    expect(jumpPath({ x: 0, y: 0 }, { x: 100, y: 0 }, [40, 46], 5)).toBe('M0,0L35,0A8,8 0 0 1 51,0L100,0');
  });
});
