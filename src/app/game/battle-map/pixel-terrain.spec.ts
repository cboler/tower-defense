import { describe, expect, it } from 'vitest';
import { TileCode } from '../../core/models/map.model';
import {
  CLIFF_TILES_DEEP,
  CLIFF_TILES_WIDE,
  Raster,
  SIDE_ATLAS_ROWS,
  SIDE_ROWS,
  TERRAIN_TEXELS,
  paintBoard,
  paintCliff,
  paintSides,
  sideBand,
  withRim,
} from './pixel-terrain';

const T = TERRAIN_TEXELS;
const BOARD: TileCode[][] = [
  ['B', 'B', 'B'],
  ['P', 'P', 'M'],
  ['B', 'O', 'S'],
];

const brightness = (raster: Raster, x: number, y: number) =>
  raster.get(x, y).reduce((sum, channel) => sum + channel, 0);

/** Mean brightness of a row of texels inside one cell. */
function rowBrightness(raster: Raster, c: number, r: number, y: number): number {
  let total = 0;
  for (let x = 2; x < T - 2; x++) total += brightness(raster, c * T + x, r * T + y);
  return total / (T - 4);
}

describe('pixel terrain', () => {
  it('paints the whole board deterministically, one cell per tile', () => {
    const a = paintBoard(BOARD);
    const b = paintBoard(BOARD);
    expect(a.color.width).toBe(3 * T);
    expect(a.color.height).toBe(3 * T);
    expect(a.color.data).toEqual(b.color.data);
    // Every texel is painted opaque
    for (let i = 3; i < a.color.data.length; i += 4) expect(a.color.data[i]).toBe(255);
  });

  it('lights a meadow rim where it drops to the road and shades the road beneath it', () => {
    const { color } = paintBoard(BOARD);
    // Meadow (0,0) sits above road (0,1): its south rim is the brightest row of the cell
    const rim = rowBrightness(color, 0, 0, T - 1);
    const middle = rowBrightness(color, 0, 0, T / 2);
    expect(rim).toBeGreaterThan(middle);
    // The road's north edge lies in the meadow's shade; with road above instead it doesn't
    const open = paintBoard([['P', 'P', 'P'], ...BOARD.slice(1)]).color;
    expect(rowBrightness(color, 1, 1, 0)).toBeCloseTo(rowBrightness(open, 1, 1, 0) * 0.62, -1);
    expect(rowBrightness(color, 1, 1, T / 2)).toBeCloseTo(rowBrightness(open, 1, 1, T / 2));
  });

  it('makes only runes, the portal sigil and lava glow', () => {
    const { glow } = paintBoard(BOARD);
    const lit = (c: number, r: number) => {
      let count = 0;
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) if (brightness(glow, c * T + x, r * T + y) > 0) count++;
      }
      return count;
    };
    expect(lit(0, 0)).toBe(0);
    expect(lit(0, 1)).toBe(0);
    expect(lit(2, 1)).toBeGreaterThan(20);
    expect(lit(2, 2)).toBeGreaterThan(20);
    expect(lit(1, 2)).toBeGreaterThan(20);
  });

  it('frames the board with wild rim ground, a step below the meadows', () => {
    const rim = withRim(BOARD, 1);
    expect(rim.length).toBe(5);
    expect(rim[0].every((g) => g === 'R')).toBe(true);
    expect(rim[2].slice(1, 4)).toEqual(BOARD[1]);
    const framed = paintBoard(BOARD, 1);
    expect(framed.color.width).toBe(5 * T);
    // Map tile (c, r) moves to cell (c + 1, r + 1)
    expect(framed.color.get(3 * T + 5, 3 * T + 9)).toEqual(
      paintBoard(BOARD).color.get(2 * T + 5, 2 * T + 9),
    );
    // The meadow lights its lip where it steps down to the rim
    expect(rowBrightness(framed.color, 1, 1, 0)).toBeGreaterThan(
      rowBrightness(framed.color, 1, 1, T / 2),
    );
  });

  it('paints a cliff that repeats sideways without a seam', () => {
    const { color, glow } = paintCliff();
    expect(color.width).toBe(CLIFF_TILES_WIDE * T);
    expect(color.height).toBe(CLIFF_TILES_DEEP * T);
    // Neighbouring columns across the wrap differ about as much as any neighbours do
    const diff = (a: number, b: number) => {
      let sum = 0;
      for (let y = 0; y < color.height; y++) {
        const [p, q] = [color.get(a, y), color.get(b, y)];
        sum += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
      }
      return sum / color.height;
    };
    expect(diff(color.width - 1, 0)).toBeLessThan(diff(40, 41) * 2.5 + 10);
    for (let i = 3; i < glow.data.length; i += 4) expect(glow.data[i]).toBe(255);
  });

  it('gives every tile kind its own band of wall, meadows topped with grass', () => {
    const walls = paintSides();
    expect(walls.height).toBe(SIDE_ATLAS_ROWS);
    const kinds: TileCode[] = ['B', 'P', 'C', 'M', 'S', 'O'];
    expect(new Set(kinds.map(sideBand)).size).toBe(kinds.length);
    // Grass greens over the soil of the meadow band
    const [r, g] = walls.get(5, sideBand('B') * SIDE_ROWS);
    expect(g).toBeGreaterThan(r);
    const [sr, sg] = walls.get(5, sideBand('B') * SIDE_ROWS + 8);
    expect(sr).toBeGreaterThan(sg);
  });
});
