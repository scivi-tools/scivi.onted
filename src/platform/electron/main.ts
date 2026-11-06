/**
 * The Electron main process: document windows, native menu, dialogs, and file access.
 *
 * Every document has its own window, with its own editor (renderer). On macOS, the windows share a
 * tabbing identifier, so they can be shown as native tabs (as the system setting "Prefer tabs when
 * opening documents" says, or with Window > Merge All Windows).
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { CommandState, DocumentState, FileRef, OpenedFile } from '../types';
import { IPC } from './ipc';
import { buildMenu } from './menu';

const APP_NAME = 'SciVi.OntEd';
const ONT_FILTERS = [
  { name: 'Ontologies', extensions: ['ont'] },
  { name: 'All Files', extensions: ['*'] },
];
/** Shared by all document windows, so that macOS can group them as tabs. */
const TABBING_ID = 'scivi-onted-document';
/** Offset of a new window from the focused one, so that it does not hide it exactly. */
const CASCADE = 24;

/** A document window and what its editor last reported. */
interface DocWindow {
  readonly win: BrowserWindow;
  state: DocumentState;
  commands: Readonly<Record<string, CommandState>> | null;
  /** The file to give to the editor once it is ready, if the window was opened for one. */
  pending: OpenedFile | null;
  /**
   * The path of the file sent to the editor and not yet confirmed: the editor's next state report
   * (showing the file, or still blank if it could not be loaded) settles it.
   */
  incoming: string | null;
  /** The editor is ready to receive documents. */
  ready: boolean;
}

const BLANK_STATE: DocumentState = { fileName: null, filePath: null, modified: false, blank: true };

/** By the ID of the window's web contents (which is what IPC events identify). */
const windows = new Map<number, DocWindow>();
/** The document window that was focused last (the menu acts on it). */
let lastFocused: DocWindow | null = null;
/**
 * The directory of the last file opened or saved, where the Open and Save As dialogs start.
 * Kept for the running session only (not stored on disk).
 */
let lastDirectory: string | undefined;
let menuUpdate: NodeJS.Timeout | null = null;

function fromEvent(e: IpcMainEvent | IpcMainInvokeEvent): DocWindow | undefined {
  return windows.get(e.sender.id);
}

/**
 * The window the menu commands go to: the one focused last. The windows' focus events are the
 * reference here: while a focus event is handled, BrowserWindow.getFocusedWindow() may still
 * return the previously focused window.
 */
function focusedWindow(): DocWindow | null {
  if (lastFocused && !lastFocused.win.isDestroyed()) return lastFocused;
  const focused = BrowserWindow.getFocusedWindow();
  return (focused && windows.get(focused.webContents.id)) || null;
}

function updateMenu(): void {
  const target = focusedWindow();
  Menu.setApplicationMenu(
    buildMenu({
      states: target ? (target.commands ?? {}) : null,
      send: (id) => focusedWindow()?.win.webContents.send(IPC.command, id),
      newDocument: () => createWindow(null),
      openFile: () => void openFile(focusedWindow()),
    }),
  );
}

/** The menu is rebuilt (rather than patched) so that labels update on every platform; debounced. */
function scheduleMenuUpdate(): void {
  if (menuUpdate) clearTimeout(menuUpdate);
  menuUpdate = setTimeout(() => {
    menuUpdate = null;
    updateMenu();
  }, 30);
}

function updateWindowTitle(dw: DocWindow): void {
  const { state, win } = dw;
  const name = state.fileName ?? 'Untitled';
  win.setTitle(`${state.modified && process.platform !== 'darwin' ? '• ' : ''}${name} — ${APP_NAME}`);
  if (process.platform === 'darwin') {
    win.setDocumentEdited(state.modified); // the dot in the close button
    win.setRepresentedFilename(state.filePath ?? ''); // the file icon in the title bar
  }
}

/** Opens a new document window: blank, or showing the given file. */
function createWindow(file: OpenedFile | null): DocWindow {
  const from = focusedWindow();
  const position = from && !from.win.isDestroyed() ? from.win.getPosition() : null;
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(position ? { x: position[0]! + CASCADE, y: position[1]! + CASCADE } : {}),
    title: APP_NAME,
    show: false,
    tabbingIdentifier: TABBING_ID,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const id = win.webContents.id;
  const dw: DocWindow = { win, state: BLANK_STATE, commands: null, pending: file, incoming: null, ready: false };
  windows.set(id, dw);
  updateWindowTitle(dw);
  if (file) win.setTitle(`${file.name} — ${APP_NAME}`);

  win.once('ready-to-show', () => win.show());
  win.on('focus', () => {
    lastFocused = dw;
    updateMenu();
  });
  win.on('closed', () => {
    windows.delete(id);
    if (lastFocused === dw) lastFocused = null;
    updateMenu();
  });
  win.on('close', (event) => {
    if (!dw.state.modified) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Discard Changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `"${dw.state.fileName ?? 'Untitled'}" has unsaved changes.`,
      detail: 'Do you want to close it and discard them?',
    });
    // Cancelling also cancels quitting the application.
    if (choice !== 0) event.preventDefault();
  });

  // Links must never open inside an editor window.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  return dw;
}

/** Paths are compared after resolving symbolic links, so that one file is not opened twice. */
async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

async function windowShowingFile(path: string): Promise<DocWindow | undefined> {
  const target = await canonicalPath(path);
  for (const dw of windows.values()) {
    for (const p of [dw.state.filePath, dw.pending?.path, dw.incoming]) {
      if (p && (await canonicalPath(p)) === target) return dw;
    }
  }
  return undefined;
}

function show(dw: DocWindow): void {
  if (dw.win.isMinimized()) dw.win.restore();
  dw.win.show();
  dw.win.focus();
}

/**
 * Asks for a file and opens it: brings forward the window already showing it, or opens it in
 * `from` if that holds a blank document, or else in a new window.
 */
async function openFile(from: DocWindow | null): Promise<void> {
  const options = { properties: ['openFile' as const], filters: ONT_FILTERS, defaultPath: lastDirectory };
  const result = from ? await dialog.showOpenDialog(from.win, options) : await dialog.showOpenDialog(options);
  const path = result.filePaths[0];
  if (result.canceled || !path) return;

  const existing = await windowShowingFile(path);
  if (existing) {
    show(existing);
    return;
  }
  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch (e) {
    await dialog.showMessageBox({ type: 'error', message: `Cannot open "${basename(path)}".`, detail: String(e) });
    return;
  }
  lastDirectory = dirname(path);
  const file: OpenedFile = { path, name: basename(path), content };

  if (from && !from.win.isDestroyed() && from.ready && from.state.blank && !from.pending && !from.incoming) {
    from.incoming = file.path;
    from.win.webContents.send(IPC.openDocument, file);
  } else {
    createWindow(file);
  }
}

function registerIpc(): void {
  ipcMain.on(IPC.requestOpenFile, (e) => void openFile(fromEvent(e) ?? null));
  ipcMain.on(IPC.requestNewDocument, () => createWindow(null));

  ipcMain.on(IPC.ready, (e) => {
    const dw = fromEvent(e);
    if (!dw) return;
    dw.ready = true;
    if (dw.pending) {
      dw.incoming = dw.pending.path;
      e.sender.send(IPC.openDocument, dw.pending);
      dw.pending = null;
    }
  });

  ipcMain.handle(IPC.saveFile, async (e, content: string, target: FileRef | null): Promise<FileRef | null> => {
    const dw = fromEvent(e);
    let path = target?.path;
    if (!path) {
      const options = {
        defaultPath: lastDirectory ? join(lastDirectory, 'untitled.ont') : 'untitled.ont',
        filters: ONT_FILTERS,
      };
      const result = dw ? await dialog.showSaveDialog(dw.win, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return null;
      path = result.filePath;
    }
    await writeFile(path, content, 'utf-8');
    lastDirectory = dirname(path);
    return { path, name: basename(path) };
  });

  ipcMain.handle(IPC.confirm, async (e, message: string, detail: string, okLabel: string) => {
    const options = { type: 'question' as const, buttons: [okLabel, 'Cancel'], defaultId: 0, cancelId: 1, message, detail };
    const dw = fromEvent(e);
    const result = dw ? await dialog.showMessageBox(dw.win, options) : await dialog.showMessageBox(options);
    return result.response === 0;
  });

  ipcMain.handle(IPC.showError, async (e, message: string, detail?: string) => {
    const options = { type: 'error' as const, message, detail };
    const dw = fromEvent(e);
    if (dw) await dialog.showMessageBox(dw.win, options);
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

  ipcMain.on(IPC.setCommandStates, (e, states: Record<string, CommandState>) => {
    const dw = fromEvent(e);
    if (!dw) return;
    dw.commands = states;
    if (dw === focusedWindow()) scheduleMenuUpdate();
  });

  ipcMain.on(IPC.setDocumentState, (e, state: DocumentState) => {
    const dw = fromEvent(e);
    if (!dw) return;
    dw.state = state;
    // The editor reports its state after handling a document it was sent (see Platform.onOpenDocument).
    dw.incoming = null;
    updateWindowTitle(dw);
  });
}

app.setName(APP_NAME);
void app.whenReady().then(() => {
  registerIpc();
  updateMenu();
  createWindow(null);
  // macOS: the "+" button of the tab bar.
  app.on('new-window-for-tab', () => createWindow(null));
  // macOS: the Dock icon was clicked with no windows open.
  app.on('activate', () => {
    if (windows.size === 0) createWindow(null);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
