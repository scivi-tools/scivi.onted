import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig, DEFAULT_CONFIG } from '../../src/core/config';
import { parseOnt } from '../../src/core/ont-format';
import { validateOntology } from '../../src/core/validation';

describe('validateOntology', () => {
  it('flags the relation with an empty name in the samples', () => {
    const dir = join(__dirname, '../../docs/ont-samples');
    const empty = readdirSync(dir)
      .filter((f) => f.endsWith('.ont'))
      .flatMap((f) => validateOntology(parseOnt(readFileSync(join(dir, f), 'utf-8'))))
      .filter((i) => i.message.includes('empty name'));
    expect(empty).toHaveLength(1);
  });

  it('flags unknown types, dangling ends, duplicates, and a small last_id', () => {
    const ont = parseOnt(`{"last_id": "2", "nodes": [{"id": "1", "name": "A"}, {"id": "1", "name": "B"}],
      "relations": [{"id": "3", "name": "likes", "source_node_id": "1", "destination_node_id": "9"}]}`);
    const messages = validateOntology(ont).map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'Duplicate ID 1',
        'Relation 3 has an unknown type "likes"',
        'Relation 3 refers to a missing node 9',
        '"last_id" (2) is less than the largest ID (3)',
      ]),
    );
  });
});

describe('resolveConfig', () => {
  it('uses the defaults for a missing config', () => {
    expect(resolveConfig(null)).toEqual({ config: DEFAULT_CONFIG, warnings: [] });
  });

  it('overrides known keys and reports problems', () => {
    const { config, warnings } = resolveConfig({
      systemNodeNames: ['Input'],
      relationColors: { is_a: 'red', likes: 'blue' },
      oops: 1,
    });
    expect(config.systemNodeNames).toEqual(['Input']);
    expect(config.relationColors.is_a).toBe('red');
    expect(config.relationColors.has).toBe(DEFAULT_CONFIG.relationColors.has);
    expect(warnings).toHaveLength(2);
  });
});
