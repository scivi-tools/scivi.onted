/**
 * An ontology being edited: the model, its undo/redo history, and the high-level editing
 * operations used by the UI. The UI never mutates the model directly; it calls these
 * operations and listens to the "changed" event.
 */
import {
  compound,
  insertNode,
  insertRelation,
  moveNodes,
  removeNode,
  removeRelation,
  renameAttribute,
  renameNode,
  setAttribute,
  setLastId,
  setRelationName,
  type Command,
  type Position,
} from './commands';
import { Emitter } from './events';
import { History } from './history';
import { SCIVI_NAMESPACE, findNode, findRelation, type AttributeValue, type Ontology } from './model';
import { createEmptyOntology, parseOnt, serializeOnt } from './ont-format';
import type { RelationType } from './relations';

export type ChangeReason = 'edit' | 'undo' | 'redo' | 'saved';

export interface DocumentEvents extends Record<string, unknown> {
  /** The model or the modified state changed. */
  changed: { reason: ChangeReason; command?: Command };
}

export class OntDocument {
  readonly events = new Emitter<DocumentEvents>();
  private readonly history = new History();

  private constructor(readonly ontology: Ontology) {}

  static createEmpty(): OntDocument {
    return new OntDocument(createEmptyOntology());
  }

  /** @throws JsonParseError or OntFormatError if the text is not a valid `ONT` file. */
  static fromText(text: string): OntDocument {
    return new OntDocument(parseOnt(text));
  }

  toText(): string {
    return serializeOnt(this.ontology);
  }

  // --- history -----------------------------------------------------------------------------

  get isModified(): boolean {
    return this.history.isModified;
  }

  get canUndo(): boolean {
    return this.history.nextUndo !== undefined;
  }

  get canRedo(): boolean {
    return this.history.nextRedo !== undefined;
  }

  get undoLabel(): string | undefined {
    return this.history.nextUndo?.label;
  }

  get redoLabel(): string | undefined {
    return this.history.nextRedo?.label;
  }

  undo(): void {
    const command = this.history.undo(this.ontology);
    if (command) this.events.emit('changed', { reason: 'undo', command });
  }

  redo(): void {
    const command = this.history.redo(this.ontology);
    if (command) this.events.emit('changed', { reason: 'redo', command });
  }

  markSaved(): void {
    this.history.markSaved();
    this.events.emit('changed', { reason: 'saved' });
  }

  execute(command: Command): void {
    this.history.execute(this.ontology, command);
    this.events.emit('changed', { reason: 'edit', command });
  }

  // --- IDs ---------------------------------------------------------------------------------

  /**
   * The ID a new element gets: `last_id + 1`. If a broken file has IDs above `last_id`,
   * the maximum existing ID is used instead, so that IDs stay unique.
   */
  private nextId(after = this.ontology.lastId): number {
    let max = after;
    for (const n of this.ontology.nodes) max = Math.max(max, n.id);
    for (const r of this.ontology.relations) max = Math.max(max, r.id);
    return max + 1;
  }

  // --- editing operations ------------------------------------------------------------------

  /** Adds a node with its box's top-left corner at (x, y). Returns the new node's ID. */
  addNode(name: string, x: number, y: number): number {
    const id = this.nextId();
    this.execute(
      compound('Add node', [
        insertNode({
          id,
          name,
          namespace: SCIVI_NAMESPACE,
          x: Math.round(x),
          y: Math.round(y),
          attributes: new Map(),
          extra: new Map(),
        }),
        setLastId(id),
      ]),
    );
    return id;
  }

  /**
   * Links each of `sourceIds` to `destinationId` with a relation of the given type.
   * Self-links and exact duplicates (same source, destination, and type) are skipped.
   * Returns the IDs of the created relations.
   */
  link(sourceIds: readonly number[], destinationId: number, type: RelationType): number[] {
    const ont = this.ontology;
    const commands: Command[] = [];
    const created: number[] = [];
    let id = ont.lastId;
    for (const sourceId of new Set(sourceIds)) {
      if (sourceId === destinationId) continue;
      if (!findNode(ont, sourceId) || !findNode(ont, destinationId)) throw new Error('Linking unknown nodes');
      const exists = ont.relations.some(
        (r) => r.sourceId === sourceId && r.destinationId === destinationId && r.name === type,
      );
      if (exists) continue;
      id = this.nextId(id);
      created.push(id);
      commands.push(
        insertRelation({
          id,
          name: type,
          namespace: SCIVI_NAMESPACE,
          sourceId,
          destinationId,
          attributes: new Map(),
          extra: new Map(),
        }),
      );
    }
    if (commands.length > 0) {
      commands.push(setLastId(id));
      this.execute(compound(commands.length > 2 ? 'Add relations' : 'Add relation', commands));
    }
    return created;
  }

  /**
   * Deletes the given nodes (together with all their relations) and relations, as one undoable step.
   * `last_id` follows the rule from docs/PLANNING.md: deleting the element whose ID equals `last_id`
   * decrements it; deleting any other element leaves a gap. Elements are processed in the descending
   * order of IDs, so deleting the last few elements releases all their IDs.
   */
  deleteElements(nodeIds: readonly number[], relationIds: readonly number[] = []): void {
    const ont = this.ontology;
    const nodes = new Set(nodeIds.filter((id) => findNode(ont, id)));
    const relations = new Set(relationIds.filter((id) => ont.relations.some((r) => r.id === id)));
    for (const r of ont.relations) {
      if (nodes.has(r.sourceId) || nodes.has(r.destinationId)) relations.add(r.id);
    }
    if (nodes.size === 0 && relations.size === 0) return;

    const commands: Command[] = [...relations].map(removeRelation);
    commands.push(...[...nodes].map(removeNode));

    let lastId = ont.lastId;
    const ids = [...nodes, ...relations].sort((a, b) => b - a);
    for (const id of ids) if (id === lastId) lastId--;
    if (lastId !== ont.lastId) commands.push(setLastId(lastId));

    const label = nodes.size === 0 ? (relations.size === 1 ? 'Delete relation' : 'Delete relations')
      : nodes.size === 1 ? 'Delete node' : 'Delete nodes';
    this.execute(compound(label, commands));
  }

  renameNode(id: number, name: string): void {
    const node = findNode(this.ontology, id);
    if (!node) throw new Error(`No node with ID ${id}`);
    if (name === '') throw new Error('The name of a node cannot be empty');
    if (node.name !== name) this.execute(renameNode(id, name));
  }

  moveNodes(positions: ReadonlyMap<number, Position>): void {
    const rounded = new Map<number, Position>();
    for (const [id, p] of positions) {
      const node = findNode(this.ontology, id);
      if (!node) throw new Error(`No node with ID ${id}`);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (node.x !== x || node.y !== y) rounded.set(id, { x, y });
    }
    if (rounded.size > 0) this.execute(moveNodes(rounded));
  }

  /** Changes the type of the given relations (e.g. to fix a relation with an invalid type). */
  setRelationType(relationIds: readonly number[], type: RelationType): void {
    const commands = relationIds
      .filter((id) => {
        const r = findRelation(this.ontology, id);
        if (!r) throw new Error(`No relation with ID ${id}`);
        return r.name !== type;
      })
      .map((id) => setRelationName(id, type));
    if (commands.length > 0) {
      this.execute(compound(commands.length === 1 ? 'Change relation type' : 'Change relation types', commands));
    }
  }

  setAttribute(nodeId: number, key: string, value: AttributeValue): void {
    if (key === '') throw new Error('The attribute name cannot be empty');
    if ((value.type === 'int' && !Number.isSafeInteger(value.value)) || (value.type === 'float' && !Number.isFinite(value.value))) {
      throw new Error(`Invalid ${value.type} value: ${value.value}`);
    }
    const old = findNode(this.ontology, nodeId)?.attributes.get(key);
    if (old && old.type === value.type && old.type !== 'json' && old.value === value.value) return;
    this.execute(setAttribute(nodeId, key, value));
  }

  deleteAttribute(nodeId: number, key: string): void {
    if (findNode(this.ontology, nodeId)?.attributes.has(key)) this.execute(setAttribute(nodeId, key, undefined));
  }

  renameAttribute(nodeId: number, oldKey: string, newKey: string): void {
    if (newKey === '') throw new Error('The attribute name cannot be empty');
    if (oldKey !== newKey && findNode(this.ontology, nodeId)?.attributes.has(newKey)) {
      throw new Error(`The attribute "${newKey}" already exists`);
    }
    if (oldKey !== newKey) this.execute(renameAttribute(nodeId, oldKey, newKey));
  }
}
