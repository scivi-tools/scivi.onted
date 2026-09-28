/**
 * A minimal JSON reader/writer tailored to the `ONT` files.
 *
 * Why not `JSON.parse` / `JSON.stringify`:
 * - `JSON.parse` loses the distinction between `1` and `1.0`, which we need to keep
 *   the types of attribute values (integer vs. float);
 * - `JSON.stringify` cannot reproduce the formatting of Qt's `QJsonDocument::Indented`,
 *   which all the existing `ONT` files use (see "File Formatting" in docs/PLANNING.md);
 * - objects are parsed into `Map`s, so arbitrary keys (even `__proto__`) are safe.
 */

/** A JSON number that remembers its textual representation. */
export class JsonNumber {
  constructor(readonly raw: string) {}

  get value(): number {
    return Number(this.raw);
  }

  /** True if the literal has no fraction and no exponent part. */
  get isIntegerLiteral(): boolean {
    return /^-?\d+$/.test(this.raw);
  }

  static fromInt(n: number): JsonNumber {
    if (!Number.isSafeInteger(n)) throw new RangeError(`Not a safe integer: ${n}`);
    return new JsonNumber(String(n));
  }

  /** Floats are always written with a fraction or an exponent, so they are read back as floats. */
  static fromFloat(n: number): JsonNumber {
    if (!Number.isFinite(n)) throw new RangeError(`Not a finite number: ${n}`);
    const s = String(n);
    return new JsonNumber(/^-?\d+$/.test(s) ? `${s}.0` : s);
  }
}

export type JsonObject = Map<string, JsonValue>;
export type JsonArray = JsonValue[];
export type JsonValue = null | boolean | string | JsonNumber | JsonArray | JsonObject;

export class JsonParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'JsonParseError';
  }
}

export function parseJson(text: string): JsonValue {
  let pos = 0;

  const fail = (message: string, at = pos): never => {
    let line = 1;
    let col = 1;
    for (let i = 0; i < at && i < text.length; i++) {
      if (text[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    throw new JsonParseError(message, line, col);
  };

  const skipWs = (): void => {
    while (pos < text.length) {
      const c = text.charCodeAt(pos);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) pos++;
      else break;
    }
  };

  const expectLiteral = (lit: string): void => {
    if (text.startsWith(lit, pos)) pos += lit.length;
    else fail(`Unexpected token, expected "${lit}"`);
  };

  const parseString = (): string => {
    // text[pos] === '"'
    pos++;
    let out = '';
    let chunkStart = pos;
    for (;;) {
      if (pos >= text.length) fail('Unterminated string');
      const c = text.charCodeAt(pos);
      if (c === 0x22) {
        out += text.slice(chunkStart, pos);
        pos++;
        return out;
      }
      if (c < 0x20) fail('Control character in string');
      if (c === 0x5c) {
        out += text.slice(chunkStart, pos);
        const e = text[pos + 1];
        switch (e) {
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '/': out += '/'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': {
            const hex = text.slice(pos + 2, pos + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\u escape');
            out += String.fromCharCode(parseInt(hex, 16));
            pos += 4;
            break;
          }
          default:
            fail('Invalid escape sequence');
        }
        pos += 2;
        chunkStart = pos;
        continue;
      }
      pos++;
    }
  };

  const numberRe = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

  const parseValue = (): JsonValue => {
    skipWs();
    const c = text[pos];
    switch (c) {
      case '{': {
        pos++;
        const obj: JsonObject = new Map();
        skipWs();
        if (text[pos] === '}') {
          pos++;
          return obj;
        }
        for (;;) {
          skipWs();
          if (text[pos] !== '"') fail('Expected a string key');
          const key = parseString();
          skipWs();
          if (text[pos] !== ':') fail('Expected ":"');
          pos++;
          if (obj.has(key)) fail(`Duplicate key "${key}"`);
          obj.set(key, parseValue());
          skipWs();
          if (text[pos] === ',') {
            pos++;
            continue;
          }
          if (text[pos] === '}') {
            pos++;
            return obj;
          }
          fail('Expected "," or "}"');
        }
      }
      case '[': {
        pos++;
        const arr: JsonArray = [];
        skipWs();
        if (text[pos] === ']') {
          pos++;
          return arr;
        }
        for (;;) {
          arr.push(parseValue());
          skipWs();
          if (text[pos] === ',') {
            pos++;
            continue;
          }
          if (text[pos] === ']') {
            pos++;
            return arr;
          }
          fail('Expected "," or "]"');
        }
      }
      case '"':
        return parseString();
      case 't':
        expectLiteral('true');
        return true;
      case 'f':
        expectLiteral('false');
        return false;
      case 'n':
        expectLiteral('null');
        return null;
      default: {
        numberRe.lastIndex = pos;
        const m = numberRe.exec(text);
        if (!m) return fail(c === undefined ? 'Unexpected end of input' : `Unexpected character "${c}"`);
        pos += m[0].length;
        return new JsonNumber(m[0]);
      }
    }
  };

  // Tolerate a UTF-8 BOM.
  if (text.charCodeAt(0) === 0xfeff) pos = 1;
  const value = parseValue();
  skipWs();
  if (pos < text.length) fail('Unexpected data after the JSON value');
  return value;
}

/** Escapes a string the same way Qt 5's JSON writer does. Non-ASCII characters are written as is. */
function quote(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const c = ch.charCodeAt(0);
    switch (ch) {
      case '"': out += '\\"'; break;
      case '\\': out += '\\\\'; break;
      case '\b': out += '\\b'; break;
      case '\f': out += '\\f'; break;
      case '\n': out += '\\n'; break;
      case '\r': out += '\\r'; break;
      case '\t': out += '\\t'; break;
      default:
        out += c < 0x20 ? `\\u${c.toString(16).padStart(4, '0')}` : ch;
    }
  }
  return out + '"';
}

/** Keys are sorted by UTF-16 code units, as Qt does. */
function sortedKeys(obj: JsonObject): string[] {
  return [...obj.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Serialises a value in the format of Qt's `QJsonDocument::toJson(QJsonDocument::Indented)`:
 * 4-space indentation, sorted keys, `"key": value`, empty containers written as
 * an opening bracket, a newline, and the closing bracket at the current indentation.
 * The top-level result ends with a newline.
 */
export function writeJson(value: JsonValue): string {
  const parts: string[] = [];
  const pad = (level: number): string => '    '.repeat(level);

  const writeValue = (v: JsonValue, level: number): void => {
    if (v === null) parts.push('null');
    else if (v === true) parts.push('true');
    else if (v === false) parts.push('false');
    else if (typeof v === 'string') parts.push(quote(v));
    else if (v instanceof JsonNumber) parts.push(v.raw);
    else if (Array.isArray(v)) {
      parts.push('[\n');
      v.forEach((item, i) => {
        parts.push(pad(level + 1));
        writeValue(item, level + 1);
        parts.push(i < v.length - 1 ? ',\n' : '\n');
      });
      parts.push(pad(level), ']');
    } else {
      parts.push('{\n');
      const keys = sortedKeys(v);
      keys.forEach((key, i) => {
        parts.push(pad(level + 1), quote(key), ': ');
        writeValue(v.get(key)!, level + 1);
        parts.push(i < keys.length - 1 ? ',\n' : '\n');
      });
      parts.push(pad(level), '}');
    }
  };

  writeValue(value, 0);
  parts.push('\n');
  return parts.join('');
}

/**
 * Serialises a value on a single line, e.g. `{"a": 1, "b": [true, null]}` (keys sorted, as in
 * the files), for showing and editing JSON values in one-line text fields.
 */
export function writeJsonInline(value: JsonValue): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return quote(value);
  if (value instanceof JsonNumber) return value.raw;
  if (Array.isArray(value)) return `[${value.map(writeJsonInline).join(', ')}]`;
  return `{${sortedKeys(value)
    .map((k) => `${quote(k)}: ${writeJsonInline(value.get(k)!)}`)
    .join(', ')}}`;
}
