import * as THREE from 'three';
import { CLIFF_TILES_DEEP, CLIFF_TILES_WIDE, Raster, hash } from './pixel-terrain';
import {
  CrystalHue,
  Foliage,
  PropArt,
  paintBush,
  paintCrystals,
  paintMonolith,
  paintPine,
  paintRock,
  paintRoundTree,
} from './pixel-props';
import {
  SPRITE_FRAGMENT,
  SPRITE_SCALE,
  SPRITE_SHADOW_FRAGMENT,
  SPRITE_SHADOW_VERTEX,
  SPRITE_VERTEX,
  billboardTurn,
} from './sprite-actors';

/*
 * The HD-2D diorama around the board: painted props standing as camera-facing billboards like
 * the characters, the island's rim and cliff, and where the props go.
 */

/** Sprite pixels per tile, as baked for the characters. */
export const PROP_PIXELS_PER_TILE = 36;

/** World size of one prop pixel on the board, matching the characters. */
export const PROP_PIXEL = SPRITE_SCALE / PROP_PIXELS_PER_TILE;

/**
 * A pixel-art texture with its top row at the top, like a loaded image. Filtered linearly for
 * the sprites' sharp sampling (see SPRITE_SAMPLE); set nearest filtering to draw it plainly.
 */
export function spriteTexture(raster: Raster): THREE.DataTexture {
  const { width, height } = raster;
  const row = width * 4;
  const data = new Uint8Array(raster.data.length);
  for (let y = 0; y < height; y++) {
    data.set(raster.data.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface ScenerySpriteOptions {
  /** World size of one pixel; distant backdrops use bigger pixels so they read the same size. */
  pixelSize?: number;
  /** Cast the sprite's silhouette as a shadow. */
  shadow?: boolean;
  /** Seconds into the loop to start, so neighbours don't move in step. */
  phase?: number;
}

/** A painted prop standing on the board, turned to face the camera like the characters. */
export class ScenerySprite {
  public readonly root = new THREE.Group();
  /** False when the owner picks frames itself with `setFrame`. */
  public playing = true;
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private readonly parentTurn = new THREE.Quaternion();
  private readonly sunTurn = new THREE.Quaternion();
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  private clock: number;

  constructor(
    private readonly art: PropArt,
    texture: THREE.Texture,
    options: ScenerySpriteOptions = {},
  ) {
    const [w, h] = art.cell;
    const [ax, ay] = art.anchor;
    const unit = options.pixelSize ?? PROP_PIXEL;
    const geometry = new THREE.PlaneGeometry(w * unit, h * unit);
    // The quad's origin sits at the anchor, so the prop stands where it is placed
    geometry.translate((w / 2 - ax) * unit, (ay - h / 2) * unit, 0);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        map: { value: texture },
        texSize: { value: new THREE.Vector2(art.raster.width, art.raster.height) },
        frame: { value: new THREE.Vector4(0, 0, 1 / art.frames, 1) },
        tint: { value: new THREE.Color(1, 1, 1) },
        flash: { value: 0 },
        opacity: { value: 1 },
      },
      vertexShader: SPRITE_VERTEX,
      fragmentShader: SPRITE_FRAGMENT,
      fog: true,
    });
    material.toneMapped = false;
    this.mesh = new THREE.Mesh(geometry, material);
    this.root.add(this.mesh);
    if (options.shadow) {
      // An upright twin turned toward the sun casts the full silhouette (see SpriteActor)
      this.shadow = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          colorWrite: false,
          depthWrite: false,
          shadowSide: THREE.DoubleSide,
        }),
      );
      this.shadow.castShadow = true;
      this.shadow.customDepthMaterial = new THREE.ShaderMaterial({
        uniforms: { map: material.uniforms['map'], frame: material.uniforms['frame'] },
        vertexShader: SPRITE_SHADOW_VERTEX,
        fragmentShader: SPRITE_SHADOW_FRAGMENT,
        side: THREE.DoubleSide,
      });
      this.root.add(this.shadow);
    }
    this.clock = options.phase ?? 0;
    this.setFrame(Math.floor((this.clock / art.duration) * art.frames));
  }

  /** Multiplies the painting's colours, e.g. to flush a crystal red. */
  public get tint(): THREE.Color {
    return this.mesh.material.uniforms['tint'].value as THREE.Color;
  }

  public update(dt: number): void {
    if (!this.playing || this.art.frames < 2) return;
    this.clock += dt;
    this.setFrame(Math.floor((this.clock / this.art.duration) * this.art.frames));
  }

  public setFrame(index: number): void {
    const n = this.art.frames;
    const frame = this.mesh.material.uniforms['frame'].value as THREE.Vector4;
    frame.x = (((index % n) + n) % n) / n;
  }

  /** Faces the camera; the shadow caster turns to `sunYaw` instead. */
  public faceCamera(camera: THREE.Camera, sunYaw: number): void {
    const parent = this.root.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.getWorldQuaternion(this.parentTurn).invert();
    } else {
      this.parentTurn.identity();
    }
    this.root.quaternion.identity();
    this.mesh.quaternion.copy(this.parentTurn).multiply(billboardTurn(camera, this.sunTurn));
    if (this.shadow) {
      this.sunTurn.setFromAxisAngle(ScenerySprite.UP, sunYaw);
      this.shadow.quaternion.copy(this.parentTurn).multiply(this.sunTurn);
    }
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.shadow?.material.dispose();
    this.shadow?.customDepthMaterial?.dispose();
  }
}

/** Paints each prop once and shares its texture between every copy on the board. */
export class PropCache {
  private readonly arts = new Map<string, { art: PropArt; texture: THREE.DataTexture }>();

  public get(key: string, paint: () => PropArt): { art: PropArt; texture: THREE.DataTexture } {
    let entry = this.arts.get(key);
    if (!entry) {
      const art = paint();
      entry = { art, texture: spriteTexture(art.raster) };
      this.arts.set(key, entry);
    }
    return entry;
  }

  public sprite(key: string, paint: () => PropArt, options?: ScenerySpriteOptions): ScenerySprite {
    const { art, texture } = this.get(key, paint);
    return new ScenerySprite(art, texture, options);
  }

  public dispose(): void {
    for (const { texture } of this.arts.values()) texture.dispose();
    this.arts.clear();
  }
}

/** Ragged rings the island's flanks pass through on the way down to its keel. */
const CLIFF_RINGS = [
  { drop: 0, inset: 0, jitter: 0 },
  { drop: 1.8, inset: 0.1, jitter: 0.06 },
  { drop: 2.7, inset: 0.6, jitter: 0.18 },
  { drop: 3.5, inset: 1.7, jitter: 0.32 },
  { drop: 4.3, inset: 3.0, jitter: 0.42 },
];
const KEEL_DROP = 6.0;
/** Target spacing of the cliff's columns of vertices, in tiles. */
const CLIFF_STEP = 0.6;

/**
 * The island's underside: walls hanging from the rim's outline that taper through ragged rings
 * to a keel. UVs are in painting repeats (u around the island, v down the face) so the cliff
 * keeps the board's texel size; each side has its own vertices, so corners stay crisp.
 */
export function islandCliffGeometry(
  halfW: number,
  halfD: number,
  top: number,
): THREE.BufferGeometry {
  const lengths = [halfW * 2, halfD * 2, halfW * 2, halfD * 2];
  const segments = lengths.map((length) => Math.max(2, Math.round(length / CLIFF_STEP)));
  const normals = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const maxInset = Math.min(halfW, halfD) - 0.4;
  /** One ring as a closed loop of points, starting at the north-west corner, clockwise. */
  const ring = (k: number): number[][] => {
    const { drop, inset, jitter } = CLIFF_RINGS[k];
    const hx = halfW - Math.min(inset, maxInset);
    const hz = halfD - Math.min(inset, maxInset);
    const corners = [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ];
    const points: number[][] = [];
    corners.forEach(([ax, az], s) => {
      const [bx, bz] = corners[(s + 1) % 4];
      for (let i = 0; i < segments[s]; i++) {
        const t = i / segments[s];
        const id = points.length;
        const out = (hash(id, k, 91) - 0.5) * 2 * jitter;
        const sag = k > 1 ? (hash(id, k, 92) - 0.5) * 2 * jitter * 0.8 : 0;
        points.push([
          ax + (bx - ax) * t + normals[s][0] * out,
          top - drop + sag,
          az + (bz - az) * t + normals[s][1] * out,
        ]);
      }
    });
    return points;
  };
  const rings = CLIFF_RINGS.map((_, k) => ring(k));
  // Painting rows run down the face: distance travelled from ring to ring
  const depthOf = [0];
  for (let k = 1; k < CLIFF_RINGS.length; k++) {
    const a = CLIFF_RINGS[k - 1];
    const b = CLIFF_RINGS[k];
    depthOf.push(depthOf[k - 1] + Math.hypot(b.drop - a.drop, b.inset - a.inset));
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let start = 0;
  let around = 0;
  const keelTip = [0.4, top - KEEL_DROP, -0.2];
  segments.forEach((count, s) => {
    const base = positions.length / 3;
    for (let k = 0; k < rings.length; k++) {
      for (let i = 0; i <= count; i++) {
        const p = rings[k][(start + i) % rings[k].length];
        positions.push(p[0], p[1], p[2]);
        uvs.push(
          (around + (i / count) * lengths[s]) / CLIFF_TILES_WIDE,
          depthOf[k] / CLIFF_TILES_DEEP,
        );
      }
    }
    const columns = count + 1;
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < count; i++) {
        const a = base + k * columns + i;
        const b = a + columns;
        // Wound to face outward
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    // The last ring closes on the keel's tip
    const tip = positions.length / 3;
    positions.push(keelTip[0], keelTip[1], keelTip[2]);
    uvs.push((around + lengths[s] / 2) / CLIFF_TILES_WIDE, 0.99);
    const last = base + (rings.length - 1) * columns;
    for (let i = 0; i < count; i++) indices.push(last + i, last + i + 1, tip);
    start += count;
    around += lengths[s];
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export type PropKind =
  | 'pine'
  | 'tall-pine'
  | 'round'
  | 'blossom'
  | 'autumn'
  | 'monolith'
  | 'crystals'
  | 'bush'
  | 'flowering-bush'
  | 'rock';

const TALL_KINDS: PropKind[] = [
  'pine',
  'tall-pine',
  'round',
  'blossom',
  'autumn',
  'monolith',
  'crystals',
];

/** Paints a prop; `seed` picks among a few variants so copies differ. */
export function paintProp(kind: PropKind, variant: number, hue: CrystalHue = 'cyan'): PropArt {
  const foliage: Record<string, Foliage> = { round: 'green', blossom: 'blossom', autumn: 'autumn' };
  switch (kind) {
    case 'pine':
      return paintPine(variant + 1, 56 + variant * 4);
    case 'tall-pine':
      return paintPine(variant + 11, 72 + variant * 4);
    case 'round':
    case 'blossom':
    case 'autumn':
      return paintRoundTree(variant + 21, foliage[kind]);
    case 'monolith':
      return paintMonolith(variant + 31);
    case 'crystals':
      return paintCrystals(variant + 41, hue);
    case 'bush':
      return paintBush(variant + 51, 'green');
    case 'flowering-bush':
      return paintBush(variant + 61, 'blossom');
    case 'rock':
      return paintRock(variant + 71);
  }
}

/** How often each prop grows on a map's rim, tall and low, plus its crystal colour. */
export interface SceneryTheme {
  tall: Partial<Record<PropKind, number>>;
  low: Partial<Record<PropKind, number>>;
  hue: CrystalHue;
}

export const SCENERY_THEMES: Record<string, SceneryTheme> = {
  'verdant-crossroads': {
    tall: { pine: 4, 'tall-pine': 3, round: 3, blossom: 1, monolith: 1, crystals: 1 },
    low: { bush: 4, 'flowering-bush': 2, rock: 2 },
    hue: 'cyan',
  },
  'sunken-sanctum': {
    tall: { monolith: 4, crystals: 3, pine: 2, round: 2 },
    low: { rock: 4, bush: 3 },
    hue: 'violet',
  },
  'molten-caldera': {
    tall: { autumn: 4, crystals: 3, monolith: 1, pine: 1 },
    low: { rock: 5, bush: 1 },
    hue: 'ember',
  },
};

function pick(weights: Partial<Record<PropKind, number>>, roll: number): PropKind {
  const entries = Object.entries(weights) as [PropKind, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let at = roll * total;
  for (const [kind, weight] of entries) {
    at -= weight;
    if (at < 0) return kind;
  }
  return entries[entries.length - 1][0];
}

export interface RimProp {
  kind: PropKind;
  variant: number;
  /** Board coordinates: tile units from the board's centre. */
  x: number;
  z: number;
  tall: boolean;
}

/**
 * Scatters props over the rim around a `width` x `height` board: a tall one (tree, standing
 * stone, crystals) on most rim tiles, and low ones (bushes, rocks) between.
 */
export function layoutRimProps(
  width: number,
  height: number,
  rim: number,
  theme: SceneryTheme,
  seed = 1,
): RimProp[] {
  const props: RimProp[] = [];
  const cols = width + rim * 2;
  const rows = height + rim * 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c >= rim && c < cols - rim && r >= rim && r < rows - rim) continue;
      const x = c - (cols - 1) / 2;
      const z = r - (rows - 1) / 2;
      const roll = (i: number) => hash(c * 7 + i, r * 13 + seed, 93);
      // Outward from the board, so tall props lean away from it
      const outX = c < rim ? -1 : c >= cols - rim ? 1 : 0;
      const outZ = r < rim ? -1 : r >= rows - rim ? 1 : 0;
      if (roll(0) < 0.72) {
        const kind = pick(theme.tall, roll(1));
        const tall = TALL_KINDS.includes(kind);
        const push = tall ? 0.22 : 0;
        props.push({
          kind,
          variant: Math.floor(roll(2) * 3),
          x: x + outX * push + (outX ? 0 : (roll(3) - 0.5) * 0.4),
          z: z + outZ * push + (outZ ? 0 : (roll(4) - 0.5) * 0.4),
          tall,
        });
      }
      if (roll(5) < 0.55) {
        props.push({
          kind: pick(theme.low, roll(6)),
          variant: Math.floor(roll(7) * 3),
          x: x + (roll(8) - 0.5) * 0.7,
          z: z + (roll(9) > 0.5 ? 0.3 : -0.3),
          tall: false,
        });
      }
    }
  }
  return props;
}

/** How far a tall prop's crown reaches to either side of its trunk, in tiles. */
const CROWN_REACH = 0.4;

/**
 * True when a tall prop at (x, z) would hide part of the board from a camera looking along the
 * horizontal direction (dx, dz): the board lies just beyond it, away from the camera, within
 * reach of its crown.
 */
export function blocksBoard(
  x: number,
  z: number,
  dx: number,
  dz: number,
  halfW: number,
  halfD: number,
): boolean {
  const length = Math.hypot(dx, dz) || 1;
  const [ux, uz] = [dx / length, dz / length];
  for (let s = 0.5; s <= 2.6; s += 0.35) {
    for (const side of [-CROWN_REACH, 0, CROWN_REACH]) {
      // Step away from the camera, and across the view to the crown's edges
      const px = x - ux * s - uz * side;
      const pz = z - uz * s + ux * side;
      if (Math.abs(px) <= halfW && Math.abs(pz) <= halfD) return true;
    }
  }
  return false;
}
