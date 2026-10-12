import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TowerClassId } from '../../core/models/tower.model';
import { MobTypeId } from '../../core/models/mob.model';

/*
 * Battlefield miniatures, sculpted from primitives to match the character art in
 * assets/sprites and assets/monsters: chibi proportions, the art's own palettes,
 * three-band cel shading and an ink outline like the sprites' line work.
 */

const TAU = Math.PI * 2;
/** World-space thickness of the ink line drawn around every miniature. */
export const INK_WIDTH = 0.016;
const INK_COLOR = 0x1a1424;

export interface MiniatureOptions {
  /** Ink outlines add a draw call per joint, so CPU-rasterized WebGL can opt out. */
  outline?: boolean;
}

type Vec = [number, number, number];

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

let toonRamp: THREE.DataTexture | null = null;

/**
 * Three hard light bands give the cel-shaded look of the character art. Calibrated with the
 * battlefield lights so the lit band lands on the sprite palette itself (see toneMapped below).
 */
export function ramp(): THREE.DataTexture {
  if (!toonRamp) {
    toonRamp = new THREE.DataTexture(new Uint8Array([40, 105, 165]), 3, 1, THREE.RedFormat);
    toonRamp.minFilter = THREE.NearestFilter;
    toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}

/** Black base with an emissive ink colour, so hit flashes tint the outline too. */
export function inkMaterial(): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: 0x000000,
    emissive: INK_COLOR,
    side: THREE.BackSide,
  });
  mat.userData['ink'] = true;
  mat.toneMapped = false;
  return mat;
}

/** One material per colour within a model, so parts can be batched; never shared across models. */
class Palette {
  private readonly cache = new Map<string, THREE.MeshToonMaterial>();

  paint(color: number, doubleSided = false): THREE.MeshToonMaterial {
    return this.get(`paint-${color}-${doubleSided}`, () => {
      const mat = new THREE.MeshToonMaterial({ color, gradientMap: ramp() });
      if (doubleSided) mat.side = THREE.DoubleSide;
      return mat;
    });
  }

  /**
   * Self-lit parts (fire, magic, eyes) skip the outline so they read as light. At full
   * intensity they ignore lighting and show their exact colour; below it they add a sheen.
   */
  glow(color: number, intensity = 1): THREE.MeshToonMaterial {
    return this.get(`glow-${color}-${intensity}`, () => {
      const full = intensity >= 1;
      const mat = new THREE.MeshToonMaterial({
        color: full ? 0x000000 : color,
        emissive: color,
        emissiveIntensity: full ? 1 : intensity,
        gradientMap: ramp(),
      });
      mat.userData['noOutline'] = true;
      return mat;
    });
  }

  glass(color: number, opacity: number): THREE.MeshToonMaterial {
    return this.get(`glass-${color}-${opacity}`, () => {
      const mat = new THREE.MeshToonMaterial({
        color,
        gradientMap: ramp(),
        transparent: true,
        opacity,
      });
      mat.userData['noOutline'] = true;
      return mat;
    });
  }

  ink(): THREE.MeshToonMaterial {
    return this.get('ink', inkMaterial);
  }

  private get(key: string, make: () => THREE.MeshToonMaterial): THREE.MeshToonMaterial {
    let mat = this.cache.get(key);
    if (!mat) {
      mat = make();
      // Filmic tone mapping desaturates the art's bold colours; miniatures keep them exact
      mat.toneMapped = false;
      this.cache.set(key, mat);
    }
    return mat;
  }
}

// ---------------------------------------------------------------------------
// Geometry shorthands
// ---------------------------------------------------------------------------

/** Segment count scaled to size: eyes and rivets stay cheap, heads stay round. */
const detail = (r: number) => (r < 0.03 ? 6 : r < 0.09 ? 10 : 16);
const ball = (r: number) => new THREE.SphereGeometry(r, detail(r), Math.ceil(detail(r) * 0.75));
const dome = (r: number, arc = Math.PI / 2, start = 0) =>
  new THREE.SphereGeometry(r, detail(r), Math.ceil(detail(r) / 2), 0, TAU, start, arc);
const tube = (top: number, bottom: number, h: number, seg = 12) =>
  new THREE.CylinderGeometry(top, bottom, h, seg);
/** Open curved panel (capes, hoods, coat tails); `from`/`arc` in radians around +y, 0 = +z. */
const sheet = (top: number, bottom: number, h: number, from: number, arc: number) =>
  new THREE.CylinderGeometry(top, bottom, h, 12, 1, true, from, arc);
const spike = (r: number, h: number, seg = 10) => new THREE.ConeGeometry(r, h, seg);
const limb = (r: number, length: number) => new THREE.CapsuleGeometry(r, length, 3, 8);
const block = (w: number, h: number, d: number, round = 0.02) =>
  new RoundedBoxGeometry(
    w,
    h,
    d,
    Math.min(w, h, d) < 0.1 ? 1 : 2,
    Math.min(round, Math.min(w, h, d) * 0.45),
  );
const hoop = (radius: number, thickness: number, arc = TAU) =>
  new THREE.TorusGeometry(radius, thickness, 5, radius < 0.12 ? 14 : 22, arc);
const gem = (r: number) => new THREE.OctahedronGeometry(r);

/** Flat outline extruded into a thin slab (shields, wings, crests). */
function slab(points: [number, number][], depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  return geometry.translate(0, 0, -depth / 2);
}

function put(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  at: Vec,
  rot?: Vec,
  scale?: Vec,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...at);
  if (rot) mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Places a cone-like part so its +y axis points along `dir`, starting at `from`. */
function aim(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  from: Vec,
  dir: Vec,
  length: number,
): THREE.Mesh {
  const d = new THREE.Vector3(...dir).normalize();
  const mesh = put(parent, geometry, mat, [
    from[0] + (d.x * length) / 2,
    from[1] + (d.y * length) / 2,
    from[2] + (d.z * length) / 2,
  ]);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  return mesh;
}

function joint(parent: THREE.Object3D, name: string, at: Vec): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...at);
  parent.add(group);
  return group;
}

/** Rest angle that animateModel layers its swings on top of. */
function rest(object: THREE.Object3D, x: number): void {
  object.rotation.x = x;
  object.userData['restX'] = x;
}

// ---------------------------------------------------------------------------
// Ink outlines and batching
// ---------------------------------------------------------------------------

/** Parts smaller than this (eyes, rivets, catch-lights) are too small to need a line. */
const MIN_INKED = 0.03;

function extent(mesh: THREE.Mesh): number {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const s = mesh.scale;
  return (
    mesh.geometry.boundingSphere!.radius * Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z))
  );
}

/** Inverted hull: the part pushed out along its welded normals, drawn back-faces only. */
function inkGeometry(mesh: THREE.Mesh, local: boolean): THREE.BufferGeometry {
  const source = mesh.geometry;
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', source.getAttribute('position').clone());
  if (source.index) shell.setIndex(source.index.clone());
  const welded = mergeVertices(shell);
  shell.dispose();
  welded.computeVertexNormals();
  const pos = welded.getAttribute('position');
  const nrm = welded.getAttribute('normal');
  // Divide by the part's own scale so squashed spheres keep an even line width
  const sx = INK_WIDTH / Math.max(Math.abs(mesh.scale.x), 1e-3);
  const sy = INK_WIDTH / Math.max(Math.abs(mesh.scale.y), 1e-3);
  const sz = INK_WIDTH / Math.max(Math.abs(mesh.scale.z), 1e-3);
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nrm.getX(i) * sx,
      pos.getY(i) + nrm.getY(i) * sy,
      pos.getZ(i) + nrm.getZ(i) * sz,
    );
  }
  if (!local) {
    mesh.updateMatrix();
    welded.applyMatrix4(mesh.matrix);
  }
  return welded;
}

/**
 * Merges fixed parts per joint and material (articulated joints keep their own pivots),
 * then wraps each joint in a single merged ink shell.
 */
function finish(root: THREE.Group, palette: Palette, options: MiniatureOptions): THREE.Group {
  const ink = options.outline === false ? null : palette.ink();
  const groups: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Group) groups.push(object);
  });
  for (const group of groups) {
    const shells: THREE.BufferGeometry[] = [];
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      const outlined =
        ink !== null && !child.material.userData['noOutline'] && extent(child) > MIN_INKED;
      if (child.name) {
        // Named parts animate on their own, so their outline rides along as a child
        if (outlined) child.add(new THREE.Mesh(inkGeometry(child, true), ink));
        continue;
      }
      if (outlined) shells.push(inkGeometry(child, false));
      const list = batches.get(child.material) ?? [];
      list.push(child);
      batches.set(child.material, list);
    }
    for (const [mat, meshes] of batches) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((mesh) => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(geometries);
      geometries.forEach((item) => item.dispose());
      if (!geometry) continue;
      for (const mesh of meshes) {
        group.remove(mesh);
        mesh.geometry.dispose();
      }
      put(group, geometry, mat, [0, 0, 0]);
    }
    if (ink && shells.length) {
      const geometry = mergeGeometries(shells);
      shells.forEach((item) => item.dispose());
      if (geometry) group.add(new THREE.Mesh(geometry, ink));
    }
  }
  return root;
}

// ---------------------------------------------------------------------------
// Shared humanoid rig
// ---------------------------------------------------------------------------

interface Outfit {
  skin: number;
  top: number;
  legs: number;
  boots: number;
  sleeve?: number;
  hand?: number;
  belt?: number;
  buckle?: number;
  /** Broadens the frame; 1 is the standard chibi build. */
  bulk?: number;
}

interface Rig {
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  weapon: THREE.Group;
  offhand: THREE.Group;
}

const HIP = 0.3;
const HEAD_R = 0.185;

/** Chibi frame: feet at y=0, faces +z, head about a third of the height like the sprites. */
function humanoid(root: THREE.Group, p: Palette, o: Outfit): Rig {
  const bulk = o.bulk ?? 1;
  for (const side of [-1, 1]) {
    const leg = joint(root, side < 0 ? 'leg-left' : 'leg-right', [side * 0.068 * bulk, HIP, 0]);
    put(leg, limb(0.05 * bulk, 0.12), p.paint(o.legs), [0, -0.1, 0]);
    put(leg, block(0.1 * bulk, 0.1, 0.16, 0.035), p.paint(o.boots), [0, -0.25, 0.022]);
  }
  const torso = joint(root, 'torso', [0, HIP, 0]);
  put(torso, tube(0.112 * bulk, 0.132 * bulk, 0.26), p.paint(o.top), [0, 0.135, 0]);
  put(torso, tube(0.134 * bulk, 0.138 * bulk, 0.08), p.paint(o.legs), [0, 0.02, 0]);
  if (o.belt !== undefined) {
    put(torso, tube(0.14 * bulk, 0.14 * bulk, 0.038), p.paint(o.belt), [0, 0.065, 0]);
  }
  if (o.buckle !== undefined) {
    put(torso, block(0.05, 0.042, 0.02, 0.006), p.paint(o.buckle), [0, 0.065, 0.14 * bulk]);
  }

  const arms = [-1, 1].map((side) => {
    const arm = joint(torso, side < 0 ? 'arm-left' : 'arm-right', [side * 0.152 * bulk, 0.235, 0]);
    arm.rotation.z = side * 0.14;
    put(arm, ball(0.054 * bulk), p.paint(o.sleeve ?? o.top), [0, 0, 0]);
    put(arm, limb(0.042 * bulk, 0.1), p.paint(o.sleeve ?? o.top), [0, -0.085, 0]);
    put(arm, ball(0.046 * bulk), p.paint(o.hand ?? o.skin), [0, -0.178, 0.008]);
    return arm;
  });
  const [armL, armR] = arms;
  const head = joint(torso, 'head', [0, 0.44, 0]);
  put(head, ball(HEAD_R), p.paint(o.skin), [0, 0, 0]);
  return {
    torso,
    head,
    armL,
    armR,
    weapon: joint(armR, 'weapon', [0, -0.18, 0.02]),
    offhand: joint(armL, 'offhand', [0, -0.18, 0.02]),
  };
}

/** Big chibi eyes: dark ovals with a catch-light. */
function eyes(head: THREE.Object3D, p: Palette, iris = 0x2b2140, y = -0.035, gap = 0.068): void {
  for (const side of [-1, 1]) {
    const z = Math.sqrt(HEAD_R ** 2 - gap ** 2 - y ** 2) - 0.004;
    put(head, ball(0.026), p.paint(iris), [side * gap, y, z], undefined, [0.75, 1.25, 0.5]);
    put(head, ball(0.008), p.paint(0xffffff), [side * gap + 0.008, y + 0.012, z + 0.011]);
  }
}

/** Crown and back volume of a hairstyle; per-character fringes and spikes go on top. */
function hairCap(head: THREE.Object3D, mat: THREE.Material, fringe = 0.5): void {
  put(head, dome(HEAD_R + 0.014, Math.PI * fringe), mat, [0, 0.004, -0.004]);
  put(head, ball(HEAD_R + 0.004), mat, [0, -0.02, -0.04]);
}

/** Tapered hair or horn strands radiating from the head centre. */
function tufts(
  head: THREE.Object3D,
  mat: THREE.Material,
  strands: { dir: Vec; length: number; width: number }[],
  base = HEAD_R * 0.86,
): void {
  for (const { dir, length, width } of strands) {
    const d = new THREE.Vector3(...dir).normalize();
    aim(head, spike(width, length, 6), mat, [d.x * base, d.y * base, d.z * base], dir, length);
  }
}

/** Long open robe skirt hung from the waist; hides the legs like the casters' art. */
function robe(
  root: THREE.Object3D,
  mat: THREE.Material,
  top: number,
  bottom: number,
  waistY = 0.42,
  hemY = 0.02,
): THREE.Mesh {
  return put(root, tube(top, bottom, waistY - hemY, 18), mat, [0, (waistY + hemY) / 2, 0]);
}

function cape(rig: Rig, mat: THREE.Material, length = 0.46, flare = 0.22): void {
  const pivot = joint(rig.torso, 'cape', [0, 0.25, -0.06]);
  put(pivot, sheet(0.13, flare, length, Math.PI / 2, Math.PI), mat, [0, -length / 2, 0]);
  rest(pivot, 0.16);
}

/** Hood around the head, open at the face, ending in a soft point at the back. */
function hood(head: THREE.Object3D, mat: THREE.Material): void {
  const shell = new THREE.SphereGeometry(
    HEAD_R + 0.034,
    18,
    12,
    Math.PI / 2 + 0.78,
    TAU - 1.56,
    0,
    Math.PI * 0.74,
  );
  put(head, shell, mat, [0, 0.012, -0.012]);
  aim(head, spike(0.1, 0.17, 12), mat, [0, 0.11, -0.13], [0, 0.35, -1], 0.17);
}

/** Bell sleeve flaring at the wrist, as on the casters' robes. */
function bellSleeves(rig: Rig, mat: THREE.Material, trim?: THREE.Material): void {
  for (const arm of [rig.armL, rig.armR]) {
    put(arm, tube(0.048, 0.08, 0.1), mat, [0, -0.13, 0]);
    if (trim) put(arm, tube(0.082, 0.082, 0.018), trim, [0, -0.18, 0]);
  }
}

/** Points arranged around a robe hem, e.g. the Oracle's red chevrons. */
function hemPattern(
  root: THREE.Object3D,
  mat: THREE.Material,
  radius: number,
  y: number,
  count: number,
  size: number,
): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    put(
      root,
      spike(size * 0.5, size, 3),
      mat,
      [Math.sin(a) * radius, y, Math.cos(a) * radius],
      [0, a, 0],
    ).scale.set(1, 1, 0.3);
  }
}

/** Speckles of starlight scattered over a robe. */
function starlight(root: THREE.Object3D, mat: THREE.Material, radius: number, seed: number): void {
  for (let i = 0; i < 7; i++) {
    const a = seed + i * 2.39;
    const y = 0.08 + ((i * 0.37) % 1) * 0.28;
    const r = radius - (y - 0.02) * 0.22 + 0.005;
    put(root, gem(0.012), mat, [Math.sin(a) * r, y, Math.cos(a) * r]);
  }
}

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------

const SKIN = 0xf4c9a4;
const LEATHER = 0x6b4329;
const GOLD = 0xe3b54f;
const STEEL = 0xa9b8c8;
const STEEL_DARK = 0x6f7f94;
const BLADE = 0xe4ebf2;

function bladeWarden(root: THREE.Group, p: Palette): void {
  const blue = 0x2f5fae;
  const rig = humanoid(root, p, {
    skin: SKIN,
    top: STEEL,
    legs: STEEL_DARK,
    boots: STEEL,
    hand: STEEL_DARK,
    belt: LEATHER,
    buckle: GOLD,
  });
  // Blue tabard with gold hem and a crest at the chest
  put(rig.torso, block(0.15, 0.32, 0.024, 0.01), p.paint(blue), [0, 0.02, 0.128]);
  put(rig.torso, block(0.16, 0.024, 0.03, 0.008), p.paint(GOLD), [0, -0.135, 0.13]);
  put(rig.torso, gem(0.026), p.paint(GOLD), [0, 0.17, 0.142], undefined, [1, 1.2, 0.4]);
  for (const arm of [rig.armL, rig.armR]) {
    put(arm, dome(0.078, Math.PI * 0.55), p.paint(STEEL), [0, 0.012, 0]);
  }
  // Spiky brown hair, swept up and back
  const hair = p.paint(0x6e4227);
  eyes(rig.head, p, 0x3b5d7a);
  hairCap(rig.head, hair, 0.44);
  tufts(rig.head, hair, [
    { dir: [0, 1, 0.35], length: 0.13, width: 0.06 },
    { dir: [0.45, 0.85, 0.25], length: 0.12, width: 0.055 },
    { dir: [-0.45, 0.85, 0.25], length: 0.12, width: 0.055 },
    { dir: [0.2, 0.7, -0.6], length: 0.13, width: 0.06 },
    { dir: [-0.25, 0.7, -0.6], length: 0.13, width: 0.06 },
    { dir: [0.65, 0.25, -0.3], length: 0.09, width: 0.05 },
    { dir: [-0.65, 0.25, -0.3], length: 0.09, width: 0.05 },
    { dir: [0.15, 0.55, 1], length: 0.08, width: 0.045 },
  ]);
  // Longsword, angled forward like a guard stance
  rest(rig.weapon, 0.55);
  sword(rig.weapon, p, 0.44, p.paint(BLADE));
  // Kite shield: steel rim around a blue field with a gold boss
  kiteShield(rig.offhand, p, STEEL, blue, GOLD, 1);
}

function sword(weapon: THREE.Object3D, p: Palette, length: number, blade: THREE.Material): void {
  put(weapon, tube(0.017, 0.017, 0.11), p.paint(LEATHER), [0, 0, 0]);
  put(weapon, ball(0.022), p.paint(GOLD), [0, -0.06, 0]);
  put(weapon, block(0.14, 0.026, 0.036, 0.01), p.paint(GOLD), [0, 0.065, 0]);
  put(
    weapon,
    tube(0.012, 0.03, length, 4),
    blade,
    [0, 0.08 + length / 2, 0],
    [0, Math.PI / 4, 0],
    [1, 1, 0.4],
  );
}

function kiteShield(
  offhand: THREE.Object3D,
  p: Palette,
  rim: number,
  field: number,
  boss: number,
  size: number,
): THREE.Group {
  const shield = joint(offhand, 'shield', [-0.03, 0.02, 0.06]);
  shield.rotation.set(0, -0.55, 0);
  const kite: [number, number][] = [
    [0, 0.15],
    [0.11, 0.11],
    [0.1, -0.02],
    [0, -0.17],
    [-0.1, -0.02],
    [-0.11, 0.11],
  ].map(([x, y]) => [x * size, y * size]);
  put(shield, slab(kite, 0.03), p.paint(rim), [0, 0, 0]);
  const inner = kite.map(([x, y]): [number, number] => [x * 0.78, y * 0.8 - 0.005]);
  put(shield, slab(inner, 0.034), p.paint(field), [0, 0, 0.002]);
  put(shield, ball(0.03 * size), p.paint(boss), [0, 0.03, 0.02], undefined, [1, 1, 0.5]);
  return shield;
}

function ranger(root: THREE.Group, p: Palette): void {
  const green = 0x4f8d3c;
  const forest = 0x2f6a3a;
  const rig = humanoid(root, p, {
    skin: SKIN,
    top: green,
    legs: 0x5a4632,
    boots: 0x6f4a2c,
    belt: LEATHER,
    buckle: GOLD,
  });
  // Tunic flares past the belt; a forest-green cloak hangs behind
  put(rig.torso, tube(0.136, 0.17, 0.11), p.paint(green), [0, -0.02, 0]);
  cape(rig, p.paint(forest, true), 0.44, 0.24);
  put(rig.torso, hoop(0.12, 0.035), p.paint(forest), [0, 0.25, -0.01], [Math.PI / 2, 0, 0]);
  // Quiver across the back
  put(rig.torso, tube(0.045, 0.04, 0.3), p.paint(LEATHER), [0.07, 0.2, -0.15], [0, 0, -0.45]);
  for (const [dx, h] of [
    [0, 0.08],
    [0.03, 0.06],
    [-0.025, 0.07],
  ]) {
    put(rig.torso, spike(0.025, h, 4), p.paint(0xe9e2d0), [0.15 + dx, 0.37, -0.15], [0, 0, -0.45]);
  }
  // Blond hair, pointed ears and a feathered cap
  const hair = p.paint(0xe6c46c);
  eyes(rig.head, p, 0x3f6fa0);
  hairCap(rig.head, hair, 0.5);
  for (const side of [-1, 1]) {
    aim(
      rig.head,
      spike(0.035, 0.14, 6),
      p.paint(SKIN),
      [side * 0.16, -0.02, -0.01],
      [side, 0.45, -0.35],
      0.14,
    );
    put(rig.head, block(0.05, 0.12, 0.05, 0.02), hair, [side * 0.15, -0.08, 0.06]);
  }
  // Cap crown tilts back off the brow and sweeps into a peak behind the head
  put(
    rig.head,
    dome(HEAD_R + 0.032, Math.PI * 0.42),
    p.paint(green),
    [0, 0.03, -0.012],
    [-0.3, 0, 0],
  );
  aim(rig.head, spike(0.14, 0.3, 14), p.paint(green), [0, 0.15, -0.07], [0, 0.45, -1], 0.3);
  put(rig.head, hoop(0.205, 0.026), p.paint(forest), [0, 0.085, -0.035], [Math.PI / 2 - 0.3, 0, 0]);
  aim(
    rig.head,
    spike(0.04, 0.34, 6),
    p.paint(0xf4ead2),
    [0.16, 0.1, -0.06],
    [0.45, 1, -0.55],
    0.34,
  ).scale.set(1, 1, 0.35);
  // Longbow held out in the left hand
  rest(rig.armL, -0.7);
  const bow = joint(rig.offhand, 'bow', [0, 0, 0.02]);
  bow.rotation.set(0.7, 0, 0);
  put(
    bow,
    hoop(0.27, 0.017, Math.PI * 0.95),
    p.paint(0x8c5a32),
    [0, 0, 0],
    [0, Math.PI / 2, Math.PI / 2 + 0.08],
  );
  put(bow, tube(0.004, 0.004, 0.52, 4), p.paint(0xf2eee2), [0, 0, -0.01]);
}

function elementalist(root: THREE.Group, p: Palette): void {
  const blue = 0x5569cc;
  const deep = 0x3a4796;
  const rig = humanoid(root, p, {
    skin: 0x17131f,
    top: blue,
    legs: 0xd8c6a0,
    boots: 0x6d4428,
    hand: 0x8a5a3a,
    belt: LEATHER,
    buckle: GOLD,
  });
  // Knee-length robe and tall collar framing the shadowed face
  put(rig.torso, tube(0.13, 0.23, 0.22), p.paint(blue), [0, -0.07, 0]);
  put(rig.torso, tube(0.142, 0.142, 0.04), p.paint(LEATHER), [0, 0.065, 0]);
  put(rig.torso, tube(0.13, 0.1, 0.07), p.paint(deep), [0, 0.27, 0]);
  bellSleeves(rig, p.paint(blue));
  for (const side of [-1, 1]) {
    put(
      rig.head,
      ball(0.03),
      p.glow(0xffd84a),
      [side * 0.065, -0.035, 0.16],
      undefined,
      [0.8, 1.2, 0.5],
    );
  }
  // The signature hat: broad drooping brim, tall crumpled crown, tan band
  put(rig.head, tube(0.34, 0.34, 0.024, 24), p.paint(blue), [0, 0.07, 0.01], [0.12, 0, 0]);
  put(rig.head, tube(0.16, 0.19, 0.07, 18), p.paint(0xc9a35a), [0, 0.12, 0]);
  put(rig.head, tube(0.15, 0.2, 0.18, 18), p.paint(blue), [0, 0.24, -0.01], [-0.12, 0, 0]);
  put(rig.head, spike(0.152, 0.3, 16), p.paint(blue), [0.06, 0.43, -0.06], [-0.4, 0, -0.6]);
  // A live flame cupped in the casting hand
  const flame = joint(rig.weapon, 'focus', [0, 0.04, 0.05]);
  put(flame, ball(0.06), p.glow(0xffd24a), [0, 0.02, 0]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    aim(
      flame,
      spike(0.038, 0.13, 6),
      p.glow(0xff7a1f),
      [Math.cos(a) * 0.035, 0.02, Math.sin(a) * 0.035],
      [Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35],
      0.13,
    );
  }
  aim(flame, spike(0.04, 0.18, 6), p.glow(0xff9b2f), [0, 0.04, 0], [0, 1, 0], 0.18);
  rest(rig.armR, -0.5);
}

function chronomancer(root: THREE.Group, p: Palette): void {
  const purple = 0x5f309c;
  const lilac = 0x8150c4;
  const rig = humanoid(root, p, {
    skin: SKIN,
    top: purple,
    legs: purple,
    boots: 0x5a3a26,
    belt: GOLD,
  });
  const robeMat = p.paint(purple);
  robe(root, robeMat, 0.15, 0.26);
  put(root, tube(0.262, 0.262, 0.03, 18), p.paint(GOLD), [0, 0.035, 0]);
  put(root, block(0.05, 0.38, 0.03, 0.01), p.paint(GOLD), [0, 0.22, 0.2], [-0.27, 0, 0]);
  starlight(root, p.glow(0xf3e9ff), 0.24, 0.4);
  bellSleeves(rig, robeMat, p.paint(GOLD));
  // Flared collar and a clockwork medallion
  put(
    rig.torso,
    sheet(0.16, 0.12, 0.13, Math.PI * 0.4, Math.PI * 1.2),
    p.paint(lilac, true),
    [0, 0.3, 0],
  );
  put(rig.torso, tube(0.04, 0.04, 0.02), p.paint(GOLD), [0, 0.19, 0.125], [Math.PI / 2, 0, 0]);
  put(rig.torso, ball(0.022), p.glow(0x9fd8ff), [0, 0.19, 0.138], undefined, [1, 1, 0.5]);
  // Blond bob framing the face
  const hair = p.paint(0xe8c46c);
  eyes(rig.head, p, 0x3b6a8c);
  hairCap(rig.head, hair, 0.47);
  for (const side of [-1, 1]) {
    put(rig.head, ball(0.08), hair, [side * 0.135, -0.07, 0.0], undefined, [0.65, 1.3, 1]);
  }
  tufts(rig.head, hair, [
    { dir: [0.3, 0.4, 1], length: 0.07, width: 0.05 },
    { dir: [-0.15, 0.45, 1], length: 0.07, width: 0.05 },
  ]);
  // Hourglass staff, held out clear of the robe
  rig.armR.rotation.z = 0.38;
  const staff = rig.weapon;
  staff.rotation.z = -0.38;
  put(staff, tube(0.022, 0.022, 0.82), p.paint(0x7a4b2a), [0, 0.18, 0]);
  const glass = joint(staff, 'focus', [0, 0.68, 0]);
  for (const y of [-0.1, 0.1]) put(glass, tube(0.075, 0.075, 0.024), p.paint(GOLD), [0, y, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    put(glass, tube(0.008, 0.008, 0.2, 5), p.paint(GOLD), [
      Math.cos(a) * 0.06,
      0,
      Math.sin(a) * 0.06,
    ]);
  }
  for (const flip of [1, -1]) {
    put(
      glass,
      spike(0.05, 0.088, 12),
      p.glass(0xbfe8ff, 0.55),
      [0, flip * 0.045, 0],
      [flip > 0 ? Math.PI : 0, 0, 0],
    );
  }
  put(glass, spike(0.04, 0.045, 10), p.paint(0xe9c27c), [0, -0.065, 0]);
}

function oracle(root: THREE.Group, p: Palette): void {
  const white = 0xf4efe8;
  const red = 0xc23a36;
  const rig = humanoid(root, p, {
    skin: SKIN,
    top: white,
    legs: white,
    boots: 0x8a5a3a,
    belt: red,
  });
  const robeMat = p.paint(white);
  robe(root, robeMat, 0.15, 0.25);
  hemPattern(root, p.paint(red), 0.245, 0.1, 9, 0.15);
  put(root, tube(0.252, 0.252, 0.025, 18), p.paint(red), [0, 0.03, 0]);
  put(root, block(0.04, 0.36, 0.03, 0.01), p.paint(red), [0, 0.22, 0.195], [-0.27, 0, 0]);
  bellSleeves(rig, robeMat, p.paint(red));
  // Hood over light brown hair
  const hair = p.paint(0xb3794a);
  eyes(rig.head, p, 0x4c6f9c);
  hairCap(rig.head, hair, 0.47);
  for (const side of [-1, 1]) {
    put(rig.head, ball(0.07), hair, [side * 0.13, -0.08, 0.04], undefined, [0.6, 1.4, 0.9]);
  }
  hood(rig.head, p.paint(white, true));
  hemPattern(rig.torso, p.paint(red), 0.125, 0.27, 6, 0.06);
  // Crescent-headed staff cradling a blue crystal, held out clear of the robe
  rig.armR.rotation.z = 0.38;
  const staff = rig.weapon;
  staff.rotation.z = -0.38;
  put(staff, tube(0.022, 0.022, 0.82), p.paint(0x8a5a32), [0, 0.18, 0]);
  put(
    staff,
    hoop(0.065, 0.014, Math.PI * 1.5),
    p.paint(GOLD),
    [0, 0.66, 0],
    [0, 0, -Math.PI * 1.25],
  );
  const crystal = put(staff, gem(0.05), p.glow(0x7fd4ff), [0, 0.67, 0], undefined, [0.8, 1.3, 0.8]);
  crystal.name = 'focus';
}

function rogue(root: THREE.Group, p: Palette): void {
  const vest = 0x7b4a2a;
  const red = 0xc8302c;
  const rig = humanoid(root, p, {
    skin: SKIN,
    top: 0xeadcc0,
    legs: 0x55513f,
    boots: 0x6b4226,
    belt: LEATHER,
    buckle: GOLD,
  });
  // Open leather vest and tall turned-down boots
  put(
    rig.torso,
    sheet(0.121, 0.141, 0.25, Math.PI * 0.2, Math.PI * 1.6),
    p.paint(vest, true),
    [0, 0.14, 0],
  );
  for (const name of ['leg-left', 'leg-right']) {
    const leg = root.getObjectByName(name)!;
    put(leg, tube(0.068, 0.062, 0.05), p.paint(0x7a5232), [0, -0.165, 0.01]);
  }
  // Messy brown hair under a red bandana with trailing tails
  const hair = p.paint(0x6b3d22);
  eyes(rig.head, p, 0x4a3326);
  hairCap(rig.head, hair, 0.5);
  tufts(rig.head, hair, [
    { dir: [0.2, 1, 0.2], length: 0.09, width: 0.05 },
    { dir: [-0.35, 0.9, 0.1], length: 0.08, width: 0.05 },
    { dir: [0.6, 0.6, 0.3], length: 0.07, width: 0.045 },
    { dir: [-0.1, 0.3, 1], length: 0.07, width: 0.045 },
  ]);
  const band = p.paint(red);
  put(rig.head, tube(HEAD_R + 0.018, HEAD_R + 0.022, 0.06, 18), band, [0, 0.06, 0], [-0.18, 0, 0]);
  put(rig.head, ball(0.04), band, [0, 0.03, -0.2]);
  for (const side of [-1, 1]) {
    aim(
      rig.head,
      block(0.05, 0.16, 0.014, 0.006),
      band,
      [side * 0.02, 0.02, -0.21],
      [side * 0.4, -1, -0.5],
      0.16,
    );
  }
  // A dagger in each hand, points forward
  for (const hand of [rig.weapon, rig.offhand]) {
    rest(hand, 1.3);
    put(hand, tube(0.014, 0.014, 0.08), p.paint(0x4a3322), [0, 0, 0]);
    put(hand, block(0.07, 0.016, 0.03, 0.006), p.paint(0x8c8f96), [0, 0.045, 0]);
    put(
      hand,
      tube(0.006, 0.025, 0.2, 4),
      p.paint(BLADE),
      [0, 0.15, 0],
      [0, Math.PI / 4, 0],
      [1, 1, 0.35],
    );
  }
}

function lancer(root: THREE.Group, p: Palette): void {
  const armor = 0x6a46b4;
  const dark = 0x3f2a78;
  const light = 0x9c82e2;
  const rig = humanoid(root, p, {
    skin: armor,
    top: armor,
    legs: dark,
    boots: armor,
    hand: dark,
    belt: dark,
    buckle: GOLD,
  });
  cape(rig, p.paint(0x9a2238, true), 0.48, 0.26);
  put(rig.torso, block(0.2, 0.15, 0.06, 0.03), p.paint(light), [0, 0.17, 0.09]);
  put(rig.torso, tube(0.145, 0.18, 0.1), p.paint(armor), [0, -0.02, 0]);
  for (const name of ['leg-left', 'leg-right']) {
    put(root.getObjectByName(name)!, ball(0.045), p.paint(light), [0, -0.12, 0.04]);
  }
  for (const [arm, side] of [
    [rig.armL, -1],
    [rig.armR, 1],
  ] as const) {
    put(arm, dome(0.085, Math.PI * 0.55), p.paint(armor), [0, 0.015, 0]);
    aim(
      arm,
      spike(0.025, 0.09, 6),
      p.paint(light),
      [side * 0.03, 0.06, 0],
      [side * 0.6, 1, 0],
      0.09,
    );
  }
  // Dragon helm: visor slit, crest ridge and swept wings
  const head = rig.head;
  put(head, block(0.2, 0.035, 0.05, 0.012), p.paint(0x1a1430), [0, -0.025, 0.16]);
  aim(head, spike(0.06, 0.12, 8), p.paint(armor), [0, -0.09, 0.12], [0, -0.5, 1], 0.12);
  put(head, block(0.03, 0.06, 0.3, 0.012), p.paint(light), [0, 0.18, -0.02], [-0.2, 0, 0]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      aim(
        head,
        spike(0.03, 0.2 - i * 0.04, 4),
        p.paint(0xe6e0f8),
        [side * 0.16, 0.05 - i * 0.03, -0.02],
        [side * 0.45, 0.9 - i * 0.25, -0.6],
        0.2 - i * 0.04,
      ).scale.set(1, 1, 0.35);
    }
  }
  // Long lance with a silver head, held upright
  put(rig.weapon, tube(0.017, 0.017, 1.0), p.paint(0x4c3c70), [0, 0.2, 0]);
  put(rig.weapon, tube(0.03, 0.03, 0.04), p.paint(GOLD), [0, 0.7, 0]);
  put(rig.weapon, spike(0.042, 0.3, 8), p.paint(BLADE), [0, 0.87, 0]);
}

function juggernaut(root: THREE.Group, p: Palette): void {
  const skin = 0xd99a6c;
  const iron = 0x535a66;
  const rig = humanoid(root, p, {
    skin,
    top: skin,
    legs: 0x6b4a2e,
    boots: 0x4a3322,
    hand: 0x5a3a24,
    belt: LEATHER,
    buckle: 0xb8bec6,
    bulk: 1.28,
  });
  // Bare, broad chest with crossed straps and a green kilt
  for (const side of [-1, 1]) {
    put(rig.torso, ball(0.075), p.paint(skin), [side * 0.06, 0.19, 0.09], undefined, [1, 0.8, 0.6]);
  }
  for (const side of [-1, 1]) {
    put(
      rig.torso,
      block(0.035, 0.36, 0.02, 0.008),
      p.paint(LEATHER),
      [0, 0.14, 0.15],
      [0.12, 0, side * 0.75],
    );
  }
  put(rig.torso, block(0.15, 0.17, 0.02, 0.008), p.paint(0x58652e), [0, -0.04, 0.17]);
  put(rig.torso, tube(0.18, 0.21, 0.1), p.paint(0x58652e), [0, -0.01, 0]);
  // Spiked iron pauldrons
  for (const [arm, side] of [
    [rig.armL, -1],
    [rig.armR, 1],
  ] as const) {
    put(arm, dome(0.1, Math.PI * 0.55), p.paint(iron), [0, 0.01, 0]);
    for (const [dx, dz] of [
      [0.2, 0],
      [0.6, 0.5],
      [0.6, -0.5],
    ]) {
      aim(
        arm,
        spike(0.022, 0.08, 6),
        p.paint(0xc8ced6),
        [side * dx * 0.08, 0.06, dz * 0.07],
        [side * dx, 1, dz],
        0.08,
      );
    }
  }
  // Swept-back hair and a heavy brow
  const hair = p.paint(0x5a3720);
  eyes(rig.head, p, 0x2a2118, -0.035, 0.062);
  for (const side of [-1, 1]) {
    put(
      rig.head,
      block(0.07, 0.022, 0.03, 0.008),
      hair,
      [side * 0.062, 0.012, 0.17],
      [0.2, 0, side * -0.35],
    );
  }
  hairCap(rig.head, hair, 0.4);
  tufts(rig.head, hair, [
    { dir: [0, 0.8, -0.6], length: 0.11, width: 0.07 },
    { dir: [0.4, 0.6, -0.7], length: 0.1, width: 0.06 },
    { dir: [-0.4, 0.6, -0.7], length: 0.1, width: 0.06 },
  ]);
  // Two-handed warhammer resting high
  rest(rig.weapon, 0.25);
  put(rig.weapon, tube(0.022, 0.022, 0.62), p.paint(0x7a5232), [0, 0.18, 0]);
  put(rig.weapon, block(0.26, 0.15, 0.15, 0.025), p.paint(0x9aa3ad), [0, 0.5, 0]);
  for (const x of [-0.08, 0.08]) {
    put(rig.weapon, block(0.025, 0.16, 0.16, 0.008), p.paint(iron), [x, 0.5, 0]);
  }
}

function redMage(root: THREE.Group, p: Palette): void {
  const red = 0xc1272d;
  const rig = humanoid(root, p, {
    skin: SKIN,
    top: red,
    legs: 0x2b2b33,
    boots: 0x6b4226,
    belt: LEATHER,
    buckle: GOLD,
  });
  // Long coat tails, gold facings and a white ruff
  put(
    rig.torso,
    sheet(0.14, 0.2, 0.22, Math.PI * 0.28, Math.PI * 1.44),
    p.paint(red, true),
    [0, -0.07, 0],
  );
  for (const side of [-1, 1]) {
    put(rig.torso, block(0.022, 0.26, 0.02, 0.006), p.paint(GOLD), [side * 0.045, 0.13, 0.118]);
  }
  put(rig.torso, hoop(0.1, 0.035), p.paint(0xf5f2ea), [0, 0.265, 0.01], [Math.PI / 2, 0, 0]);
  for (const name of ['leg-left', 'leg-right']) {
    put(root.getObjectByName(name)!, tube(0.07, 0.06, 0.06), p.paint(0x7a5232), [0, -0.16, 0.01]);
  }
  bellSleeves(rig, p.paint(red), p.paint(GOLD));
  // Brown hair under a cocked, plumed hat
  const hair = p.paint(0x5a3520);
  eyes(rig.head, p, 0x3a2a22);
  hairCap(rig.head, hair, 0.5);
  const hat = joint(rig.head, 'hat', [0, 0.1, 0]);
  hat.rotation.set(0.1, 0, 0.22);
  put(hat, tube(0.31, 0.31, 0.022, 24), p.paint(red), [0, 0, 0]);
  put(hat, tube(0.15, 0.175, 0.13, 18), p.paint(red), [0, 0.07, 0]);
  put(hat, tube(0.178, 0.178, 0.03, 18), p.paint(GOLD), [0, 0.02, 0]);
  const plume = p.paint(0xf6f2ea);
  for (let i = 0; i < 3; i++) {
    aim(
      hat,
      spike(0.05 - i * 0.008, 0.36 - i * 0.06, 8),
      plume,
      [-0.14, 0.05, 0.02 - i * 0.03],
      [-0.6 - i * 0.2, 0.75 - i * 0.15, -0.3 - i * 0.2],
      0.36 - i * 0.06,
    ).scale.set(1, 1, 0.45);
  }
  // Rapier with a swept gold guard
  rest(rig.weapon, 0.9);
  put(rig.weapon, tube(0.013, 0.013, 0.08), p.paint(0x3a2a22), [0, 0, 0]);
  put(rig.weapon, hoop(0.045, 0.007), p.paint(GOLD), [0, 0.05, 0], [0, Math.PI / 2, 0]);
  put(rig.weapon, ball(0.03), p.paint(GOLD), [0, 0.045, 0], undefined, [1, 0.4, 1]);
  put(rig.weapon, tube(0.004, 0.011, 0.5, 4), p.paint(BLADE), [0, 0.3, 0]);
}

function ninja(root: THREE.Group, p: Palette): void {
  const navy = 0x293a78;
  const dark = 0x1b2552;
  const rig = humanoid(root, p, {
    skin: navy,
    top: navy,
    legs: navy,
    boots: dark,
    hand: dark,
    belt: dark,
  });
  for (const arm of [rig.armL, rig.armR]) {
    put(arm, tube(0.05, 0.05, 0.08), p.paint(dark), [0, -0.12, 0]);
  }
  for (const name of ['leg-left', 'leg-right']) {
    put(root.getObjectByName(name)!, tube(0.058, 0.058, 0.07), p.paint(dark), [0, -0.15, 0]);
  }
  // Masked face: only a band of skin and the eyes show
  put(rig.head, ball(0.07), p.paint(SKIN), [0, -0.025, 0.142], undefined, [2.1, 0.62, 0.65]);
  for (const side of [-1, 1]) {
    put(
      rig.head,
      ball(0.02),
      p.paint(0x241a2a),
      [side * 0.06, -0.025, 0.185],
      undefined,
      [1.1, 0.8, 0.5],
    );
  }
  // Hood knot with long tails streaming behind
  put(rig.head, ball(0.045), p.paint(dark), [0, 0.04, -0.19]);
  for (const side of [-1, 1]) {
    aim(
      rig.head,
      block(0.055, 0.32, 0.016, 0.006),
      p.paint(navy),
      [side * 0.03, 0.03, -0.2],
      [side * 0.35, -0.35, -1],
      0.32,
    );
  }
  // Twin blades, held low and ready
  for (const hand of [rig.weapon, rig.offhand]) {
    rest(hand, 1.0);
    put(hand, tube(0.014, 0.014, 0.1), p.paint(0x2a2a3a), [0, 0, 0]);
    put(hand, tube(0.03, 0.03, 0.01), p.paint(GOLD), [0, 0.055, 0]);
    put(hand, block(0.02, 0.36, 0.006, 0.003), p.paint(BLADE), [0, 0.24, 0]);
  }
}

function samurai(root: THREE.Group, p: Palette): void {
  const red = 0xa8262b;
  const black = 0x241b1e;
  const rig = humanoid(root, p, {
    skin: SKIN,
    top: red,
    legs: 0x3a1e22,
    boots: black,
    hand: black,
    belt: GOLD,
  });
  // Laced breastplate, tiered skirt and broad shoulder plates
  put(rig.torso, block(0.25, 0.2, 0.06, 0.02), p.paint(red), [0, 0.16, 0.08]);
  for (const y of [0.11, 0.18]) {
    put(rig.torso, block(0.25, 0.012, 0.064, 0.004), p.paint(GOLD), [0, y, 0.082]);
  }
  put(rig.torso, tube(0.16, 0.22, 0.16), p.paint(red), [0, -0.05, 0]);
  put(rig.torso, tube(0.2, 0.2, 0.014), p.paint(GOLD), [0, -0.03, 0]);
  for (const [arm, side] of [
    [rig.armL, -1],
    [rig.armR, 1],
  ] as const) {
    put(
      arm,
      block(0.05, 0.16, 0.13, 0.015),
      p.paint(red),
      [side * 0.04, -0.04, 0],
      [0, 0, side * 0.2],
    );
    put(
      arm,
      block(0.054, 0.02, 0.134, 0.006),
      p.paint(GOLD),
      [side * 0.05, -0.12, 0],
      [0, 0, side * 0.2],
    );
  }
  // Kabuto: dark bowl, flared neck guard, golden crescent crest; black face mask
  eyes(rig.head, p, 0x2a1d1a, -0.02);
  put(rig.head, dome(HEAD_R + 0.025, Math.PI * 0.45), p.paint(black), [0, 0.01, -0.005]);
  put(
    rig.head,
    sheet(0.2, 0.28, 0.11, Math.PI * 0.32, Math.PI * 1.36),
    p.paint(red, true),
    [0, -0.02, -0.01],
  );
  put(rig.head, hoop(0.15, 0.022, Math.PI), p.paint(GOLD), [0, 0.3, 0.15], [-0.25, 0, Math.PI]);
  put(rig.head, block(0.04, 0.08, 0.03, 0.01), p.paint(GOLD), [0, 0.15, 0.17], [-0.4, 0, 0]);
  put(rig.head, ball(0.11), p.paint(black), [0, -0.1, 0.1], undefined, [1.25, 0.7, 0.7]);
  // Katana raised forward; a second blade sheathed at the hip
  rest(rig.weapon, 0.45);
  put(rig.weapon, tube(0.015, 0.015, 0.13), p.paint(black), [0, 0, 0]);
  put(rig.weapon, tube(0.035, 0.035, 0.012), p.paint(GOLD), [0, 0.07, 0]);
  put(rig.weapon, block(0.022, 0.48, 0.007, 0.003), p.paint(BLADE), [0, 0.32, 0], [0.06, 0, 0]);
  put(rig.torso, tube(0.018, 0.018, 0.48), p.paint(black), [-0.16, 0.04, -0.02], [0.3, 0, 1.25]);
}

function paladin(root: THREE.Group, p: Palette): void {
  const blue = 0x2c5cbe;
  const rig = humanoid(root, p, {
    skin: STEEL,
    top: STEEL,
    legs: STEEL_DARK,
    boots: STEEL,
    hand: STEEL_DARK,
    belt: GOLD,
  });
  cape(rig, p.paint(blue, true), 0.48, 0.26);
  put(rig.torso, block(0.15, 0.34, 0.024, 0.01), p.paint(blue), [0, 0.01, 0.128]);
  put(rig.torso, block(0.16, 0.024, 0.03, 0.008), p.paint(GOLD), [0, -0.155, 0.13]);
  put(rig.torso, gem(0.035), p.paint(GOLD), [0, 0.15, 0.142], undefined, [1.3, 1, 0.4]);
  for (const arm of [rig.armL, rig.armR]) {
    put(arm, dome(0.085, Math.PI * 0.55), p.paint(STEEL), [0, 0.015, 0]);
    put(arm, hoop(0.07, 0.012), p.paint(GOLD), [0, -0.005, 0], [Math.PI / 2, 0, 0]);
  }
  // Great helm: visor, gold ridge and a sweeping blue plume
  const head = rig.head;
  put(head, block(0.19, 0.03, 0.05, 0.01), p.paint(0x1f2633), [0, -0.02, 0.165]);
  put(head, block(0.025, 0.2, 0.04, 0.01), p.paint(GOLD), [0, 0.05, 0.165], [-0.25, 0, 0]);
  const plume = p.paint(0x2f74d8);
  for (let i = 0; i < 4; i++) {
    const a = 0.3 + i * 0.45;
    put(
      head,
      ball(0.06 - i * 0.006),
      plume,
      [0, 0.17 + Math.cos(a) * 0.06, -Math.sin(a) * 0.14],
      undefined,
      [0.7, 1.3, 1],
    );
  }
  // Radiant sword and a gold-crossed kite shield
  rest(rig.weapon, 0.55);
  sword(rig.weapon, p, 0.46, p.glow(0xf4f6e6, 0.35));
  const shield = kiteShield(rig.offhand, p, GOLD, blue, GOLD, 1.18);
  put(shield, block(0.03, 0.22, 0.04, 0.008), p.paint(GOLD), [0, 0, 0.004]);
  put(shield, block(0.16, 0.03, 0.04, 0.008), p.paint(GOLD), [0, 0.06, 0.004]);
}

function astrologian(root: THREE.Group, p: Palette): void {
  const navy = 0x2a3a82;
  const rig = humanoid(root, p, {
    skin: SKIN,
    top: navy,
    legs: navy,
    boots: 0x6b4226,
    belt: GOLD,
  });
  const robeMat = p.paint(navy);
  robe(root, robeMat, 0.15, 0.27);
  put(root, tube(0.272, 0.272, 0.03, 18), p.paint(GOLD), [0, 0.035, 0]);
  put(root, block(0.045, 0.38, 0.03, 0.01), p.paint(GOLD), [0, 0.22, 0.21], [-0.29, 0, 0]);
  starlight(root, p.glow(0xcfe8ff), 0.26, 1.7);
  bellSleeves(rig, robeMat, p.paint(GOLD));
  // Dark hair under a starry hood
  const hair = p.paint(0x3b2a20);
  eyes(rig.head, p, 0x2f2a3a);
  hairCap(rig.head, hair, 0.47);
  hood(rig.head, p.paint(navy, true));
  // Armillary sphere floating above the raised hand
  rest(rig.armR, -0.75);
  const sphere = joint(rig.weapon, 'focus', [0, 0.16, 0.03]);
  put(sphere, ball(0.045), p.glow(0xbfe6ff), [0, 0, 0]);
  for (const [rx, rz] of [
    [Math.PI / 2, 0],
    [0.4, 0.6],
    [-0.4, -0.6],
  ]) {
    put(sphere, hoop(0.12, 0.012), p.paint(GOLD), [0, 0, 0], [rx, 0, rz]);
  }
  // A star chart rolled in the other hand
  put(rig.offhand, tube(0.022, 0.022, 0.16), p.paint(0xeee2c4), [0, 0, 0.02], [0, 0, Math.PI / 2]);
}

function bard(root: THREE.Group, p: Palette): void {
  const rose = 0xd04a7a;
  const wine = 0x8e2a57;
  const rig = humanoid(root, p, {
    skin: SKIN,
    top: 0xf3e6cf,
    legs: 0x4a3a5c,
    boots: 0x6b4226,
    belt: LEATHER,
    buckle: GOLD,
  });
  // Rose doublet laced in gold over a cream shirt, puffed shoulders and a short wine cape
  put(rig.torso, tube(0.118, 0.138, 0.2), p.paint(rose), [0, 0.15, 0]);
  put(rig.torso, tube(0.14, 0.18, 0.1), p.paint(rose), [0, -0.02, 0]);
  for (const y of [0.11, 0.17, 0.23]) {
    put(rig.torso, block(0.06, 0.012, 0.02, 0.004), p.paint(GOLD), [0, y, 0.13]);
  }
  for (const arm of [rig.armL, rig.armR]) {
    put(arm, ball(0.068), p.paint(rose), [0, 0, 0], undefined, [1, 0.85, 1]);
  }
  cape(rig, p.paint(wine, true), 0.36, 0.2);
  // Lyre slung across the back, peeking over the right shoulder: golden frame, glowing strings
  const lyre = joint(rig.torso, 'lyre', [0.1, 0.3, -0.16]);
  lyre.rotation.set(0, 0, -0.45);
  put(lyre, hoop(0.085, 0.014, Math.PI * 1.2), p.paint(GOLD), [0, 0, 0], [0, 0, Math.PI * 0.9]);
  put(lyre, block(0.16, 0.018, 0.018, 0.006), p.paint(GOLD), [0, 0.07, 0]);
  for (const x of [-0.03, 0, 0.03]) {
    put(lyre, tube(0.003, 0.003, 0.14, 4), p.glow(0xf9a8d4, 0.6), [x, 0, 0]);
  }
  // Auburn hair under a cocked, wide-brimmed hat with a long pink plume
  const hair = p.paint(0xa4532c);
  eyes(rig.head, p, 0x5a3a6e);
  hairCap(rig.head, hair, 0.5);
  for (const side of [-1, 1]) {
    put(rig.head, ball(0.06), hair, [side * 0.14, -0.07, 0.03], undefined, [0.7, 1.3, 0.9]);
  }
  const hat = p.paint(wine);
  const tilt: Vec = [-0.15, 0, 0.12];
  put(rig.head, tube(0.3, 0.3, 0.02, 20), hat, [0, 0.11, -0.01], tilt);
  put(rig.head, tube(0.13, 0.17, 0.13, 16), hat, [0.008, 0.18, -0.02], tilt);
  put(rig.head, tube(0.168, 0.172, 0.03, 16), p.paint(GOLD), [0.004, 0.135, -0.014], tilt);
  for (const [color, from, dir, length] of [
    [0xfbcfe8, [0.12, 0.2, -0.04], [0.55, 0.4, -1], 0.42],
    [0xffffff, [0.1, 0.19, -0.06], [0.3, 0.25, -1], 0.3],
  ] as [number, Vec, Vec, number][]) {
    aim(rig.head, spike(0.045, length, 6), p.paint(color), from, dir, length).scale.set(1, 1, 0.3);
  }
  // Recurve bow held out in the left hand, strung with a singing pink string
  rest(rig.armL, -0.7);
  const bow = joint(rig.offhand, 'bow', [0, 0, 0.02]);
  bow.rotation.set(0.7, 0, 0);
  put(
    bow,
    hoop(0.24, 0.016, Math.PI * 0.95),
    p.paint(0xb07040),
    [0, 0, 0],
    [0, Math.PI / 2, Math.PI / 2 + 0.08],
  );
  put(bow, tube(0.004, 0.004, 0.46, 4), p.glow(0xf9a8d4), [0, 0, -0.01]);
}

const HEROES: Record<
  Exclude<TowerClassId, 'barricade'>,
  (root: THREE.Group, p: Palette) => void
> = {
  'blade-warden': bladeWarden,
  ranger,
  elementalist,
  chronomancer,
  oracle,
  rogue,
  lancer,
  juggernaut,
  'red-mage': redMage,
  ninja,
  samurai,
  paladin,
  astrologian,
  bard,
};

/** Heroes stand turned three-quarters toward the camera, like their sprites. */
export const HERO_TURN = 0.35;

/** Every hero class is sculpted from its own sprite; feet at y=0, facing +z. */
export function createHeroModel(id: TowerClassId, options: MiniatureOptions = {}): THREE.Group {
  const root = new THREE.Group();
  const palette = new Palette();
  HEROES[id === 'barricade' ? 'blade-warden' : id](root, palette);
  root.rotation.y = HERO_TURN;
  return finish(root, palette, options);
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

function skulker(root: THREE.Group, p: Palette): void {
  const green = 0x6aa53a;
  const hoodMat = p.paint(0x5a4530, true);
  const rig = humanoid(root, p, {
    skin: green,
    top: green,
    legs: 0x4c7a2c,
    boots: 0x4c7a2c,
    belt: 0x4a3524,
  });
  // Hunched forward over a ragged loincloth
  rig.torso.rotation.x = 0.22;
  put(rig.torso, block(0.13, 0.15, 0.02, 0.008), p.paint(0x6b4a32), [0, -0.05, 0.135]);
  put(rig.torso, ball(0.06), p.paint(0xe6dcc0), [0, 0.05, 0.14], undefined, [1, 0.8, 0.6]);
  // Skull pauldron on the off shoulder
  put(rig.armL, ball(0.07), p.paint(0xe6dcc0), [0, 0.03, 0]);
  for (const side of [-1, 1]) {
    put(rig.armL, ball(0.017), p.paint(0x2a2230), [-0.035, 0.035, side * 0.03 + 0.01]);
  }
  // Long ears, hooked nose and burning eyes under a pointed hood
  const head = rig.head;
  for (const side of [-1, 1]) {
    aim(
      head,
      spike(0.05, 0.24, 8),
      p.paint(green),
      [side * 0.15, 0.0, -0.02],
      [side, 0.35, -0.25],
      0.24,
    ).scale.set(1, 1, 0.45);
    put(
      head,
      ball(0.026),
      p.glow(0xff7a1a),
      [side * 0.065, -0.01, 0.165],
      undefined,
      [1.1, 0.75, 0.5],
    );
  }
  aim(head, spike(0.045, 0.13, 8), p.paint(0x5d9332), [0, -0.05, 0.16], [0, -0.55, 1], 0.13);
  hood(head, hoodMat);
  // Curved knife
  rest(rig.weapon, 1.1);
  put(rig.weapon, tube(0.014, 0.014, 0.07), p.paint(0x4a3322), [0, 0, 0]);
  put(
    rig.weapon,
    tube(0.006, 0.03, 0.2, 4),
    p.paint(0xc9ced4),
    [0.02, 0.13, 0],
    [0, Math.PI / 4, -0.25],
    [1, 1, 0.35],
  );
}

function swiftbeak(root: THREE.Group, p: Palette): void {
  const blue = p.paint(0x2f86cc);
  const pale = p.paint(0x7ccaf2);
  const dark = p.paint(0x1f5c99);
  const legs = p.paint(0x3a4152);
  const beak = p.paint(0x8f99a8);
  // Long running legs with three forward toes
  for (const side of [-1, 1]) {
    const leg = joint(root, side < 0 ? 'leg-left' : 'leg-right', [side * 0.09, 0.36, -0.02]);
    put(leg, ball(0.075), blue, [0, 0, 0], undefined, [0.9, 1.2, 1.1]);
    put(leg, limb(0.02, 0.26), legs, [0, -0.17, 0]);
    for (const toe of [-0.5, 0, 0.5]) {
      aim(leg, spike(0.015, 0.09, 5), legs, [0, -0.33, 0], [toe, -0.15, 1], 0.09);
    }
  }
  // Long horizontal body: pale breast, dark streaked wings folded at the sides
  const body = joint(root, 'torso', [0, 0.44, 0]);
  body.rotation.x = 0.08;
  put(body, ball(0.21), blue, [0, 0, 0], undefined, [0.82, 0.78, 1.4]);
  put(body, ball(0.15), pale, [0, -0.07, 0.08], undefined, [0.85, 0.7, 1.3]);
  for (const side of [-1, 1]) {
    put(body, ball(0.16), dark, [side * 0.13, 0.04, -0.05], undefined, [0.3, 0.6, 1.25]);
    for (let i = 0; i < 3; i++) {
      put(body, block(0.012, 0.012, 0.22 - i * 0.04, 0.004), pale, [
        side * 0.18,
        0.07 - i * 0.04,
        -0.06 - i * 0.02,
      ]);
    }
  }
  // Neck thrust forward like a sprinter, small crested head, hooked grey beak
  aim(body, limb(0.06, 0.16), blue, [0, 0.08, 0.24], [0, 0.8, 0.6], 0.22);
  aim(body, limb(0.05, 0.08), blue, [0, 0.25, 0.37], [0, 0.97, 0.24], 0.1);
  const head = joint(body, 'head', [0, 0.38, 0.41]);
  put(head, ball(0.085), blue, [0, 0, 0], undefined, [0.85, 0.9, 1.15]);
  aim(head, spike(0.045, 0.17, 10), beak, [0, -0.01, 0.07], [0, -0.25, 1], 0.17);
  put(head, ball(0.022), beak, [0, -0.05, 0.22]);
  for (const side of [-1, 1]) {
    put(head, ball(0.02), p.paint(0xffd04a), [side * 0.06, 0.02, 0.04]);
    put(head, ball(0.009), p.paint(0x1a1424), [side * 0.07, 0.022, 0.048]);
  }
  tufts(
    head,
    pale,
    [
      { dir: [0, 0.5, -1], length: 0.2, width: 0.02 },
      { dir: [0.18, 0.75, -1], length: 0.17, width: 0.018 },
      { dir: [-0.18, 0.75, -1], length: 0.17, width: 0.018 },
    ],
    0.06,
  );
  // Streaming tail plumes fanned out behind
  const tail = joint(body, 'tail', [0, 0.06, -0.27]);
  for (let i = 0; i < 5; i++) {
    const length = 0.42 - Math.abs(i - 2) * 0.06;
    aim(
      tail,
      spike(0.03, length, 6),
      i % 2 ? pale : blue,
      [0, 0, 0],
      [(i - 2) * 0.22, 0.12 + Math.abs(i - 2) * 0.05, -1],
      length,
    ).scale.set(1, 1, 0.4);
  }
}

function prismaticOoze(root: THREE.Group, p: Palette): void {
  const jelly = p.paint(0x3fc89c);
  jelly.emissive.set(0x0f5a40);
  // Domed body settling into a flat, dripping base
  put(root, ball(0.36), jelly, [0, 0.27, 0], undefined, [1, 0.82, 0.95]);
  put(root, tube(0.33, 0.38, 0.1, 20), jelly, [0, 0.05, 0]);
  for (const [x, z, h] of [
    [-0.22, 0.27, 0.08],
    [0.1, 0.33, 0.11],
    [0.27, 0.2, 0.07],
    [-0.05, 0.35, 0.06],
  ]) {
    put(root, limb(0.035, h), jelly, [x, 0.08, z]);
  }
  put(root, ball(0.14), p.glass(0xc6ffe8, 0.55), [-0.12, 0.47, 0.12], undefined, [1.2, 0.6, 0.8]);
  put(root, gem(0.035), p.glow(0xffffff), [0.14, 0.55, 0.1]);
  // Big friendly face
  for (const side of [-1, 1]) {
    put(root, ball(0.05), p.paint(0x173a3a), [side * 0.11, 0.3, 0.32], undefined, [0.85, 1.1, 0.5]);
    put(root, ball(0.016), p.paint(0xffffff), [side * 0.11 + 0.015, 0.33, 0.345]);
    put(
      root,
      ball(0.035),
      p.glow(0xff8fa3, 0.6),
      [side * 0.2, 0.22, 0.27],
      undefined,
      [1.2, 0.7, 0.4],
    );
  }
  put(root, hoop(0.035, 0.009, Math.PI), p.paint(0x173a3a), [0, 0.225, 0.335], [0, 0, Math.PI]);
}

function pyreCore(root: THREE.Group, p: Palette): void {
  const rock = p.paint(0x4a2a1e);
  // Molten heart, mostly crusted over with dark rock plates
  put(root, ball(0.25), p.glow(0xff7b1c), [0, 0.45, 0]);
  for (let i = 0; i < 16; i++) {
    const y = 1 - ((i + 0.5) / 16) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const n: Vec = [Math.cos(a) * r, y, Math.sin(a) * r];
    const plate = put(root, new THREE.DodecahedronGeometry(0.1), rock, [
      n[0] * 0.24,
      0.45 + n[1] * 0.24,
      n[2] * 0.24,
    ]);
    plate.lookAt(n[0] * 2, 0.45 + n[1] * 2, n[2] * 2);
    plate.scale.set(1, 1, 0.45);
  }
  // Crown of flame
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    aim(
      root,
      spike(0.06, 0.26, 7),
      p.glow(i % 2 ? 0xffb43a : 0xff6a1a),
      [Math.cos(a) * 0.12, 0.6, Math.sin(a) * 0.12],
      [Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45],
      0.26,
    );
  }
  aim(root, spike(0.08, 0.34, 8), p.glow(0xffd24a), [0, 0.64, 0], [0, 1, 0], 0.34);
  // Orbiting cinders
  const orbit = joint(root, 'orbit', [0, 0.45, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    put(orbit, new THREE.DodecahedronGeometry(0.045), rock, [
      Math.cos(a) * 0.38,
      Math.sin(a * 2) * 0.1,
      Math.sin(a) * 0.38,
    ]);
  }
}

/** Bat-like wing membrane with finger spars; extends along +x, mirrored for the left side. */
function batWing(
  root: THREE.Object3D,
  p: Palette,
  side: number,
  at: Vec,
  span: number,
  membrane: number,
  spar: number,
): void {
  const wing = joint(root, side < 0 ? 'wing-left' : 'wing-right', at);
  const points: [number, number][] = [
    [0, 0.08],
    [0.45, 0.42],
    [1, 0.3],
    [0.82, 0.05],
    [0.62, -0.12],
    [0.42, 0.02],
    [0.22, -0.16],
    [0.08, -0.08],
  ];
  const shape = points.map(([x, y]): [number, number] => [side * x * span, y * span]);
  put(
    wing,
    slab(side < 0 ? [...shape].reverse() : shape, 0.016),
    p.paint(membrane, true),
    [0, 0, 0],
  );
  for (const [x, y] of [
    [0.45, 0.42],
    [1, 0.3],
    [0.62, -0.12],
    [0.22, -0.16],
  ]) {
    const length = Math.hypot(x, y) * span;
    aim(
      wing,
      limb(0.012 * (span / 0.5), length),
      p.paint(spar),
      [0, 0, 0.01],
      [side * x, y, 0],
      length,
    );
  }
}

function dreadGaze(root: THREE.Group, p: Palette): void {
  const flesh = 0xa8402f;
  // One great eye: white globe, red iris, black pupil
  put(root, ball(0.26), p.paint(0xf1ebe2), [0, 0.52, 0]);
  const iris = new THREE.SphereGeometry(0.262, 18, 8, 0, TAU, 0, 0.62);
  put(root, iris, p.paint(0xc4262c), [0, 0.52, 0], [Math.PI / 2, 0, 0]);
  const pupil = new THREE.SphereGeometry(0.265, 14, 6, 0, TAU, 0, 0.3);
  put(root, pupil, p.paint(0x1a0f14), [0, 0.52, 0], [Math.PI / 2, 0, 0]);
  put(root, ball(0.03), p.paint(0xffffff), [0.07, 0.6, 0.24]);
  // Curling horns
  const horn = p.paint(0x3a2b2e);
  for (const side of [-1, 1]) {
    let from: Vec = [side * 0.13, 0.7, -0.02];
    const dirs: Vec[] = [
      [side * 0.4, 1, 0],
      [side * 0.6, 0.6, -0.3],
      [side * 0.3, 0.1, -0.8],
    ];
    dirs.forEach((dir, i) => {
      const length = 0.11 - i * 0.015;
      aim(root, spike(0.045 - i * 0.012, length + 0.02, 8), horn, from, dir, length + 0.02);
      const d = new THREE.Vector3(...dir).normalize().multiplyScalar(length);
      from = [from[0] + d.x, from[1] + d.y, from[2] + d.z];
    });
    batWing(root, p, side, [side * 0.2, 0.58, -0.1], 0.5, 0x9c2b2b, 0x5a1a1a);
  }
  // Small dangling limbs
  for (const side of [-1, 1]) {
    const leg = joint(root, side < 0 ? 'leg-left' : 'leg-right', [side * 0.09, 0.3, 0]);
    put(leg, limb(0.03, 0.14), p.paint(flesh), [0, -0.1, 0]);
    aim(leg, spike(0.02, 0.06, 5), p.paint(0x3a2b2e), [0, -0.2, 0.01], [0, -0.4, 1], 0.06);
    const arm = joint(root, side < 0 ? 'arm-left' : 'arm-right', [side * 0.2, 0.38, 0.1]);
    arm.rotation.z = side * 0.4;
    put(arm, limb(0.025, 0.12), p.paint(flesh), [0, -0.08, 0]);
  }
}

function bonewalker(root: THREE.Group, p: Palette): void {
  const bone = p.paint(0xe8dfc6);
  const socket = p.paint(0x2a2230);
  for (const side of [-1, 1]) {
    const leg = joint(root, side < 0 ? 'leg-left' : 'leg-right', [side * 0.07, HIP, 0]);
    put(leg, limb(0.026, 0.2), bone, [0, -0.12, 0]);
    put(leg, block(0.08, 0.07, 0.13, 0.025), p.paint(0x6b4a32), [0, -0.265, 0.02]);
  }
  // Pelvis, spine and ribcage
  const torso = joint(root, 'torso', [0, HIP, 0]);
  put(torso, ball(0.09), bone, [0, 0.02, 0], undefined, [1.3, 0.6, 0.8]);
  put(torso, tube(0.022, 0.022, 0.26), bone, [0, 0.14, -0.04]);
  for (let i = 0; i < 3; i++) {
    put(
      torso,
      hoop(0.1 - i * 0.012, 0.016),
      bone,
      [0, 0.22 - i * 0.055, 0],
      [Math.PI / 2, 0, 0],
      [1, 0.8, 1],
    );
  }
  put(
    torso,
    sheet(0.13, 0.17, 0.14, Math.PI * 0.15, Math.PI * 1.7),
    p.paint(0x7a5a3a, true),
    [0, -0.04, 0],
  );
  hemPattern(torso, p.paint(0x7a5a3a), 0.165, -0.13, 7, 0.07);
  // Skull with dark sockets and jaw
  const head = joint(torso, 'head', [0, 0.42, 0]);
  put(head, ball(0.17), bone, [0, 0, 0]);
  put(head, block(0.17, 0.07, 0.14, 0.03), bone, [0, -0.13, 0.05]);
  for (const side of [-1, 1]) {
    put(head, ball(0.045), socket, [side * 0.06, -0.02, 0.135], undefined, [1, 1.1, 0.6]);
  }
  put(head, spike(0.022, 0.04, 3), socket, [0, -0.08, 0.16], [Math.PI, 0, 0]);
  for (let i = 0; i < 4; i++) {
    put(head, block(0.018, 0.02, 0.01, 0.004), socket, [-0.045 + i * 0.03, -0.13, 0.12]);
  }
  // Bony arms with a leather pauldron
  const arms = [-1, 1].map((side) => {
    const arm = joint(torso, side < 0 ? 'arm-left' : 'arm-right', [side * 0.13, 0.23, 0]);
    arm.rotation.z = side * 0.18;
    put(arm, ball(0.035), bone, [0, 0, 0]);
    put(arm, limb(0.022, 0.16), bone, [0, -0.1, 0]);
    put(arm, ball(0.035), bone, [0, -0.2, 0.01]);
    return arm;
  });
  put(arms[0], dome(0.075, Math.PI * 0.55), p.paint(0x6b4a32), [0, 0.015, 0]);
  aim(arms[0], spike(0.018, 0.06, 5), p.paint(0xb8bec6), [-0.03, 0.06, 0], [-0.6, 1, 0], 0.06);
  // Notched sword and a round wooden shield
  const weapon = joint(arms[1], 'weapon', [0, -0.2, 0.02]);
  rest(weapon, 0.7);
  put(weapon, tube(0.014, 0.014, 0.08), p.paint(0x4a3322), [0, 0, 0]);
  put(weapon, block(0.1, 0.02, 0.03, 0.006), p.paint(0x7a7f88), [0, 0.05, 0]);
  put(
    weapon,
    tube(0.012, 0.028, 0.36, 4),
    p.paint(0xb9b6ac),
    [0, 0.24, 0],
    [0, Math.PI / 4, 0],
    [1, 1, 0.4],
  );
  const shield = joint(arms[0], 'shield', [-0.02, -0.18, 0.08]);
  shield.rotation.set(Math.PI / 2, 0, 0);
  shield.rotation.z = 0.5;
  put(shield, tube(0.15, 0.15, 0.03, 18), p.paint(0x8a5a32), [0, 0, 0]);
  put(shield, hoop(0.15, 0.014), p.paint(0x5a5f68), [0, 0, 0], [Math.PI / 2, 0, 0]);
  put(shield, ball(0.035), p.paint(0x5a5f68), [0, 0.02, 0], undefined, [1, 0.5, 1]);
}

function brambleGolem(root: THREE.Group, p: Palette): void {
  const bark = p.paint(0x6e4b2c);
  const darkBark = p.paint(0x4a321c);
  const moss = p.paint(0x6f9a3a);
  // Stumpy legs ending in spreading roots
  for (const side of [-1, 1]) {
    const leg = joint(root, side < 0 ? 'leg-left' : 'leg-right', [side * 0.14, 0.26, 0]);
    put(leg, limb(0.085, 0.1), bark, [0, -0.11, 0]);
    for (const a of [-0.7, 0, 0.7]) {
      const dir: Vec = [Math.sin(a) + side * 0.3, -0.3, Math.cos(a)];
      aim(leg, spike(0.045, 0.15, 5), darkBark, [0, -0.21, 0], dir, 0.15);
    }
  }
  // Hulking trunk, broad at the shoulders, wrapped in moss and vines
  const torso = joint(root, 'torso', [0, 0.26, 0]);
  put(torso, tube(0.27, 0.19, 0.42, 9), bark, [0, 0.21, 0]);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3;
    const knot = new THREE.DodecahedronGeometry(0.075);
    put(torso, knot, darkBark, [Math.sin(a) * 0.22, 0.08 + (i % 3) * 0.12, Math.cos(a) * 0.22]);
  }
  put(torso, hoop(0.23, 0.02), moss, [0, 0.15, 0], [Math.PI / 2 + 0.3, 0, 0.15]);
  put(torso, hoop(0.25, 0.016), moss, [0, 0.3, 0], [Math.PI / 2 - 0.25, 0, -0.1]);
  // Head sunk between the shoulders: glowing eyes under a heavy brow, jagged maw
  const head = joint(torso, 'head', [0, 0.47, 0.06]);
  put(head, ball(0.16), bark, [0, 0, 0], undefined, [1.05, 0.95, 0.9]);
  for (const side of [-1, 1]) {
    put(
      head,
      ball(0.032),
      p.glow(0xff8a1a),
      [side * 0.065, 0.01, 0.135],
      undefined,
      [1.2, 0.8, 0.5],
    );
    put(
      head,
      block(0.09, 0.025, 0.04, 0.008),
      darkBark,
      [side * 0.065, 0.055, 0.135],
      [0, 0, side * -0.35],
    );
  }
  put(head, block(0.12, 0.045, 0.03, 0.01), p.paint(0x1e140c), [0, -0.07, 0.13]);
  for (let i = 0; i < 3; i++) {
    put(
      head,
      spike(0.012, 0.035, 4),
      p.paint(0xd9c8a0),
      [-0.035 + i * 0.035, -0.055, 0.145],
      [Math.PI, 0, 0],
    );
  }
  put(head, ball(0.09), moss, [0.02, 0.11, -0.03], undefined, [1.4, 0.45, 1.1]);
  // Gnarled branches clawing upward from crown and shoulders
  tufts(
    head,
    darkBark,
    [
      { dir: [0.45, 1, 0.05], length: 0.34, width: 0.05 },
      { dir: [-0.5, 1, 0.1], length: 0.36, width: 0.05 },
      { dir: [0.05, 1, -0.45], length: 0.28, width: 0.045 },
      { dir: [0.95, 0.55, -0.2], length: 0.24, width: 0.04 },
      { dir: [-0.95, 0.5, -0.2], length: 0.24, width: 0.04 },
      { dir: [0.2, 0.9, 0.5], length: 0.18, width: 0.035 },
    ],
    0.11,
  );
  // Long arms hanging nearly to the ground, ending in twig claws
  for (const side of [-1, 1]) {
    const arm = joint(torso, side < 0 ? 'arm-left' : 'arm-right', [side * 0.3, 0.37, 0]);
    arm.rotation.z = side * 0.18;
    put(arm, ball(0.12), bark, [0, 0, 0]);
    put(arm, ball(0.1), moss, [0, 0.07, 0], undefined, [1.15, 0.45, 1.1]);
    aim(arm, spike(0.03, 0.2, 5), darkBark, [side * 0.06, 0.06, -0.02], [side * 0.6, 1, -0.2], 0.2);
    put(arm, limb(0.08, 0.26), bark, [0, -0.19, 0]);
    put(arm, hoop(0.085, 0.014), moss, [0, -0.16, 0], [Math.PI / 2 + 0.4, 0, 0]);
    put(arm, ball(0.075), darkBark, [0, -0.36, 0.02]);
    for (const a of [-0.6, 0, 0.6]) {
      aim(
        arm,
        spike(0.025, 0.13, 5),
        darkBark,
        [0, -0.38, 0.03],
        [Math.sin(a) * 0.7, -1, 0.45],
        0.13,
      );
    }
  }
}

function skySovereign(root: THREE.Group, p: Palette): void {
  const teal = p.paint(0x2f9e9a);
  const deep = p.paint(0x1f6f75);
  const belly = p.paint(0xe6d7a8);
  const horn = p.paint(0xd9c49a);
  // Four clawed legs
  for (const [side, z, name] of [
    [-1, -0.12, 'leg-left'],
    [1, -0.12, 'leg-right'],
  ] as const) {
    const leg = joint(root, name, [side * 0.14, 0.3, z]);
    put(leg, ball(0.08), teal, [0, 0.02, 0]);
    put(leg, limb(0.04, 0.16), teal, [0, -0.13, 0.02]);
    for (const a of [-0.4, 0, 0.4])
      aim(leg, spike(0.016, 0.06, 5), horn, [0, -0.25, 0.04], [a, -0.3, 1], 0.06);
    const fore = joint(root, `foreleg-${name}`, [side * 0.12, 0.34, 0.2]);
    put(fore, limb(0.03, 0.14), teal, [0, -0.12, 0.02]);
    for (const a of [-0.4, 0.4])
      aim(fore, spike(0.014, 0.05, 5), horn, [0, -0.22, 0.04], [a, -0.3, 1], 0.05);
  }
  // Body with a cream belly
  const body = joint(root, 'torso', [0, 0.45, 0]);
  put(body, ball(0.22), teal, [0, 0, 0], undefined, [0.9, 0.85, 1.3]);
  put(body, ball(0.17), belly, [0, -0.06, 0.08], undefined, [0.85, 0.75, 1.25]);
  // Neck rising to a horned head with open jaws
  const neck: Vec[] = [
    [0, 0.17, 0.22],
    [0, 0.27, 0.3],
    [0, 0.37, 0.34],
  ];
  neck.forEach(([x, y, z], i) => {
    put(body, ball(0.1 - i * 0.012), teal, [x, y, z]);
    put(body, ball(0.07 - i * 0.01), belly, [x, y - 0.03, z + 0.05]);
    aim(body, spike(0.025, 0.07, 4), deep, [x, y + 0.07 - i * 0.008, z - 0.03], [0, 1, -0.6], 0.07);
  });
  const head = joint(body, 'head', [0, 0.45, 0.4]);
  put(head, ball(0.11), teal, [0, 0, 0], undefined, [1, 0.9, 1.1]);
  put(head, block(0.12, 0.07, 0.16, 0.03), teal, [0, 0.0, 0.13]);
  put(head, block(0.1, 0.03, 0.14, 0.012), p.paint(0xb8322f), [0, -0.045, 0.12]);
  put(head, block(0.1, 0.03, 0.13, 0.012), belly, [0, -0.075, 0.11], [0.25, 0, 0]);
  for (const side of [-1, 1]) {
    put(head, ball(0.022), p.glow(0xffd04a), [side * 0.065, 0.04, 0.07]);
    aim(head, spike(0.03, 0.2, 8), horn, [side * 0.06, 0.07, -0.03], [side * 0.35, 0.55, -1], 0.2);
    aim(head, spike(0.02, 0.1, 6), horn, [side * 0.08, 0.0, -0.05], [side * 0.6, 0.1, -1], 0.1);
  }
  // Broad wings and a long tapering tail
  for (const side of [-1, 1])
    batWing(body, p, side, [side * 0.15, 0.12, -0.05], 0.62, 0x3fb3a8, 0x1f6f75);
  const tail = joint(body, 'tail', [0, -0.02, -0.26]);
  let from: Vec = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const dir: Vec = [Math.sin(i * 0.7) * 0.3, -0.25 + i * 0.1, -1];
    const length = 0.16 - i * 0.015;
    aim(
      tail,
      spike(0.07 - i * 0.015, length + 0.03, 8),
      i === 3 ? deep : teal,
      from,
      dir,
      length + 0.03,
    );
    const d = new THREE.Vector3(...dir).normalize().multiplyScalar(length);
    from = [from[0] + d.x, from[1] + d.y, from[2] + d.z];
  }
}

const MONSTERS: Record<MobTypeId, (root: THREE.Group, p: Palette) => void> = {
  skulker,
  swiftbeak,
  'prismatic-ooze': prismaticOoze,
  'pyre-core': pyreCore,
  'dread-gaze': dreadGaze,
  bonewalker,
  'bramble-golem': brambleGolem,
  'sky-sovereign': skySovereign,
};

/** Monsters are sculpted from their bestiary sprites; feet at y=0, facing +z. */
export function createMonsterModel(id: MobTypeId, options: MiniatureOptions = {}): THREE.Group {
  const root = new THREE.Group();
  const palette = new Palette();
  MONSTERS[id](root, palette);
  return finish(root, palette, options);
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

function restX(object: THREE.Object3D): number {
  return (object.userData['restX'] as number | undefined) ?? 0;
}

export function animateModel(root: THREE.Group, phase: number, stride: number, action = 0): void {
  const leftLeg = root.getObjectByName('leg-left');
  const rightLeg = root.getObjectByName('leg-right');
  if (leftLeg) leftLeg.rotation.x = Math.sin(phase) * stride;
  if (rightLeg) rightLeg.rotation.x = -Math.sin(phase) * stride;
  const rightArm = root.getObjectByName('arm-right');
  const leftArm = root.getObjectByName('arm-left');
  if (rightArm) {
    rightArm.rotation.x = restX(rightArm) - action * 1.7 - Math.sin(phase) * stride * 0.6;
  }
  if (leftArm) {
    leftArm.rotation.x = restX(leftArm) - action * 0.7 + Math.sin(phase) * stride * 0.6;
  }
  const cape = root.getObjectByName('cape');
  if (cape) cape.rotation.x = restX(cape) + Math.sin(phase * 0.7) * 0.08 + action * 0.3;
  const tail = root.getObjectByName('tail');
  if (tail) tail.rotation.y = Math.sin(phase) * 0.25;
  for (const side of [-1, 1]) {
    const wing = root.getObjectByName(side < 0 ? 'wing-left' : 'wing-right');
    if (wing) wing.rotation.z = side * (0.2 + Math.sin(phase * 2) * 0.5);
  }
  const orbit = root.getObjectByName('orbit');
  if (orbit) orbit.rotation.y = phase * 0.4;
  const focus = root.getObjectByName('focus');
  if (focus) focus.rotation.y = phase;
}
