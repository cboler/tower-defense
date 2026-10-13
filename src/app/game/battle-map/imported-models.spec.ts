import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LoadedModel, instantiateModel, resolveClips } from './imported-models';
import { HERO_TURN } from './battlefield-models';
import { ModelLibraryService } from './model-library.service';

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) found.push(object);
  });
  return found;
}

const isInk = (mesh: THREE.Mesh) => (mesh.material as THREE.Material).userData['ink'] === true;

/** A tall, off-centre static figure in arbitrary units, like a raw generator export. */
function statue(): LoadedModel {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x336699, map: new THREE.DataTexture() }),
  );
  body.position.set(5, 2, -3);
  scene.add(body);
  return { scene, animations: [] };
}

/** A two-bone skinned limb with idle, attack and walk clips on its upper bone. */
function puppet(): LoadedModel {
  const scene = new THREE.Group();
  const hip = new THREE.Bone();
  hip.name = 'hip';
  const arm = new THREE.Bone();
  arm.name = 'arm';
  arm.position.y = 1;
  hip.add(arm);
  const geometry = new THREE.CylinderGeometry(0.2, 0.2, 2, 8, 4).translate(0, 1, 0);
  const count = geometry.getAttribute('position').count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = geometry.getAttribute('position').getY(i) > 1 ? 1 : 0;
    skinWeight[i * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.add(hip);
  mesh.bind(new THREE.Skeleton([hip, arm]));
  scene.add(mesh);
  const swing = (name: string, duration: number, angle: number) =>
    new THREE.AnimationClip(name, duration, [
      new THREE.NumberKeyframeTrack('arm.rotation[x]', [0, duration / 2, duration], [0, angle, 0]),
    ]);
  return {
    scene,
    animations: [
      swing('Idle_Breathe', 2, 0.05),
      swing('Sword Slash', 0.4, -1.5),
      swing('Run', 1, 0.8),
    ],
  };
}

describe('authored miniatures', () => {
  it('fits any export to the sculpted footprint: turned, scaled, feet down and centred', () => {
    const rig = instantiateModel(statue(), { yaw: Math.PI / 2 }, 0.9, { outline: false });
    const box = new THREE.Box3().setFromObject(rig.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    expect(size.y).toBeCloseTo(0.9);
    expect(box.min.y).toBeCloseTo(0);
    expect(center.x).toBeCloseTo(0);
    expect(center.z).toBeCloseTo(0);
    // The quarter turn swaps the footprint's width and depth
    expect(size.x).toBeLessThan(size.z);
    const tall = instantiateModel(statue(), { height: 1.4 }, 0.9, { outline: false });
    expect(new THREE.Box3().setFromObject(tall.root).getSize(new THREE.Vector3()).y).toBeCloseTo(
      1.4,
    );
  });

  it('gives each instance its own cel-shaded materials while sharing geometry', () => {
    const asset = statue();
    const [a, b] = [0, 1].map(() =>
      meshes(instantiateModel(asset, {}, 1, { outline: false }).root),
    );
    expect(a[0].geometry).toBe(b[0].geometry);
    expect(a[0].material).not.toBe(b[0].material);
    const source = meshes(asset.scene)[0].material as THREE.MeshStandardMaterial;
    const toon = a[0].material as THREE.MeshToonMaterial;
    expect(toon).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(toon.map).toBe(source.map);
    expect(toon.color.equals(source.color)).toBe(true);
    expect(toon.toneMapped).toBe(false);
    const original = meshes(instantiateModel(asset, { toon: false }, 1).root).find(
      (m) => !isInk(m),
    )!;
    expect(original.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it('outlines skinned meshes with a shell that follows the same skeleton', () => {
    const asset = puppet();
    const first = meshes(instantiateModel(asset, {}, 1).root);
    const body = first.find((m) => !isInk(m)) as THREE.SkinnedMesh;
    const shell = first.find(isInk) as THREE.SkinnedMesh;
    expect(shell).toBeInstanceOf(THREE.SkinnedMesh);
    expect(shell.skeleton).toBe(body.skeleton);
    expect(shell.bindMatrix.equals(body.bindMatrix)).toBe(true);
    // Shells are built once per mesh and reused by later instances
    const second = meshes(instantiateModel(asset, {}, 1).root).find(isInk)!;
    expect(second.geometry).toBe(shell.geometry);
    expect(meshes(instantiateModel(asset, { outline: false }, 1).root).some(isInk)).toBe(false);
    expect(meshes(instantiateModel(asset, {}, 1, { outline: false }).root).some(isInk)).toBe(false);
  });

  it('leaves fine details flagged `ink: false` unoutlined', () => {
    const asset = statue();
    const detail = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshStandardMaterial());
    detail.userData['ink'] = false;
    asset.scene.add(detail);
    const parts = meshes(instantiateModel(asset, {}, 1).root);
    const shells = parts.filter(isInk);
    expect(shells.length).toBe(1);
    expect(shells[0].parent?.userData['ink']).not.toBe(false);
  });

  it('matches clips to roles by name unless told which to use', () => {
    const clips = puppet().animations;
    const found = resolveClips(clips);
    expect(found.idle?.name).toBe('Idle_Breathe');
    expect(found.attack?.name).toBe('Sword Slash');
    expect(found.walk?.name).toBe('Run');
    expect(resolveClips(clips, { attack: 'Run' }).attack?.name).toBe('Run');
    expect(resolveClips(clips, { idle: 'Missing' }).idle).toBeUndefined();
  });

  it('swings the attack clip at full strength, then settles back into idle', () => {
    const rig = instantiateModel(puppet(), {}, 1, { outline: false });
    const arm = rig.root.getObjectByName('arm')!;
    expect(rig.animated).toBe(true);
    rig.update(0);
    expect(rig.attack()).toBe(true);
    for (let i = 0; i < 4; i++) rig.update(0.05);
    expect(arm.rotation.x).toBeLessThan(-1);
    for (let i = 0; i < 20; i++) rig.update(0.05);
    expect(Math.abs(arm.rotation.x)).toBeLessThan(0.1);
  });

  it('poses the walk clip from distance travelled, identically for identical strides', () => {
    const rig = instantiateModel(puppet(), {}, 1, { outline: false });
    const arm = rig.root.getObjectByName('arm')!;
    rig.stride(Math.PI);
    rig.update(0);
    const halfway = arm.rotation.x;
    expect(halfway).toBeCloseTo(0.8);
    rig.update(5);
    expect(arm.rotation.x).toBeCloseTo(halfway);
    rig.stride(Math.PI * 4);
    rig.update(0);
    expect(arm.rotation.x).toBeCloseTo(0);
  });
});

describe('ModelLibraryService', () => {
  it('falls back to the sculpted miniature until an authored model is registered', async () => {
    const library = new ModelLibraryService();
    const sculpted = library.hero('ranger');
    expect(sculpted.animated).toBe(false);
    expect(sculpted.root.getObjectByName('arm-left')).toBeDefined();
    const sculptedHeight = new THREE.Box3()
      .setFromObject(sculpted.root)
      .getSize(new THREE.Vector3()).y;

    await library.register('heroes', 'ranger', statue());
    expect(library.revision('heroes', 'ranger')).toBe(1);
    expect(library.revision('heroes', 'oracle')).toBe(0);
    const authored = library.hero('ranger');
    expect(authored.root.getObjectByName('model-fit')).toBeDefined();
    expect(authored.root.rotation.y).toBeCloseTo(HERO_TURN);
    const authoredHeight = new THREE.Box3()
      .setFromObject(authored.root)
      .getSize(new THREE.Vector3()).y;
    expect(authoredHeight).toBeCloseTo(sculptedHeight, 1);

    library.tune('heroes', 'ranger', { sculpted: true });
    expect(library.revision('heroes', 'ranger')).toBe(2);
    expect(library.hero('ranger').root.getObjectByName('model-fit')).toBeUndefined();
    library.tune('heroes', 'ranger', { sculpted: false, yaw: 1 });
    expect(library.settings('heroes', 'ranger')).toEqual({ sculpted: false, yaw: 1 });
  });
});
