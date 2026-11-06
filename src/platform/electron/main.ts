/** The Electron main process: window, native menu, dialogs, and file access. */
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { CommandState, DocumentState, FileRef, OpenedFile } from '../types';
import { IPC } from './ipc';
import { buildMenu } from './menu';

const APP_NAME = 'SciVi.OntEd';
const ONT_FILTERS = [
  { name: 'Ontologies', extensions: ['ont'] },
  { name: 'All Files', extensions: ['*'] },
];

let mainWindow: BrowserWindow | null = null;
let documentState: DocumentState = { fileName: null, modified: false };
/**
 * The directory of the last file opened or saved, where the Open and Save As dialogs start.
 * Kept for the running session only (not stored on disk).
 */
let lastDirectory: string | undefined;
let commandStates: Readonly<Record<string, CommandState>> = {};
let commandStatesJson = '';
let menuUpdate: NodeJS.Timeout | null = null;

function updateMenu(): void {
  Menu.setApplicationMenu(buildMenu(() => mainWindow, commandStates));
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: APP_NAME,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });
  win.on('close', (event) => {
    if (!documentState.modified) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Discard Changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'The ontology has unsaved changes.',
      detail: 'Do you want to close the window and discard them?',
    });
    if (choice !== 0) event.preventDefault();
  });

  // Links must never open inside the editor window.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

function registerIpc(): void {
  ipcMain.handle(IPC.openFile, async (): Promise<OpenedFile | null> => {
    const win = mainWindow;
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: ONT_FILTERS,
      defaultPath: lastDirectory,
    });
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    const content = await readFile(path, 'utf-8');
    lastDirectory = dirname(path);
    return { path, name: basename(path), content };
  });

  ipcMain.handle(IPC.saveFile, async (_e, content: string, target: FileRef | null): Promise<FileRef | null> => {
    let path = target?.path;
    if (!path) {
      const win = mainWindow;
      if (!win) return null;
      const result = await dialog.showSaveDialog(win, {
        defaultPath: lastDirectory ? join(lastDirectory, 'untitled.ont') : 'untitled.ont',
        filters: ONT_FILTERS,
      });
      if (result.canceled || !result.filePath) return null;
      path = result.filePath;
    }
    await writeFile(path, content, 'utf-8');
    lastDirectory = dirname(path);
    return { path, name: basename(path) };
  });

  ipcMain.handle(IPC.confirm, async (_e, message: string, detail: string, okLabel: string) => {
    const options = { type: 'question' as const, buttons: [okLabel, 'Cancel'], defaultId: 0, cancelId: 1, message, detail };
    const result = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
    return result.response === 0;
  });

  ipcMain.handle(IPC.showError, async (_e, message: string, detail?: string) => {
    const options = { type: 'error' as const, message, detail };
    if (mainWindow) await dialog.showMessageBox(mainWindow, options);
    else await dialog.showMessageBox(options);
  });

  // The config lives in `config/onted.config.json` next to the sources (the editor is run from source).
  ipcMain.handle(IPC.loadConfig, async (): Promise<unknown> => {
    const path = join(app.getAppPath(), 'config', 'onted.config.json');
    let text: string;
    try {
      text = await readFile(path, 'utf-8');
    } catch {
      return null;
    }
    return JSON.parse(text) as unknown;
  });

  // The menu is rebuilt (rather than patched) so that labels update on every platform; debounced.
  ipcMain.on(IPC.setCommandStates, (_e, states: Record<string, CommandState>) => {
    const json = JSON.stringify(states);
    if (json === commandStatesJson) return;
    commandStatesJson = json;
    commandStates = states;
    if (menuUpdate) clearTimeout(menuUpdate);
    menuUpdate = setTimeout(() => {
      menuUpdate = null;
      updateMenu();
    }, 30);
  });

  ipcMain.on(IPC.setDocumentState, (_e, state: DocumentState) => {
    documentState = state;
    const win = mainWindow;
    if (!win) return;
    const name = state.fileName ?? 'Untitled';
    win.setTitle(`${state.modified && process.platform !== 'darwin' ? '• ' : ''}${name} — ${APP_NAME}`);
    win.setDocumentEdited(state.modified); // macOS: the dot in the close button
  });
}

app.setName(APP_NAME);
void app.whenReady().then(() => {
  registerIpc();
  updateMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
