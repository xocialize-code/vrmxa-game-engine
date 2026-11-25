// Rectangle select's maths (M5 W5, AB-T-0604), plain functions tested in Node. ⌘-drag (Ctrl-drag elsewhere) in the
// viewport draws a rectangle; a node is picked when all of it on screen lies inside (a window select): the screen box of
// its world bounds, or its origin for a node with nothing to draw (a light, a camera, a marker). A node partly behind
// the camera isn't picked. ⇧ adds to the selection.

/** The rectangle two corners span (pixels, any order): { left, top, right, bottom }. */
export function normRect(x0, y0, x1, y1) {
  return { left: Math.min(x0, x1), top: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) };
}

/** Big enough to be a rectangle and not a click (pixels on either side). */
export function isDrag(r, min = 4) { return r.right - r.left >= min || r.bottom - r.top >= min; }

/**
 * Screen bounds of projected points, or null when any is behind the camera.
 * @param {{ x: number, y: number, behind: boolean }[]} points in pixels
 */
export function screenBox(points) {
  if (!points.length || points.some((p) => p.behind)) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/**
 * The ids of the items wholly inside the rectangle.
 * @param {{ left: number, top: number, right: number, bottom: number }} rect
 * @param {{ id: string, box: { left: number, top: number, right: number, bottom: number } | null }[]} items
 */
export function rectSelect(rect, items) {
  return items.filter(({ box }) => box && box.left >= rect.left && box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom).map((i) => i.id);
}
