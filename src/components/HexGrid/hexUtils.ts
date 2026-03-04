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

export function pixelToHex(px: number, py: number, size: number): { q: number; r: number } {
  const q = Math.round((2 / 3) * px / size);
  const r = Math.round(py / (size * SQRT3) - 0.5 * (q & 1));
  return { q, r };
}

export function hexCorners(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    points.push(
      `${cx + size * Math.cos(angleRad)},${cy + size * Math.sin(angleRad)}`
    );
  }
  return points.join(' ');
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
