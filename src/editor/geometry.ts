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

// --- crossings of arrows ("tunnels") ------------------------------------------------------------

/** A straight arrow, for the crossing computation. */
export interface Segment {
  readonly id: number;
  readonly start: Point;
  readonly end: Point;
  /** The nodes the arrow connects: arrows sharing a node only meet next to it, so they never jump. */
  readonly nodes?: readonly [number, number];
}

/**
 * The parameters (t, u in [0, 1]) where segment a1–a2 crosses segment b1–b2, or null if they do not
 * cross. Parallel and collinear segments are treated as not crossing.
 */
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): { t: number; u: number } | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9 * Math.hypot(rx, ry) * Math.hypot(sx, sy) || denom === 0) return null;
  const qx = b1.x - a1.x;
  const qy = b1.y - a1.y;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

export interface CrossingOptions {
  /** Crossings closer than this to either end of either arrow are ignored (they are at the nodes). */
  readonly endMargin: number;
  /**
   * Crossings at a smaller angle (in degrees) are ignored: for nearly parallel arrows a jump
   * does not help, and it would look like a loop.
   */
  readonly minAngle?: number;
}

function shareNode(a: Segment, b: Segment): boolean {
  return !!a.nodes && !!b.nodes && a.nodes.some((n) => b.nodes!.includes(n));
}

/**
 * For every arrow that has to jump over others, the distances (from its start, ascending) at which
 * it crosses them. Of two crossing arrows, the one with the larger ID jumps, so adding a relation
 * never changes how the existing ones are drawn.
 *
 * A sweep over the x-extents keeps this fast for large graphs (only overlapping bounding boxes are
 * tested).
 */
export function computeCrossings(segments: readonly Segment[], options: CrossingOptions): Map<number, number[]> {
  const items = segments.map((s) => ({
    s,
    minX: Math.min(s.start.x, s.end.x),
    maxX: Math.max(s.start.x, s.end.x),
    minY: Math.min(s.start.y, s.end.y),
    maxY: Math.max(s.start.y, s.end.y),
    len: Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y),
  }));
  items.sort((a, b) => a.minX - b.minX);

  const result = new Map<number, number[]>();
  const m = options.endMargin;
  const minSin = Math.sin(((options.minAngle ?? 0) * Math.PI) / 180);
  const active: typeof items = [];
  for (const cur of items) {
    // Drop the segments that end before this one starts (in x).
    for (let i = active.length - 1; i >= 0; i--) if (active[i]!.maxX < cur.minX) active.splice(i, 1);
    for (const other of active) {
      if (other.maxY < cur.minY || cur.maxY < other.minY) continue;
      if (shareNode(cur.s, other.s)) continue;
      const hit = segmentIntersection(cur.s.start, cur.s.end, other.s.start, other.s.end);
      if (!hit) continue;
      const dCur = hit.t * cur.len;
      const dOther = hit.u * other.len;
      // When the non-tunneled line crosses the tunneled one too close to arrowhead and the arc is added, then the
      // arrowhead is put along the arc direction, which is not the direction of the line. This is ugly, so we opt out
      // the arc in this case.
      // In cntrast, if the tunneled line crosses the non-tunneled one close to its (non-tunneled) arrowhead,
      // the arc shall appear.
      // The tunneled arc is the one with larger ID.
      // HINT: for checking both ends, both lines, you can use
      // `if (dCur < m || cur.len - dCur < m || dOther < m || other.len - dOther < m) continue;`
      if (cur.s.id > other.s.id) { // `cur` is tunneled.
        if (cur.len - dCur < m) // Check arrowhead proximity for it.
          continue;
      } else { // `other` s tunneled.
        if (other.len - dOther < m) // Check arrowhead proximity for the second one instead.
          continue;
      }
      if (minSin > 0) {
        const sin = Math.abs(
          (cur.s.end.x - cur.s.start.x) * (other.s.end.y - other.s.start.y) -
            (cur.s.end.y - cur.s.start.y) * (other.s.end.x - other.s.start.x),
        ) / (cur.len * other.len);
        if (sin < minSin) continue;
      }
      const [jumper, d] = cur.s.id > other.s.id ? [cur.s, dCur] : [other.s, dOther];
      let list = result.get(jumper.id);
      if (!list) result.set(jumper.id, (list = []));
      list.push(d);
    }
    active.push(cur);
  }
  for (const list of result.values()) list.sort((a, b) => a - b);
  return result;
}

/**
 * The SVG path of a straight arrow from `start` to `end` that jumps (with a small arc) at the given
 * distances from `start`. Jumps closer than their width merge into one wider arc. The arcs bulge
 * up on the screen (to the left for vertical arrows), so that parallel arrows look alike.
 */
export function jumpPath(start: Point, end: Point, jumps: readonly number[], radius: number): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (jumps.length === 0 || len === 0) return `M${f(start.x)},${f(start.y)}L${f(end.x)},${f(end.y)}`;
  const dx = (end.x - start.x) / len;
  const dy = (end.y - start.y) / len;

  // Merge overlapping jumps into spans [from, to], kept within the segment.
  const spans: [number, number][] = [];
  for (const d of jumps) {
    const from = Math.max(0, d - radius);
    const to = Math.min(len, d + radius);
    const last = spans.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else spans.push([from, to]);
  }

  // Bulge to the screen's "up" side (negative y), or to the left for vertical arrows.
  let bx = dy;
  let by = -dx;
  if (by > 1e-9 || (Math.abs(by) <= 1e-9 && bx > 0)) {
    bx = -bx;
    by = -by;
  }
  const sweep = dx * by - dy * bx < 0 ? 1 : 0;

  const at = (d: number) => `${f(start.x + dx * d)},${f(start.y + dy * d)}`;
  let path = `M${f(start.x)},${f(start.y)}`;
  for (const [from, to] of spans) {
    const r = f((to - from) / 2);
    path += `L${at(from)}A${r},${r} 0 0 ${sweep} ${at(to)}`;
  }
  return path + `L${f(end.x)},${f(end.y)}`;
}
