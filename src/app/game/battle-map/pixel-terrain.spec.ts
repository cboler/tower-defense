import { describe, expect, it } from 'vitest';
import { TileCode } from '../../core/models/map.model';
import {
  Raster,
  SIDE_ATLAS_ROWS,
  SIDE_ROWS,
  TERRAIN_TEXELS,
  paintBoard,
  paintSides,
  sideBand,
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
