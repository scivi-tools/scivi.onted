/** IPC channel names shared by the main process and the preload script. */
export const IPC = {
  openFile: 'onted:open-file',
  saveFile: 'onted:save-file',
  confirm: 'onted:confirm',
  showError: 'onted:show-error',
  loadConfig: 'onted:load-config',
  setDocumentState: 'onted:set-document-state',
  setCommandStates: 'onted:set-command-states',
  command: 'onted:command',
} as const;
