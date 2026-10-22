import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PropArt } from './pixel-props';
import {
  PixelRing,
  fxPalette,
  fromRows,
  paintArrow,
  paintBladeStar,
  paintCursorBrackets,
  paintCursorGem,
  paintExplosion,
  paintFireball,
  paintIceShard,
  paintLightningBolt,
  paintLightPillar,
  paintPrism,
  paintSlash,
  paintSpark,
  paintSpear,
  paintTimeOrb,
} from './pixel-fx';

const ALL: [string, () => PropArt][] = [
  ['arrow', () => paintArrow()],
  ['song arrow', () => paintArrow(true)],
  ['spear', paintSpear],
  ['fireball', paintFireball],
  ['ice shard', paintIceShard],
  ['lightning bolt', paintLightningBolt],
  ['time orb', paintTimeOrb],
  ['prism', paintPrism],
  ['blade star', paintBladeStar],
  ['spark', () => paintSpark()],
  ['slash', () => paintSlash('#38bdf8')],
  ['explosion', () => paintExplosion('#f97316', 12)],
  ['light pillar', () => paintLightPillar('#facc15')],
  ['cursor gem', paintCursorGem],
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

describe('pixel effects', () => {
  it.each(ALL)('paints a %s the same way every time, in whole frames', (_, paint) => {
    const a = paint();
    expect(a.raster.data).toEqual(paint().raster.data);
    expect(a.raster.width).toBe(a.cell[0] * a.frames);
    expect(painted(a, 0)).toBeGreaterThan(4);
  });

  it('draws shots pointing right, so a roll can aim them along their flight', () => {
    for (const art of [
      paintArrow(),
      paintSpear(),
      paintFireball(),
      paintIceShard(),
      paintLightningBolt(),
    ]) {
      const [w, h] = art.cell;
      // The brightest pixels (steel tips, the white-hot core) sit in the right half
      let sum = 0;
      let count = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const [r, g, b] = art.raster.get(x, y);
          if (art.raster.opaque(x, y) && r + g + b > 690) {
            sum += x;
            count++;
          }
        }
      }
      expect(count).toBeGreaterThan(0);
      expect(sum / count).toBeGreaterThan(w / 2);
    }
  });

  it('plays slashes, explosions and pillars out into dither', () => {
    for (const art of [
      paintSlash('#f59e0b'),
      paintExplosion('#ef4444', 10),
      paintLightPillar('#38bdf8'),
    ]) {
      const peak = Math.max(...Array.from({ length: art.frames }, (_, f) => painted(art, f)));
      expect(painted(art, art.frames - 1)).toBeLessThan(peak * 0.75);
    }
  });

  it('tints effects by their game colour, from shadow to white-hot', () => {
    const tones = fxPalette('#38bdf8');
    expect(tones).toHaveLength(5);
    const sum = (t: readonly number[]) => t[0] + t[1] + t[2];
    for (let i = 1; i < tones.length; i++) expect(sum(tones[i])).toBeGreaterThan(sum(tones[i - 1]));
    expect(fxPalette(0x38bdf8)).toEqual(tones);
  });

  it('paints small sprites from character rows', () => {
    const raster = fromRows(['a.', '.b'], { a: 0xff0000, b: 0x0000ff });
    expect(raster.width).toBe(4);
    expect(raster.get(1, 1)).toEqual([255, 0, 0]);
    expect(raster.opaque(2, 1)).toBe(false);
    expect(raster.get(2, 2)).toEqual([0, 0, 255]);
  });

  it('paints cursor brackets as two breathing frames at the board texel size', () => {
    const brackets = paintCursorBrackets(28);
    expect(brackets.width).toBe(56);
    expect(brackets.height).toBe(28);
    expect(brackets.opaque(2, 2) || brackets.opaque(3, 3)).toBe(true);
    // The centre of the tile stays clear
    expect(brackets.opaque(14, 14)).toBe(false);
  });

  it('sizes a pixel ring quad to fit the ring and keeps its settings in uniforms', () => {
    const ring = new PixelRing({ color: 0x38bdf8, pixel: 1 / 28, ground: true });
    ring.setRadius(2, 0.1);
    expect(ring.mesh.scale.x).toBeCloseTo(2.1);
    expect(ring.mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    ring.density = 0.4;
    ring.setArc(1, 2);
    ring.setFill(0.5, 0.3);
    const u = ring.mesh.material.uniforms;
    expect(u['density'].value).toBe(0.4);
    expect(u['arcStart'].value).toBe(1);
    expect(u['arcLength'].value).toBe(2);
    expect(u['fill'].value).toBe(0.5);
    expect(ring.mesh.material.defines).toHaveProperty('GROUND');
    const facing = new PixelRing({ color: new THREE.Color(1, 0, 0), pixel: 0.04 });
    expect(facing.mesh.material.defines).not.toHaveProperty('GROUND');
    ring.dispose();
    facing.dispose();
  });
});
