import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { CommandState } from '../types';

const RELATION_TYPES = ['is_a', 'a_part_of', 'has', 'is_instance', 'is_used', 'is_hosted', 'base_type', 'language'];

export interface MenuOptions {
  /** The command states of the focused document window, or null if there is none. */
  readonly states: Readonly<Record<string, CommandState>> | null;
  /** Sends a command to the focused document window's editor. */
  send(commandId: string): void;
  /** Opens a new, empty document. */
  newDocument(): void;
  /** Asks for a file and opens it. */
  openFile(): void;
}

/**
 * Builds the native main menu. Most items only send a command ID to the focused window's editor:
 * the handlers live in the editor's command registry, which is shared by the menu, the context
 * menu, and the keyboard shortcuts. Labels and enabled states come from that editor. New and
 * Open are handled here, as they work without any window too (on macOS).
 *
 * Only Cmd/Ctrl shortcuts are registered as menu accelerators. The editor's single-key shortcuts
 * (Shift+A, Shift+1...8, Delete, ...) are handled by the editor itself and are only shown in the
 * labels: registered as accelerators, they could steal these keys from text fields.
 */
export function buildMenu(options: MenuOptions): Menu {
  const isMac = process.platform === 'darwin';
  const states = options.states;
  const item = (id: string, fallbackLabel: string, accelerator?: string): MenuItemConstructorOptions => {
    const state = states?.[id];
    const label = state?.label ?? fallbackLabel;
    return {
      id,
      label: !accelerator && state?.hint ? `${label}  (${state.hint})` : label,
      accelerator,
      enabled: states !== null && (state?.enabled ?? true),
      click: () => options.send(id),
    };
  };
  const separator: MenuItemConstructorOptions = { type: 'separator' };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        { id: 'file.new', label: 'New', accelerator: 'CmdOrCtrl+N', click: () => options.newDocument() },
        { id: 'file.open', label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => options.openFile() },
        separator,
        item('file.save', 'Save', 'CmdOrCtrl+S'),
        item('file.saveAs', 'Save As…', 'CmdOrCtrl+Shift+S'),
        separator,
        // Closes the focused window (or tab), asking about unsaved changes.
        { role: 'close', enabled: states !== null },
        ...(isMac ? [] : [{ role: 'quit' } as MenuItemConstructorOptions]),
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
          enabled: states !== null,
          submenu: RELATION_TYPES.map((t) => item(`edit.link.${t}`, t)),
        },
        {
          label: 'Change Relation Type',
          enabled: states !== null,
          submenu: RELATION_TYPES.map((t) => item(`edit.retype.${t}`, t)),
        },
        separator,
        item('edit.delete', 'Delete'),
      ],
    },
    {
      label: 'Arrange',
      submenu: [
        item('layout.layered', 'Hierarchical Layout (Vertical)'),
        item('layout.layeredHorizontal', 'Hierarchical Layout (Horizontal)'),
        item('layout.stress', 'Organic Layout'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('view.fit', 'Fit to Window', 'CmdOrCtrl+0'),
        separator,
        // macOS: Electron gives the tab roles no titles, so they are named here. Full screen is added
        // to this menu by macOS itself.
        ...(isMac
          ? [
              { role: 'toggleTabBar', label: 'Show Tab Bar' } as MenuItemConstructorOptions,
              { role: 'showAllTabs', label: 'Show All Tabs' } as MenuItemConstructorOptions,
              separator,
              { role: 'toggleDevTools' } as MenuItemConstructorOptions,
            ]
          : [{ role: 'toggleDevTools' } as MenuItemConstructorOptions, { role: 'togglefullscreen' } as MenuItemConstructorOptions]),
      ],
    },
    isMac
      ? {
          // macOS lists the open windows (and tabs) at the end of this menu by itself.
          role: 'windowMenu',
          submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            separator,
            { role: 'selectPreviousTab', label: 'Show Previous Tab' },
            { role: 'selectNextTab', label: 'Show Next Tab' },
            { role: 'moveTabToNewWindow', label: 'Move Tab to New Window' },
            { role: 'mergeAllWindows', label: 'Merge All Windows' },
            separator,
            { role: 'front' },
          ],
        }
      : { role: 'windowMenu' },
  ];
  return Menu.buildFromTemplate(template);
}
