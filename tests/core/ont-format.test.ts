import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyOntology, parseOnt, serializeOnt } from '../../src/core/ont-format';

const samplesDir = join(__dirname, '../../docs/ont-samples');
const samples = readdirSync(samplesDir).filter((f) => f.endsWith('.ont'));

describe('ONT round trip', () => {
  it('has samples to test', () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it.each(samples)('%s is saved byte-identical', (file) => {
    const text = readFileSync(join(samplesDir, file), 'utf-8');
    expect(serializeOnt(parseOnt(text))).toBe(text);
  });
});

describe('parseOnt', () => {
  it('reads IDs as integers and attribute values with their types', () => {
    const ont = parseOnt(`{
      "last_id": "3",
      "nodes": [{"id": "1", "name": "A", "namespace": "x", "position_x": -5, "position_y": 7,
                 "attributes": {"s": "1", "i": 1, "f": 0.5, "b": true, "n": null}}],
      "relations": []
    }`);
    expect(ont.lastId).toBe(3);
    const node = ont.nodes[0]!;
    expect(node.id).toBe(1);
    expect([node.x, node.y]).toEqual([-5, 7]);
    expect(Object.fromEntries(node.attributes)).toEqual({
      s: { type: 'string', value: '1' },
      i: { type: 'int', value: 1 },
      f: { type: 'float', value: 0.5 },
      b: { type: 'bool', value: true },
      n: { type: 'json', value: null },
    });
  });

  it('keeps unknown fields', () => {
    const text = serializeOnt(parseOnt('{"extra": 1, "nodes": [{"id": "1", "name": "A", "foo": [1]}], "relations": []}'));
    expect(text).toContain('"extra": 1');
    expect(text).toContain('"foo": [');
  });

  it('rejects non-integer IDs', () => {
    expect(() => parseOnt('{"nodes": [{"id": "x1"}]}')).toThrow(/integer ID/);
  });
});

describe('createEmptyOntology', () => {
  it('uses only the SciVi namespace', () => {
    const text = serializeOnt(createEmptyOntology());
    expect(text).toContain('"default": "https://scivi.tools/"');
    expect(text).not.toContain('knova');
    expect(parseOnt(text).lastId).toBe(0);
  });
});
