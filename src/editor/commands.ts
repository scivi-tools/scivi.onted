/**
 * The command registry: every user action is defined here once (ID, label, handler) and invoked
 * by ID from the main menu, the context menus, and the keyboard shortcuts alike.
 */
export interface EditorCommand {
  readonly id: string;
  readonly label: string;
  run(): void | Promise<void>;
  isEnabled?(): boolean;
}

export class CommandRegistry {
  private readonly commands = new Map<string, EditorCommand>();

  /** Registers a command; returns a function that unregisters it. */
  register(command: EditorCommand): () => void {
    this.commands.set(command.id, command);
    return () => {
      if (this.commands.get(command.id) === command) this.commands.delete(command.id);
    };
  }

  get(id: string): EditorCommand | undefined {
    return this.commands.get(id);
  }

  async run(id: string): Promise<void> {
    const command = this.commands.get(id);
    if (!command) {
      console.warn(`Unknown command "${id}"`);
      return;
    }
    if (command.isEnabled && !command.isEnabled()) return;
    await command.run();
  }
}
