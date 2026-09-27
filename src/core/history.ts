import type { Command } from './commands';
import type { Ontology } from './model';

/** Undo/redo stacks, plus tracking of the state that was last saved. */
export class History {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  /**
   * Depth of the undo stack at the moment of the last save; `null` if that state
   * can no longer be reached (e.g. it was undone and then something else was done).
   */
  private savedDepth: number | null = 0;

  execute(ont: Ontology, command: Command): void {
    command.apply(ont);
    if (this.savedDepth !== null && this.savedDepth > this.undoStack.length) this.savedDepth = null;
    this.undoStack.push(command);
    this.redoStack.length = 0;
  }

  undo(ont: Ontology): Command | undefined {
    const c = this.undoStack.pop();
    if (c) {
      c.revert(ont);
      this.redoStack.push(c);
    }
    return c;
  }

  redo(ont: Ontology): Command | undefined {
    const c = this.redoStack.pop();
    if (c) {
      c.apply(ont);
      this.undoStack.push(c);
    }
    return c;
  }

  get nextUndo(): Command | undefined {
    return this.undoStack.at(-1);
  }

  get nextRedo(): Command | undefined {
    return this.redoStack.at(-1);
  }

  markSaved(): void {
    this.savedDepth = this.undoStack.length;
  }

  get isModified(): boolean {
    return this.savedDepth !== this.undoStack.length;
  }
}
