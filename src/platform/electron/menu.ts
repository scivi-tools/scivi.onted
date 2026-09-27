import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC } from './ipc';

/**
 * Builds the native main menu. The items that act on the document only send a command ID to the
 * renderer: the actual handlers live in the editor's command registry, which is shared by the menu,
 * the context menus, and the keyboard shortcuts.
 */
export function buildMenu(getWindow: () => BrowserWindow | null): Menu {
  const isMac = process.platform === 'darwin';
  const send = (commandId: string) => () => getWindow()?.webContents.send(IPC.command, commandId);
  const item = (label: string, commandId: string, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: send(commandId),
  });

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        item('New', 'file.new', 'CmdOrCtrl+N'),
        item('Open…', 'file.open', 'CmdOrCtrl+O'),
        { type: 'separator' },
        item('Save', 'file.save', 'CmdOrCtrl+S'),
        item('Save As…', 'file.saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'edit.undo', 'CmdOrCtrl+Z'),
        item('Redo', 'edit.redo', 'CmdOrCtrl+Shift+Z'),
        { type: 'separator' },
        // Standard text editing, needed by the text fields (e.g. in the inspector).
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Fit to Window', 'view.fit', 'CmdOrCtrl+0'),
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  return Menu.buildFromTemplate(template);
}
