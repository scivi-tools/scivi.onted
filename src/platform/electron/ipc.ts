/** IPC channel names shared by the main process and the preload script. */
export const IPC = {
  requestOpenFile: 'onted:request-open-file',
  requestNewDocument: 'onted:request-new-document',
  /** Main -> renderer: a document to show. */
  openDocument: 'onted:open-document',
  /** Renderer -> main: ready to receive documents. */
  ready: 'onted:ready',
  saveFile: 'onted:save-file',
  confirm: 'onted:confirm',
  showError: 'onted:show-error',
  loadConfig: 'onted:load-config',
  setDocumentState: 'onted:set-document-state',
  setCommandStates: 'onted:set-command-states',
  command: 'onted:command',
} as const;
