/** The structure of the context menus, in terms of command IDs. */
import { RELATION_TYPES } from '../core';

export type MenuEntry =
  | { readonly kind: 'command'; readonly id: string; readonly label?: string }
  | { readonly kind: 'separator' }
  | { readonly kind: 'submenu'; readonly label: string; readonly entries: readonly MenuEntry[] };

const cmd = (id: string, label?: string): MenuEntry => ({ kind: 'command', id, label });
const separator: MenuEntry = { kind: 'separator' };

export const NODE_MENU: readonly MenuEntry[] = [
  cmd('edit.rename', 'Rename'),
  cmd('edit.attributes'),
  { kind: 'submenu', label: 'Link Selected Nodes', entries: RELATION_TYPES.map((t) => cmd(`edit.link.${t}`)) },
  separator,
  cmd('edit.delete'),
];

export const RELATION_MENU: readonly MenuEntry[] = [
  { kind: 'submenu', label: 'Change Type', entries: RELATION_TYPES.map((t) => cmd(`edit.retype.${t}`)) },
  separator,
  cmd('edit.delete'),
];

export const BACKGROUND_MENU: readonly MenuEntry[] = [
  cmd('edit.addNode', 'Add Node Here'),
  separator,
  cmd('edit.selectAll'),
  cmd('view.fit'),
];
