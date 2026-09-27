/** Sizes of the node boxes, derived from the text of their names. */
import type { Rect } from './geometry';

export const NODE_FONT = '13px system-ui, -apple-system, "Segoe UI", Ubuntu, sans-serif';
export const NODE_HEIGHT = 26;
export const NODE_PADDING_X = 10;
export const NODE_MIN_WIDTH = 40;

let context: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

export function textWidth(text: string): number {
  let w = cache.get(text);
  if (w === undefined) {
    context ??= document.createElement('canvas').getContext('2d');
    if (context) {
      context.font = NODE_FONT;
      w = context.measureText(text).width;
    } else {
      w = text.length * 7;
    }
    cache.set(text, w);
  }
  return w;
}

/** The box of a node whose top-left corner is at (x, y). */
export function nodeBox(name: string, x: number, y: number): Rect {
  const width = Math.max(NODE_MIN_WIDTH, Math.ceil(textWidth(name)) + 2 * NODE_PADDING_X);
  return { x, y, width, height: NODE_HEIGHT };
}
