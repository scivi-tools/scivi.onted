import { describe, expect, it } from 'vitest';
import { attributeFromText, attributeToText, convertAttribute, defaultAttribute } from '../../src/core/attributes';
import { JsonNumber } from '../../src/core/json';
import type { AttributeValue } from '../../src/core/model';

describe('attributeFromText', () => {
  it('parses each type strictly', () => {
    expect(attributeFromText(' 42 ', 'int')).toEqual({ type: 'int', value: 42 });
    expect(attributeFromText('4.2', 'int')).toBeNull();
    expect(attributeFromText('4.2', 'float')).toEqual({ type: 'float', value: 4.2 });
    expect(attributeFromText('1e3', 'float')).toEqual({ type: 'float', value: 1000 });
    expect(attributeFromText('abc', 'float')).toBeNull();
    expect(attributeFromText('TRUE', 'bool')).toEqual({ type: 'bool', value: true });
    expect(attributeFromText('yes', 'bool')).toBeNull();
    expect(attributeFromText(' a ', 'string')).toEqual({ type: 'string', value: ' a ' });
    expect(attributeFromText('[1', 'json')).toBeNull();
  });

  it('round-trips through text', () => {
    const values: AttributeValue[] = [
      { type: 'string', value: 'x' },
      { type: 'int', value: -3 },
      { type: 'float', value: 0.65 },
      { type: 'bool', value: false },
    ];
    for (const v of values) expect(attributeFromText(attributeToText(v), v.type)).toEqual(v);
  });
});

describe('convertAttribute', () => {
  it('keeps what can be kept', () => {
    expect(convertAttribute({ type: 'string', value: '42' }, 'int')).toEqual({ type: 'int', value: 42 });
    expect(convertAttribute({ type: 'string', value: '2.7' }, 'int')).toEqual({ type: 'int', value: 2 });
    expect(convertAttribute({ type: 'float', value: -2.7 }, 'int')).toEqual({ type: 'int', value: -2 });
    expect(convertAttribute({ type: 'int', value: 5 }, 'float')).toEqual({ type: 'float', value: 5 });
    expect(convertAttribute({ type: 'int', value: 0 }, 'bool')).toEqual({ type: 'bool', value: false });
    expect(convertAttribute({ type: 'bool', value: true }, 'int')).toEqual({ type: 'int', value: 1 });
    expect(convertAttribute({ type: 'bool', value: true }, 'string')).toEqual({ type: 'string', value: 'true' });
    expect(convertAttribute({ type: 'string', value: 'false' }, 'bool')).toEqual({ type: 'bool', value: false });
    expect(convertAttribute({ type: 'int', value: 7 }, 'json')).toEqual({ type: 'json', value: new JsonNumber('7') });
    expect(convertAttribute({ type: 'json', value: 'abc' }, 'string')).toEqual({ type: 'string', value: 'abc' });
  });

  it('falls back to the default of the target type', () => {
    expect(convertAttribute({ type: 'string', value: 'abc' }, 'int')).toEqual(defaultAttribute('int'));
    expect(convertAttribute({ type: 'string', value: 'abc' }, 'bool')).toEqual(defaultAttribute('bool'));
    expect(convertAttribute({ type: 'json', value: [] }, 'int')).toEqual(defaultAttribute('int'));
  });
});

describe('attributeToText', () => {
  it('writes JSON values on one line', () => {
    const v = attributeFromText('{"b": [1, {"c": null}], "a": {}}', 'json')!;
    expect(attributeToText(v)).toBe('{"a": {}, "b": [1, {"c": null}]}');
  });
});
