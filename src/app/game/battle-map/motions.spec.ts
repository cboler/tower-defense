import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHeroModel } from './battlefield-models';
import { CLASS_ATTACK, attackImpact, leadArm, poseAttack, poseIdle, track } from './motions';

describe('motions', () => {
  it('eases between keys and holds the ends', () => {
    const keys = [
      [0, 0],
      [0.5, 2],
      [1, 0],
    ] as const;
    expect(track(-1, keys)).toBe(0);
    expect(track(0.25, keys)).toBeCloseTo(1);
    expect(track(0.5, keys)).toBe(2);
    expect(track(2, keys)).toBe(0);
  });

  it('swings from rest, lands the blow at impact and returns to rest', () => {
    const model = createHeroModel('blade-warden');
    const arm = model.getObjectByName('arm-right')!;
    const torso = model.getObjectByName('torso')!;
    poseAttack(model, 'slash', 0);
    const rest = arm.rotation.clone();
    const restTorso = torso.rotation.clone();
    poseAttack(model, 'slash', 0.28);
    // Wind-up: sword raised overhead, shoulder drawn back
    expect(arm.rotation.x).toBeLessThan(rest.x - 2);
    poseAttack(model, 'slash', attackImpact('slash'));
    expect(arm.rotation.x).toBeGreaterThan(rest.x - 1);
    expect(model.position.z).toBeGreaterThan(0.05);
    poseAttack(model, 'slash', 1);
    expect(arm.rotation.x).toBeCloseTo(rest.x);
    expect(arm.rotation.z).toBeCloseTo(rest.z);
    expect(torso.rotation.y).toBeCloseTo(restTorso.y);
    expect(model.position.length()).toBeCloseTo(0);
  });

  it('mirrors sideways motion when the lead arm is on the left of the body', () => {
    // Every lead arm in the art is on the character's right (-x), the ranger's bow included
    const ranger = createHeroModel('ranger');
    expect(leadArm('ranger')).toBe('arm-left');
    expect(ranger.getObjectByName(leadArm('ranger'))!.position.x).toBeLessThan(0);
    const right = createHeroModel('blade-warden');
    const left = createHeroModel('blade-warden');
    for (const model of [right, left]) poseAttack(model, 'slash', 0);
    poseAttack(right, 'slash', 0.28, 'arm-right');
    poseAttack(left, 'slash', 0.28, 'arm-left');
    const twist = (m: THREE.Group) => m.getObjectByName('torso')!.rotation.y;
    expect(twist(left)).toBeCloseTo(-twist(right));
    expect(Math.abs(twist(right))).toBeGreaterThan(0.3);
  });

  it('gives every class an attack and breathes back to the same pose each loop', () => {
    for (const motion of Object.values(CLASS_ATTACK))
      expect(attackImpact(motion)).toBeGreaterThan(0);
    const model = createHeroModel('oracle');
    poseIdle(model, 0);
    const torso = model.getObjectByName('torso')!;
    const start = torso.position.y;
    poseIdle(model, 0.25);
    expect(torso.position.y).toBeGreaterThan(start);
    poseIdle(model, 1);
    expect(torso.position.y).toBeCloseTo(start);
  });
});
