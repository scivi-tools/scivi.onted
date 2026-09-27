import type { Ontology } from './model';
import { isRelationType } from './relations';

export interface ValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  /** The ID of the node or relation the issue is about, if any. */
  readonly elementId?: number;
}

/** Finds problems in an ontology that the editor itself would never produce. */
export function validateOntology(ont: Ontology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set<number>();
  const seen = new Set<number>();
  let maxId = 0;

  for (const el of [...ont.nodes, ...ont.relations]) {
    if (seen.has(el.id)) issues.push({ severity: 'error', message: `Duplicate ID ${el.id}`, elementId: el.id });
    seen.add(el.id);
    maxId = Math.max(maxId, el.id);
  }
  for (const n of ont.nodes) {
    nodeIds.add(n.id);
    if (n.name === '') issues.push({ severity: 'warning', message: `Node ${n.id} has an empty name`, elementId: n.id });
  }
  for (const r of ont.relations) {
    if (r.name === '') {
      issues.push({ severity: 'error', message: `Relation ${r.id} has an empty name`, elementId: r.id });
    } else if (!isRelationType(r.name)) {
      issues.push({ severity: 'error', message: `Relation ${r.id} has an unknown type "${r.name}"`, elementId: r.id });
    }
    for (const end of [r.sourceId, r.destinationId]) {
      if (!nodeIds.has(end)) {
        issues.push({ severity: 'error', message: `Relation ${r.id} refers to a missing node ${end}`, elementId: r.id });
      }
    }
    if (r.sourceId === r.destinationId) {
      issues.push({ severity: 'warning', message: `Relation ${r.id} links a node to itself`, elementId: r.id });
    }
  }
  if (ont.lastId < maxId) {
    issues.push({ severity: 'warning', message: `"last_id" (${ont.lastId}) is less than the largest ID (${maxId})` });
  }
  return issues;
}
