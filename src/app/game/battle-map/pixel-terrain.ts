import * as THREE from 'three';
import { TileCode } from '../../core/models/map.model';

/*
 * Pixel-art terrain for the HD-2D look, painted in code (no image files) at roughly the sprites'
 * on-screen pixel size so board and characters share one pixel grid. The whole board is one
 * continuous painting: meadows, cobbles and basalt flow across tiles, and each tile reads its
 * neighbours to catch light on raised edges and fall into shadow beside them.
 */

/** Texels per tile: close to an HD-2D sprite pixel on screen (36 px per tile at 1.35x). */
export const TERRAIN_TEXELS = 28;

/** Ground the painting knows: the map's tiles plus `R`, the wild rim of the island around them. */
export type Ground = TileCode | 'R';

/** Each tile's box: its height and the y of its centre. Meadows stand above the sunken road. */
export const TILE_SHAPES: Record<Ground, { height: number; y: number }> = {
  B: { height: 0.36, y: 0.07 },
  P: { height: 0.24, y: -0.05 },
  M: { height: 0.28, y: -0.02 },
  O: { height: 0.42, y: 0.1 },
  S: { height: 0.26, y: -0.04 },
  C: { height: 0.3, y: -0.02 },
  // A step below the meadows, so the playable board reads as a raised stage
  R: { height: 0.33, y: -0.005 },
};

const topOf = (tile: Ground) => TILE_SHAPES[tile].y + TILE_SHAPES[tile].height / 2;

export type RGB = readonly [number, number, number];
export const rgb = (value: number): RGB => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
export const scale = ([r, g, b]: RGB, f: number): RGB => [
  Math.min(255, r * f),
  Math.min(255, g * f),
  Math.min(255, b * f),
];

const MEADOW = [0x203520, 0x2a4526, 0x35562e, 0x436a36, 0x587f42].map(rgb);
const MEADOW_LIP = rgb(0x86a957);
const FLOWERS = [0xf2e6a2, 0xf0a6c4, 0xfaf7ee, 0xb9d8ff].map(rgb);
const FLOWER_HEART = rgb(0xd9a441);
const COBBLES = [0x8d8a83, 0x9c978d, 0x7f7b74, 0xa9a397].map(rgb);
const MORTAR = rgb(0x45413e);
const MOSS = rgb(0x557a3a);
const PAVERS = [0xc4bba8, 0xb7ae9c, 0xcdc5b3].map(rgb);
const PAVER_SEAM = rgb(0x8f8676);
const SLATE = [0x343c4a, 0x3d4656, 0x465063].map(rgb);
const RUNE = rgb(0x6ff0f7);
const VOID = [0x241b36, 0x2d2244, 0x372a52].map(rgb);
const SIGIL = rgb(0xc39bff);
const BASALT = [0x241e1c, 0x2e2724, 0x3a312d, 0x4a3f39].map(rgb);
const LAVA = rgb(0xff8a2a);
const SOIL = [0x3b2618, 0x4d3220, 0x5e3f28, 0x6f4c30].map(rgb);
const PEBBLE = [0x7d756b, 0x938a7e].map(rgb);
const BLOCK = [0x6f6a64, 0x7b766f, 0x5f5b56].map(rgb);

/** Stable pseudo-random value in [0, 1) for integer coordinates. */
export function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Smooth value noise in [0, 1). With `period` (a multiple of `size`) it repeats every `period`
 * texels in x, for textures that tile sideways.
 */
export function noise(x: number, y: number, size: number, seed: number, period = 0): number {
  const fx = x / size;
  const fy = y / size;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = fx - x0;
  const sy = fy - y0;
  const u = sx * sx * (3 - 2 * sx);
  const v = sy * sy * (3 - 2 * sy);
  const cells = Math.round(period / size);
  const wrap = (i: number) => (cells ? ((i % cells) + cells) % cells : i);
  const a = hash(wrap(x0), y0, seed);
  const b = hash(wrap(x0 + 1), y0, seed);
  const c = hash(wrap(x0), y0 + 1, seed);
  const d = hash(wrap(x0 + 1), y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 4x4 ordered dither threshold in [-0.5, 0.5): the classic pixel-art gradient pattern. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5;

/** RGBA pixel buffer; row 0 is the north edge of the board. */
export class Raster {
  public readonly data: Uint8Array;

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  public set(x: number, y: number, [r, g, b]: RGB): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = 255;
  }

  public get(x: number, y: number): RGB {
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  /** True where something has been painted; false outside the raster. */
  public opaque(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.data[(y * this.width + x) * 4 + 3] > 0;
  }

  public shade(x: number, y: number, f: number): void {
    this.set(x, y, scale(this.get(x, y), f));
  }
}

interface Cell {
  tiles: Ground[][];
  c: number;
  r: number;
  /** Top-left texel of the cell. */
  ox: number;
  oy: number;
}

const SIDES = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
] as const;

/** Texels from (x, y) to the edge on `side`. */
function edgeDistance(x: number, y: number, side: (typeof SIDES)[number]): number {
  const last = TERRAIN_TEXELS - 1;
  if (side.dy < 0) return y;
  if (side.dy > 0) return last - y;
  if (side.dx < 0) return x;
  return last - x;
}

/** Neighbour's top height, or the board's skirt (below everything) past the edge. */
function neighbourTop(cell: Cell, side: (typeof SIDES)[number]): number {
  const tile = cell.tiles[cell.r + side.dy]?.[cell.c + side.dx];
  return tile ? topOf(tile) : -1;
}

/** Darkens texels beside taller neighbours, as if in their shade. */
function shadowFromTaller(out: Raster, cell: Cell, own: Ground): void {
  for (const side of SIDES) {
    if (neighbourTop(cell, side) <= topOf(own) + 0.01) continue;
    for (let y = 0; y < TERRAIN_TEXELS; y++) {
      for (let x = 0; x < TERRAIN_TEXELS; x++) {
        const d = edgeDistance(x, y, side);
        if (d < 3) out.shade(cell.ox + x, cell.oy + y, [0.62, 0.76, 0.9][d]);
      }
    }
  }
}

function paintMeadow(out: Raster, cell: Cell): void {
  const { ox, oy } = cell;
  for (let y = 0; y < TERRAIN_TEXELS; y++) {
    for (let x = 0; x < TERRAIN_TEXELS; x++) {
      const gx = ox + x;
      const gy = oy + y;
      const n = 0.6 * noise(gx, gy, 9, 11) + 0.4 * noise(gx, gy, 3.5, 12);
      const level = Math.max(1, Math.min(4, Math.floor((n + dither(gx, gy) * 0.22) * 4.4 - 0.4)));
      out.set(gx, gy, MEADOW[level]);
    }
  }
  // Tufts: a dark root with two sunlit blades
  const tufts = 4 + Math.floor(hash(cell.c, cell.r, 21) * 4);
  for (let i = 0; i < tufts; i++) {
    const x = ox + 3 + Math.floor(hash(cell.c * 7 + i, cell.r, 22) * (TERRAIN_TEXELS - 6));
    const y = oy + 4 + Math.floor(hash(cell.c, cell.r * 7 + i, 23) * (TERRAIN_TEXELS - 7));
    out.set(x, y, MEADOW[0]);
    out.set(x, y - 1, MEADOW[2]);
    out.set(x - 1, y - 2, MEADOW[4]);
    out.set(x + 1, y - 2, MEADOW[4]);
  }
  // Now and then a wildflower
  for (let i = 0; i < 2; i++) {
    if (hash(cell.c + i * 13, cell.r, 24) > 0.42) continue;
    const x = ox + 4 + Math.floor(hash(cell.c, cell.r + i * 13, 25) * (TERRAIN_TEXELS - 8));
    const y = oy + 4 + Math.floor(hash(cell.c + i, cell.r + i, 26) * (TERRAIN_TEXELS - 8));
    const petal = FLOWERS[Math.floor(hash(x, y, 27) * FLOWERS.length)];
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]) {
      out.set(x + dx, y + dy, petal);
    }
    out.set(x, y, FLOWER_HEART);
  }
  // Edges: a sunlit lip where the meadow drops away, a faint tactics grid between meadows
  for (const side of SIDES) {
    const lower = neighbourTop(cell, side) < topOf('B') - 0.01;
    const meadow = cell.tiles[cell.r + side.dy]?.[cell.c + side.dx] === 'B';
    for (let y = 0; y < TERRAIN_TEXELS; y++) {
      for (let x = 0; x < TERRAIN_TEXELS; x++) {
        const d = edgeDistance(x, y, side);
        if (lower && d === 0) out.set(ox + x, oy + y, MEADOW_LIP);
        else if (lower && d === 1) out.set(ox + x, oy + y, MEADOW[4]);
        else if (meadow && d === 0 && side.dy >= 0 && side.dx >= 0) {
          out.shade(ox + x, oy + y, 0.9);
        }
      }
    }
  }
  shadowFromTaller(out, cell, 'B');
}

/**
 * The island's wild rim: deeper, unkempt grass with clover, pebbles and flower drifts, no tactics
 * grid, and a sunlit lip where the island ends.
 */
function paintWilds(out: Raster, cell: Cell): void {
  const { ox, oy } = cell;
  for (let y = 0; y < TERRAIN_TEXELS; y++) {
    for (let x = 0; x < TERRAIN_TEXELS; x++) {
      const gx = ox + x;
      const gy = oy + y;
      const n = 0.55 * noise(gx, gy, 11, 13) + 0.45 * noise(gx, gy, 3, 14);
      const level = Math.max(0, Math.min(3, Math.floor((n + dither(gx, gy) * 0.26) * 4.2 - 0.5)));
      out.set(gx, gy, MEADOW[level]);
    }
  }
  const tufts = 9 + Math.floor(hash(cell.c, cell.r, 15) * 6);
  for (let i = 0; i < tufts; i++) {
    const x = ox + 2 + Math.floor(hash(cell.c * 5 + i, cell.r, 16) * (TERRAIN_TEXELS - 4));
    const y = oy + 3 + Math.floor(hash(cell.c, cell.r * 5 + i, 17) * (TERRAIN_TEXELS - 4));
    out.set(x, y, MEADOW[0]);
    out.set(x, y - 1, MEADOW[2]);
    out.set(x - 1, y - 2, MEADOW[3]);
    out.set(x + 1, y - 2, MEADOW[4]);
    out.set(x + 1, y - 3, MEADOW[4]);
  }
  // A drift of one kind of flower now and then, scattered pebbles
  if (hash(cell.c, cell.r, 18) < 0.45) {
    const petal = FLOWERS[Math.floor(hash(cell.r, cell.c, 19) * FLOWERS.length)];
    for (let i = 0; i < 5; i++) {
      const x = ox + 3 + Math.floor(hash(cell.c + i * 7, cell.r, 20) * (TERRAIN_TEXELS - 6));
      const y = oy + 3 + Math.floor(hash(cell.c, cell.r + i * 7, 21) * (TERRAIN_TEXELS - 6));
      out.set(x, y, petal);
      out.set(x + 1, y, scale(petal, 0.8));
      out.set(x, y - 1, petal);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (hash(cell.c + i, cell.r, 22) > 0.5) continue;
    const x = ox + 3 + Math.floor(hash(cell.c, cell.r + i * 3, 23) * (TERRAIN_TEXELS - 6));
    const y = oy + 3 + Math.floor(hash(cell.c + i * 3, cell.r, 24) * (TERRAIN_TEXELS - 6));
    out.set(x, y, PEBBLE[1]);
    out.set(x + 1, y, PEBBLE[0]);
    out.set(x, y + 1, scale(PEBBLE[0], 0.7));
    out.set(x + 1, y + 1, scale(PEBBLE[0], 0.6));
  }
  for (const side of SIDES) {
    if (neighbourTop(cell, side) >= topOf('R') - 0.01) continue;
    for (let y = 0; y < TERRAIN_TEXELS; y++) {
      for (let x = 0; x < TERRAIN_TEXELS; x++) {
        const d = edgeDistance(x, y, side);
        if (d === 0) out.set(ox + x, oy + y, MEADOW_LIP);
        else if (d === 1) out.set(ox + x, oy + y, MEADOW[4]);
      }
    }
  }
  shadowFromTaller(out, cell, 'R');
}

/** Rounded stones from a jittered Voronoi pattern over the whole board, lit from the top left. */
function paintStones(
  out: Raster,
  cell: Cell,
  grid: number,
  seed: number,
  stones: readonly RGB[],
  seam: (gx: number, gy: number) => RGB,
  glow?: Raster,
): void {
  for (let y = 0; y < TERRAIN_TEXELS; y++) {
    for (let x = 0; x < TERRAIN_TEXELS; x++) {
      const gx = cell.ox + x;
      const gy = cell.oy + y;
      const cx = Math.floor(gx / grid);
      const cy = Math.floor(gy / grid);
      let d1 = Infinity;
      let d2 = Infinity;
      let near = [0, 0, 0, 0];
      for (let j = cy - 1; j <= cy + 1; j++) {
        for (let i = cx - 1; i <= cx + 1; i++) {
          const px = (i + 0.2 + 0.6 * hash(i, j, seed)) * grid;
          const py = (j + 0.2 + 0.6 * hash(i, j, seed + 1)) * grid;
          const d = Math.hypot(gx + 0.5 - px, gy + 0.5 - py);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            near = [px, py, i, j];
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      if (d2 - d1 < 1.15) {
        const colour = seam(gx, gy);
        out.set(gx, gy, colour);
        glow?.set(gx, gy, colour);
        continue;
      }
      const base = stones[Math.floor(hash(near[2], near[3], seed + 2) * stones.length)];
      const lean = (gx + 0.5 - near[0] + (gy + 0.5 - near[1])) / grid;
      const lit = lean < -0.32 ? 1.16 : lean > 0.36 ? 0.84 : 1;
      out.set(gx, gy, scale(base, lit + dither(gx, gy) * 0.06));
    }
  }
}

function paintRoad(out: Raster, cell: Cell): void {
  paintStones(out, cell, 7, 31, COBBLES, (gx, gy) => (hash(gx, gy, 32) < 0.1 ? MOSS : MORTAR));
  shadowFromTaller(out, cell, 'P');
}

function paintPlaza(out: Raster, cell: Cell): void {
  const half = TERRAIN_TEXELS / 2;
  for (let y = 0; y < TERRAIN_TEXELS; y++) {
    for (let x = 0; x < TERRAIN_TEXELS; x++) {
      const gx = cell.ox + x;
      const gy = cell.oy + y;
      const paver = PAVERS[Math.floor(hash(Math.floor(gx / half), Math.floor(gy / half), 41) * 3)];
      const seam = x % half === 0 || y % half === 0;
      out.set(gx, gy, seam ? PAVER_SEAM : scale(paver, 1 + dither(gx, gy) * 0.05));
    }
  }
  shadowFromTaller(out, cell, 'C');
}

/** A dark slab with a glowing ring and glyph: maze slots and the spawn portal. */
function paintRuneSlab(
  out: Raster,
  glow: Raster,
  cell: Cell,
  slab: readonly RGB[],
  ink: RGB,
  spiral: boolean,
): void {
  const centre = (TERRAIN_TEXELS - 1) / 2;
  for (let y = 0; y < TERRAIN_TEXELS; y++) {
    for (let x = 0; x < TERRAIN_TEXELS; x++) {
      const gx = cell.ox + x;
      const gy = cell.oy + y;
      const n = noise(gx, gy, 4, 51) + dither(gx, gy) * 0.3;
      let colour = slab[Math.max(0, Math.min(slab.length - 1, Math.floor(n * slab.length)))];
      if (x === 0 || y === 0 || x === TERRAIN_TEXELS - 1 || y === TERRAIN_TEXELS - 1) {
        colour = scale(slab[0], 0.75);
      }
      const dx = x - centre;
      const dy = y - centre;
      const r = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const ring = Math.abs(r - 9) < 0.7;
      const glyph = spiral
        ? r < 7.5 && Math.abs(((angle + r * 0.55 + Math.PI * 3) % (Math.PI / 1.5)) - 0.5) < 0.22
        : r < 6.5 && (Math.abs(Math.abs(dx) + Math.abs(dy) - 4.5) < 0.6 || (r < 1.2 && r > 0));
      if (ring || glyph) {
        out.set(gx, gy, ink);
        glow.set(gx, gy, ink);
      } else {
        out.set(gx, gy, colour);
      }
    }
  }
  shadowFromTaller(out, cell, spiral ? 'S' : 'M');
}

function paintBasalt(out: Raster, glow: Raster, cell: Cell): void {
  paintStones(out, cell, 9, 61, BASALT, () => LAVA, glow);
}

/** The map's tiles framed by `rim` tiles of wild ground on every side. */
export function withRim(tiles: TileCode[][], rim: number): Ground[][] {
  const width = (tiles[0]?.length ?? 0) + rim * 2;
  return Array.from({ length: tiles.length + rim * 2 }, (_, r) =>
    Array.from({ length: width }, (_, c): Ground => tiles[r - rim]?.[c - rim] ?? 'R'),
  );
}

/**
 * The whole board's top faces (colour) and what glows on them (runes, lava). With a `rim`, the
 * painting also covers that many tiles of wild ground around the map, and map tile (c, r) sits
 * at cell (c + rim, r + rim).
 */
export function paintBoard(tiles: TileCode[][], rim = 0): { color: Raster; glow: Raster } {
  const ground = withRim(tiles, rim);
  const height = ground.length;
  const width = ground[0]?.length ?? 0;
  const color = new Raster(width * TERRAIN_TEXELS, height * TERRAIN_TEXELS);
  const glow = new Raster(width * TERRAIN_TEXELS, height * TERRAIN_TEXELS);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell: Cell = { tiles: ground, c, r, ox: c * TERRAIN_TEXELS, oy: r * TERRAIN_TEXELS };
      switch (ground[r][c]) {
        case 'R':
          paintWilds(color, cell);
          break;
        case 'B':
          paintMeadow(color, cell);
          break;
        case 'P':
          paintRoad(color, cell);
          break;
        case 'C':
          paintPlaza(color, cell);
          break;
        case 'M':
          paintRuneSlab(color, glow, cell, SLATE, RUNE, false);
          break;
        case 'S':
          paintRuneSlab(color, glow, cell, VOID, SIGIL, true);
          break;
        case 'O':
          paintBasalt(color, glow, cell);
          break;
      }
    }
  }
  return { color, glow };
}

/** Rows per tile kind in the side atlas, enough for the tallest wall. */
export const SIDE_ROWS = 14;
const SIDE_KINDS: Ground[] = ['B', 'P', 'C', 'M', 'S', 'O', 'R'];
/** Total rows in the wall atlas. */
export const SIDE_ATLAS_ROWS = SIDE_ROWS * SIDE_KINDS.length;

/** Atlas band (0 = first) holding the walls for a tile kind. */
export function sideBand(tile: Ground): number {
  return SIDE_KINDS.indexOf(tile);
}

/**
 * Wall faces, one band per tile kind, each TERRAIN_TEXELS wide and tiling sideways: meadows
 * show a ragged grass overhang above soil and pebbles, roads and slabs show coursed blocks.
 * Row 0 of a band is the top of the wall.
 */
export function paintSides(): Raster {
  const out = new Raster(TERRAIN_TEXELS, SIDE_ROWS * SIDE_KINDS.length);
  SIDE_KINDS.forEach((kind, band) => {
    const top = band * SIDE_ROWS;
    for (let y = 0; y < SIDE_ROWS; y++) {
      for (let x = 0; x < TERRAIN_TEXELS; x++) {
        const gy = top + y;
        if (kind === 'B' || kind === 'R') {
          const overhang = 2 + Math.floor(hash(x, 0, 71) * 2.6);
          if (y === 0) out.set(x, gy, MEADOW_LIP);
          else if (y < overhang) out.set(x, gy, MEADOW[y === 1 ? 3 : 2]);
          else if (hash(x, y, 72) < 0.07) out.set(x, gy, PEBBLE[Math.floor(hash(y, x, 73) * 2)]);
          else {
            const n = noise(x, y, 3, 74) + dither(x, y) * 0.3 - y * 0.035;
            out.set(x, gy, SOIL[Math.max(0, Math.min(3, Math.floor(n * 4)))]);
          }
        } else {
          const palette =
            kind === 'O' ? BASALT : kind === 'S' ? VOID : kind === 'M' ? SLATE : BLOCK;
          const course = Math.floor(y / 5);
          const offset = course % 2 ? 7 : 0;
          const seam = y % 5 === 4 || (x + offset) % 14 === 0;
          const block = palette[Math.floor(hash(Math.floor((x + offset) / 14), course, 75) * 3)];
          const lit = y % 5 === 0 ? 1.15 : 1;
          out.set(x, gy, seam ? scale(palette[0], 0.7) : scale(block, lit));
        }
      }
    }
  });
  return out;
}

/** The cliff painting spans this many tiles across (repeating sideways) and down. */
export const CLIFF_TILES_WIDE = 8;
export const CLIFF_TILES_DEEP = 6;

const STRATA = [0x4d3220, 0x5e3f28, 0x6f4c30, 0x7d5a3a, 0x5a3a26].map(rgb);
const ROOTS = [0x8c6a48, 0x5e4330].map(rgb);
const CRAG = [0x3d384a, 0x4a4358, 0x5a5268, 0x6b637a].map(rgb);
const VEIN = [0x2f9bd6, 0x6fe0f7, 0xd8fbff].map(rgb);

/**
 * The island's flanks below the rim: dark soil hung with roots and vines, banded earth strata,
 * then craggy rock darkening with depth and veined with glowing crystal. Repeats sideways.
 */
export function paintCliff(): { color: Raster; glow: Raster } {
  const W = CLIFF_TILES_WIDE * TERRAIN_TEXELS;
  const H = CLIFF_TILES_DEEP * TERRAIN_TEXELS;
  const color = new Raster(W, H);
  const glow = new Raster(W, H);
  const put = (out: Raster, x: number, y: number, c: RGB) => out.set(((x % W) + W) % W, y, c);
  const grid = 14;
  const cells = W / grid;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const boundary = 30 + Math.round((noise(x, 0, 16, 81, W) - 0.5) * 12);
      if (y < 4) {
        // Dark soil just under the rim's wall, shaded by the overhang
        color.set(x, y, scale(SOIL[y < 2 ? 0 : 1], 0.8 + dither(x, y) * 0.1));
      } else if (y < boundary) {
        const wave = noise(x, y, 28, 82, W) * 5;
        const band = Math.floor((y + wave) / 6);
        const row = (y + wave) % 6;
        const base = STRATA[Math.floor(hash(band, 0, 83) * STRATA.length)];
        const lit = row < 1 ? 1.14 : row > 5 ? 0.8 : 1;
        const pebble = hash(x, y, 84) < 0.025;
        color.set(x, y, pebble ? PEBBLE[1] : scale(base, lit + dither(x, y) * 0.08));
      } else {
        // Jittered Voronoi crags whose cells wrap with the texture
        const cx = Math.floor(x / grid);
        const cy = Math.floor(y / grid);
        let d1 = Infinity;
        let d2 = Infinity;
        let near = [0, 0, 0, 0];
        for (let j = cy - 2; j <= cy + 2; j++) {
          for (let i = cx - 1; i <= cx + 1; i++) {
            const wi = ((i % cells) + cells) % cells;
            const px = (i + 0.2 + 0.6 * hash(wi, j, 85)) * grid;
            const py = (j + 0.2 + 0.6 * hash(wi, j, 86)) * grid;
            // Squashed vertically, so the crags stand tall like a cliff face
            const d = Math.hypot(x + 0.5 - px, (y + 0.5 - py) * 0.55);
            if (d < d1) {
              d2 = d1;
              d1 = d;
              near = [px, py, wi, j];
            } else if (d < d2) {
              d2 = d;
            }
          }
        }
        const depth = Math.min(1, (y - boundary) / (H - 34));
        const fade = 1 - depth * 0.5;
        if (d2 - d1 < 1.2) {
          color.set(x, y, scale(CRAG[0], 0.6 * fade));
          continue;
        }
        const base = CRAG[Math.floor(hash(near[2], near[3], 87) * CRAG.length)];
        const lean = (x + 0.5 - near[0] + (y + 0.5 - near[1])) / grid;
        const lit = lean < -0.3 ? 1.18 : lean > 0.35 ? 0.82 : 1;
        color.set(x, y, scale(base, (lit + dither(x, y) * 0.07) * fade));
      }
    }
  }
  // Crystal veins glinting in the rock
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(hash(i, 1, 88) * W);
    const y = 46 + Math.floor(hash(i, 2, 88) * (H - 60));
    for (let s = 0; s < 3; s++) {
      const sx = x + s * 3 - 3;
      const tall = 3 + Math.floor(hash(i, s, 89) * 4);
      for (let k = -tall; k <= 1; k++) {
        const wide = k > -tall + 1 && k < 1;
        for (const dx of wide ? [-1, 0, 1] : [0]) {
          const c = dx === 0 ? VEIN[k < -1 ? 2 : 1] : VEIN[0];
          put(color, sx + dx, y + k, c);
          put(glow, sx + dx, y + k, c);
        }
      }
    }
  }
  // Roots and vines hang from the rim
  for (let i = 0; i < 18; i++) {
    const x0 = Math.floor(hash(i, 3, 90) * W);
    const vine = i % 3 === 0;
    const length = (vine ? 10 : 4) + Math.floor(hash(i, 4, 90) * (vine ? 18 : 12));
    for (let t = 0; t < length; t++) {
      const x = x0 + Math.round(Math.sin(t * 0.45 + i) * (vine ? 1.4 : 0.8));
      if (vine) {
        put(color, x, t, MEADOW[t % 4 === 0 ? 4 : 2]);
        if (t % 3 === 1) put(color, x + (t % 2 ? 1 : -1), t, MEADOW[3]);
      } else {
        put(color, x, t, ROOTS[t < length / 2 ? 0 : 1]);
      }
    }
  }
  // A dim copy of the painting glows too, so faces turned from the sun stay readable
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!glow.opaque(x, y)) glow.set(x, y, scale(color.get(x, y), 0.22));
    }
  }
  return { color, glow };
}

/** Pixel-art texture: crisp up close, smoothed only when shrunk far below its pixel size. */
export function rasterTexture(raster: Raster, srgb = true): THREE.DataTexture {
  const texture = new THREE.DataTexture(raster.data, raster.width, raster.height);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
