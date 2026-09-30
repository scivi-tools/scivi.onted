import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OntDocument } from '../../src/core/document';
import { SCIVI_NAMESPACE } from '../../src/core/model';

const sample = (name: string): string => readFileSync(join(__dirname, '../../docs/ont-samples', name), 'utf-8');

function docWithNodes(n: number): OntDocument {
  const doc = OntDocument.createEmpty();
  for (let i = 1; i <= n; i++) doc.addNode(`N${i}`, i * 10, 0);
  return doc;
}

describe('IDs', () => {
  it('allocates last_id + 1 for nodes and relations alike', () => {
    const doc = docWithNodes(2);
    expect(doc.ontology.nodes.map((n) => n.id)).toEqual([1, 2]);
    expect(doc.link([1], 2, 'is_a')).toEqual([3]);
    expect(doc.ontology.lastId).toBe(3);
  });

  it('decrements last_id only when the last element is deleted', () => {
    const doc = docWithNodes(3);
    doc.deleteElements([2]);
    expect(doc.ontology.lastId).toBe(3); // a gap appears
    doc.deleteElements([3]);
    expect(doc.ontology.lastId).toBe(2);
    expect(doc.addNode('X', 0, 0)).toBe(3);
  });

  it('releases all trailing IDs when several last elements are deleted at once', () => {
    const doc = docWithNodes(2);
    doc.link([1], 2, 'has'); // id 3
    doc.deleteElements([2]); // deletes node 2 and relation 3
    expect(doc.ontology.lastId).toBe(1);
  });

  it('never reuses IDs of a broken file with last_id below the largest ID', () => {
    const doc = OntDocument.fromText('{"last_id": "1", "nodes": [{"id": "5", "name": "A"}], "relations": []}');
    expect(doc.addNode('B', 0, 0)).toBe(6);
  });
});

describe('editing', () => {
  it('links from each earlier-selected node to the last-selected one, skipping duplicates', () => {
    const doc = docWithNodes(3);
    expect(doc.link([1, 2], 3, 'a_part_of')).toEqual([4, 5]);
    expect(doc.link([1, 3], 3, 'a_part_of')).toEqual([]);
    const r = doc.ontology.relations;
    expect(r.map((x) => [x.sourceId, x.destinationId, x.name])).toEqual([
      [1, 3, 'a_part_of'],
      [2, 3, 'a_part_of'],
    ]);
    expect(r.every((x) => x.namespace === SCIVI_NAMESPACE)).toBe(true);
  });

  it('gives new objects the SciVi namespace in foreign files, keeping the existing ones', () => {
    const text = sample('slider.ont');
    const doc = OntDocument.fromText(text);
    const id = doc.addNode('New', 0, 0);
    const nodes = doc.ontology.nodes;
    expect(nodes.find((n) => n.id === id)!.namespace).toBe(SCIVI_NAMESPACE);
    expect(nodes[0]!.namespace).toContain('knova.ru');
  });

  it('renames and moves nodes, rounding the coordinates', () => {
    const doc = docWithNodes(1);
    doc.renameNode(1, 'Renamed');
    doc.moveNodes(new Map([[1, { x: 10.6, y: -3.2 }]]));
    expect(doc.ontology.nodes[0]).toMatchObject({ name: 'Renamed', x: 11, y: -3 });
    expect(() => doc.renameNode(1, '')).toThrow();
  });

  it('edits attributes keeping their types and order', () => {
    const doc = docWithNodes(1);
    doc.setAttribute(1, 'a', { type: 'int', value: 1 });
    doc.setAttribute(1, 'b', { type: 'bool', value: false });
    doc.renameAttribute(1, 'a', 'c');
    expect([...doc.ontology.nodes[0]!.attributes]).toEqual([
      ['c', { type: 'int', value: 1 }],
      ['b', { type: 'bool', value: false }],
    ]);
    doc.deleteAttribute(1, 'b');
    expect(doc.toText()).toContain('"c": 1');
    expect(doc.toText()).not.toContain('"b"');
  });
});

describe('undo/redo', () => {
  it('restores a real file byte-identically after arbitrary edits', () => {
    const text = sample('cgraph.ont');
    const doc = OntDocument.fromText(text);
    const [a, b] = doc.ontology.nodes;
    doc.addNode('X', 1, 2);
    doc.link([a!.id], b!.id, 'is_used');
    doc.renameNode(a!.id, 'Y');
    doc.moveNodes(new Map([[b!.id, { x: 0, y: 0 }]]));
    doc.setAttribute(a!.id, 'k', { type: 'string', value: 'v' });
    doc.deleteElements([a!.id, b!.id]);
    const edited = doc.toText();
    expect(edited).not.toBe(text);

    while (doc.canUndo) doc.undo();
    expect(doc.toText()).toBe(text);
    while (doc.canRedo) doc.redo();
    expect(doc.toText()).toBe(edited);
  });

  it('tracks the modified state against the last save', () => {
    const doc = docWithNodes(0);
    expect(doc.isModified).toBe(false);
    doc.addNode('A', 0, 0);
    expect(doc.isModified).toBe(true);
    doc.markSaved();
    expect(doc.isModified).toBe(false);
    doc.undo();
    expect(doc.isModified).toBe(true);
    doc.redo();
    expect(doc.isModified).toBe(false);
    doc.undo();
    doc.addNode('B', 0, 0); // the saved state is no longer reachable
    expect(doc.isModified).toBe(true);
    doc.undo();
    expect(doc.isModified).toBe(true);
  });

  it('emits change events', () => {
    const doc = docWithNodes(0);
    const reasons: string[] = [];
    doc.events.on('changed', (e) => reasons.push(e.reason));
    doc.addNode('A', 0, 0);
    doc.undo();
    doc.redo();
    doc.markSaved();
    expect(reasons).toEqual(['edit', 'undo', 'redo', 'saved']);
  });
});

describe('relation types and attribute checks', () => {
  it('changes relation types as one undoable step', () => {
    const doc = docWithNodes(3);
    const ids = doc.link([1, 2], 3, 'is_a');
    doc.setRelationType(ids, 'has');
    expect(doc.ontology.relations.map((r) => r.name)).toEqual(['has', 'has']);
    doc.undo();
    expect(doc.ontology.relations.map((r) => r.name)).toEqual(['is_a', 'is_a']);
  });

  it('rejects renaming an attribute onto an existing one, and skips no-op edits', () => {
    const doc = docWithNodes(1);
    doc.setAttribute(1, 'a', { type: 'int', value: 1 });
    doc.setAttribute(1, 'b', { type: 'int', value: 2 });
    expect(() => doc.renameAttribute(1, 'a', 'b')).toThrow(/already exists/);
    doc.setAttribute(1, 'a', { type: 'int', value: 1 });
    expect(doc.undoLabel).toBe('Set attribute');
    doc.undo();
    doc.undo();
    expect(doc.ontology.nodes[0]!.attributes.size).toBe(0);
    expect(() => doc.setAttribute(1, 'x', { type: 'int', value: 1.5 })).toThrow();
  });
});

describe('moveNodes', () => {
  it('can carry a custom undo label (e.g. for auto-layout)', () => {
    const doc = docWithNodes(2);
    doc.moveNodes(new Map([[1, { x: 5, y: 5 }], [2, { x: 50, y: 5 }]]), 'Auto-Layout');
    expect(doc.undoLabel).toBe('Auto-Layout');
    doc.moveNodes(new Map([[1, { x: 7, y: 5 }]]));
    expect(doc.undoLabel).toBe('Move node');
  });
});
