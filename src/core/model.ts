import type { JsonObject, JsonValue } from './json';

/** The namespace assigned to everything created by the editor. */
export const SCIVI_NAMESPACE = 'https://scivi.tools/';

/**
 * A typed attribute value. The types that occur in SciVi ontologies are string, integer,
 * float, and boolean. Anything else (null, arrays, objects) is kept as raw JSON, so that
 * it survives a load/save cycle unchanged.
 */
export type AttributeValue =
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'int'; readonly value: number }
  | { readonly type: 'float'; readonly value: number }
  | { readonly type: 'bool'; readonly value: boolean }
  | { readonly type: 'json'; readonly value: JsonValue };

export type AttributeType = AttributeValue['type'];

/** A term of the ontology. */
export interface OntNode {
  readonly id: number;
  name: string;
  namespace: string;
  /** Top-left corner of the node's box, in the browser coordinate system. */
  x: number;
  y: number;
  attributes: Map<string, AttributeValue>;
  /** Fields of the node that the editor does not handle, kept as they were. */
  readonly extra: JsonObject;
}

/** A relation between two terms. */
export interface OntRelation {
  readonly id: number;
  /** Normally one of RELATION_TYPES, but loaded files may contain anything. */
  name: string;
  namespace: string;
  sourceId: number;
  destinationId: number;
  /** Not used in SciVi; kept as is and never shown. */
  readonly attributes: JsonValue;
  readonly extra: JsonObject;
}

export interface Ontology {
  lastId: number;
  /** Not used in SciVi; kept as is and never shown. */
  readonly namespaces: JsonValue;
  /** Not used in SciVi; kept as is and never shown. */
  readonly visualizeOntPath: JsonValue;
  /** In file order; new nodes are appended. */
  nodes: OntNode[];
  /** In file order; new relations are appended. */
  relations: OntRelation[];
  readonly extra: JsonObject;
}

export function findNode(ont: Ontology, id: number): OntNode | undefined {
  return ont.nodes.find((n) => n.id === id);
}

export function findRelation(ont: Ontology, id: number): OntRelation | undefined {
  return ont.relations.find((r) => r.id === id);
}
