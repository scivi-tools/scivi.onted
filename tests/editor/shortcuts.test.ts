import { describe, expect, it } from 'vitest';
import { commandForKey, type KeyStroke } from '../../src/editor/shortcuts';

const key = (code: string, mods: Partial<KeyStroke> = {}): KeyStroke => ({
  code,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('commandForKey', () => {
  it('maps Shift+digits to the relation types by physical key', () => {
    expect(commandForKey(key('Digit1', { shiftKey: true }))).toBe('edit.link.is_a');
    expect(commandForKey(key('Digit8', { shiftKey: true }))).toBe('edit.link.language');
    expect(commandForKey(key('Numpad2', { shiftKey: true }))).toBe('edit.link.a_part_of');
    expect(commandForKey(key('Digit9', { shiftKey: true }))).toBeNull();
    expect(commandForKey(key('Digit1'))).toBeNull();
  });

  it('maps the other shortcuts', () => {
    expect(commandForKey(key('KeyA', { shiftKey: true }))).toBe('edit.addNode');
    expect(commandForKey(key('KeyA'))).toBeNull();
    expect(commandForKey(key('Delete'))).toBe('edit.delete');
    expect(commandForKey(key('Backspace'))).toBe('edit.delete');
    expect(commandForKey(key('F2'))).toBe('edit.rename');
    expect(commandForKey(key('Escape'))).toBe('edit.selectNone');
  });

  it('leaves Cmd/Ctrl/Alt combinations to the platform', () => {
    expect(commandForKey(key('KeyA', { shiftKey: true, metaKey: true }))).toBeNull();
    expect(commandForKey(key('Delete', { ctrlKey: true }))).toBeNull();
    expect(commandForKey(key('Digit1', { shiftKey: true, altKey: true }))).toBeNull();
  });
});
