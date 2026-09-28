import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, prune, selectOnly, toggle } from '../../src/editor/selection';

describe('selection', () => {
  it('keeps the order in which nodes were selected', () => {
    let s = selectOnly('node', 3);
    s = toggle(s, 'node', 1);
    s = toggle(s, 'relation', 7);
    expect(s).toEqual({ nodes: [3, 1], relations: [7] });
    expect(toggle(s, 'node', 3)).toEqual({ nodes: [1], relations: [7] });
  });

  it('prunes deleted elements, returning the same object if nothing changed', () => {
    const s = { nodes: [1, 2], relations: [5] };
    expect(prune(s, new Set([1, 2]), new Set([5]))).toBe(s);
    expect(prune(s, new Set([2]), new Set())).toEqual({ nodes: [2], relations: [] });
    expect(prune(EMPTY_SELECTION, new Set(), new Set())).toBe(EMPTY_SELECTION);
  });
});
