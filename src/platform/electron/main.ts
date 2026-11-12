/**
 * The Electron main process: document windows, native menu, dialogs, and file access.
 *
 * Every document has its own window, with its own editor (renderer). On macOS, the windows share a
 * tabbing identifier, so they can be shown as native tabs (as the system setting "Prefer tabs when
 * opening documents" says, or with Window > Merge All Windows).
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { statSync } from 'node:fs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
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

/** Asks for a file and opens it (see openPath). */
async function openFile(from: DocWindow | null): Promise<void> {
  const options = { properties: ['openFile' as const], filters: ONT_FILTERS, defaultPath: lastDirectory };
  const result = from ? await dialog.showOpenDialog(from.win, options) : await dialog.showOpenDialog(options);
  const path = result.filePaths[0];
  if (!result.canceled && path) await openPath(path, from);
}

/**
 * Opens a file: brings forward the window already showing it, or opens it in `from` if that holds
 * a blank document (also while its editor is still loading), or else in a new window.
 * All the ways of opening files end here: the Open dialog, Finder and the Dock icon (macOS),
 * the command line, and files dropped onto a window.
 */
async function openPath(path: string, from: DocWindow | null): Promise<void> {
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

  if (from && !from.win.isDestroyed() && from.state.blank && !from.pending && !from.incoming) {
    if (from.ready) {
      from.incoming = file.path;
      from.win.webContents.send(IPC.openDocument, file);
    } else {
      from.pending = file; // Given to the editor once it is ready.
      from.win.setTitle(`${file.name} — ${APP_NAME}`);
      return; // The window shows itself when it is ready.
    }
    show(from);
  } else {
    createWindow(file);
  }
}

/** Number of openPaths calls in progress (so that no extra blank window is opened meanwhile). */
let openingFiles = 0;

/** Opens several files in turn: the first may fill the blank window `from`, the others get new windows. */
async function openPaths(paths: readonly string[], from: DocWindow | null): Promise<void> {
  openingFiles++;
  try {
    for (const path of paths) await openPath(path, from);
  } finally {
    openingFiles--;
  }
}

/**
 * The files named on a command line (relative paths are resolved against `cwd`). Everything that is
 * not an existing file is skipped: the executable, options, and, when running from source, the
 * application's directory.
 */
function filesFromArgs(argv: readonly string[], cwd: string): string[] {
  const files: string[] = [];
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue;
    const path = resolve(cwd, arg);
    try {
      if (statSync(path).isFile()) files.push(path);
    } catch {
      // Not a file.
    }
  }
  return files;
}

function registerIpc(): void {
  ipcMain.on(IPC.requestOpenFile, (e) => void openFile(fromEvent(e) ?? null));
  ipcMain.on(IPC.requestNewDocument, () => createWindow(null));
  ipcMain.on(IPC.openPaths, (e, paths: unknown) => {
    if (!Array.isArray(paths)) return;
    const files = paths.filter((p): p is string => typeof p === 'string' && p !== '');
    void openPaths(files, fromEvent(e) ?? null);
  });

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

  ipcMain.handle(IPC.loadConfig, () => loadConfig());

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

/**
 * The config: the bundled `config/onted.config.json` (next to the sources, or in the packaged
 * application's resources), overridden key by key by the user's `onted.config.json` in the
 * application-data folder (macOS: ~/Library/Application Support/SciVi.OntEd; Linux: ~/.config/SciVi.OntEd).
 */
async function loadConfig(): Promise<unknown> {
  const bundledPath = app.isPackaged
    ? join(process.resourcesPath, 'config', 'onted.config.json')
    : join(app.getAppPath(), 'config', 'onted.config.json');
  const read = async (path: string): Promise<Record<string, unknown> | null> => {
    let text: string;
    try {
      text = await readFile(path, 'utf-8');
    } catch {
      return null; // No such file.
    }
    try {
      const value = JSON.parse(text) as unknown;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // Reported below.
    }
    throw new Error(`${path} is not a JSON object`);
  };
  const bundled = await read(bundledPath);
  const user = await read(USER_CONFIG_PATH);
  if (!user) return bundled;
  const merged: Record<string, unknown> = { ...bundled, ...user };
  // Relation colours are merged per relation type, so a user config may change just one colour.
  const colors = (v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
  if (bundled?.['relationColors'] !== undefined || user['relationColors'] !== undefined) {
    merged['relationColors'] = { ...colors(bundled?.['relationColors']), ...colors(user['relationColors']) };
  }
  return merged;
}

app.setName(APP_NAME);
/** Shared by the packaged application and runs from source (whose other data is kept apart, see below). */
const USER_CONFIG_PATH = join(app.getPath('appData'), APP_NAME, 'onted.config.json');
// Running from source must not hand its files over to an installed copy that is running (or the
// other way round): keep its data, including the single-instance lock, in a folder of its own.
if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), `${APP_NAME} (development)`));

/** Files to open that arrived before the application was ready (macOS: launched from Finder or the Dock). */
const filesAtLaunch: string[] = [];
let started = false;

// macOS: files opened from Finder, dropped on the Dock icon, or given to `open -a`.
// This is emitted before 'ready' when the application is launched for a file.
app.on('open-file', (event, path) => {
  event.preventDefault();
  if (started) void openPaths([path], focusedWindow());
  else filesAtLaunch.push(path);
});

// One running instance: started again (e.g. `onted file.ont` on Linux), it hands its files to this one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const files = filesFromArgs(argv, workingDirectory);
    const target = focusedWindow();
    if (files.length > 0) void openPaths(files, target);
    else if (target) show(target);
    else createWindow(null);
  });

  void app.whenReady().then(async () => {
    registerIpc();
    updateMenu();
    // macOS: the "+" button of the tab bar.
    app.on('new-window-for-tab', () => createWindow(null));
    // macOS: the Dock icon was clicked with no windows open.
    app.on('activate', () => {
      if (windows.size === 0 && openingFiles === 0) createWindow(null);
    });

    started = true;
    const files = [...filesFromArgs(process.argv, process.cwd()), ...filesAtLaunch];
    if (files.length > 0) await openPaths(files, null);
    if (windows.size === 0) createWindow(null);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
