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
