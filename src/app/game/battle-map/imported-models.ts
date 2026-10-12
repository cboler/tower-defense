import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { INK_WIDTH, MiniatureOptions, inkMaterial, ramp } from './battlefield-models';
import { ClipRole, MiniatureRig } from './miniature-rig';

/*
 * Authored miniatures (Blender, Meshy, Tripo...) loaded from glTF. Each is fitted to the
 * sculpted miniature's footprint and can take on its cel shading and ink outline, so authored
 * and sculpted pieces share the board while the art direction is iterated. Loaded only once
 * an authored model exists, since it pulls in the animation system.
 */

export interface ImportedModelSettings {
  /** Turn in radians applied before fitting, for models that don't face +z. */
  yaw?: number;
  /** Height in tiles once fitted; defaults to the sculpted miniature's height. */
  height?: number;
  /** Re-shade with the miniatures' three-band cel ramp, keeping colours and texture maps. */
  toon?: boolean;
  /** Ink outline like the sculpted miniatures. */
  outline?: boolean;
  /** Clip name per role; otherwise matched by name (Idle, Attack/Slash/Cast, Walk/Run/Fly). */
  clips?: Partial<Record<ClipRole, string>>;
  /** Show the sculpted miniature instead, for side-by-side comparison. */
  sculpted?: boolean;
}

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  /** Ink shells are built once per mesh and line width, then shared by every instance. */
  inkCache?: Map<string, THREE.BufferGeometry>;
}

const CLIP_PATTERNS: Record<ClipRole, RegExp> = {
  idle: /idle|breath|stand|wait/i,
  attack: /attack|slash|strike|shoot|cast|punch|swing|stab|spell/i,
  walk: /walk|run|move|fly|hover|crawl/i,
};

export function resolveClips(
  animations: THREE.AnimationClip[],
  names: ImportedModelSettings['clips'] = {},
): Partial<Record<ClipRole, THREE.AnimationClip>> {
  const found: Partial<Record<ClipRole, THREE.AnimationClip>> = {};
  for (const role of Object.keys(CLIP_PATTERNS) as ClipRole[]) {
    const wanted = names[role];
    const clip =
      wanted !== undefined
        ? animations.find((c) => c.name === wanted)
        : animations.find((c) => CLIP_PATTERNS[role].test(c.name));
    if (clip) found[role] = clip;
  }
  return found;
}

/** Swaps a glTF material for the miniatures' cel shading, keeping its colour and maps. */
function restyle(source: THREE.Material, toon: boolean): THREE.Material {
  if (!toon) return source.clone();
  const src = source as Partial<THREE.MeshStandardMaterial>;
  const mat = new THREE.MeshToonMaterial({
    color: src.color ?? 0xffffff,
    map: src.map ?? null,
    emissive: src.emissive ?? 0x000000,
    emissiveMap: src.emissiveMap ?? null,
    emissiveIntensity: src.emissiveIntensity ?? 1,
    alphaMap: src.alphaMap ?? null,
    gradientMap: ramp(),
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
    vertexColors: source.vertexColors,
  });
  mat.name = source.name;
  // Like the sculpted miniatures, keep the art's colours out of filmic tone mapping
  mat.toneMapped = false;
  return mat;
}

/** Inverted hull for any mesh, skinned or not: pushed out along welded normals. */
function inkShell(mesh: THREE.Mesh, width: number): THREE.BufferGeometry {
  const source = mesh.geometry;
  const position = source.getAttribute('position');
  const shell = new THREE.BufferGeometry();
  // Dequantize: compressed positions are normalized integers that can't hold the push
  const floats = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    floats[i * 3] = position.getX(i);
    floats[i * 3 + 1] = position.getY(i);
    floats[i * 3 + 2] = position.getZ(i);
  }
  shell.setAttribute('position', new THREE.BufferAttribute(floats, 3));
  for (const name of ['skinIndex', 'skinWeight']) {
    const attribute = source.getAttribute(name);
    if (attribute) shell.setAttribute(name, attribute.clone());
  }
  if (source.index) shell.setIndex(source.index.clone());
  const welded = mergeVertices(shell);
  shell.dispose();
  welded.computeVertexNormals();
  const pos = welded.getAttribute('position');
  const nrm = welded.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nrm.getX(i) * width,
      pos.getY(i) + nrm.getY(i) * width,
      pos.getZ(i) + nrm.getZ(i) * width,
    );
  }
  welded.userData['shared'] = true;
  return welded;
}

/** Ratio between a mesh's on-board size and its geometry's own units (skinning included). */
function boardScale(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  const local = geometry.boundingBox!.getSize(size).length();
  let posed = geometry.boundingBox!;
  if (mesh instanceof THREE.SkinnedMesh) {
    mesh.computeBoundingBox();
    posed = mesh.boundingBox!;
  }
  const world = posed.clone().applyMatrix4(mesh.matrixWorld).getSize(size).length();
  return local > 1e-9 ? world / local : 1;
}

/**
 * Builds one board-ready instance: a private clone (own materials for hit tints, shared
 * geometry), turned to face +z, scaled to `height` with its feet at y=0 and centred.
 */
export function instantiateModel(
  asset: LoadedModel,
  settings: ImportedModelSettings,
  height: number,
  options: MiniatureOptions = {},
): MiniatureRig {
  const model = cloneSkinned(asset.scene) as THREE.Group;
  const toon = settings.toon ?? true;
  const meshes: THREE.Mesh[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes.push(object);
    object.castShadow = true;
    object.geometry.userData['shared'] = true;
    object.material = Array.isArray(object.material)
      ? object.material.map((m) => restyle(m, toon))
      : restyle(object.material, toon);
  });

  const fit = new THREE.Group();
  fit.name = 'model-fit';
  fit.rotation.y = settings.yaw ?? 0;
  fit.add(model);
  fit.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fit);
  const size = box.getSize(new THREE.Vector3());
  const scale = size.y > 1e-9 ? (settings.height ?? height) / size.y : 1;
  const center = box.getCenter(new THREE.Vector3());
  fit.scale.setScalar(scale);
  fit.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  fit.updateMatrixWorld(true);

  if (options.outline !== false && settings.outline !== false) {
    const ink = inkMaterial();
    asset.inkCache ??= new Map();
    for (const mesh of meshes) {
      const width = INK_WIDTH / boardScale(mesh);
      const key = `${mesh.geometry.uuid}:${width.toPrecision(4)}`;
      let geometry = asset.inkCache.get(key);
      if (!geometry) {
        geometry = inkShell(mesh, width);
        asset.inkCache.set(key, geometry);
      }
      if (mesh instanceof THREE.SkinnedMesh) {
        const shell = new THREE.SkinnedMesh(geometry, ink);
        shell.bind(mesh.skeleton, mesh.bindMatrix);
        mesh.add(shell);
      } else {
        mesh.add(new THREE.Mesh(geometry, ink));
      }
    }
  }

  const root = new THREE.Group();
  root.add(fit);
  const clips = resolveClips(asset.animations, settings.clips);
  const mixer = Object.keys(clips).length ? new THREE.AnimationMixer(model) : null;
  return new MiniatureRig(root, mixer, clips);
}
