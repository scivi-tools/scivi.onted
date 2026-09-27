/** The relation types supported by SciVi (see "Ontology Representation" in docs/PLANNING.md). */
export const RELATION_TYPES = [
  'is_a',
  'a_part_of',
  'has',
  'is_instance',
  'is_used',
  'is_hosted',
  'base_type',
  'language',
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export function isRelationType(name: string): name is RelationType {
  return (RELATION_TYPES as readonly string[]).includes(name);
}
