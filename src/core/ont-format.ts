/**
 * Reading and writing of the `ONT` format (see "Ontology Representation" and
 * "File Formatting" in docs/PLANNING.md).
 */
import { JsonNumber, parseJson, writeJson, type JsonObject, type JsonValue } from './json';
import { SCIVI_NAMESPACE, type AttributeValue, type OntNode, type OntRelation, type Ontology } from './model';

export class OntFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OntFormatError';
  }
}

const NODE_KEYS = ['attributes', 'id', 'name', 'namespace', 'position_x', 'position_y'];
const RELATION_KEYS = ['attributes', 'destination_node_id', 'id', 'name', 'namespace', 'source_node_id'];
const TOP_KEYS = ['last_id', 'namespaces', 'nodes', 'relations', 'visualize_ont_path'];

function isObject(v: JsonValue | undefined): v is JsonObject {
  return v instanceof Map;
}

function pickExtra(obj: JsonObject, known: string[]): JsonObject {
  const extra: JsonObject = new Map();
  for (const [k, v] of obj) if (!known.includes(k)) extra.set(k, v);
  return extra;
}

function describe(v: JsonValue | undefined): string {
  if (v === undefined) return 'nothing';
  if (v === null) return 'null';
  if (v instanceof JsonNumber) return v.raw;
  if (Array.isArray(v)) return 'an array';
  if (v instanceof Map) return 'an object';
  return JSON.stringify(v);
}

/** IDs are stored as strings that are guaranteed to be integers; plain numbers are tolerated too. */
function readId(v: JsonValue | undefined, what: string): number {
  const s = typeof v === 'string' ? v.trim() : v instanceof JsonNumber ? v.raw : undefined;
  if (s === undefined || !/^-?\d+$/.test(s)) {
    throw new OntFormatError(`${what}: expected an integer ID, got ${describe(v)}`);
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n)) throw new OntFormatError(`${what}: ID out of range: ${s}`);
  return n;
}

function readString(v: JsonValue | undefined, what: string, fallback: string): string {
  if (typeof v === 'string') return v;
  if (v === undefined) return fallback;
  throw new OntFormatError(`${what}: expected a string, got ${describe(v)}`);
}

function readCoord(v: JsonValue | undefined, what: string): number {
  if (v === undefined) return 0;
  if (v instanceof JsonNumber) return v.value;
  throw new OntFormatError(`${what}: expected a number, got ${describe(v)}`);
}

export function attributeFromJson(v: JsonValue): AttributeValue {
  if (typeof v === 'string') return { type: 'string', value: v };
  if (typeof v === 'boolean') return { type: 'bool', value: v };
  if (v instanceof JsonNumber) {
    if (v.isIntegerLiteral) {
      // Integers beyond the safe range are kept as raw JSON, so they are not corrupted.
      return Number.isSafeInteger(v.value) ? { type: 'int', value: v.value } : { type: 'json', value: v };
    }
    // Keep a float as raw JSON if its textual form would not survive a round trip (e.g. "1.50").
    const f = JsonNumber.fromFloat(v.value);
    return f.raw === v.raw ? { type: 'float', value: v.value } : { type: 'json', value: v };
  }
  return { type: 'json', value: v };
}

export function attributeToJson(a: AttributeValue): JsonValue {
  switch (a.type) {
    case 'string':
    case 'bool':
    case 'json':
      return a.value;
    case 'int':
      return JsonNumber.fromInt(a.value);
    case 'float':
      return JsonNumber.fromFloat(a.value);
  }
}

function coordToJson(n: number): JsonNumber {
  return Number.isInteger(n) ? JsonNumber.fromInt(n) : JsonNumber.fromFloat(n);
}

export function parseOnt(text: string): Ontology {
  const root = parseJson(text);
  if (!isObject(root)) throw new OntFormatError('The file is not a JSON object');

  const nodesJson = root.get('nodes') ?? [];
  const relationsJson = root.get('relations') ?? [];
  if (!Array.isArray(nodesJson)) throw new OntFormatError('"nodes" must be an array');
  if (!Array.isArray(relationsJson)) throw new OntFormatError('"relations" must be an array');

  const nodes = nodesJson.map((n, i): OntNode => {
    const what = `Node #${i + 1}`;
    if (!isObject(n)) throw new OntFormatError(`${what}: expected an object`);
    const attrsJson = n.get('attributes') ?? new Map();
    if (!isObject(attrsJson)) throw new OntFormatError(`${what}: "attributes" must be an object`);
    const attributes = new Map<string, AttributeValue>();
    for (const [k, v] of attrsJson) attributes.set(k, attributeFromJson(v));
    return {
      id: readId(n.get('id'), what),
      name: readString(n.get('name'), what, ''),
      namespace: readString(n.get('namespace'), what, SCIVI_NAMESPACE),
      x: readCoord(n.get('position_x'), what),
      y: readCoord(n.get('position_y'), what),
      attributes,
      extra: pickExtra(n, NODE_KEYS),
    };
  });

  const relations = relationsJson.map((r, i): OntRelation => {
    const what = `Relation #${i + 1}`;
    if (!isObject(r)) throw new OntFormatError(`${what}: expected an object`);
    return {
      id: readId(r.get('id'), what),
      name: readString(r.get('name'), what, ''),
      namespace: readString(r.get('namespace'), what, SCIVI_NAMESPACE),
      sourceId: readId(r.get('source_node_id'), `${what}, source`),
      destinationId: readId(r.get('destination_node_id'), `${what}, destination`),
      attributes: r.get('attributes') ?? new Map(),
      extra: pickExtra(r, RELATION_KEYS),
    };
  });

  const lastIdJson = root.get('last_id');
  return {
    lastId: lastIdJson === undefined ? 0 : readId(lastIdJson, '"last_id"'),
    namespaces: root.get('namespaces') ?? defaultNamespaces(),
    visualizeOntPath: root.get('visualize_ont_path') ?? '',
    nodes,
    relations,
    extra: pickExtra(root, TOP_KEYS),
  };
}

export function serializeOnt(ont: Ontology): string {
  const root: JsonObject = new Map(ont.extra);
  root.set('last_id', String(ont.lastId));
  root.set('namespaces', ont.namespaces);
  root.set(
    'nodes',
    ont.nodes.map((n) => {
      const attrs: JsonObject = new Map();
      for (const [k, v] of n.attributes) attrs.set(k, attributeToJson(v));
      const o: JsonObject = new Map(n.extra);
      o.set('attributes', attrs);
      o.set('id', String(n.id));
      o.set('name', n.name);
      o.set('namespace', n.namespace);
      o.set('position_x', coordToJson(n.x));
      o.set('position_y', coordToJson(n.y));
      return o;
    }),
  );
  root.set(
    'relations',
    ont.relations.map((r) => {
      const o: JsonObject = new Map(r.extra);
      o.set('attributes', r.attributes);
      o.set('destination_node_id', String(r.destinationId));
      o.set('id', String(r.id));
      o.set('name', r.name);
      o.set('namespace', r.namespace);
      o.set('source_node_id', String(r.sourceId));
      return o;
    }),
  );
  root.set('visualize_ont_path', ont.visualizeOntPath);
  return writeJson(root);
}

function defaultNamespaces(): JsonObject {
  return new Map<string, JsonValue>([
    ['default', SCIVI_NAMESPACE],
    ['owl', 'http://www.w3.org/2002/07/owl'],
    ['rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns'],
    ['rdfs', 'http://www.w3.org/2000/01/rdf-schema'],
    ['xsd', 'http://www.w3.org/2001/XMLSchema'],
  ]);
}

/** A new, empty ontology, as created by "File > New". */
export function createEmptyOntology(): Ontology {
  return {
    lastId: 0,
    namespaces: defaultNamespaces(),
    visualizeOntPath: '',
    nodes: [],
    relations: [],
    extra: new Map(),
  };
}
