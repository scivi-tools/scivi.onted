/**
 * The preload script: exposes a narrow API to the renderer (which runs with context isolation
 * and without Node.js). This object is exactly the `Platform` interface.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { CommandState, DocumentState, FileRef, OpenedFile, Platform } from '../types';
import { IPC } from './ipc';

const api: Platform = {
  requestOpenFile: () => ipcRenderer.send(IPC.requestOpenFile),
  requestNewDocument: () => ipcRenderer.send(IPC.requestNewDocument),
  onOpenDocument: (handler: (file: OpenedFile) => void) => {
    ipcRenderer.on(IPC.openDocument, (_event, file: OpenedFile) => handler(file));
    // Now the main process may send the document this window was opened for, if any.
    ipcRenderer.send(IPC.ready);
  },
  saveFile: (content: string, target: FileRef | null) => ipcRenderer.invoke(IPC.saveFile, content, target),
  confirm: (message: string, detail: string, okLabel: string) => ipcRenderer.invoke(IPC.confirm, message, detail, okLabel),
  showError: (message: string, detail?: string) => ipcRenderer.invoke(IPC.showError, message, detail),
  loadConfig: () => ipcRenderer.invoke(IPC.loadConfig),
  setDocumentState: (state: DocumentState) => ipcRenderer.send(IPC.setDocumentState, state),
  setCommandStates: (states: Readonly<Record<string, CommandState>>) => ipcRenderer.send(IPC.setCommandStates, states),
  onCommand: (handler: (commandId: string) => void) => {
    ipcRenderer.on(IPC.command, (_event, commandId: string) => handler(commandId));
  },
};

contextBridge.exposeInMainWorld('ontedPlatform', api);
