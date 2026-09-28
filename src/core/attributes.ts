/** Helpers for typed attribute values: text input/output, defaults, and type conversion. */
import { parseJson, writeJson } from './json';
import type { AttributeType, AttributeValue } from './model';
import { attributeFromJson, attributeToJson } from './ont-format';

export const ATTRIBUTE_TYPES: readonly AttributeType[] = ['string', 'int', 'float', 'bool', 'json'];

/** The value as a user would type it. */
export function attributeToText(a: AttributeValue): string {
  return a.type === 'json' ? writeJson(a.value).trimEnd() : String(a.value);
}

/**
 * Parses user input as a value of the given type. Returns null if the text is not a valid value
 * of that type (e.g. "1.5" for an integer).
 */
export function attributeFromText(text: string, type: AttributeType): AttributeValue | null {
  const t = text.trim();
  switch (type) {
    case 'string':
      return { type, value: text };
    case 'int': {
      if (!/^[-+]?\d+$/.test(t)) return null;
      const n = Number(t);
      return Number.isSafeInteger(n) ? { type, value: n } : null;
    }
    case 'float': {
      if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
      const n = Number(t);
      return Number.isFinite(n) ? { type, value: n } : null;
    }
    case 'bool': {
      const l = t.toLowerCase();
      return l === 'true' ? { type, value: true } : l === 'false' ? { type, value: false } : null;
    }
    case 'json':
      try {
        return { type, value: parseJson(text) };
      } catch {
        return null;
      }
  }
}

/** The default value of each type, e.g. for a new attribute. */
export function defaultAttribute(type: AttributeType): AttributeValue {
  switch (type) {
    case 'string':
      return { type, value: '' };
    case 'int':
    case 'float':
      return { type, value: 0 };
    case 'bool':
      return { type, value: false };
    case 'json':
      return { type, value: null };
  }
}

/**
 * Converts a value to another type, keeping as much of it as possible:
 * "42" becomes 42, 1 becomes true, 2.7 becomes 2 (towards zero), true becomes 1, and so on.
 * Falls back to the default value of the target type if nothing sensible can be kept.
 */
export function convertAttribute(a: AttributeValue, type: AttributeType): AttributeValue {
  if (a.type === type) return a;
  // Raw JSON holding a plain scalar (e.g. `"12"` or `true`) converts like that scalar.
  if (a.type === 'json') {
    const typed = attributeFromJson(a.value);
    if (typed.type !== 'json') return convertAttribute(typed, type);
    return type === 'string' ? { type, value: attributeToText(a) } : defaultAttribute(type);
  }
  switch (type) {
    case 'string':
      return { type, value: attributeToText(a) };
    case 'json':
      return { type, value: attributeToJson(a) };
    case 'bool':
      if (a.type === 'int' || a.type === 'float') return { type, value: a.value !== 0 };
      return attributeFromText(attributeToText(a), type) ?? defaultAttribute(type);
    case 'int':
    case 'float': {
      let n: number;
      if (a.type === 'bool') n = a.value ? 1 : 0;
      else if (a.type === 'string') {
        const parsed = attributeFromText(a.value, 'float');
        if (!parsed) return defaultAttribute(type);
        n = parsed.value as number;
      } else n = a.value;
      if (type === 'int') n = Math.trunc(n);
      if (type === 'int' ? !Number.isSafeInteger(n) : !Number.isFinite(n)) return defaultAttribute(type);
      return { type, value: n };
    }
  }
}
