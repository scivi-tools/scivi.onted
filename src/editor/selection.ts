/** The selection: nodes in the order they were selected (which matters for linking), and relations. */
export interface Selection {
  readonly nodes: readonly number[];
  readonly relations: readonly number[];
}

export const EMPTY_SELECTION: Selection = { nodes: [], relations: [] };

export type ElementKind = 'node' | 'relation';

function key(kind: ElementKind): keyof Selection {
  return kind === 'node' ? 'nodes' : 'relations';
}

export function isSelected(sel: Selection, kind: ElementKind, id: number): boolean {
  return sel[key(kind)].includes(id);
}

/** Selects only the given element. */
export function selectOnly(kind: ElementKind, id: number): Selection {
  return kind === 'node' ? { nodes: [id], relations: [] } : { nodes: [], relations: [id] };
}

/** Adds the element to the selection (at the end), or removes it if it is already selected. */
export function toggle(sel: Selection, kind: ElementKind, id: number): Selection {
  const k = key(kind);
  const list = sel[k];
  return { ...sel, [k]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
}

export function add(sel: Selection, kind: ElementKind, id: number): Selection {
  return isSelected(sel, kind, id) ? sel : toggle(sel, kind, id);
}

export function isEmpty(sel: Selection): boolean {
  return sel.nodes.length === 0 && sel.relations.length === 0;
}

/** Drops the elements that no longer exist. Returns the same object if nothing changed. */
export function prune(sel: Selection, nodeIds: ReadonlySet<number>, relationIds: ReadonlySet<number>): Selection {
  const nodes = sel.nodes.filter((id) => nodeIds.has(id));
  const relations = sel.relations.filter((id) => relationIds.has(id));
  return nodes.length === sel.nodes.length && relations.length === sel.relations.length ? sel : { nodes, relations };
}
