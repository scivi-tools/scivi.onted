/**
 * Reversible modifications of an ontology. Every change of the model goes through a command,
 * which is what makes undo/redo possible. The primitive commands below capture whatever they
 * need to revert themselves when they are applied, so they can be re-applied for redo.
 */
import type { AttributeValue, OntNode, OntRelation, Ontology } from './model';

export interface Command {
  /** Human-readable name, e.g. for "Undo <label>" in the menu. */
  readonly label: string;
  apply(ont: Ontology): void;
  revert(ont: Ontology): void;
}

/** Several commands applied as one undoable step. */
export function compound(label: string, commands: readonly Command[]): Command {
  return {
    label,
    apply(ont) {
      for (const c of commands) c.apply(ont);
    },
    revert(ont) {
      for (let i = commands.length - 1; i >= 0; i--) commands[i]!.revert(ont);
    },
  };
}

function nodeIndex(ont: Ontology, id: number): number {
  const i = ont.nodes.findIndex((n) => n.id === id);
  if (i < 0) throw new Error(`No node with ID ${id}`);
  return i;
}

function relationIndex(ont: Ontology, id: number): number {
  const i = ont.relations.findIndex((r) => r.id === id);
  if (i < 0) throw new Error(`No relation with ID ${id}`);
  return i;
}

export function setLastId(value: number): Command {
  let old = 0;
  return {
    label: 'Set last ID',
    apply(ont) {
      old = ont.lastId;
      ont.lastId = value;
    },
    revert(ont) {
      ont.lastId = old;
    },
  };
}

/** Inserts a node at the given index (appends by default). */
export function insertNode(node: OntNode, index?: number): Command {
  return {
    label: 'Add node',
    apply(ont) {
      ont.nodes.splice(index ?? ont.nodes.length, 0, node);
    },
    revert(ont) {
      ont.nodes.splice(nodeIndex(ont, node.id), 1);
    },
  };
}

/** Removes a node, but not its relations: remove them first (see OntDocument.deleteElements). */
export function removeNode(id: number): Command {
  let removed: OntNode | undefined;
  let index = 0;
  return {
    label: 'Delete node',
    apply(ont) {
      index = nodeIndex(ont, id);
      removed = ont.nodes.splice(index, 1)[0];
    },
    revert(ont) {
      ont.nodes.splice(index, 0, removed!);
    },
  };
}

export function insertRelation(relation: OntRelation, index?: number): Command {
  return {
    label: 'Add relation',
    apply(ont) {
      ont.relations.splice(index ?? ont.relations.length, 0, relation);
    },
    revert(ont) {
      ont.relations.splice(relationIndex(ont, relation.id), 1);
    },
  };
}

export function removeRelation(id: number): Command {
  let removed: OntRelation | undefined;
  let index = 0;
  return {
    label: 'Delete relation',
    apply(ont) {
      index = relationIndex(ont, id);
      removed = ont.relations.splice(index, 1)[0];
    },
    revert(ont) {
      ont.relations.splice(index, 0, removed!);
    },
  };
}

export function renameNode(id: number, name: string): Command {
  let old = '';
  return {
    label: 'Rename node',
    apply(ont) {
      const node = ont.nodes[nodeIndex(ont, id)]!;
      old = node.name;
      node.name = name;
    },
    revert(ont) {
      ont.nodes[nodeIndex(ont, id)]!.name = old;
    },
  };
}

export interface Position {
  x: number;
  y: number;
}

export function moveNodes(positions: ReadonlyMap<number, Position>): Command {
  const old = new Map<number, Position>();
  return {
    label: positions.size === 1 ? 'Move node' : 'Move nodes',
    apply(ont) {
      old.clear();
      for (const [id, p] of positions) {
        const node = ont.nodes[nodeIndex(ont, id)]!;
        old.set(id, { x: node.x, y: node.y });
        node.x = p.x;
        node.y = p.y;
      }
    },
    revert(ont) {
      for (const [id, p] of old) {
        const node = ont.nodes[nodeIndex(ont, id)]!;
        node.x = p.x;
        node.y = p.y;
      }
    },
  };
}

/** Sets an attribute of a node; `undefined` removes it. */
export function setAttribute(nodeId: number, key: string, value: AttributeValue | undefined): Command {
  let old: AttributeValue | undefined;
  return {
    label: value === undefined ? 'Delete attribute' : 'Set attribute',
    apply(ont) {
      const attrs = ont.nodes[nodeIndex(ont, nodeId)]!.attributes;
      old = attrs.get(key);
      if (value === undefined) attrs.delete(key);
      else attrs.set(key, value);
    },
    revert(ont) {
      const attrs = ont.nodes[nodeIndex(ont, nodeId)]!.attributes;
      if (old === undefined) attrs.delete(key);
      else attrs.set(key, old);
    },
  };
}

/** Renames an attribute key, keeping its position among the other attributes. */
export function renameAttribute(nodeId: number, oldKey: string, newKey: string): Command {
  const rekey = (ont: Ontology, from: string, to: string): void => {
    const node = ont.nodes[nodeIndex(ont, nodeId)]!;
    if (!node.attributes.has(from)) throw new Error(`No attribute "${from}"`);
    if (node.attributes.has(to)) throw new Error(`Attribute "${to}" already exists`);
    node.attributes = new Map([...node.attributes].map(([k, v]) => [k === from ? to : k, v]));
  };
  return {
    label: 'Rename attribute',
    apply(ont) {
      rekey(ont, oldKey, newKey);
    },
    revert(ont) {
      rekey(ont, newKey, oldKey);
    },
  };
}
