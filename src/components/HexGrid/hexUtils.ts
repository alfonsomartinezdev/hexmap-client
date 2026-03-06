/**
 * Flat-top hex geometry utilities using offset coordinates (odd-q).
 * q = column, r = row. Odd columns are shifted down by half a hex height.
 * Reference: https://www.redblobgames.com/grids/hexagons/
 */

const SQRT3 = Math.sqrt(3);

export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (3 / 2) * q;
  const y = size * SQRT3 * (r + 0.5 * (q & 1));
  return { x, y };
}

/** Nearest hex center (may be wrong at edges). Use pixelToHexContaining for hit-testing. */
export function pixelToHex(px: number, py: number, size: number): { q: number; r: number } {
  const q = Math.round((2 / 3) * px / size);
  const r = Math.round(py / (size * SQRT3) - 0.5 * (q & 1));
  return { q, r };
}

/** Six neighbors in odd-q offset. Order: E, W, SE, SW, NE, NW (for even q); E, W, SW, NE, NW, SE (odd q). */
function oddQNeighbors(q: number, r: number): [number, number][] {
  if ((q & 1) === 0) {
    return [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1], [q + 1, r + 1], [q - 1, r + 1]];
  }
  return [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1], [q + 1, r - 1], [q - 1, r - 1]];
}

/** Hex (q,r) that contains (px, py), or null if outside grid. Uses point-in-hex for correct edges. */
export function pixelToHexContaining(
  px: number,
  py: number,
  size: number,
  cols: number,
  rows: number
): { q: number; r: number } | null {
  const { q, r } = pixelToHex(px, py, size);
  const candidates: [number, number][] = [[q, r], ...oddQNeighbors(q, r)];
  for (const [cq, cr] of candidates) {
    if (cq < 0 || cq >= cols || cr < 0 || cr >= rows) continue;
    const { x: cx, y: cy } = hexToPixel(cq, cr, size);
    if (pointInHex(px, py, cx, cy, size)) return { q: cq, r: cr };
  }
  return null;
}

/** Corner positions as {x,y} for point-in-polygon. Flat-top: first vertex at 0°. */
export function hexCornerPoints(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angleRad = (Math.PI / 180) * 60 * i;
    points.push({ x: cx + size * Math.cos(angleRad), y: cy + size * Math.sin(angleRad) });
  }
  return points;
}

export function hexCorners(cx: number, cy: number, size: number): string {
  return hexCornerPoints(cx, cy, size).map((p) => `${p.x},${p.y}`).join(' ');
}

/** True if (px, py) is inside the flat-top hex centered at (cx, cy) with given size. */
export function pointInHex(px: number, py: number, cx: number, cy: number, size: number): boolean {
  const corners = hexCornerPoints(cx, cy, size);
  let inside = false;
  const n = corners.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = corners[i].x, yi = corners[i].y;
    const xj = corners[j].x, yj = corners[j].y;
    if (yi === yj) continue; // skip horizontal edge
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export function getGridBounds(
  cols: number,
  rows: number,
  size: number
): { minX: number; minY: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (let q = 0; q < cols; q++) {
    for (let r = 0; r < rows; r++) {
      const { x, y } = hexToPixel(q, r, size);
      if (x - size < minX) minX = x - size;
      if (y - size < minY) minY = y - size;
      if (x + size > maxX) maxX = x + size;
      if (y + size > maxY) maxY = y + size;
    }
  }

  return {
    minX: minX - size * 0.5,
    minY: minY - size * 0.5,
    width: maxX - minX + size,
    height: maxY - minY + size,
  };
}

export function isHexInViewport(
  x: number,
  y: number,
  size: number,
  vx: number,
  vy: number,
  vw: number,
  vh: number
): boolean {
  const margin = size * 2;
  return (
    x + margin >= vx &&
    x - margin <= vx + vw &&
    y + margin >= vy &&
    y - margin <= vy + vh
  );
}
