/**
 * The state of the editor window: the open document, its file, the selection, and the config.
 * Bridges the framework-independent core (OntDocument and its events) to Vue's reactivity.
 */
import { computed, shallowRef, triggerRef, type ShallowRef } from 'vue';
import {
  DEFAULT_CONFIG,
  OntDocument,
  resolveConfig,
  validateOntology,
  type EditorConfig,
} from '../core';
import type { FileRef, Platform } from '../platform/types';
import { CommandRegistry } from './commands';

export class EditorSession {
  readonly commands = new CommandRegistry();
  readonly config = shallowRef<EditorConfig>(DEFAULT_CONFIG);
  readonly configWarnings = shallowRef<string[]>([]);
  /** Triggered (via triggerRef) whenever the document changes, so views recompute. */
  readonly document: ShallowRef<OntDocument>;
  readonly file = shallowRef<FileRef | null>(null);
  /** Selected node IDs, in the order of selection. */
  readonly selection = shallowRef<readonly number[]>([]);

  readonly issues = computed(() => validateOntology(this.document.value.ontology));

  private unsubscribe: (() => void) | null = null;

  constructor(readonly platform: Platform) {
    this.document = shallowRef(OntDocument.createEmpty());
    this.attach(this.document.value);
    this.registerCommands();
  }

  async init(): Promise<void> {
    try {
      const { config, warnings } = resolveConfig(await this.platform.loadConfig());
      this.config.value = config;
      this.configWarnings.value = warnings;
    } catch (e) {
      this.configWarnings.value = [`Cannot read the config: ${String(e)}`];
    }
    this.platform.onCommand((id) => void this.commands.run(id));
    this.publishState();
  }

  private attach(doc: OntDocument): void {
    this.unsubscribe?.();
    this.unsubscribe = doc.events.on('changed', () => {
      // Drop selected nodes that no longer exist (e.g. after an undo).
      const ids = new Set(doc.ontology.nodes.map((n) => n.id));
      if (this.selection.value.some((id) => !ids.has(id))) {
        this.selection.value = this.selection.value.filter((id) => ids.has(id));
      }
      triggerRef(this.document);
      this.publishState();
    });
  }

  private setDocument(doc: OntDocument, file: FileRef | null): void {
    this.attach(doc);
    this.document.value = doc;
    this.file.value = file;
    this.selection.value = [];
    this.publishState();
    void this.commands.run('view.fit');
  }

  private publishState(): void {
    this.platform.setDocumentState({
      fileName: this.file.value?.name ?? null,
      modified: this.document.value.isModified,
    });
  }

  /** Asks whether unsaved changes may be discarded; true if there are none. */
  private async confirmDiscard(): Promise<boolean> {
    if (!this.document.value.isModified) return true;
    return this.platform.confirm(
      'The ontology has unsaved changes.',
      'Do you want to discard them?',
      'Discard Changes',
    );
  }

  select(ids: readonly number[]): void {
    this.selection.value = ids;
  }

  private registerCommands(): void {
    const c = this.commands;
    c.register({
      id: 'file.new',
      label: 'New',
      run: async () => {
        if (await this.confirmDiscard()) this.setDocument(OntDocument.createEmpty(), null);
      },
    });
    c.register({
      id: 'file.open',
      label: 'Open…',
      run: async () => {
        if (!(await this.confirmDiscard())) return;
        const opened = await this.platform.openFile();
        if (!opened) return;
        let doc: OntDocument;
        try {
          doc = OntDocument.fromText(opened.content);
        } catch (e) {
          await this.platform.showError(`Cannot open "${opened.name}".`, e instanceof Error ? e.message : String(e));
          return;
        }
        this.setDocument(doc, { path: opened.path, name: opened.name });
      },
    });
    const save = async (target: FileRef | null): Promise<void> => {
      const doc = this.document.value;
      try {
        const saved = await this.platform.saveFile(doc.toText(), target);
        if (!saved) return;
        this.file.value = saved;
        doc.markSaved();
      } catch (e) {
        await this.platform.showError('Cannot save the ontology.', e instanceof Error ? e.message : String(e));
      }
    };
    c.register({ id: 'file.save', label: 'Save', run: () => save(this.file.value) });
    c.register({ id: 'file.saveAs', label: 'Save As…', run: () => save(null) });
    c.register({
      id: 'edit.undo',
      label: 'Undo',
      isEnabled: () => this.document.value.canUndo,
      run: () => this.document.value.undo(),
    });
    c.register({
      id: 'edit.redo',
      label: 'Redo',
      isEnabled: () => this.document.value.canRedo,
      run: () => this.document.value.redo(),
    });
  }
}
