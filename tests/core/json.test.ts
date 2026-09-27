import { describe, expect, it } from 'vitest';
import { JsonNumber, JsonParseError, parseJson, writeJson, type JsonValue } from '../../src/core/json';

const obj = (entries: [string, JsonValue][]): Map<string, JsonValue> => new Map(entries);

describe('parseJson', () => {
  it('keeps the textual form of numbers', () => {
    const v = parseJson('[1, 1.0, -0.65, 2e3]') as JsonNumber[];
    expect(v.map((n) => n.raw)).toEqual(['1', '1.0', '-0.65', '2e3']);
    expect(v.map((n) => n.isIntegerLiteral)).toEqual([true, false, false, false]);
  });

  it('parses objects into Maps, allowing any key', () => {
    const v = parseJson('{"__proto__": 1, "b": {"c": [true, false, null]}}') as Map<string, JsonValue>;
    expect([...v.keys()]).toEqual(['__proto__', 'b']);
    expect((v.get('b') as Map<string, JsonValue>).get('c')).toEqual([true, false, null]);
  });

  it('decodes escapes', () => {
    expect(parseJson('"a\\"b\\\\c\\/d\\n\\u00e9\\ud83d\\ude00"')).toBe('a"b\\c/d\né😀');
  });

  it('reports the position of errors', () => {
    expect(() => parseJson('{\n  "a": 1,\n  "b": }')).toThrow(JsonParseError);
    try {
      parseJson('{\n  "a": 1,\n  "b": }');
    } catch (e) {
      expect((e as JsonParseError).line).toBe(3);
      expect((e as JsonParseError).column).toBe(8);
    }
  });

  it('rejects trailing data and duplicate keys', () => {
    expect(() => parseJson('{} x')).toThrow(JsonParseError);
    expect(() => parseJson('{"a": 1, "a": 2}')).toThrow(/Duplicate key/);
  });
});

describe('writeJson', () => {
  it('writes in the Qt indented style with sorted keys', () => {
    const v = obj([
      ['b', [JsonNumber.fromInt(1), 'x']],
      ['a', obj([])],
      ['c', []],
    ]);
    expect(writeJson(v)).toBe(
      ['{', '    "a": {', '    },', '    "b": [', '        1,', '        "x"', '    ],', '    "c": [', '    ]', '}', ''].join('\n'),
    );
  });

  it('escapes strings like Qt and keeps non-ASCII characters', () => {
    expect(writeJson('"\\\n\t\u0001é')).toBe('"\\"\\\\\\n\\t\\u0001é"\n');
  });

  it('writes floats so that they are read back as floats', () => {
    expect(JsonNumber.fromFloat(2).raw).toBe('2.0');
    expect(JsonNumber.fromFloat(0.65).raw).toBe('0.65');
    expect(JsonNumber.fromFloat(1e21).raw).toBe('1e+21');
  });
});
