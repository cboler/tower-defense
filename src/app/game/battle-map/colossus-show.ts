import * as THREE from 'three';
import { MOB_TYPES, MobInstance, SUPER_BOSS_DEATH } from '../../core/models/mob.model';
import {
  COLOSSUS_FALL_IMPACT,
  applyColossusDamage,
  applyColossusPose,
  colossusBreakingParts,
  colossusDeathFrame,
  colossusStep,
  colossusStrideRate,
  deathPose,
  gaitPose,
  staggerPose,
} from './colossus';
import { PieceRig } from './miniature-rig';
import { SpriteActor } from './sprite-actors';

/*
 * The Iron Colossus on the board: it shakes the ground with every footfall, sheds armour as its
 * damage stages break, smokes and sparks as it weakens, and dies in a long Castle Crashers-style
 * show of popping blasts, a last reach and a final explosion. Miniatures shed real parts; HD-2D
 * sprites carry the damage in their baked frames and throw pixel chunks instead.
 */

/** What the show needs from the battlefield: effects, shake and sound. */
export interface ColossusHost {
  burst(
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    count: number,
    opts?: {
      speed?: number;
      lift?: number;
      gravity?: number;
      life?: number;
      size?: number;
      additive?: boolean;
    },
  ): void;
  /** An explosion's flash, rings and sparks at a point, `radius` tiles across. */
  blast(x: number, y: number, z: number, color: string, radius: number): void;
  /** A ring of dust spreading over the ground. */
  dust(x: number, z: number, radius: number): void;
  shake(amount: number): void;
  stomp(weight: number): void;
}

/** Sprite gait per damage stage, as baked by `npm run sprites:bake`. */
const SPRITE_GAITS = ['walk', 'walk-cracked', 'limp', 'crawl'];

/** Height of the board's ground plane under walking monsters. */
const GROUND = 0.2;

const IRON = 0x4b5361;
const EMBER = '#fb923c';

interface Debris {
  object: THREE.Object3D;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  resting: number;
}

/** Armour shed by the colossus: tumbles, bounces, lies a while and sinks away. */
export class DebrisField {
  private readonly pieces: Debris[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Detaches a part from its model and throws it, keeping its place in the world. */
  public throw(part: THREE.Object3D, velocity: THREE.Vector3): void {
    part.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      // Its own materials, so the body's flashes and disposal leave it alone
      object.material = Array.isArray(object.material)
        ? object.material.map((m) => m.clone())
        : object.material.clone();
    });
    this.scene.attach(part);
    part.visible = true;
    const spin = new THREE.Vector3(
      (Math.random() - 0.5) * 9,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 9,
    );
    this.pieces.push({ object: part, velocity, spin, age: 0, resting: 0 });
  }

  public update(dt: number): void {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const d = this.pieces[i];
      d.age += dt;
      const o = d.object;
      if (d.resting < 2.4) {
        d.velocity.y -= 9.8 * dt;
        o.position.addScaledVector(d.velocity, dt);
        o.rotation.x += d.spin.x * dt;
        o.rotation.y += d.spin.y * dt;
        o.rotation.z += d.spin.z * dt;
        if (o.position.y < GROUND + 0.05 && d.velocity.y < 0) {
          // Clatters down, bouncing less each time, then lies still
          o.position.y = GROUND + 0.05;
          d.velocity.y *= -0.35;
          d.velocity.x *= 0.55;
          d.velocity.z *= 0.55;
          d.spin.multiplyScalar(0.5);
          if (Math.abs(d.velocity.y) < 0.6) {
            d.velocity.set(0, 0, 0);
            d.spin.set(0, 0, 0);
          }
        }
        if (d.velocity.lengthSq() === 0) d.resting += dt;
      } else {
        // Sinks into the ground
        d.resting += dt;
        o.position.y -= dt * 0.35;
        const fade = Math.max(0.001, 1 - (d.resting - 2.4) / 0.9);
        o.scale.multiplyScalar(Math.pow(fade, dt * 3));
        if (d.resting > 3.3 || d.age > 12) {
          this.dispose(o);
          this.pieces.splice(i, 1);
        }
      }
    }
  }

  public clear(): void {
    for (const d of this.pieces) this.dispose(d.object);
    this.pieces.length = 0;
  }

  private dispose(object: THREE.Object3D): void {
    this.scene.remove(object);
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) =>
        m.dispose(),
      );
    });
  }
}

/** One colossus's state on the board, from its first step to its last breath. */
export class ColossusShow {
  /** Damage stage shown so far; parts broken up to it have been shed. */
  private stage = 0;
  /** Gait phase: one cycle per stride, or per crawl pull. */
  public stride = 0;
  private lastStep: number | null = null;
  private lastStaggerU = 0;
  private ambience = 0;
  private flash = 0;
  /** Rig the current damage has been applied to; a rebuilt rig needs it again. */
  private dressed: PieceRig | null = null;
  private deathAge = -1;
  private deathPhase = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly host: ColossusHost,
    private readonly debris: DebrisField,
  ) {}

  /** Hit flashes are a glint on so much iron, or the boss would glow white under fire. */
  public static readonly HIT_FLASH = 0.35;

  public get crawling(): boolean {
    return this.stage >= 3;
  }

  public get flashAmount(): number {
    return this.flash;
  }

  /** Poses and dresses the colossus for this frame and plays its footfalls and wounds. */
  public update(
    mob: MobInstance,
    rig: PieceRig,
    holder: THREE.Group,
    group: THREE.Group,
    moved: number,
    simDt: number,
    reducedMotion: boolean,
  ): void {
    const target = mob.damageStage ?? 0;
    while (this.stage < target) this.breakStage(++this.stage, rig, holder, group);
    if (this.dressed !== rig) this.dress(rig);
    this.flash = Math.max(0, this.flash - simDt * 6);

    const def = MOB_TYPES[mob.typeId];
    const staggerMs = mob.staggerMs ?? 0;
    const staggered = staggerMs > 0 && this.stage > 0;
    const u = staggered ? 1 - staggerMs / def.damageStages![this.stage - 1].staggerMs : 0;
    if (!staggered) {
      this.stride += moved * colossusStrideRate(this.stage);
      const step = colossusStep(this.stage, this.stride);
      if (this.lastStep !== null && step !== this.lastStep) this.footfall(holder, group);
      this.lastStep = step;
    } else if (
      this.stage >= 3 &&
      this.lastStaggerU < COLOSSUS_FALL_IMPACT &&
      u >= COLOSSUS_FALL_IMPACT
    ) {
      // The fall lands: the heaviest blow the ground takes
      const p = group.position;
      this.host.shake(0.18);
      this.host.dust(p.x, p.z, 1.8);
      this.host.burst(p.x, GROUND + 0.1, p.z, 0x8a7a64, 16, { speed: 3, lift: 1.4 });
      this.host.stomp(1.4);
    }
    this.lastStaggerU = u;

    const phase = reducedMotion ? 0 : this.stride;
    const actor = rig instanceof SpriteActor ? rig : null;
    if (actor) {
      actor.gait = SPRITE_GAITS[Math.min(3, this.stage)];
      actor.held = staggered
        ? { name: `stagger-${this.stage}`, frame: Math.floor(u * (this.stage >= 3 ? 8 : 6)) }
        : null;
      actor.stride(phase);
    } else if (!rig.animated) {
      applyColossusPose(
        rig.root,
        staggered ? staggerPose(this.stage, u, phase) : gaitPose(this.stage, phase),
      );
    }

    this.ambience -= simDt;
    if (this.ambience <= 0 && simDt > 0) {
      this.ambience = 0.22;
      this.wounds(rig, holder, group, moved > 1e-4 && !staggered);
    }
  }

  /** Starts the death show; returns its length in seconds. */
  public beginDeath(rig: PieceRig, holder: THREE.Group, group: THREE.Group): void {
    // Struck down before its legs failed: everything left to break goes at once
    while (this.stage < 3) this.breakStage(++this.stage, rig, holder, group);
    this.deathAge = 0;
    this.deathPhase = this.stride;
    this.flash = 1;
    this.host.shake(0.15);
  }

  /** Advances the death show by `dt`; `progress` past the blast is how far the wreck has sunk. */
  public updateDeath(
    dt: number,
    rig: PieceRig,
    holder: THREE.Group,
    group: THREE.Group,
  ): { flash: number; sink: number } {
    const before = this.deathAge;
    const t = (this.deathAge += dt);
    const crossed = (beat: number) => before < beat && t >= beat;
    const p = group.position;
    const { pops, reach, slump, blast } = SUPER_BOSS_DEATH;
    this.flash = Math.max(0, this.flash - dt * 7);

    pops.forEach((at, i) => {
      if (!crossed(at)) return;
      // Blasts pop all over the body, faster and bigger as the furnace goes
      const point = this.bodyPoint(holder, group, Math.random(), Math.random(), Math.random());
      this.host.blast(point.x, point.y, point.z, i % 3 ? EMBER : '#fde047', 0.5 + i * 0.03);
      this.host.burst(point.x, point.y, point.z, IRON, 3, { speed: 2.2, lift: 2.4, size: 1.6 });
      this.host.shake(0.05 + i * 0.004);
      this.flash = Math.max(this.flash, 0.8);
    });
    if (crossed(reach)) this.flash = 0.4;
    if (crossed(slump)) {
      this.host.shake(0.12);
      this.host.dust(p.x, p.z, 1.4);
      this.host.burst(p.x, GROUND + 0.1, p.z, 0x8a7a64, 12, { speed: 2.4, lift: 1.2 });
    }
    if (crossed(blast)) {
      // The final explosion: the furnace bursts and the last of the armour flies off
      this.flash = 1;
      this.host.shake(0.22);
      const core = this.bodyPoint(holder, group, 0.5, 0.5, 0.6);
      this.host.blast(core.x, core.y, core.z, '#fde047', 2.2);
      this.host.blast(core.x, core.y + 0.3, core.z, EMBER, 1.4);
      this.host.dust(p.x, p.z, 2.6);
      this.host.burst(core.x, core.y, core.z, EMBER, 30, { speed: 4.5, lift: 3, additive: true });
      this.host.burst(core.x, core.y, core.z, IRON, 18, {
        speed: 3.5,
        lift: 4,
        size: 2.4,
        life: 1.1,
      });
      this.host.burst(core.x, core.y, core.z, '#facc15', 16, {
        speed: 2,
        lift: 5,
        gravity: 4,
        life: 1.4,
        size: 1.4,
      });
      if (!(rig instanceof SpriteActor)) {
        for (const part of colossusBreakingParts(rig.root, 4)) {
          const velocity = this.outward(part, group, 3.2, 4.5);
          // The helm pops high into the air, Castle Crashers style
          if (part.name === 'head') velocity.set(velocity.x * 0.4, 7.5, velocity.z * 0.4);
          this.debris.throw(part, velocity);
        }
      }
    }
    if (t > blast && Math.random() < dt * 6) {
      // The wreck smoulders
      const point = this.bodyPoint(holder, group, Math.random(), 0.3, Math.random());
      this.host.burst(point.x, point.y, point.z, 0x52525b, 1, {
        speed: 0.3,
        lift: 1.2,
        gravity: -1,
        life: 1.2,
        size: 2,
      });
    }

    const actor = rig instanceof SpriteActor ? rig : null;
    if (actor) {
      actor.held = { name: 'death', frame: colossusDeathFrame(t) };
    } else if (!rig.animated) {
      applyColossusPose(rig.root, deathPose(t, this.deathPhase));
    }
    const sink = t > blast + 0.25 ? Math.min(1, (t - blast - 0.25) / 0.7) : 0;
    return { flash: this.flash, sink };
  }

  private dress(rig: PieceRig): void {
    this.dressed = rig;
    if (!(rig instanceof SpriteActor)) applyColossusDamage(rig.root, this.stage);
  }

  /** A stage breaks: armour flies, sparks spray and the boss reels (the game holds it still). */
  private breakStage(stage: number, rig: PieceRig, holder: THREE.Group, group: THREE.Group): void {
    const chest = this.bodyPoint(holder, group, 0.5, 0.75, 0.55);
    this.host.blast(chest.x, chest.y, chest.z, EMBER, 0.9 + stage * 0.2);
    this.host.burst(chest.x, chest.y, chest.z, EMBER, 18, {
      speed: 3.2,
      lift: 2.5,
      additive: true,
    });
    this.host.shake(0.1 + stage * 0.02);
    this.flash = 1;
    if (rig instanceof SpriteActor) {
      // Pixel armour chunks stand in for the shed parts
      this.host.burst(chest.x, chest.y, chest.z, IRON, 8 + stage * 3, {
        speed: 2.6,
        lift: 3.5,
        size: 2.6,
        life: 1,
      });
      this.host.burst(chest.x, chest.y, chest.z, 0x8c97a7, 5, {
        speed: 2.2,
        lift: 3,
        size: 2,
        life: 1,
      });
    } else {
      for (const part of colossusBreakingParts(rig.root, stage)) {
        // The sword is let go rather than thrown
        const velocity =
          part.name === 'sword'
            ? new THREE.Vector3(0, 0.5, 0)
            : this.outward(part, group, 2.2, 3.4);
        this.debris.throw(part, velocity);
      }
      applyColossusDamage(rig.root, stage);
    }
  }

  /** Footfall (or the crawling hand slamming down): the board shakes and dust flies. */
  private footfall(holder: THREE.Group, group: THREE.Group): void {
    const crawling = this.crawling;
    const side = Math.floor(this.stride / Math.PI) % 2 ? 0.25 : 0.75;
    const at = crawling
      ? this.bodyPoint(holder, group, 0.3, 0, 1.15)
      : this.bodyPoint(holder, group, side, 0, 0.62);
    this.host.shake(crawling ? 0.055 : 0.085);
    this.host.dust(at.x, at.z, crawling ? 0.7 : 1.05);
    this.host.burst(at.x, GROUND + 0.06, at.z, 0x8a7a64, crawling ? 6 : 9, {
      speed: 1.6,
      lift: 1.1,
      life: 0.55,
    });
    this.host.stomp(crawling ? 0.65 : 1);
  }

  /** Smoke, sparks and the dragged sword's scrape, more of each as the colossus breaks. */
  private wounds(rig: PieceRig, holder: THREE.Group, group: THREE.Group, moving: boolean): void {
    const miniature = rig instanceof SpriteActor ? null : rig.root;
    if (this.stage >= 1) {
      const stack =
        this.point(miniature, 'smokestack') ??
        this.bodyPoint(holder, group, 0.5, this.crawling ? 0.55 : 0.95, this.crawling ? 0.35 : 0.3);
      const puffs = this.stage >= 2 ? 2 : 1;
      this.host.burst(stack.x, stack.y, stack.z, this.stage >= 3 ? 0x3f3f46 : 0x71717a, puffs, {
        speed: 0.25,
        lift: 1.1,
        gravity: -1.2,
        life: 1.3,
        size: 2.2,
      });
    }
    if (this.stage >= 2 && Math.random() < 0.6) {
      const stump =
        this.point(miniature, 'stump') ??
        this.bodyPoint(holder, group, 0.9, this.crawling ? 0.4 : 0.62, 0.5);
      this.host.burst(stump.x, stump.y, stump.z, EMBER, 3, {
        speed: 1.4,
        lift: 1.6,
        additive: true,
      });
    }
    if (moving && this.stage < 3 && Math.random() < 0.7) {
      const tip = this.point(miniature, 'sword-tip') ?? this.bodyPoint(holder, group, 0.1, 0, -0.9);
      this.host.burst(tip.x, GROUND + 0.05, tip.z, '#fde68a', 2, {
        speed: 1.1,
        lift: 0.9,
        additive: true,
        life: 0.3,
      });
    }
  }

  private point(model: THREE.Object3D | null, name: string): THREE.Vector3 | null {
    const object = model?.getObjectByName(name);
    if (!object) return null;
    return object.getWorldPosition(new THREE.Vector3());
  }

  /**
   * A point in the body's rough bounds, from fractions across (`fx`, right to left), up (`fy`)
   * and along (`fz`, back to front, in body lengths from the feet), turned with the colossus.
   * Standing it is tall and narrow; crawling it lies long and low ahead of its hips.
   */
  private bodyPoint(
    holder: THREE.Group,
    group: THREE.Group,
    fx: number,
    fy: number,
    fz: number,
  ): THREE.Vector3 {
    const scale = 2.1;
    const across = (fx - 0.5) * 0.7 * scale;
    const up = this.crawling ? (0.1 + fy * 0.3) * scale : (0.1 + fy * 1.0) * scale;
    const along = this.crawling ? (fz - 0.1) * 0.9 * scale : (fz - 0.5) * 0.35 * scale;
    const yaw = holder.rotation.y;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return this.tmp
      .set(
        group.position.x + across * c + along * s,
        group.position.y + up,
        group.position.z - across * s + along * c,
      )
      .clone();
  }

  /** A throw away from the body's centre, `out` sideways and `up` upward. */
  private outward(
    part: THREE.Object3D,
    group: THREE.Group,
    out: number,
    up: number,
  ): THREE.Vector3 {
    const at = part.getWorldPosition(new THREE.Vector3());
    const dir = at.sub(group.position).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    dir.normalize().multiplyScalar(out * (0.7 + Math.random() * 0.6));
    return dir.setY(up * (0.8 + Math.random() * 0.4));
  }
}
