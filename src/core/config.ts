import { isRelationType, type RelationType } from './relations';

export interface EditorConfig {
  /** Names of the nodes treated specially by SciVi (case-sensitive); drawn in light yellow. */
  readonly systemNodeNames: readonly string[];
  /** Colour of each relation type's arrows, as a CSS colour. */
  readonly relationColors: Readonly<Record<RelationType, string>>;
}

export const DEFAULT_CONFIG: EditorConfig = {
  systemNodeNames: ['Input', 'Output', 'Setting'],
  relationColors: {
    is_a: '#0000FF',
    a_part_of: '#FEAE00',
    has: '#C80000',
    is_instance: '#FF00FF',
    is_used: '#B51700',
    is_hosted: '#56C1FF',
    base_type: '#B2B2B2',
    language: '#FF9400',
  },
};

/**
 * Builds the config from the contents of a config file (already parsed from JSON), falling back
 * to the defaults for anything missing or invalid. Problems are reported as warnings.
 */
export function resolveConfig(raw: unknown): { config: EditorConfig; warnings: string[] } {
  const warnings: string[] = [];
  if (raw === null || raw === undefined) return { config: DEFAULT_CONFIG, warnings };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: DEFAULT_CONFIG, warnings: ['The config must be a JSON object; using the defaults'] };
  }
  const obj = raw as Record<string, unknown>;

  let systemNodeNames = DEFAULT_CONFIG.systemNodeNames;
  if ('systemNodeNames' in obj) {
    const v = obj.systemNodeNames;
    if (Array.isArray(v) && v.every((s) => typeof s === 'string')) systemNodeNames = v as string[];
    else warnings.push('"systemNodeNames" must be an array of strings; using the defaults');
  }

  const relationColors: Record<RelationType, string> = { ...DEFAULT_CONFIG.relationColors };
  if ('relationColors' in obj) {
    const v = obj.relationColors;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      for (const [k, c] of Object.entries(v)) {
        if (!isRelationType(k)) warnings.push(`"relationColors": unknown relation type "${k}"`);
        else if (typeof c !== 'string') warnings.push(`"relationColors.${k}" must be a string`);
        else relationColors[k] = c;
      }
    } else {
      warnings.push('"relationColors" must be an object; using the defaults');
    }
  }

  for (const k of Object.keys(obj)) {
    if (k !== 'systemNodeNames' && k !== 'relationColors' && !k.startsWith('$')) {
      warnings.push(`Unknown config key "${k}"`);
    }
  }
  return { config: { systemNodeNames, relationColors }, warnings };
}

