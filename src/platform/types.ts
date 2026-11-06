/**
 * Everything the editor needs from its host environment. The Electron implementation lives in
 * `./electron`; a future Web port only has to provide another implementation of this interface.
 */

export interface FileRef {
  /** Opaque handle: a file system path in Electron, something else in a Web port. */
  readonly path: string;
  /** File name to show to the user. */
  readonly name: string;
}

export interface OpenedFile extends FileRef {
  readonly content: string;
}

export interface DocumentState {
  /** File name, or null for a new document that has not been saved yet. */
  readonly fileName: string | null;
  /** The file's path (see FileRef.path), or null for a new document. */
  readonly filePath: string | null;
  readonly modified: boolean;
  /**
   * True for a new, empty, unmodified document (e.g. right after start): the host may open a file
   * in its place rather than in a new window.
   */
  readonly blank: boolean;
}

/** The state of an editor command, for showing it in the host's menus. */
export interface CommandState {
  readonly enabled: boolean;
  /** Label to show, e.g. "Undo Add Node". */
  readonly label: string;
  /** Human-readable shortcut, if the command has one. */
  readonly hint?: string;
}

export interface Platform {
  /**
   * Asks the user for a file to open. The host decides where it goes: into this editor (through
   * `onOpenDocument`) if it holds a blank document, or elsewhere (e.g. a new window, or the window
   * that already shows that file).
   */
  requestOpenFile(): void;

  /** Asks the host for a new, empty document (e.g. in a new window). */
  requestNewDocument(): void;

  /**
   * Subscribes to documents the host gives to this editor to show: the file of a newly opened
   * window, or a file opened in place of a blank document. The editor must report its document
   * state (setDocumentState) after handling each one, whether it could be loaded or not.
   * Call this after the editor has reported its initial state.
   */
  onOpenDocument(handler: (file: OpenedFile) => void): void;

  /**
   * Saves the content to the given file, or asks the user where to save it if `target` is null
   * ("Save As"). Resolves to the file written, or null if cancelled.
   */
  saveFile(content: string, target: FileRef | null): Promise<FileRef | null>;

  /** Asks a yes/no question, e.g. whether to discard unsaved changes. */
  confirm(message: string, detail: string, okLabel: string): Promise<boolean>;

  /** Shows an error message. */
  showError(message: string, detail?: string): Promise<void>;

  /** The raw contents of the user config (parsed JSON), or null if there is none. */
  loadConfig(): Promise<unknown>;

  /** Reports the document state, so the host can show it (window title, "unsaved" mark, close confirmation). */
  setDocumentState(state: DocumentState): void;

  /** Reports the state of the editor's commands, so the host's menus can show it. */
  setCommandStates(states: Readonly<Record<string, CommandState>>): void;

  /** Subscribes to commands coming from the host, e.g. from the native main menu. */
  onCommand(handler: (commandId: string) => void): void;
}
