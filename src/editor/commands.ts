/**
 * The command registry: every user action is defined here once (ID, label, handler) and invoked
 * by ID from the main menu, the context menu, and the keyboard shortcuts alike.
 */
import { shallowRef } from 'vue';

export interface EditorCommand {
  readonly id: string;
  /** A fixed label, or a function for labels that change (e.g. "Undo Add Node"). */
  readonly label: string | (() => string);
  run(): void | Promise<void>;
  isEnabled?(): boolean;
}

export class CommandRegistry {
  private readonly commands = new Map<string, EditorCommand>();
  /** Bumped on (un)registration, so that computed values listing the commands update. */
  readonly revision = shallowRef(0);

  /** Registers a command; returns a function that unregisters it. */
  register(command: EditorCommand): () => void {
    this.commands.set(command.id, command);
    this.revision.value++;
    return () => {
      if (this.commands.get(command.id) === command) {
        this.commands.delete(command.id);
        this.revision.value++;
      }
    };
  }

  get(id: string): EditorCommand | undefined {
    return this.commands.get(id);
  }

  all(): EditorCommand[] {
    void this.revision.value;
    return [...this.commands.values()];
  }

  isEnabled(id: string): boolean {
    const c = this.commands.get(id);
    return !!c && (!c.isEnabled || c.isEnabled());
  }

  label(id: string): string {
    const l = this.commands.get(id)?.label;
    return typeof l === 'function' ? l() : (l ?? id);
  }

  /** Runs a command if it exists and is enabled. Returns false if it did not run. */
  async run(id: string): Promise<boolean> {
    const command = this.commands.get(id);
    if (!command) {
      console.warn(`Unknown command "${id}"`);
      return false;
    }
    if (command.isEnabled && !command.isEnabled()) return false;
    await command.run();
    return true;
  }
}
