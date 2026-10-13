import * as THREE from 'three';

export type ClipRole = 'idle' | 'attack' | 'walk';

/** What the battlefield needs from any piece on the board: a 3D miniature or a sprite. */
export interface PieceRig {
  /** What the battlefield moves around. */
  readonly root: THREE.Group;
  /** True when the piece animates itself, so procedural joint posing should stand down. */
  readonly animated: boolean;
  has(role: ClipRole): boolean;
  /** Starts an attack; false when the piece has no attack of its own. */
  attack(): boolean;
  /** Poses the walk cycle by distance travelled. */
  stride(phase: number): void;
  update(dt: number): void;
  dispose(): void;
}

/**
 * A miniature on the board: sculpted rigs pose their named joints procedurally, authored
 * rigs play their own clips. Either way `root` is what the battlefield moves around.
 */
export class MiniatureRig implements PieceRig {
  private readonly actions: Partial<Record<ClipRole, THREE.AnimationAction>> = {};

  constructor(
    public readonly root: THREE.Group,
    private readonly mixer: THREE.AnimationMixer | null = null,
    clips: Partial<Record<ClipRole, THREE.AnimationClip>> = {},
  ) {
    if (!mixer) return;
    for (const role of Object.keys(clips) as ClipRole[]) {
      this.actions[role] = mixer.clipAction(clips[role]!);
    }
    mixer.addEventListener('finished', (event) => {
      if (event.action !== this.actions.attack) return;
      event.action.fadeOut(0.2);
      this.actions.idle?.reset().fadeIn(0.2).play();
    });
    this.actions.idle?.play();
  }

  /** True when the model brings its own clips, so procedural joint posing should stand down. */
  public get animated(): boolean {
    return Object.keys(this.actions).length > 0;
  }

  public has(role: ClipRole): boolean {
    return this.actions[role] !== undefined;
  }

  /** Plays the attack clip once over the idle loop; false when the model has none. */
  public attack(): boolean {
    const action = this.actions.attack;
    if (!action) return false;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(0.06).play();
    // Cross-fade rather than blend, so the swing plays at full strength
    this.actions.idle?.fadeOut(0.06);
    return true;
  }

  /** Poses the walk clip by distance travelled, so slowed monsters visibly trudge. */
  public stride(phase: number): void {
    const action = this.actions.walk;
    if (!action) return;
    if (!action.isRunning()) {
      this.actions.idle?.stop();
      action.play();
    }
    action.timeScale = 0;
    const cycle = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
    action.time = cycle * action.getClip().duration;
  }

  /** Advances clips by simulation time; zero while paused keeps the pose fixed. */
  public update(dt: number): void {
    this.mixer?.update(dt);
  }

  public dispose(): void {
    if (!this.mixer) return;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
