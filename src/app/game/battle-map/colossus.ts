import * as THREE from 'three';
import { SUPER_BOSS_DEATH } from '../../core/models/mob.model';

/*
 * The Iron Colossus moves on its own rig rather than the shared walk: a ponderous stomp, a limp
 * once its arm is torn away, a crawl on one arm once its legs give out, the reel each time a
 * damage stage breaks, and a drawn-out death. Poses are plain joint values, so the battlefield,
 * the sprite baker and the gallery all pose it the same way.
 *
 * Damage shows on the model itself: parts tagged `breakStage` come away when that stage breaks
 * (stage 4 is the final blast) and glowing fissures tagged `crackStage` open up.
 */

export const COLOSSUS_JOINTS = [
  'pelvis',
  'torso',
  'head',
  'leg-left',
  'leg-right',
  'knee-left',
  'knee-right',
  'arm-left',
  'arm-right',
  'forearm-left',
  'forearm-right',
] as const;

type Joint = (typeof COLOSSUS_JOINTS)[number];

/** Rotation (x, y, z) and position offset (x, y, z) of one joint. */
type JointState = [number, number, number, number, number, number];

export type ColossusPose = Record<Joint, JointState>;

/** Height of the hip joint above the feet, in model units. */
export const COLOSSUS_HIPS = 0.425;

/** Resting turn of each joint, applied by the sculpt and kept by every pose. */
export const COLOSSUS_REST: Partial<Record<Joint, [number, number, number]>> = {
  torso: [0.1, 0, 0],
  head: [-0.1, 0, 0],
  'arm-left': [0, 0, 0.14],
  'arm-right': [0.05, 0, -0.12],
  'forearm-left': [-0.2, 0, 0],
  'forearm-right': [-0.15, 0, 0],
};

/** Tiles walked per full gait cycle (two steps), per crawl pull. */
export const COLOSSUS_GAIT_TILES = 1.3;
export const COLOSSUS_CRAWL_TILES = 0.55;

/** Board scale of the colossus, so the crawl's lurch matches the distance it covers. */
const BOARD_SCALE = 2.1;

/** Phase gained per tile travelled at this damage stage. */
export function colossusStrideRate(stage: number): number {
  return (Math.PI * 2) / (stage >= 3 ? COLOSSUS_CRAWL_TILES : COLOSSUS_GAIT_TILES);
}

/**
 * Counts footfalls: it changes each time a foot (or, crawling, the hand) slams down, so the
 * battlefield can shake the ground on each one.
 */
export function colossusStep(stage: number, stride: number): number {
  if (stage >= 3) return Math.floor(stride / (Math.PI * 2) - CRAWL_PLANT);
  return Math.floor((stride - Math.PI / 2) / Math.PI);
}

/** Prone, the hips sit behind the piece's position so the body lies centred on it. */
const CRAWL_SHIFT = -0.36;

/** Fraction of a crawl cycle at which the reaching hand slams down and the pull begins. */
const CRAWL_PLANT = 0.45;

/** Seconds of each stagger, by the stage that broke (mirrors the mob definition). */
export const COLOSSUS_STAGGER_SECONDS = [1.4, 1.6, 2.6];

/** Point in the stage-3 stagger where the body hits the ground. */
export const COLOSSUS_FALL_IMPACT = 0.55;

function blank(): ColossusPose {
  const pose = {} as ColossusPose;
  for (const joint of COLOSSUS_JOINTS) {
    const r = COLOSSUS_REST[joint] ?? [0, 0, 0];
    pose[joint] = [r[0], r[1], r[2], 0, 0, 0];
  }
  return pose;
}

function add(
  pose: ColossusPose,
  joint: Joint,
  rx = 0,
  ry = 0,
  rz = 0,
  px = 0,
  py = 0,
  pz = 0,
): void {
  const s = pose[joint];
  s[0] += rx;
  s[1] += ry;
  s[2] += rz;
  s[3] += px;
  s[4] += py;
  s[5] += pz;
}

/** Sets a joint's turn outright, measured from its rest. */
function turn(pose: ColossusPose, joint: Joint, rx = 0, ry = 0, rz = 0): void {
  const r = COLOSSUS_REST[joint] ?? [0, 0, 0];
  const s = pose[joint];
  s[0] = r[0] + rx;
  s[1] = r[1] + ry;
  s[2] = r[2] + rz;
}

export function mixPoses(a: ColossusPose, b: ColossusPose, t: number): ColossusPose {
  const pose = {} as ColossusPose;
  for (const joint of COLOSSUS_JOINTS) {
    pose[joint] = a[joint].map((v, i) => v + (b[joint][i] - v) * t) as JointState;
  }
  return pose;
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const span = (t: number, from: number, to: number) => smooth((t - from) / (to - from));

/** The stomping gait: undamaged, cracked (stage 1, hunched) or limping (stage 2). */
export function walkPose(stage: number, phase: number): ColossusPose {
  const pose = blank();
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const limp = stage >= 2;
  // The left leg is wounded once the arm above it is gone: a short, stiff step
  const reachR = 0.42;
  const reachL = limp ? 0.24 : 0.42;
  add(pose, 'leg-right', s * reachR);
  add(pose, 'leg-left', -s * reachL);
  add(pose, 'knee-right', Math.max(0, -c) * 0.75 + 0.04);
  add(pose, 'knee-left', limp ? 0.22 + Math.max(0, c) * 0.25 : Math.max(0, c) * 0.75 + 0.04);
  // Hips drop as the legs spread and rise over the planted foot; weight rolls side to side
  const dip = limp ? Math.max(0, -s) * 0.035 : 0;
  add(pose, 'pelvis', 0, 0, s * 0.07 + (limp ? 0.05 : 0), 0, -0.032 * s * s - dip);
  add(pose, 'torso', stage >= 1 ? 0.08 : 0, -s * 0.13, -s * 0.045 + (limp ? 0.1 : 0));
  add(pose, 'head', stage >= 1 ? -0.05 : 0, s * 0.06, s * 0.03);
  // The sword arm hangs heavy, dragging the blade; the free arm swings against the stride
  add(pose, 'arm-right', s * 0.06);
  if (limp) {
    // What is left of the left arm twitches with each lurch
    add(pose, 'arm-left', -0.25 + Math.sin(phase * 2) * 0.12, 0, 0.3);
  } else {
    add(pose, 'arm-left', s * 0.32);
    add(pose, 'forearm-left', -Math.max(0, -s) * 0.3);
  }
  return pose;
}

/** Dragging itself on its one arm, legs trailing; `phase` advances one pull per cycle. */
export function crawlPose(phase: number): ColossusPose {
  const pose = blank();
  const cycle = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
  // Reach: the arm swings forward while the body rests; pull: the body is hauled after it
  const reaching = cycle < CRAWL_PLANT;
  const u = reaching ? cycle / CRAWL_PLANT : (cycle - CRAWL_PLANT) / (1 - CRAWL_PLANT);
  const extend = reaching ? smooth(u) : 1 - smooth(u);
  // The body only moves during the pull, so it lurches: offset it against the steady march
  const d = COLOSSUS_CRAWL_TILES / BOARD_SCALE;
  const lurch = reaching ? 0.225 * d - d * cycle : -0.225 * d + CRAWL_PLANT * d * u;
  const heave = reaching ? 0 : Math.sin(u * Math.PI) * 0.03;
  add(
    pose,
    'pelvis',
    1.25,
    0,
    Math.sin(phase) * 0.04,
    0,
    0.17 - COLOSSUS_HIPS + heave,
    CRAWL_SHIFT + lurch,
  );
  add(pose, 'leg-right', -0.18 + Math.sin(phase) * 0.04, 0, -0.1);
  add(pose, 'leg-left', -0.14 - Math.sin(phase) * 0.04, 0, 0.12);
  add(pose, 'knee-right', 0.12);
  add(pose, 'knee-left', 0.2);
  add(pose, 'torso', -0.18 - heave * 3, 0, -0.06);
  add(pose, 'head', -1.45 + extend * 0.15, 0, Math.sin(phase) * 0.05);
  // The sword hand, empty now, reaches far ahead and claws the body forward
  add(pose, 'arm-right', -0.75 - extend * 1.75, 0, 0.05);
  add(pose, 'forearm-right', -1.0 + extend * 0.95);
  // The stump paws uselessly at the ground
  add(pose, 'arm-left', -1.5 + Math.sin(phase * 2) * 0.18, 0, 0.25);
  return pose;
}

/** The pose a moving colossus holds at this damage stage and stride. */
export function gaitPose(stage: number, phase: number): ColossusPose {
  return stage >= 3 ? crawlPose(phase) : walkPose(stage, phase);
}

/**
 * Reeling as a damage stage breaks, `u` from 0 to 1 over the stagger. Stage 3 is the fall: the
 * knees buckle, it topples onto its hand and ends at the start of the crawl.
 */
export function staggerPose(stage: number, u: number, phase = 0): ColossusPose {
  if (stage >= 3) return fallPose(u, phase);
  const pose = walkPose(stage - 1, phase);
  // A sharp recoil, then a slow recovery
  const e = u < 0.12 ? smooth(u / 0.12) : 1 - smooth((u - 0.12) / 0.88);
  const shudder = Math.sin(u * 70) * 0.05 * e;
  if (stage === 1) {
    add(pose, 'torso', -0.42 * e, 0, shudder);
    add(pose, 'head', -0.3 * e + shudder * 2);
    add(pose, 'pelvis', -0.08 * e, 0, 0, 0, 0, -0.03 * e);
    add(pose, 'arm-left', -0.9 * e, 0, 0.5 * e);
    add(pose, 'arm-right', -0.3 * e, 0, -0.04 * e);
  } else {
    // Lurches toward the torn side, the wounded knee buckling under it
    add(pose, 'torso', -0.22 * e, 0.08 * e, -0.38 * e + shudder);
    add(pose, 'head', -0.25 * e + shudder * 2, 0, 0.2 * e);
    add(pose, 'pelvis', 0, 0, -0.1 * e, 0, -0.05 * e);
    add(pose, 'knee-left', 0.6 * e);
    add(pose, 'leg-left', -0.3 * e);
    add(pose, 'arm-left', -1.3 * e, 0, 0.7 * e);
    add(pose, 'arm-right', -0.35 * e, 0, -0.04 * e);
  }
  return pose;
}

function fallPose(u: number, phase: number): ColossusPose {
  const standing = walkPose(2, 0);
  const crawl = crawlPose(phase);
  // Knees buckle: down onto both knees, body pitching forward
  const kneel = blank();
  add(kneel, 'pelvis', 0.25, 0, 0.05, 0, -0.2);
  add(kneel, 'leg-right', -1.05);
  add(kneel, 'leg-left', -0.95);
  add(kneel, 'knee-right', 1.55);
  add(kneel, 'knee-left', 1.45);
  add(kneel, 'torso', 0.3, 0, 0.12);
  add(kneel, 'head', 0.2);
  add(kneel, 'arm-right', -0.6, 0, -0.5);
  add(kneel, 'arm-left', -0.4, 0, 0.6);
  // Toppling: thrown forward with the hand out to catch itself
  const topple = crawlPose(Math.PI * 2 * 0.4);
  add(topple, 'pelvis', -0.15, 0, 0, 0, 0.05);
  add(topple, 'head', 0.6);
  let pose: ColossusPose;
  if (u < 0.3) pose = mixPoses(standing, kneel, span(u, 0, 0.3));
  else if (u < COLOSSUS_FALL_IMPACT) {
    pose = mixPoses(kneel, topple, span(u, 0.3, COLOSSUS_FALL_IMPACT));
  } else {
    // Hits the ground, lies a moment, then lifts its head toward the crystal
    pose = mixPoses(topple, crawl, span(u, 0.62, 1));
    const bounce = Math.max(0, 1 - (u - COLOSSUS_FALL_IMPACT) / 0.08);
    add(pose, 'pelvis', 0, 0, 0, 0, 0.02 * bounce);
  }
  const shake = Math.sin(u * 55) * 0.06 * (1 - u);
  add(pose, 'torso', 0, 0, shake);
  return pose;
}

/**
 * Seconds into the death, from wherever the crawl was: convulsions as the blasts pop, one last
 * reach, the slump, and the wreck lying still after the final blast.
 */
export function deathPose(t: number, phase = Math.PI * 2 * 0.7): ColossusPose {
  const { reach, slump, blast } = SUPER_BOSS_DEATH;
  const pose = crawlPose(phase);
  if (t < reach) {
    // Convulsions grow as the furnace fails
    const k = 0.4 + 0.6 * (t / reach);
    add(
      pose,
      'torso',
      Math.sin(t * 37) * 0.1 * k,
      Math.sin(t * 23) * 0.06 * k,
      Math.sin(t * 29) * 0.08 * k,
    );
    add(pose, 'head', Math.sin(t * 43) * 0.2 * k, Math.sin(t * 31) * 0.15 * k);
    add(pose, 'arm-right', Math.sin(t * 31) * 0.3 * k, 0, Math.sin(t * 19) * 0.15 * k);
    add(pose, 'forearm-right', Math.sin(t * 27) * 0.3 * k);
    add(pose, 'arm-left', Math.sin(t * 41) * 0.35 * k);
    add(
      pose,
      'pelvis',
      0,
      0,
      Math.sin(t * 33) * 0.04 * k,
      0,
      Math.abs(Math.sin(t * 41)) * 0.014 * k,
    );
    return pose;
  }
  // One last reach for the crystal: arm out, head raised, back arched
  const r = span(t, reach, slump - 0.1);
  const tremble = Math.sin(t * 50) * 0.03;
  const reached = crawlPose(phase);
  turn(reached, 'arm-right', -2.6 + tremble, 0, 0.1);
  turn(reached, 'forearm-right', -0.1);
  turn(reached, 'head', -1.35 + tremble);
  turn(reached, 'torso', -0.45);
  let out = mixPoses(pose, reached, r);
  if (t >= slump) {
    // The slump: face down, arm dropped flat, the body settling into the ground
    const s = span(t, slump, blast);
    const slumped = crawlPose(phase);
    turn(slumped, 'arm-right', -1.9, 0, 0.3);
    turn(slumped, 'forearm-right', -0.3);
    turn(slumped, 'head', 0.35);
    turn(slumped, 'torso', 0.1, 0, 0.06);
    turn(slumped, 'arm-left', -0.9, 0, 0.55);
    add(slumped, 'pelvis', -0.1, 0, 0.08, 0, -0.035);
    out = mixPoses(out, slumped, s);
  }
  return out;
}

/** Death frames baked into the HD-2D sheet, as seconds into the death. */
export const COLOSSUS_DEATH_FRAMES = [0.3, 0.55, 0.8, 1.05, 2.35, 2.6, 2.8, 3.0, 3.2, 3.6];

/** How many of the death frames are convulsions, cycled until the reach. */
const CONVULSE_FRAMES = 4;

/** The baked death frame to show at `t` seconds into the death. */
export function colossusDeathFrame(t: number): number {
  if (t < SUPER_BOSS_DEATH.reach) return Math.floor(t * 14) % CONVULSE_FRAMES;
  let best = CONVULSE_FRAMES;
  for (let i = CONVULSE_FRAMES; i < COLOSSUS_DEATH_FRAMES.length; i++) {
    if (COLOSSUS_DEATH_FRAMES[i] <= t + 0.1) best = i;
  }
  return best;
}

interface JointCache {
  joints: Partial<Record<Joint, THREE.Object3D>>;
  pelvisRest: THREE.Vector3;
}

function jointsOf(model: THREE.Object3D): JointCache {
  let cache = model.userData['colossusJoints'] as JointCache | undefined;
  if (!cache) {
    const joints: JointCache['joints'] = {};
    for (const name of COLOSSUS_JOINTS) {
      const object = model.getObjectByName(name);
      if (object) joints[name] = object;
    }
    cache = { joints, pelvisRest: joints.pelvis?.position.clone() ?? new THREE.Vector3() };
    model.userData['colossusJoints'] = cache;
  }
  return cache;
}

/** Poses the colossus's joints. */
export function applyColossusPose(model: THREE.Object3D, pose: ColossusPose): void {
  const { joints, pelvisRest } = jointsOf(model);
  for (const name of COLOSSUS_JOINTS) {
    const joint = joints[name];
    if (!joint) continue;
    const [rx, ry, rz, px, py, pz] = pose[name];
    joint.rotation.set(rx, ry, rz);
    if (name === 'pelvis')
      joint.position.set(pelvisRest.x + px, pelvisRest.y + py, pelvisRest.z + pz);
  }
}

/** Shows the damage of `stage`: broken parts hidden, fissures open. Idempotent. */
export function applyColossusDamage(model: THREE.Object3D, stage: number): void {
  model.traverse((object) => {
    const broken = object.userData['breakStage'] as number | undefined;
    const crack = object.userData['crackStage'] as number | undefined;
    if (broken !== undefined) object.visible = stage < broken;
    if (crack !== undefined) object.visible = stage >= crack;
  });
}

/** Parts that come away when `stage` breaks, still attached to the model. */
export function colossusBreakingParts(model: THREE.Object3D, stage: number): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  model.traverse((object) => {
    if (object.userData['breakStage'] === stage) parts.push(object);
  });
  return parts;
}
