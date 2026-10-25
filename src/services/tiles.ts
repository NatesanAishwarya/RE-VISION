export type Tile = { x: number; y: number; w: number; h: number };

export const TILE_MIN = 300, TILE_MAX = 640, TILE_OVERLAP = 0.25, MAX_TILES = 30;

/**
 * Overlapping, roughly square tiles covering the image. COCO-SSD squashes its input to
 * ~300x300, so a person in a 4000px group photo is a few pixels wide. Tiles keep people large.
 */
export function makeTiles(width: number, height: number): Tile[] {
  let size = Math.min(TILE_MAX, Math.max(TILE_MIN, Math.round(Math.min(width, height) / 2)));
  const build = (s: number): Tile[] => {
    const tw = Math.min(s, width), th = Math.min(s, height);
    const stride = (n: number) => Math.max(1, Math.round(n * (1 - TILE_OVERLAP)));
    const xs = starts(width, tw, stride(tw)), ys = starts(height, th, stride(th));
    return ys.flatMap((y) => xs.map((x) => ({ x, y, w: tw, h: th })));
  };
  let tiles = build(size);
  while (tiles.length > MAX_TILES && size < Math.max(width, height)) { size = Math.round(size * 1.25); tiles = build(size); }
  return tiles;
}

function starts(total: number, tile: number, stride: number): number[] {
  if (tile >= total) return [0];
  const out: number[] = [];
  for (let p = 0; p + tile < total; p += stride) out.push(p);
  out.push(total - tile); // last tile flush with the edge
  return out;
}

/** True if a box (in tile coordinates) is cut by a tile edge that is not the image edge. */
export function touchesInteriorEdge(
  b: { x: number; y: number; width: number; height: number }, t: Tile, imgW: number, imgH: number, margin = 3,
): boolean {
  return (
    (t.x > 0 && b.x < margin) ||
    (t.y > 0 && b.y < margin) ||
    (t.x + t.w < imgW && b.x + b.width > t.w - margin) ||
    (t.y + t.h < imgH && b.y + b.height > t.h - margin)
  );
}
