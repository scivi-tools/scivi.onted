import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { CommandState } from '../types';
import { IPC } from './ipc';

const RELATION_TYPES = ['is_a', 'a_part_of', 'has', 'is_instance', 'is_used', 'is_hosted', 'base_type', 'language'];

/**
 * Builds the native main menu. Its items only send command IDs to the renderer: the handlers live
 * in the editor's command registry, which is shared by the menu, the context menu, and the keyboard.
 * Labels and enabled states come from the editor (`states`).
 *
 * Only Cmd/Ctrl shortcuts are registered as menu accelerators. The editor's single-key shortcuts
 * (Shift+A, Shift+1...8, Delete, ...) are handled by the editor itself and are only shown in the
 * labels: registered as accelerators, they could steal these keys from text fields.
 */
export function buildMenu(
  getWindow: () => BrowserWindow | null,
  states: Readonly<Record<string, CommandState>>,
): Menu {
  const isMac = process.platform === 'darwin';
  const item = (id: string, fallbackLabel: string, accelerator?: string): MenuItemConstructorOptions => {
    const state = states[id];
    const label = state?.label ?? fallbackLabel;
    return {
      id,
      label: !accelerator && state?.hint ? `${label}  (${state.hint})` : label,
      accelerator,
      enabled: state?.enabled ?? true,
      click: () => getWindow()?.webContents.send(IPC.command, id),
    };
  };
  const separator: MenuItemConstructorOptions = { type: 'separator' };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        item('file.new', 'New', 'CmdOrCtrl+N'),
        item('file.open', 'Open…', 'CmdOrCtrl+O'),
        separator,
        item('file.save', 'Save', 'CmdOrCtrl+S'),
        item('file.saveAs', 'Save As…', 'CmdOrCtrl+Shift+S'),
        separator,
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('edit.undo', 'Undo', 'CmdOrCtrl+Z'),
        item('edit.redo', 'Redo', 'CmdOrCtrl+Shift+Z'),
        separator,
        // Standard text editing, for the text fields.
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        item('edit.selectAll', 'Select All', 'CmdOrCtrl+A'),
        separator,
        item('edit.addNode', 'Add Node'),
        item('edit.rename', 'Rename Node'),
        item('edit.attributes', 'Edit Attributes'),
        {
          label: 'Link Selected Nodes',
          submenu: RELATION_TYPES.map((t) => item(`edit.link.${t}`, t)),
        },
        {
          label: 'Change Relation Type',
          submenu: RELATION_TYPES.map((t) => item(`edit.retype.${t}`, t)),
        },
        separator,
        item('edit.delete', 'Delete'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('view.fit', 'Fit to Window', 'CmdOrCtrl+0'),
        separator,
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  return Menu.buildFromTemplate(template);
}
