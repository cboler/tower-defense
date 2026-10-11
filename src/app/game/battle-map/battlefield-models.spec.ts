import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TOWER_CLASSES, TowerClassId } from '../../core/models/tower.model';
import { MOB_TYPES, MobTypeId } from '../../core/models/mob.model';
import { animateModel, createHeroModel, createMonsterModel } from './battlefield-models';

const HERO_IDS = (Object.keys(TOWER_CLASSES) as TowerClassId[]).filter((id) => id !== 'barricade');
const MOB_IDS = Object.keys(MOB_TYPES) as MobTypeId[];

function meshes(model: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) found.push(object);
  });
  return found;
}

function isInk(mesh: THREE.Mesh): boolean {
  return (mesh.material as THREE.Material).userData['ink'] === true;
}

describe('battlefield miniatures', () => {
  it('keeps every recruit and monster within a readable tile-sized silhouette after animation', () => {
    const heroes = HERO_IDS.map((id) => createHeroModel(id));
    const monsters = MOB_IDS.map((id) => createMonsterModel(id));
    for (const model of [...heroes, ...monsters]) {
      for (const phase of [0, 1, 20]) {
        animateModel(model, phase, 0.5, 0.8);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        expect([size.x, size.y, size.z].every(Number.isFinite)).toBe(true);
        expect(size.y).toBeGreaterThan(0.3);
        expect(size.y).toBeLessThan(2);
        expect(Math.max(size.x, size.z)).toBeLessThan(2.5);
      }
    }
  });

  it('sculpts each class and monster individually rather than recolouring one rig', () => {
    const signature = (model: THREE.Group) =>
      meshes(model)
        .map((mesh) => mesh.geometry.getAttribute('position').count)
        .sort((a, b) => a - b)
        .join(',');
    const heroes = new Set(HERO_IDS.map((id) => signature(createHeroModel(id))));
    const monsters = new Set(MOB_IDS.map((id) => signature(createMonsterModel(id))));
    expect(heroes.size).toBe(HERO_IDS.length);
    expect(monsters.size).toBe(MOB_IDS.length);
  });

  it('animates articulated weapons and opposing steps without moving the gameplay root', () => {
    const model = createHeroModel('blade-warden');
    const arm = model.getObjectByName('arm-right')!;
    animateModel(model, Math.PI / 2, 0.5, 1);
    expect(arm.rotation.x).toBeLessThan(-1);
    expect(model.getObjectByName('leg-left')!.rotation.x).toBeCloseTo(0.5);
    expect(model.getObjectByName('leg-right')!.rotation.x).toBeCloseTo(-0.5);
    expect(model.position.toArray()).toEqual([0, 0, 0]);
    // Identical simulation time must yield an identical pose while paused.
    const pose = arm.quaternion.clone();
    animateModel(model, Math.PI / 2, 0.5, 1);
    expect(arm.quaternion.equals(pose)).toBe(true);
    animateModel(model, 0, 0, 0);
    expect(arm.rotation.x).toBeCloseTo(0);
  });

  it('layers attack swings on top of a pose held from the artwork', () => {
    // The ranger holds the bow out at rest, as in its sprite.
    const model = createHeroModel('ranger');
    const bowArm = model.getObjectByName('arm-left')!;
    animateModel(model, 0, 0, 0);
    const restAngle = bowArm.rotation.x;
    expect(restAngle).toBeLessThan(-0.3);
    animateModel(model, 0, 0, 1);
    expect(bowArm.rotation.x).toBeLessThan(restAngle);
    animateModel(model, 0, 0, 0);
    expect(bowArm.rotation.x).toBeCloseTo(restAngle);
  });

  it('wraps miniatures in an ink outline that CPU-rasterized renderers can skip', () => {
    for (const model of [createHeroModel('paladin'), createMonsterModel('dread-gaze')]) {
      expect(meshes(model).some(isInk)).toBe(true);
    }
    const plain = [
      createHeroModel('paladin', { outline: false }),
      createMonsterModel('dread-gaze', { outline: false }),
    ];
    for (const model of plain) {
      expect(meshes(model).some(isInk)).toBe(false);
    }
  });

  it('keeps the artwork palette out of filmic tone mapping', () => {
    for (const mesh of meshes(createHeroModel('red-mage'))) {
      expect((mesh.material as THREE.Material).toneMapped).toBe(false);
    }
  });

  it('keeps separate creatures independent when hit tint or death opacity changes', () => {
    const first = createMonsterModel('prismatic-ooze');
    const second = createMonsterModel('prismatic-ooze');
    const materials = new Set<THREE.Material>();
    first.traverse((object) => {
      if (object instanceof THREE.Mesh) materials.add(object.material);
    });
    second.traverse((object) => {
      if (object instanceof THREE.Mesh) expect(materials.has(object.material)).toBe(false);
    });
  });
});
