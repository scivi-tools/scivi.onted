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
  readonly modified: boolean;
}

export interface Platform {
  /** Asks the user for a file to open. Resolves to null if cancelled. */
  openFile(): Promise<OpenedFile | null>;

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

  /** Subscribes to commands coming from the host, e.g. from the native main menu. */
  onCommand(handler: (commandId: string) => void): void;
}
