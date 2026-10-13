import * as THREE from 'three';
import { TowerClassId } from '../../core/models/tower.model';
import { animateModel } from './battlefield-models';

/*
 * Keyframed motions for the shared humanoid rig (joints named torso, head, arm-left, arm-right).
 * They pose sculpted and authored miniatures alike, drive the battlefield's 3D heroes, and are
 * what the sprite baker renders into pixel-art frames, so both looks move the same way.
 */

export type AttackMotion = 'slash' | 'shoot' | 'throw' | 'cast' | 'slam' | 'stab';

/** Which attack each class performs. */
export const CLASS_ATTACK: Record<Exclude<TowerClassId, 'barricade'>, AttackMotion> = {
  'blade-warden': 'slash',
  samurai: 'slash',
  paladin: 'slash',
  ranger: 'shoot',
  bard: 'shoot',
  ninja: 'throw',
  elementalist: 'cast',
  chronomancer: 'cast',
  'red-mage': 'cast',
  astrologian: 'cast',
  oracle: 'cast',
  lancer: 'slam',
  juggernaut: 'slam',
  rogue: 'stab',
};

/** Archers lead with the bow in the off hand; everyone else leads with the right hand. */
export function leadArm(classId: TowerClassId): 'arm-left' | 'arm-right' {
  return classId === 'ranger' || classId === 'bard' ? 'arm-left' : 'arm-right';
}

type Keys = readonly (readonly [number, number])[];

interface Choreography {
  /** Seconds for one play-through at normal speed. */
  duration: number;
  /** Fraction of the motion where the blow lands. */
  impact: number;
  /**
   * Joint offsets from rest, keyed by channel. Written for a lead arm on the character's right
   * (-x); sideways channels (lead.rz, off.rz, torso.ry) flip for a lead arm on the left.
   */
  keys: Partial<Record<Channel, Keys>>;
}

type Channel =
  | 'lead.rx'
  | 'lead.rz'
  | 'off.rx'
  | 'off.rz'
  | 'torso.rx'
  | 'torso.ry'
  | 'head.rx'
  | 'root.y'
  | 'root.z';

const SIDEWAYS = new Set<Channel>(['lead.rz', 'off.rz', 'torso.ry']);

/** Anticipation, a fast strike landing on `impact`, follow-through, then recovery. */
const ATTACKS: Record<AttackMotion, Choreography> = {
  // Sword raised overhead and cut diagonally across the body with a half step
  slash: {
    duration: 0.5,
    impact: 0.42,
    keys: {
      'lead.rx': [
        [0, 0],
        [0.28, -2.7],
        [0.42, -0.55],
        [0.6, -0.25],
        [1, 0],
      ],
      'lead.rz': [
        [0, 0],
        [0.28, -0.35],
        [0.42, 0.35],
        [0.6, 0.5],
        [1, 0],
      ],
      'off.rx': [
        [0, 0],
        [0.28, -0.3],
        [0.42, -0.6],
        [0.6, -0.5],
        [1, 0],
      ],
      'torso.ry': [
        [0, 0],
        [0.28, -0.4],
        [0.42, 0.45],
        [0.6, 0.5],
        [1, 0],
      ],
      'torso.rx': [
        [0, 0],
        [0.28, -0.08],
        [0.42, 0.12],
        [0.6, 0.08],
        [1, 0],
      ],
      'head.rx': [
        [0, 0],
        [0.42, 0.08],
        [1, 0],
      ],
      'root.z': [
        [0, 0],
        [0.28, -0.02],
        [0.42, 0.07],
        [0.6, 0.06],
        [1, 0],
      ],
      'root.y': [
        [0, 0],
        [0.42, -0.015],
        [0.6, 0],
        [1, 0],
      ],
    },
  },
  // Bow raised level and drawn, released, and the draw hand snaps back
  shoot: {
    duration: 0.45,
    impact: 0.5,
    keys: {
      'lead.rx': [
        [0, 0],
        [0.35, -0.85],
        [0.5, -0.85],
        [0.7, -0.6],
        [1, 0],
      ],
      'off.rx': [
        [0, 0],
        [0.35, -1.4],
        [0.5, -1.0],
        [0.7, -0.5],
        [1, 0],
      ],
      'torso.ry': [
        [0, 0],
        [0.35, 0.35],
        [0.5, 0.35],
        [0.7, 0.2],
        [1, 0],
      ],
      'root.z': [
        [0, 0],
        [0.5, 0],
        [0.6, -0.03],
        [1, 0],
      ],
    },
  },
  // Hand cocked back, then whipped forward across the body
  throw: {
    duration: 0.4,
    impact: 0.45,
    keys: {
      'lead.rx': [
        [0, 0],
        [0.3, 0.7],
        [0.45, -1.6],
        [0.65, -1.2],
        [1, 0],
      ],
      'lead.rz': [
        [0, 0],
        [0.3, -0.3],
        [0.45, 0.2],
        [1, 0],
      ],
      'off.rx': [
        [0, 0],
        [0.3, -0.9],
        [0.45, 0.3],
        [1, 0],
      ],
      'torso.ry': [
        [0, 0],
        [0.3, -0.35],
        [0.45, 0.35],
        [0.65, 0.3],
        [1, 0],
      ],
      'root.z': [
        [0, 0],
        [0.45, 0.04],
        [1, 0],
      ],
    },
  },
  // Focus raised high while rising onto the toes, then thrust at the target
  cast: {
    duration: 0.6,
    impact: 0.55,
    keys: {
      'lead.rx': [
        [0, 0],
        [0.35, -2.6],
        [0.45, -2.45],
        [0.55, -1.35],
        [0.72, -1.2],
        [1, 0],
      ],
      'off.rx': [
        [0, 0],
        [0.35, -0.8],
        [0.55, -0.4],
        [1, 0],
      ],
      'torso.rx': [
        [0, 0],
        [0.35, -0.1],
        [0.55, 0.12],
        [0.72, 0.08],
        [1, 0],
      ],
      'head.rx': [
        [0, 0],
        [0.35, -0.1],
        [0.55, 0.06],
        [1, 0],
      ],
      'root.y': [
        [0, 0],
        [0.35, 0.03],
        [0.5, 0.035],
        [0.62, 0],
        [1, 0],
      ],
    },
  },
  // Both hands overhead on a hop, then crashing down into a crouch
  slam: {
    duration: 0.6,
    impact: 0.5,
    keys: {
      'lead.rx': [
        [0, 0],
        [0.32, -2.9],
        [0.48, -0.35],
        [0.7, -0.3],
        [1, 0],
      ],
      'off.rx': [
        [0, 0],
        [0.32, -2.6],
        [0.48, -0.5],
        [0.7, -0.4],
        [1, 0],
      ],
      'torso.rx': [
        [0, 0],
        [0.32, -0.15],
        [0.48, 0.28],
        [0.7, 0.22],
        [1, 0],
      ],
      'head.rx': [
        [0, 0],
        [0.48, 0.1],
        [1, 0],
      ],
      'root.y': [
        [0, 0],
        [0.2, 0],
        [0.32, 0.09],
        [0.44, 0],
        [0.5, -0.03],
        [0.7, -0.02],
        [1, 0],
      ],
      'root.z': [
        [0, 0],
        [0.48, 0.05],
        [1, 0],
      ],
    },
  },
  // A crouch, then a darting lunge with both blades
  stab: {
    duration: 0.4,
    impact: 0.45,
    keys: {
      'lead.rx': [
        [0, 0],
        [0.25, 0.5],
        [0.45, -1.5],
        [0.65, -1.3],
        [1, 0],
      ],
      'off.rx': [
        [0, 0],
        [0.25, 0.4],
        [0.5, -1.4],
        [0.7, -1.2],
        [1, 0],
      ],
      'torso.rx': [
        [0, 0],
        [0.25, -0.05],
        [0.45, 0.18],
        [1, 0],
      ],
      'root.z': [
        [0, 0],
        [0.25, -0.03],
        [0.45, 0.09],
        [0.7, 0.07],
        [1, 0],
      ],
      'root.y': [
        [0, 0],
        [0.35, 0.04],
        [0.5, 0],
        [1, 0],
      ],
    },
  },
};

export function attackDuration(motion: AttackMotion): number {
  return ATTACKS[motion].duration;
}

export function attackImpact(motion: AttackMotion): number {
  return ATTACKS[motion].impact;
}

/** Smoothstep between keys: eases out of and into every key, so short spans read as snaps. */
export function track(u: number, keys: Keys): number {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [u1, v1] = keys[i];
    if (u <= u1) {
      const [u0, v0] = keys[i - 1];
      const t = (u - u0) / (u1 - u0);
      return v0 + (v1 - v0) * t * t * (3 - 2 * t);
    }
  }
  return keys[keys.length - 1][1];
}

interface Rest {
  joints: Map<THREE.Object3D, { position: THREE.Vector3; rotation: THREE.Euler }>;
  root: THREE.Vector3;
}

const JOINTS = ['torso', 'head', 'arm-left', 'arm-right'];

/** Rest pose, captured the first time a model is posed. */
function rest(model: THREE.Object3D): Rest {
  let saved = model.userData['motionRest'] as Rest | undefined;
  if (!saved) {
    saved = { joints: new Map(), root: model.position.clone() };
    for (const name of JOINTS) {
      const joint = model.getObjectByName(name);
      if (joint) {
        saved.joints.set(joint, {
          position: joint.position.clone(),
          rotation: joint.rotation.clone(),
        });
      }
    }
    model.userData['motionRest'] = saved;
  }
  return saved;
}

/**
 * Poses a humanoid model `u` of the way (0 to 1) through an attack. Rest pose at both ends,
 * so it can be played back to back. Root offsets move `model` itself (feet at its origin).
 */
export function poseAttack(
  model: THREE.Object3D,
  motion: AttackMotion,
  u: number,
  lead: 'arm-left' | 'arm-right' = 'arm-right',
): void {
  const { joints, root } = rest(model);
  const leadArm = model.getObjectByName(lead);
  const offArm = model.getObjectByName(lead === 'arm-right' ? 'arm-left' : 'arm-right');
  // Choreography is written for a lead arm on the character's right (-x)
  const flip = leadArm && joints.get(leadArm)!.position.x > 0 ? -1 : 1;
  const keys = ATTACKS[motion].keys;
  const value = (channel: Channel) => {
    const k = keys[channel];
    if (!k) return 0;
    return track(u, k) * (SIDEWAYS.has(channel) ? flip : 1);
  };
  const set = (joint: THREE.Object3D | undefined, rx: number, ry: number, rz: number) => {
    const base = joint && joints.get(joint);
    if (!joint || !base) return;
    joint.rotation.set(base.rotation.x + rx, base.rotation.y + ry, base.rotation.z + rz);
  };
  set(leadArm, value('lead.rx'), 0, value('lead.rz'));
  set(offArm, value('off.rx'), 0, value('off.rz'));
  set(model.getObjectByName('torso'), value('torso.rx'), value('torso.ry'), 0);
  set(model.getObjectByName('head'), value('head.rx'), 0, 0);
  model.position.set(root.x, root.y + value('root.y'), root.z + value('root.z'));
}

/** One breath, 0 to 1: chest rises, the head lifts a touch and the arms sway. Loops. */
export function poseIdle(model: THREE.Group, u: number): void {
  const { joints, root } = rest(model);
  // Capes, orbiting charms and spinning foci keep their own procedural motion
  animateModel(model, u * Math.PI * 20, 0, 0);
  const wave = Math.sin(u * Math.PI * 2);
  for (const [joint, base] of joints) {
    joint.position.copy(base.position);
    joint.rotation.copy(base.rotation);
  }
  const torso = model.getObjectByName('torso');
  if (torso) torso.position.y += wave * 0.008;
  const head = model.getObjectByName('head');
  if (head) head.rotation.x += Math.sin(u * Math.PI * 2 + 0.6) * 0.04;
  for (const name of ['arm-left', 'arm-right']) {
    const arm = model.getObjectByName(name);
    if (arm) arm.rotation.x += wave * 0.05;
  }
  model.position.copy(root);
}
