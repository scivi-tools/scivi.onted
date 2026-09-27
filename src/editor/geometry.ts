/** Pure geometry helpers for drawing the graph. */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function center(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/**
 * The point where the ray from the centre of `rect` towards `target` leaves the rectangle.
 * Returns the centre itself if `target` coincides with it.
 */
export function exitPoint(rect: Rect, target: Point): Point {
  const c = center(rect);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const tx = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * The straight arrow between two boxes, from the border of `from` to the border of `to`.
 * Returns null if the boxes overlap, so that there is no visible segment to draw.
 */
export function arrowBetween(from: Rect, to: Rect): { start: Point; end: Point } | null {
  if (rectsOverlap(from, to)) return null;
  return { start: exitPoint(from, center(to)), end: exitPoint(to, center(from)) };
}

/** Bounding box of the given rectangles, or null if there are none. */
export function boundingBox(rects: Iterable<Rect>): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
