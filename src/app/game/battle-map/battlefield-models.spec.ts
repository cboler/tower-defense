import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TOWER_CLASSES, TowerClassId } from '../../core/models/tower.model';
import { MOB_TYPES, MobTypeId } from '../../core/models/mob.model';
import { animateModel, createHeroModel, createMonsterModel } from './battlefield-models';

describe('battlefield miniatures', () => {
  it('keeps every recruit and monster within a readable tile-sized silhouette after animation', () => {
    const heroes = (Object.keys(TOWER_CLASSES) as TowerClassId[])
      .filter((id) => id !== 'barricade')
      .map(createHeroModel);
    const monsters = (Object.keys(MOB_TYPES) as MobTypeId[]).map(createMonsterModel);
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
