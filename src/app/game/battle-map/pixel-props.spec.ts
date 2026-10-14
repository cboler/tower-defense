import { describe, expect, it } from 'vitest';
import {
  CRYSTAL_PALETTES,
  INK,
  PropArt,
  paintBush,
  paintCloud,
  paintCrystals,
  paintDais,
  paintGate,
  paintGem,
  paintMonolith,
  paintPine,
  paintRock,
  paintRoundTree,
  paintSky,
  paintSkyIsland,
  paintVoidOrb,
} from './pixel-props';

const ALL: [string, () => PropArt][] = [
  ['pine', () => paintPine(1)],
  ['round tree', () => paintRoundTree(2, 'blossom')],
  ['bush', () => paintBush(3)],
  ['rock', () => paintRock(4)],
  ['monolith', () => paintMonolith(5)],
  ['crystals', () => paintCrystals(6, 'ember')],
  ['gate', () => paintGate()],
  ['void orb', () => paintVoidOrb()],
  ['dais', () => paintDais()],
  [
    'gem',
    () =>
      paintGem({
        sides: 6,
        radius: 7,
        top: 14,
        bottom: 9,
        palette: CRYSTAL_PALETTES.altar,
        frames: 8,
        duration: 1,
      }),
  ],
  ['sky island', () => paintSkyIsland(1)],
  ['cloud', () => paintCloud(2)],
];

/** Opaque pixels in one frame of a strip. */
function painted(art: PropArt, frame: number): number {
  const [w, h] = art.cell;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (art.raster.opaque(frame * w + x, y)) count++;
  }
  return count;
}

describe('pixel props', () => {
  it.each(ALL)('paints a %s the same way every time, in whole frames', (_, paint) => {
    const a = paint();
    const b = paint();
    expect(a.raster.data).toEqual(b.raster.data);
    expect(a.raster.width).toBe(a.cell[0] * a.frames);
    expect(a.raster.height).toBe(a.cell[1]);
    for (let f = 0; f < a.frames; f++) expect(painted(a, f)).toBeGreaterThan(40);
    // The anchor sits inside the frame
    expect(a.anchor[0]).toBeGreaterThan(0);
    expect(a.anchor[0]).toBeLessThan(a.cell[0]);
    expect(a.anchor[1]).toBeLessThanOrEqual(a.cell[1]);
  });

  it.each(ALL)('keeps a %s clear of its frame edges, so nothing is clipped', (_, paint) => {
    const art = paint();
    const [w, h] = art.cell;
    for (let f = 0; f < art.frames; f++) {
      for (let y = 0; y < h; y++) {
        expect(art.raster.opaque(f * w, y)).toBe(false);
        expect(art.raster.opaque(f * w + w - 1, y)).toBe(false);
      }
      for (let x = 0; x < w; x++) expect(art.raster.opaque(f * w + x, 0)).toBe(false);
    }
  });

  it('outlines trees in ink and sways their crowns but not their trunks', () => {
    const pine = paintPine(7);
    const [w, h] = pine.cell;
    let ink = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = pine.raster.get(x, y);
        if (pine.raster.opaque(x, y) && r === INK[0] && g === INK[1] && b === INK[2]) ink++;
      }
    }
    expect(ink).toBeGreaterThan(60);
    const row = (frame: number, y: number) =>
      Array.from({ length: w }, (_, x) => pine.raster.opaque(frame * w + x, y));
    // Frame 1 leans: the top differs from frame 0, the trunk's foot doesn't
    expect(row(1, 6)).not.toEqual(row(0, 6));
    expect(row(1, pine.anchor[1] - 1)).toEqual(row(0, pine.anchor[1] - 1));
  });

  it('turns the gem a facet through its frames, every frame different', () => {
    const gem = paintGem({
      sides: 6,
      radius: 7,
      top: 14,
      bottom: 9,
      palette: CRYSTAL_PALETTES.altar,
      frames: 4,
      duration: 1,
    });
    const [w, h] = gem.cell;
    const frame = (f: number) => {
      const pixels: number[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) pixels.push(...gem.raster.get(f * w + x, y));
      }
      return pixels;
    };
    expect(frame(1)).not.toEqual(frame(0));
    expect(frame(2)).not.toEqual(frame(1));
  });

  it('paints a sky darker overhead than low down, with stars', () => {
    const sky = paintSky(64, 36);
    const luma = (y: number) => {
      let sum = 0;
      for (let x = 0; x < 64; x++) sum += sky.get(x, y).reduce((a, c) => a + c, 0);
      return sum / 64;
    };
    expect(luma(2)).toBeLessThan(luma(24));
    for (let i = 3; i < sky.data.length; i += 4) expect(sky.data[i]).toBe(255);
  });
});
