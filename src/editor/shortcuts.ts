/**
 * Single-key shortcuts of the editor, bound to physical key positions (`KeyboardEvent.code`),
 * so they work with any keyboard layout (e.g. Shift+1 is not affected by the layout producing "!").
 *
 * Shortcuts with Cmd/Ctrl (Undo, Save, ...) are not here: they belong to the platform
 * (the native main menu in Electron), which forwards them as commands.
 */
import { RELATION_TYPES } from '../core';

export interface KeyStroke {
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** The command bound to a key stroke, or null. */
export function commandForKey(e: KeyStroke): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.shiftKey) {
    if (e.code === 'KeyA') return 'edit.addNode';
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) {
      const type = RELATION_TYPES[Number(digit[1]) - 1];
      return type ? `edit.link.${type}` : null;
    }
    return null;
  }
  switch (e.code) {
    case 'Delete':
    case 'Backspace':
      return 'edit.delete';
    case 'F2':
      return 'edit.rename';
    case 'Enter':
    case 'NumpadEnter':
      return 'edit.attributes';
    case 'Escape':
      return 'edit.selectNone';
    default:
      return null;
  }
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

/** Human-readable shortcut of a command, for menus. */
export function shortcutHint(commandId: string): string | undefined {
  const shift = isMac ? '⇧' : 'Shift+';
  if (commandId === 'edit.addNode' || commandId === 'edit.addNodeHere') return `${shift}A`;
  if (commandId.startsWith('edit.link.')) {
    const i = (RELATION_TYPES as readonly string[]).indexOf(commandId.slice('edit.link.'.length));
    return i >= 0 ? `${shift}${i + 1}` : undefined;
  }
  switch (commandId) {
    case 'edit.delete':
      return isMac ? '⌫' : 'Delete';
    case 'edit.rename':
      return 'F2';
    case 'edit.attributes':
      return isMac ? '↩' : 'Enter';
    case 'edit.undo':
      return isMac ? '⌘Z' : 'Ctrl+Z';
    case 'edit.redo':
      return isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z';
    case 'edit.selectAll':
      return isMac ? '⌘A' : 'Ctrl+A';
    case 'view.fit':
      return isMac ? '⌘0' : 'Ctrl+0';
    default:
      return undefined;
  }
}

/** True if keyboard input currently goes to a text field (where the editor's shortcuts must not fire). */
export function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit'].includes(el.type);
  if (el instanceof HTMLSelectElement) return true;
  return (el as HTMLElement).isContentEditable === true;
}
