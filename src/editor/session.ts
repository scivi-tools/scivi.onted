/**
 * The state of the editor window: the open document, its file, the selection, and the config.
 * Bridges the framework-independent core (OntDocument and its events) to Vue's reactivity, and
 * defines the commands that do not depend on a particular view.
 */
import { computed, shallowRef, triggerRef, watch, type ShallowRef } from 'vue';
import {
  DEFAULT_CONFIG,
  OntDocument,
  RELATION_TYPES,
  resolveConfig,
  validateOntology,
  type EditorConfig,
  type RelationType,
} from '../core';
import type { CommandState, FileRef, Platform } from '../platform/types';
import { CommandRegistry } from './commands';
import { EMPTY_SELECTION, isEmpty, prune, type Selection } from './selection';
import { commandForKey, isTextInput, shortcutHint } from './shortcuts';

export class EditorSession {
  readonly commands = new CommandRegistry();
  readonly config = shallowRef<EditorConfig>(DEFAULT_CONFIG);
  readonly configWarnings = shallowRef<string[]>([]);
  /** Triggered (via triggerRef) whenever the document changes, so views recompute. */
  readonly document: ShallowRef<OntDocument>;
  readonly file = shallowRef<FileRef | null>(null);
  readonly selection = shallowRef<Selection>(EMPTY_SELECTION);
  /** True while keyboard input goes to a text field. */
  readonly textFocused = shallowRef(false);
  /** Incremented to ask the inspector to take the keyboard focus. */
  readonly inspectorFocusRequest = shallowRef(0);

  readonly issues = computed(() => validateOntology(this.document.value.ontology));

  /** The state of all commands, as shown in menus. */
  readonly commandStates = computed<Record<string, CommandState>>(() => {
    // Depend on everything the enabled states and labels are computed from.
    void this.document.value;
    void this.selection.value;
    void this.textFocused.value;
    const states: Record<string, CommandState> = {};
    for (const c of this.commands.all()) {
      states[c.id] = { enabled: this.commands.isEnabled(c.id), label: this.commands.label(c.id), hint: shortcutHint(c.id) };
    }
    return states;
  });

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
    this.platform.onCommand((id) => void this.runCommand(id));
    watch(this.commandStates, (states) => this.platform.setCommandStates(states), { immediate: true });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('focusin', () => this.updateTextFocus());
    window.addEventListener('focusout', () => setTimeout(() => this.updateTextFocus()));
    this.publishState();
  }

  /** Runs a command, reporting errors to the user. */
  async runCommand(id: string): Promise<boolean> {
    try {
      return await this.commands.run(id);
    } catch (e) {
      await this.platform.showError('The action failed.', e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /** Runs an action (e.g. an edit rejected by the core with an exception), reporting errors to the user. */
  async runCommandFn(action: () => void): Promise<void> {
    try {
      action();
    } catch (e) {
      await this.platform.showError('The action failed.', e instanceof Error ? e.message : String(e));
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.isComposing || isTextInput(document.activeElement)) return;
    const id = commandForKey(e);
    if (id && this.commands.get(id)) {
      e.preventDefault();
      void this.runCommand(id);
    }
  }

  private updateTextFocus(): void {
    this.textFocused.value = isTextInput(document.activeElement);
  }

  private attach(doc: OntDocument): void {
    this.unsubscribe?.();
    this.unsubscribe = doc.events.on('changed', () => {
      // Drop selected elements that no longer exist (e.g. after an undo).
      this.selection.value = prune(
        this.selection.value,
        new Set(doc.ontology.nodes.map((n) => n.id)),
        new Set(doc.ontology.relations.map((r) => r.id)),
      );
      triggerRef(this.document);
      this.publishState();
    });
  }

  private setDocument(doc: OntDocument, file: FileRef | null): void {
    this.attach(doc);
    this.document.value = doc;
    this.file.value = file;
    this.selection.value = EMPTY_SELECTION;
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
    return this.platform.confirm('The ontology has unsaved changes.', 'Do you want to discard them?', 'Discard Changes');
  }

  select(selection: Selection): void {
    this.selection.value = selection;
  }

  /** Links the selected nodes: each earlier-selected node to the last-selected one. */
  link(type: RelationType): void {
    const nodes = this.selection.value.nodes;
    if (nodes.length < 2) return;
    this.document.value.link(nodes.slice(0, -1), nodes.at(-1)!, type);
  }

  private registerCommands(): void {
    const c = this.commands;
    const doc = () => this.document.value;
    const sel = () => this.selection.value;
    // In a text field, Undo/Redo/Select All act on the text, as usual.
    const inText = () => isTextInput(document.activeElement);

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
        let d: OntDocument;
        try {
          d = OntDocument.fromText(opened.content);
        } catch (e) {
          await this.platform.showError(`Cannot open "${opened.name}".`, e instanceof Error ? e.message : String(e));
          return;
        }
        this.setDocument(d, { path: opened.path, name: opened.name });
      },
    });
    const save = async (target: FileRef | null): Promise<void> => {
      const d = doc();
      try {
        const saved = await this.platform.saveFile(d.toText(), target);
        if (!saved) return;
        this.file.value = saved;
        d.markSaved();
      } catch (e) {
        await this.platform.showError('Cannot save the ontology.', e instanceof Error ? e.message : String(e));
      }
    };
    c.register({ id: 'file.save', label: 'Save', run: () => save(this.file.value) });
    c.register({ id: 'file.saveAs', label: 'Save As…', run: () => save(null) });

    c.register({
      id: 'edit.undo',
      label: () => (!this.textFocused.value && doc().undoLabel ? `Undo ${doc().undoLabel}` : 'Undo'),
      isEnabled: () => this.textFocused.value || doc().canUndo,
      run: () => (inText() ? void document.execCommand('undo') : doc().undo()),
    });
    c.register({
      id: 'edit.redo',
      label: () => (!this.textFocused.value && doc().redoLabel ? `Redo ${doc().redoLabel}` : 'Redo'),
      isEnabled: () => this.textFocused.value || doc().canRedo,
      run: () => (inText() ? void document.execCommand('redo') : doc().redo()),
    });
    c.register({
      id: 'edit.selectAll',
      label: 'Select All',
      run: () => {
        if (inText()) document.execCommand('selectAll');
        else this.select({ nodes: doc().ontology.nodes.map((n) => n.id), relations: [] });
      },
    });
    c.register({
      id: 'edit.selectNone',
      label: 'Select None',
      isEnabled: () => !isEmpty(sel()),
      run: () => this.select(EMPTY_SELECTION),
    });
    c.register({
      id: 'edit.delete',
      label: () => (sel().nodes.length === 0 && sel().relations.length > 0 ? 'Delete Relation' : 'Delete'),
      isEnabled: () => !this.textFocused.value && !isEmpty(sel()),
      run: () => {
        doc().deleteElements(sel().nodes, sel().relations);
        this.select(EMPTY_SELECTION);
      },
    });
    c.register({
      id: 'edit.attributes',
      label: 'Edit Attributes',
      isEnabled: () => sel().nodes.length === 1,
      run: () => {
        this.inspectorFocusRequest.value++;
      },
    });
    for (const type of RELATION_TYPES) {
      c.register({
        id: `edit.retype.${type}`,
        label: type,
        isEnabled: () => sel().relations.length > 0,
        run: () => doc().setRelationType(sel().relations, type),
      });
      c.register({
        id: `edit.link.${type}`,
        label: type,
        isEnabled: () => !this.textFocused.value && sel().nodes.length >= 2,
        run: () => this.link(type),
      });
    }
  }
}
