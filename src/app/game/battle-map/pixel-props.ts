import { RGB, Raster, dither, hash, noise, rgb, scale } from './pixel-terrain';

/*
 * HD-2D scenery painted in code as pixel-art sprites, in the baked characters' style: a few
 * flat tones per material lit from the upper left, ordered dithering between them and a 1px ink
 * outline. Each prop is a strip of frames (a breeze, a glint, a turning crystal) at the
 * characters' 36 pixels per tile, so scenery and pieces share one pixel grid.
 */

/** Ink of the 1px outline, shared with the baked characters. */
export const INK = rgb(0x1a1424);

/** A painted prop: frames side by side, left to right. */
export interface PropArt {
  raster: Raster;
  /** Frame size in pixels. */
  cell: [number, number];
  /** Where the prop meets the ground, in pixels from a frame's top-left. */
  anchor: [number, number];
  frames: number;
  /** Seconds for one loop of the frames. */
  duration: number;
}

export type Foliage = 'green' | 'blossom' | 'autumn';

const PINE = [0x0f2420, 0x163a2e, 0x1e5137, 0x2b6a40, 0x3f8649, 0x66a85a].map(rgb);
const LEAVES: Record<Foliage, RGB[]> = {
  green: [0x123020, 0x1b4626, 0x285f2c, 0x3b7c33, 0x56993f, 0x86bd55].map(rgb),
  blossom: [0x4d1f3d, 0x7d3360, 0xb2517f, 0xd97ba0, 0xf3a9c4, 0xffd8e6].map(rgb),
  autumn: [0x4a1c12, 0x7a2f16, 0xa8481c, 0xd06d25, 0xeb9a3a, 0xf9c867].map(rgb),
};
const BARK = [0x3b2416, 0x5a3820, 0x7a5030, 0x98683e].map(rgb);
const STONE = [0x262836, 0x383b4b, 0x4f5366, 0x6a7085, 0x8c93a6].map(rgb);
const MOSS = [0x2f5428, 0x3f6b34, 0x5b8a3e].map(rgb);
const RUNE_GLOW = [0x2fb6d6, 0x7ff3ff, 0xe6ffff].map(rgb);
const OBSIDIAN = [0x161028, 0x241a40, 0x34285a, 0x4a3b7a, 0x6754a0].map(rgb);
const SIGIL_GLOW = [0x7d4cd6, 0xc39bff, 0xf3e8ff].map(rgb);
const BERRIES = [0xd94a4a, 0xf2e6a2, 0xb9d8ff].map(rgb);

export const CRYSTAL_PALETTES = {
  cyan: [0x0d2c4a, 0x174d7a, 0x2478b0, 0x3fa8dc, 0x86dcf6, 0xe4fbff].map(rgb),
  violet: [0x23123f, 0x3c2170, 0x5b37a6, 0x8762d8, 0xbfa2f6, 0xf6efff].map(rgb),
  ember: [0x3a0f0a, 0x6b1d10, 0xa83518, 0xe0621f, 0xffa040, 0xfff0b0].map(rgb),
  altar: [0x0e3a5f, 0x1b6aa0, 0x2f9bd6, 0x5fcdf3, 0xa9efff, 0xf4feff].map(rgb),
};
export type CrystalHue = keyof typeof CRYSTAL_PALETTES;

/** Light from the upper left and a little toward the viewer (x right, y up, z out). */
const LIGHT = normalise([-0.5, 0.62, 0.6]);

function normalise(v: number[]): [number, number, number] {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** Lambert light in -1..1 on a ball of radius r, (dx, dy) pixels from its centre; null outside. */
export function ballLight(dx: number, dy: number, r: number): number | null {
  const nx = dx / r;
  const ny = -dy / r;
  const nz2 = 1 - nx * nx - ny * ny;
  if (nz2 < 0) return null;
  return nx * LIGHT[0] + ny * LIGHT[1] + Math.sqrt(nz2) * LIGHT[2];
}

/** A palette tone for light in 0..1, dithered across the steps. */
export function ramp(
  palette: readonly RGB[],
  light: number,
  x: number,
  y: number,
  spread = 0.5,
): RGB {
  const t = light * palette.length + dither(x, y) * spread;
  return palette[Math.max(0, Math.min(palette.length - 1, Math.floor(t)))];
}

/** Wraps everything painted in a 1px outline. */
export function outline(raster: Raster, ink: RGB = INK): void {
  const edge: number[] = [];
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      if (raster.opaque(x, y)) continue;
      if (
        raster.opaque(x - 1, y) ||
        raster.opaque(x + 1, y) ||
        raster.opaque(x, y - 1) ||
        raster.opaque(x, y + 1)
      ) {
        edge.push(x, y);
      }
    }
  }
  for (let i = 0; i < edge.length; i += 2) raster.set(edge[i], edge[i + 1], ink);
}

/** Copies `from` onto `to` with its top-left at (ox, oy), skipping empty pixels. */
export function blit(to: Raster, from: Raster, ox: number, oy: number): void {
  for (let y = 0; y < from.height; y++) {
    for (let x = 0; x < from.width; x++) {
      if (from.opaque(x, y)) to.set(ox + x, oy + y, from.get(x, y));
    }
  }
}

/** Lays frames side by side in one strip. */
export function strip(frames: Raster[], anchor: [number, number], duration: number): PropArt {
  const [first] = frames;
  const raster = new Raster(first.width * frames.length, first.height);
  frames.forEach((frame, i) => blit(raster, frame, i * first.width, 0));
  return {
    raster,
    cell: [first.width, first.height],
    anchor,
    frames: frames.length,
    duration,
  };
}

/** The first frame of a prop on its own, for painting it into a bigger scene. */
export function firstFrame(art: PropArt): Raster {
  const [w, h] = art.cell;
  const out = new Raster(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (art.raster.opaque(x, y)) out.set(x, y, art.raster.get(x, y));
  }
  return out;
}

/** Leans the rows above `ground` sideways, more toward the top, as if in a breeze. */
function sway(base: Raster, amount: number, ground: number, height: number): Raster {
  const out = new Raster(base.width, base.height);
  for (let y = 0; y < base.height; y++) {
    const lift = Math.max(0, (ground - y) / height);
    const shift = Math.round(amount * lift ** 1.6);
    for (let x = 0; x < base.width; x++) {
      if (base.opaque(x - shift, y)) out.set(x, y, base.get(x - shift, y));
    }
  }
  return out;
}

/** Breeze frames for a tree: still, lean, still, lean back; each outlined. */
function breeze(base: Raster, ground: number, height: number, duration: number): PropArt {
  const frames = [0, 1, 0, -1].map((amount) => {
    const frame = sway(base, amount, ground, height);
    outline(frame);
    return frame;
  });
  return strip(frames, [Math.floor(base.width / 2), ground + 1], duration);
}

function paintTrunk(out: Raster, cx: number, ground: number, height: number, width: number): void {
  const left = Math.round(cx - width / 2);
  for (let y = ground - height; y <= ground; y++) {
    for (let i = 0; i < width; i++) {
      const tone = i === 0 ? 2 : i === width - 1 ? 0 : i === 1 && width > 3 ? 2 : 1;
      const knot = hash(left + i, y, 3) < 0.12 ? -1 : 0;
      out.set(left + i, y, BARK[Math.max(0, tone + knot)]);
    }
  }
  // Roots flare where the trunk meets the ground
  out.set(left - 1, ground, BARK[1]);
  out.set(left + width, ground, BARK[0]);
}

/** A conifer of stacked, drooping tiers, lit on the left. */
export function paintPine(seed: number, height = 62): PropArt {
  const w = 40;
  const h = height + 6;
  const ground = h - 3;
  const cx = w / 2;
  const base = new Raster(w, h);
  paintTrunk(base, cx, ground, 13, 4);
  const top = ground - height;
  const bottom = ground - 9;
  const span = bottom - top;
  const tiers = height > 70 ? 5 : 4;
  const bottoms = Array.from({ length: tiers }, (_, i) => bottom - i * span * (0.84 / tiers));
  for (let i = 0; i < tiers; i++) {
    const tierBottom = bottoms[i];
    const tierTop = i === tiers - 1 ? top : tierBottom - span * 0.44;
    const halfBase = 17 * (1 - i * (0.75 / tiers));
    for (let y = Math.floor(tierTop); y <= tierBottom + 2; y++) {
      const t = Math.min(1, (y - tierTop) / (tierBottom - tierTop));
      const half = halfBase * Math.max(0, t) ** 0.85 + (hash(y, i, seed) - 0.5) * 1.4;
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - cx;
        if (Math.abs(dx) > half) continue;
        // Drooping bough tips along the tier's lower edge, shorter toward its ends
        const tooth = Math.abs(dx) > half - 2 ? 0 : [0, 1, 3, 1][(x + i * 2 + seed) & 3];
        if (y > tierBottom - 1 + tooth) continue;
        const u = dx / Math.max(1, half);
        let light = 0.62 - 0.38 * u - 0.3 * t + (noise(x, y, 2.5, seed + i) - 0.5) * 0.4;
        // The tier above shades the top of this one
        const above = bottoms[i + 1];
        if (above !== undefined && y > above - 1 && y < above + 4) light -= 0.3;
        base.set(x, y, ramp(PINE, light, x, y, 0.6));
      }
    }
  }
  return breeze(base, ground, height, 2.8 + hash(seed, 1, 2) * 0.8);
}

interface Clump {
  x: number;
  y: number;
  r: number;
}

/**
 * Paints overlapping leafy balls: each shaded as a ball and as part of the whole crown, with
 * scalloped edges and a 2x2 leaf texture. Lower clumps overlap higher ones.
 */
function paintClumps(
  out: Raster,
  clumps: Clump[],
  crown: Clump,
  palette: readonly RGB[],
  seed: number,
): void {
  for (const clump of [...clumps].sort((a, b) => a.y - b.y)) {
    const reach = Math.ceil(clump.r + 1);
    for (let y = Math.floor(clump.y - reach); y <= clump.y + reach; y++) {
      for (let x = Math.floor(clump.x - reach); x <= clump.x + reach; x++) {
        const dx = x + 0.5 - clump.x;
        const dy = y + 0.5 - clump.y;
        const r = clump.r + (hash(x, y, seed) - 0.5) * 1.6;
        const own = ballLight(dx, dy, r);
        if (own === null) continue;
        const whole =
          ballLight((x + 0.5 - crown.x) * 0.9, (y + 0.5 - crown.y) * 0.9, crown.r + 4) ?? -0.4;
        const leaf = (hash(x >> 1, y >> 1, seed + 5) - 0.5) * 0.3;
        // Each clump's underside falls into shade, which separates it from the next
        const under = own < -0.05 ? 0.12 : 0;
        const light = 0.4 + 0.42 * own + 0.28 * whole + leaf - under;
        out.set(x, y, ramp(palette, light, x, y, 0.55));
      }
    }
  }
}

/** A broadleaf tree with a round crown of leafy clumps on a forked trunk. */
export function paintRoundTree(seed: number, foliage: Foliage = 'green'): PropArt {
  const w = 48;
  const h = 58;
  const ground = h - 3;
  const cx = w / 2;
  const base = new Raster(w, h);
  paintTrunk(base, cx, ground, 20, 5);
  // Two limbs fork up into the crown
  for (let i = 0; i < 9; i++) {
    base.set(Math.round(cx - 2 - i * 0.7), ground - 16 - i, BARK[2]);
    base.set(Math.round(cx - 3 - i * 0.7), ground - 16 - i, BARK[1]);
    base.set(Math.round(cx + 2 + i * 0.6), ground - 15 - i, BARK[1]);
    base.set(Math.round(cx + 3 + i * 0.6), ground - 15 - i, BARK[0]);
  }
  const crown: Clump = { x: cx, y: ground - 34, r: 15 };
  const clumps: Clump[] = [{ x: crown.x, y: crown.y, r: 12 }];
  const lobes = 7;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + hash(seed, i, 6) * 0.5;
    clumps.push({
      x: crown.x + Math.cos(a) * 12,
      y: crown.y + Math.sin(a) * 9,
      r: 7 + hash(seed, i, 7) * 2.5,
    });
  }
  clumps.push(
    { x: crown.x - 5, y: crown.y + 10, r: 7 },
    { x: crown.x + 6, y: crown.y + 9, r: 6.5 },
  );
  paintClumps(base, clumps, crown, LEAVES[foliage], seed);
  return breeze(base, ground, 40, 3.2 + hash(seed, 2, 2) * 0.8);
}

/** A low shrub; now and then with berries or blooms. */
export function paintBush(seed: number, foliage: Foliage = 'green'): PropArt {
  const w = 32;
  const h = 19;
  const ground = h - 2;
  const out = new Raster(w, h);
  const count = 3 + Math.floor(hash(seed, 0, 8) * 2);
  const clumps: Clump[] = [];
  for (let i = 0; i < count; i++) {
    const r = 4.5 + hash(seed, i, 9) * 2.5;
    clumps.push({ x: 10 + (i / Math.max(1, count - 1)) * 12, y: ground - r + 1.5, r });
  }
  clumps.push({ x: w / 2, y: ground - 8, r: 6 });
  paintClumps(out, clumps, { x: w / 2, y: ground - 6, r: 9 }, LEAVES[foliage], seed);
  if (hash(seed, 1, 10) < 0.5) {
    const berry = BERRIES[Math.floor(hash(seed, 2, 10) * BERRIES.length)];
    for (let i = 0; i < 4; i++) {
      const x = 8 + Math.floor(hash(seed, i, 11) * 16);
      const y = ground - 3 - Math.floor(hash(i, seed, 12) * 8);
      if (out.opaque(x, y)) out.set(x, y, berry);
    }
  }
  outline(out);
  return strip([out], [w / 2, ground + 1], 1);
}

/** A mossy boulder or two. */
export function paintRock(seed: number): PropArt {
  const w = 24;
  const h = 18;
  const ground = h - 2;
  const out = new Raster(w, h);
  const lumps = [
    { x: 11, y: ground - 5, r: 6.5 + hash(seed, 0, 13) * 1.5 },
    { x: 17, y: ground - 3, r: 3.5 + hash(seed, 1, 13) * 1.5 },
  ];
  for (const lump of lumps) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - lump.x;
        const dy = (y + 0.5 - lump.y) / 0.78;
        const r = lump.r + (hash(x, y, seed + 14) - 0.5) * 0.9;
        const light = ballLight(dx, dy, r);
        if (light === null || y > ground) continue;
        const top = -dy / r;
        const mossy = top > 0.35 && noise(x, y, 3, seed + 15) > 0.45;
        out.set(
          x,
          y,
          mossy ? ramp(MOSS, 0.4 + light * 0.5, x, y) : ramp(STONE, 0.45 + light * 0.5, x, y),
        );
      }
    }
  }
  outline(out);
  return strip([out], [w / 2, ground + 1], 1);
}

const GLYPHS = [
  [0b010, 0b111, 0b010, 0b010],
  [0b101, 0b010, 0b101, 0b000],
  [0b111, 0b100, 0b111, 0b001],
  [0b010, 0b101, 0b010, 0b101],
  [0b110, 0b011, 0b110, 0b010],
];

/**
 * A standing stone seen a little from the side: a lit front face, a darker side and a pale top,
 * carved with glyphs that pulse with light.
 */
function paintStandingStone(
  seed: number,
  w: number,
  stoneHeight: number,
  front: [number, number],
  palette: readonly RGB[],
  glow: readonly RGB[],
  pulse: number,
  out: Raster,
  ground: number,
  lean = 0,
): void {
  const [left, frontWidth] = front;
  const side = 3;
  for (let y = ground - stoneHeight - 3; y <= ground; y++) {
    const fromTop = y - (ground - stoneHeight);
    const taper = Math.floor((stoneHeight - Math.max(0, fromTop)) / 16);
    const shift = Math.round(lean * (1 - Math.max(0, fromTop) / stoneHeight));
    const l = left + shift + (taper > 1 ? 1 : 0);
    const r = left + shift + frontWidth - taper;
    // Chipped crown: each column ends at its own height
    for (let x = l; x < r + side; x++) {
      const crown = ground - stoneHeight + Math.floor(hash(x, seed, 16) * 3);
      if (y < crown - (x >= r ? 1 : 0)) continue;
      let tone: RGB;
      if (y < crown + 2 && x < r) tone = palette[4];
      else if (x >= r) tone = palette[1];
      else tone = ramp(palette, 0.72 - ((x - l) / (r - l)) * 0.25, x, y, 0.4);
      if (hash(x, y, seed + 17) < 0.05) tone = scale(tone, 0.8);
      out.set(x, y, tone);
    }
    // Moss creeps up from the ground in ragged tongues
    for (let x = l; x < r + side; x++) {
      const reach = 1 + noise(x, 0, 2.5, seed) * 6;
      if (ground - y < reach && out.opaque(x, y) && hash(x, y, seed) < 0.6) {
        out.set(x, y, MOSS[ground - y < reach - 1.5 ? 1 : x < r ? 2 : 0]);
      }
    }
  }
  // Glyphs down the front face
  const glyphColour = (bit: boolean) => (bit ? glow[pulse] : null);
  for (let g = 0, y = ground - stoneHeight + 6; y < ground - 9; g++, y += 7) {
    const glyph = GLYPHS[Math.floor(hash(seed, g, 18) * GLYPHS.length)];
    const gx = left + Math.floor((frontWidth - 3) / 2);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        const colour = glyphColour(((glyph[row] >> (2 - col)) & 1) === 1);
        if (colour) out.set(gx + col, y + row, colour);
      }
    }
  }
}

/** A carved runestone whose glyphs breathe with light. */
export function paintMonolith(seed: number): PropArt {
  const w = 22;
  const h = 52;
  const ground = h - 3;
  const height = 38 + Math.floor(hash(seed, 0, 19) * 8);
  const frames = [0, 1, 2, 1].map((pulse) => {
    const out = new Raster(w, h);
    paintStandingStone(seed, w, height, [6, 10], STONE, RUNE_GLOW, pulse, out, ground);
    outline(out);
    return out;
  });
  return strip(frames, [11, ground + 1], 2.4);
}

/** The spawn rift's gate: two leaning obsidian pillars carved with violet sigils. */
export function paintGate(): PropArt {
  const w = 44;
  const h = 50;
  const ground = h - 3;
  const frames = [0, 1, 2, 1].map((pulse, frame) => {
    const out = new Raster(w, h);
    paintStandingStone(4, w, 34, [5, 7], OBSIDIAN, SIGIL_GLOW, pulse, out, ground, 2);
    paintStandingStone(9, w, 32, [30, 7], OBSIDIAN, SIGIL_GLOW, pulse, out, ground, -2);
    // Broken capstones float above, bobbing a pixel
    const bob = frame === 1 ? -1 : frame === 3 ? 1 : 0;
    for (const [x, y, len] of [
      [8, ground - 41, 7],
      [18, ground - 44 + bob, 6],
      [29, ground - 40 - bob, 7],
    ]) {
      for (let i = 0; i < len; i++) {
        out.set(x + i, y, OBSIDIAN[4]);
        out.set(x + i, y + 1, OBSIDIAN[2]);
        out.set(x + i, y + 2, OBSIDIAN[1]);
      }
      out.set(x + Math.floor(len / 2), y + 1, SIGIL_GLOW[pulse]);
    }
    outline(out);
    return out;
  });
  return strip(frames, [w / 2, ground + 1], 1.6);
}

const DAIS = [0x4a4756, 0x625e6e, 0x7c7886, 0x9a96a3, 0xbab6c2, 0xd7d3dd].map(rgb);

/**
 * The sanctuary's two-tiered round dais, its top ringed with runes that pulse. Its anchor is the
 * front of the lower step, so it stands at the front of its tile.
 */
export function paintDais(): PropArt {
  const w = 32;
  const h = 22;
  const cx = w / 2;
  const tiers = [
    { rx: 14, ry: 5.2, top: 9.5, wall: 4 },
    { rx: 9.5, ry: 3.6, top: 7, wall: 3 },
  ];
  const ground = Math.ceil(tiers[0].top + tiers[0].ry + tiers[0].wall);
  const frames = [0, 1, 2, 1].map((pulse) => {
    const out = new Raster(w, h);
    tiers.forEach((tier, t) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x + 0.5 - cx) / tier.rx;
          if (Math.abs(dx) >= 1) continue;
          const half = tier.ry * Math.sqrt(1 - dx * dx);
          const dy = (y + 0.5 - tier.top) / tier.ry;
          if (Math.abs(dy) * tier.ry < half) {
            // Top: paving in rings and wedges, a rune circle on the upper step
            const r = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx) + Math.PI;
            const seam =
              Math.abs(r - 0.58) < 0.07 ||
              (r > 0.58 && (angle * 4) / Math.PI - Math.floor((angle * 4) / Math.PI) < 0.09);
            let tone = seam ? DAIS[2] : ramp(DAIS, 0.78 - dx * 0.12 + dy * 0.05, x, y, 0.35);
            if (t === 1 && Math.abs(r - 0.62) < 0.14) tone = RUNE_GLOW[pulse];
            if (t === 1 && r < 0.2) tone = RUNE_GLOW[Math.max(0, pulse - 1)];
            out.set(x, y, tone);
          } else if (y + 0.5 >= tier.top + half && y + 0.5 < tier.top + half + tier.wall) {
            // Wall: coursed blocks, lit on the left
            const down = y + 0.5 - (tier.top + half);
            const course = Math.floor(down / 3);
            const joint = Math.floor((dx + 1) * (5 + course));
            const seam = down % 3 > 2 || Math.abs((dx + 1) * (5 + course) - joint - 0.5) > 0.42;
            const light = down < 1 ? 0.85 : 0.55 - dx * 0.3;
            out.set(x, y, seam ? DAIS[0] : ramp(DAIS, light, x, y, 0.4));
          }
        }
      }
    });
    outline(out);
    return out;
  });
  return strip(frames, [cx, ground], 2.4);
}

interface Shard {
  x: number;
  angle: number;
  length: number;
  width: number;
}

/** Faceted crystal prisms: lit left facet, bright middle, dark right, brighter tips. */
function paintShards(
  out: Raster,
  shards: Shard[],
  ground: number,
  palette: readonly RGB[],
  glint: number | null,
): void {
  for (const shard of shards) {
    const sin = Math.sin(shard.angle);
    const cos = Math.cos(shard.angle);
    const half = shard.width / 2;
    const tip = shard.width * 0.9;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const px = x + 0.5 - shard.x;
        const py = ground + 0.5 - (y + 0.5);
        const along = px * sin + py * cos;
        const across = px * cos - py * sin;
        if (Math.abs(across) > half || along < -1) continue;
        if (along > shard.length - (tip * Math.abs(across)) / half) continue;
        const facet = across / half;
        let level = facet < -0.33 ? 3 : facet <= 0.33 ? 4 : 1;
        if (along > shard.length - tip) level += 1;
        if (along < shard.length * 0.25) level -= 1;
        if (Math.abs(facet + 0.33) < 0.2 && along > 2) level = 5;
        out.set(x, y, palette[Math.max(0, Math.min(5, level))]);
      }
    }
  }
  if (glint !== null) {
    const main = shards[shards.length - 1];
    const along = main.length * glint;
    const gx = Math.round(main.x + along * Math.sin(main.angle) - main.width * 0.2);
    const gy = Math.round(ground - along * Math.cos(main.angle));
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      out.set(gx + dx, gy + dy, dx || dy ? palette[4] : rgb(0xffffff));
    }
  }
}

/** A cluster of glowing crystal prisms on a bed of stones, with a glint running up it. */
export function paintCrystals(seed: number, hue: CrystalHue = 'cyan'): PropArt {
  const w = 30;
  const h = 38;
  const ground = h - 3;
  const jitter = (i: number) => (hash(seed, i, 20) - 0.5) * 0.2;
  const shards: Shard[] = [
    { x: 9, angle: -0.5 + jitter(0), length: 14 + hash(seed, 1, 21) * 4, width: 6 },
    { x: 21, angle: 0.42 + jitter(1), length: 16 + hash(seed, 2, 21) * 4, width: 6 },
    { x: 12, angle: 0.18 + jitter(2), length: 10, width: 5 },
    { x: 15, angle: -0.08 + jitter(3), length: 25 + hash(seed, 3, 21) * 5, width: 8 },
  ];
  const frames = [null, 0.35, 0.65, null].map((glint) => {
    const out = new Raster(w, h);
    paintShards(out, shards, ground, CRYSTAL_PALETTES[hue], glint);
    for (const [x, r] of [
      [8, 3],
      [15, 4],
      [22, 3],
    ]) {
      for (let y = ground - r; y <= ground; y++) {
        for (let dx = -r; dx <= r; dx++) {
          const light = ballLight(dx, (y - ground) * 1.4, r + 0.5);
          if (light !== null) out.set(x + dx, y, ramp(STONE, 0.4 + light * 0.4, x + dx, y));
        }
      }
    }
    outline(out);
    return out;
  });
  return strip(frames, [w / 2, ground + 1], 2.2 + hash(seed, 4, 21));
}

export interface GemSpec {
  sides: number;
  /** Equator radius, apex heights above and below it, in pixels. */
  radius: number;
  top: number;
  bottom: number;
  palette: readonly RGB[];
  frames: number;
  /** Seconds for one turn through the frames. */
  duration: number;
}

/**
 * A bipyramid gem turning about its upright axis, seen from a little above: each frame turns it
 * by an equal step through one facet, so the frames loop seamlessly. Facets shade by the light.
 */
export function paintGem(spec: GemSpec): PropArt {
  const { sides, radius, top, bottom, palette } = spec;
  const w = Math.ceil(radius * 2) + 4;
  const h = Math.ceil(top + bottom) + 6;
  const pitch = 0.3;
  const equator = top * Math.cos(pitch) + 3;
  const cx = w / 2;
  const view = ([x, y, z]: number[]): number[] => [
    x,
    y * Math.cos(pitch) - z * Math.sin(pitch),
    z * Math.cos(pitch) + y * Math.sin(pitch),
  ];
  const frames: Raster[] = [];
  for (let f = 0; f < spec.frames; f++) {
    const out = new Raster(w, h);
    const turn = (f / spec.frames) * ((Math.PI * 2) / sides);
    const ring = Array.from({ length: sides }, (_, k) => {
      const a = turn + (k / sides) * Math.PI * 2;
      return view([radius * Math.cos(a), 0, radius * Math.sin(a)]);
    });
    const apexes = [view([0, top, 0]), view([0, -bottom, 0])];
    for (const apex of apexes) {
      for (let k = 0; k < sides; k++) {
        const a = ring[k];
        const b = ring[(k + 1) % sides];
        const e1 = [a[0] - apex[0], a[1] - apex[1], a[2] - apex[2]];
        const e2 = [b[0] - apex[0], b[1] - apex[1], b[2] - apex[2]];
        let n = normalise([
          e1[1] * e2[2] - e1[2] * e2[1],
          e1[2] * e2[0] - e1[0] * e2[2],
          e1[0] * e2[1] - e1[1] * e2[0],
        ]);
        // Point every facet outward, away from the gem's centre
        const mid = [
          (a[0] + b[0] + apex[0]) / 3,
          (a[1] + b[1] + apex[1]) / 3,
          (a[2] + b[2] + apex[2]) / 3,
        ];
        if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0) n = [-n[0], -n[1], -n[2]];
        if (n[2] <= 0) continue;
        const shade = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        const level = Math.min(
          palette.length - 1,
          Math.floor(0.6 + shade * (palette.length - 0.6)),
        );
        const pts = [apex, a, b].map(([x, y]) => [cx + x, equator - y]);
        fillTriangle(out, pts, palette[level]);
      }
    }
    // A bright heart and sparkle
    out.set(Math.floor(cx - 1), Math.floor(equator - top * 0.45), palette[palette.length - 1]);
    outline(out);
    frames.push(out);
  }
  return strip(frames, [Math.floor(cx), h - 1], spec.duration);
}

function fillTriangle(out: Raster, pts: number[][], colour: RGB): void {
  const [[ax, ay], [bx, by], [cx, cy]] = pts;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-6) return;
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) out.set(x, y, colour);
    }
  }
}

/** The rift's heart: a dark orb with violet light spiralling around it. */
export function paintVoidOrb(): PropArt {
  const w = 20;
  const h = 20;
  const r = 7.5;
  const frames: Raster[] = [];
  for (let f = 0; f < 8; f++) {
    const out = new Raster(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - w / 2;
        const dy = y + 0.5 - h / 2;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const angle = Math.atan2(dy, dx);
        const swirl = Math.sin(angle * 2 - d * 0.9 + (f / 8) * Math.PI * 2);
        let colour = OBSIDIAN[d < 3 ? 0 : 1];
        if (swirl > 0.55 && d > 2.5) colour = d > r - 2 ? SIGIL_GLOW[2] : SIGIL_GLOW[1];
        else if (swirl > 0.1 && d > 3) colour = SIGIL_GLOW[0];
        out.set(x, y, colour);
      }
    }
    outline(out);
    frames.push(out);
  }
  return strip(frames, [w / 2, h - 1], 1.2);
}

const WATER = [0x5fb3d6, 0x8fd8ee, 0xc9f1fb].map(rgb);
const EARTH = [0x3b2618, 0x4d3220, 0x5e3f28, 0x6f4c30, 0x7d5a3a].map(rgb);
const KEEL = [0x1f1b2c, 0x2b2639, 0x3a3448, 0x4a4358, 0x5a5268].map(rgb);
const ISLAND_MEADOW = [0x203520, 0x2a4526, 0x35562e, 0x436a36, 0x587f42].map(rgb);
const RUIN = [0x4f5366, 0x6a7085, 0x8c93a6, 0xaab1c0].map(rgb);

/**
 * A distant floating island: a meadow plateau with pines (and ruins or a crystal), a rocky keel
 * hanging beneath it, and a waterfall spilling off the edge. The frames run the waterfall.
 */
export function paintSkyIsland(seed: number): PropArt {
  const w = 168;
  const h = 156;
  const cx = w / 2;
  const cy = 46;
  const rx = 70;
  const ry = 21;
  const tipX = cx + (hash(seed, 0, 30) - 0.5) * 30;
  const tipY = h - 8;
  const base = new Raster(w, h);
  const lipOf = (x: number) => cy + ry * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / rx) ** 2));
  const wall = 9;
  for (let x = 0; x < w; x++) {
    const dx = (x + 0.5 - cx) / rx;
    if (Math.abs(dx) >= 1) continue;
    const lip = lipOf(x);
    const backEdge = cy - ry * Math.sqrt(1 - dx * dx);
    // The keel tapers toward its tip, ragged with hanging spurs
    const taper = Math.max(0, 1 - Math.abs(x + 0.5 - tipX) / (rx * 1.05)) ** 1.35;
    const spur = hash(Math.floor(x / 3), seed, 31) < 0.25 ? hash(x >> 1, seed, 32) * 14 : 0;
    const keelBottom = lip + wall + (tipY - cy - ry - wall) * taper + spur * taper;
    for (let y = Math.floor(backEdge); y < Math.min(h - 1, keelBottom); y++) {
      if (y < lip) {
        const n = noise(x, y, 5, seed + 33) + dither(x, y) * 0.35;
        const back = (y - backEdge) / (lip - backEdge);
        let level = Math.floor(n * 3.2 + back * 1.4);
        if (lip - y < 1.5) level = 5;
        base.set(x, y, level >= 5 ? rgb(0x86a957) : ISLAND_MEADOW[Math.max(0, Math.min(4, level))]);
      } else if (y < lip + wall) {
        const band = Math.floor((y - lip + noise(x, 0, 6, seed) * 3) / 3);
        const light = 0.75 - dx * 0.3 - (y - lip) / (wall * 3);
        base.set(x, y, scale(EARTH[(band + 2) % 5], light + dither(x, y) * 0.1 + 0.4));
      } else {
        const depth = (y - lip - wall) / (tipY - cy - ry - wall);
        const band = Math.floor((y + noise(x, 0, 9, seed + 34) * 6) / 5);
        const light = 0.62 - dx * 0.35 - depth * 0.45 + (hash(band, 0, seed) - 0.5) * 0.18;
        base.set(x, y, ramp(KEEL, light, x, y, 0.6));
      }
    }
  }
  // Pines along the back of the plateau, and ruins or a crystal toward the front
  const pines = 3 + Math.floor(hash(seed, 1, 35) * 3);
  for (let i = 0; i < pines; i++) {
    const art = paintPine(seed * 10 + i, 20 + Math.floor(hash(seed, i, 36) * 10));
    const x = cx - rx * 0.75 + ((i + 0.5) / pines) * rx * 1.5 + (hash(i, seed, 37) - 0.5) * 10;
    const y = cy - ry * 0.35 + hash(seed, i, 38) * ry * 0.5;
    blit(base, firstFrame(art), Math.round(x - art.anchor[0]), Math.round(y - art.anchor[1]));
  }
  if (seed % 2 === 0) {
    const art = paintCrystals(seed, seed % 4 === 0 ? 'cyan' : 'violet');
    blit(
      base,
      firstFrame(art),
      Math.round(cx + 18 - art.anchor[0]),
      Math.round(cy + 8 - art.anchor[1]),
    );
  } else {
    for (let i = 0; i < 3; i++) {
      const x = Math.round(cx - 22 + i * 10);
      const top = Math.round(cy + 6 - 16 + i * 3 + hash(seed, i, 39) * 6);
      for (let y = top; y < cy + 10; y++) {
        for (let dx = 0; dx < 5; dx++)
          base.set(x + dx, y, RUIN[dx === 0 ? 3 : dx === 4 ? 0 : 2 - (y % 6 === 0 ? 1 : 0)]);
      }
    }
    for (let i = 0; i < 12; i++)
      base.set(Math.round(cx - 22 + i), Math.round(cy - 12 + Math.abs(i - 6) * 0.4), RUIN[3]);
  }
  // A waterfall spills off the front lip
  const fallX = Math.round(cx + rx * (seed % 2 ? -0.42 : 0.45));
  const fallTop = Math.floor(lipOf(fallX)) - 1;
  const frames = [0, 1, 2, 3].map((f) => {
    const out = new Raster(w, h);
    blit(out, base, 0, 0);
    for (let y = fallTop; y < h - 1; y++) {
      const fade = (y - fallTop) / (h - fallTop);
      for (let dx = 0; dx < 5; dx++) {
        if (fade > 0.6 && dither(fallX + dx, y) + 0.5 < (fade - 0.6) * 2.6) continue;
        const stripe = (y - f * 3 + dx * 2) % 7 < 2;
        out.set(fallX + dx, y, stripe ? WATER[2] : WATER[dx === 0 || dx === 4 ? 0 : 1]);
      }
    }
    outline(out, rgb(0x141a2e));
    return out;
  });
  return strip(frames, [Math.round(cx), Math.round(cy + ry)], 0.9);
}

const SKY = [
  0x090c22, 0x0e1534, 0x141f47, 0x1a2b59, 0x223a6a, 0x2d4b79, 0x3b5d86, 0x4d6f91, 0x63819b,
  0x7d92a3,
].map(rgb);
const SKY_CLOUDS = [0x31476f, 0x435b80, 0x5a7090].map(rgb);

/**
 * The backdrop: a twilight gradient dithered between bands, stars overhead and layered cloud
 * banks low down, at about the size of one screen of chunky pixels.
 */
export function paintSky(w = 256, h = 144): Raster {
  const out = new Raster(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (y / (h - 1)) * (SKY.length - 1) + dither(x, y) * 0.9 + 0.2;
      out.set(x, y, SKY[Math.max(0, Math.min(SKY.length - 1, Math.floor(t)))]);
    }
  }
  for (let y = 0; y < h * 0.62; y++) {
    for (let x = 0; x < w; x++) {
      const roll = hash(x, y, 51);
      if (roll > 0.006) continue;
      const fade = 1 - y / (h * 0.62);
      const star = scale(rgb(0xdfe8ff), 0.45 + fade * 0.55 * (roll / 0.006));
      out.set(x, y, star);
      if (roll < 0.0006) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          out.set(x + dx, y + dy, scale(star, 0.55));
        }
      }
    }
  }
  SKY_CLOUDS.forEach((colour, k) => {
    const base = h * (0.7 + k * 0.1);
    for (let x = 0; x < w; x++) {
      const top = Math.round(base - 3 - noise(x, k, 14, 52 + k) * 12 - noise(x, k, 4, 55 + k) * 3);
      for (let y = top; y < h; y++) {
        out.set(x, y, y === top ? scale(colour, 1.25) : scale(colour, 1 - (y - top) / (h * 2)));
      }
    }
  });
  return out;
}

const CLOUD = [0x6f86b0, 0x91a8cc, 0xb9cbe6, 0xdfe9f7, 0xf7fbff].map(rgb);

/** A flat-bottomed bank of puffy cloud, lit from above. */
export function paintCloud(seed: number): PropArt {
  const w = 120;
  const h = 44;
  const floor = h - 6;
  const out = new Raster(w, h);
  const puffs: Clump[] = [];
  for (let x = 24; x < w - 24; x += 9 + hash(x, seed, 40) * 6) {
    const middle = 1 - Math.abs(x - w / 2) / (w / 2);
    puffs.push({ x, y: floor - 4 - middle * 10, r: 7 + middle * 9 + hash(seed, x, 41) * 4 });
  }
  for (const puff of puffs) {
    for (let y = Math.floor(puff.y - puff.r); y <= floor; y++) {
      for (let x = Math.floor(puff.x - puff.r); x <= puff.x + puff.r; x++) {
        const light = ballLight(x + 0.5 - puff.x, y + 0.5 - puff.y, puff.r);
        if (light === null) continue;
        const under = Math.max(0, (y - (floor - 5)) / 5);
        out.set(x, y, ramp(CLOUD, 0.55 + light * 0.45 - under * 0.5, x, y, 0.7));
      }
    }
  }
  outline(out, CLOUD[0]);
  return strip([out], [w / 2, floor], 1);
}
