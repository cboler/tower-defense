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

/** Each tile's box: its height and the y of its centre. Meadows stand above the sunken road. */
export const TILE_SHAPES: Record<TileCode, { height: number; y: number }> = {
  B: { height: 0.36, y: 0.07 },
  P: { height: 0.24, y: -0.05 },
  M: { height: 0.28, y: -0.02 },
  O: { height: 0.42, y: 0.1 },
  S: { height: 0.26, y: -0.04 },
  C: { height: 0.3, y: -0.02 },
};

const topOf = (tile: TileCode) => TILE_SHAPES[tile].y + TILE_SHAPES[tile].height / 2;

type RGB = readonly [number, number, number];
const rgb = (value: number): RGB => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
const scale = ([r, g, b]: RGB, f: number): RGB => [
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

/** Smooth value noise in [0, 1). */
function noise(x: number, y: number, size: number, seed: number): number {
  const fx = x / size;
  const fy = y / size;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = fx - x0;
  const sy = fy - y0;
  const u = sx * sx * (3 - 2 * sx);
  const v = sy * sy * (3 - 2 * sy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 4x4 ordered dither threshold in [-0.5, 0.5): the classic pixel-art gradient pattern. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5;

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

  public shade(x: number, y: number, f: number): void {
    this.set(x, y, scale(this.get(x, y), f));
  }
}

interface Cell {
  tiles: TileCode[][];
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
function shadowFromTaller(out: Raster, cell: Cell, own: TileCode): void {
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

/** The whole board's top faces (colour) and what glows on them (runes, lava). */
export function paintBoard(tiles: TileCode[][]): { color: Raster; glow: Raster } {
  const height = tiles.length;
  const width = tiles[0]?.length ?? 0;
  const color = new Raster(width * TERRAIN_TEXELS, height * TERRAIN_TEXELS);
  const glow = new Raster(width * TERRAIN_TEXELS, height * TERRAIN_TEXELS);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell: Cell = { tiles, c, r, ox: c * TERRAIN_TEXELS, oy: r * TERRAIN_TEXELS };
      switch (tiles[r][c]) {
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
const SIDE_KINDS: TileCode[] = ['B', 'P', 'C', 'M', 'S', 'O'];
/** Total rows in the wall atlas. */
export const SIDE_ATLAS_ROWS = SIDE_ROWS * SIDE_KINDS.length;

/** Atlas band (0 = first) holding the walls for a tile kind. */
export function sideBand(tile: TileCode): number {
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
        if (kind === 'B') {
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
