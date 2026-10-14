import * as THREE from 'three';
import { ClipRole, PieceRig } from './miniature-rig';

/*
 * HD-2D pieces: pixel-art sprite sheets baked from the miniatures (`npm run sprites:bake`),
 * standing on the 3D board as camera-facing billboards. A sheet holds every animation in eight
 * facings; the actor picks the facing from the yaw the battlefield gives its holder, so the
 * board drives sprites exactly as it drives miniatures.
 */

export interface SheetAnimation {
  /** First row; facings follow in order, 0 = toward the camera, then clockwise from above. */
  row: number;
  frames: number;
  /** Seconds for one-shot animations (attacks); loops are paced by the caller. */
  duration?: number;
  /** Frame where the blow lands. */
  impact?: number;
}

export interface ActorSheet {
  file: string;
  /** Cell size in pixels. */
  cell: [number, number];
  /** Feet position within a cell, in pixels from its top-left. */
  anchor: [number, number];
  directions: number;
  animations: Record<string, SheetAnimation>;
}

export interface ActorSheets {
  pixelsPerTile: number;
  heroes: Record<string, ActorSheet>;
  monsters: Record<string, ActorSheet>;
}

/**
 * Sprites stand taller than the miniatures' footprint, as HD-2D characters do. Every sprite
 * shares the scale, so the pixel grid stays uniform across the board.
 */
export const SPRITE_SCALE = 1.35;

/** Seconds per breath of the idle loop. */
const IDLE_SECONDS = 0.9;

/**
 * Facing to show for a piece facing `yaw` (rotation.y; 0 faces +z) seen by a camera at
 * `cameraYaw` around it (0 = camera on the +z side).
 */
export function facingIndex(yaw: number, cameraYaw: number, directions: number): number {
  const step = (Math.PI * 2) / directions;
  const index = Math.round((yaw - cameraYaw) / step) % directions;
  return (index + directions) % directions;
}

/**
 * Furthest a sprite leans back to face the camera. From overhead a fully camera-facing sprite
 * would lie flat on the board and sink into taller tiles behind it; capped, it stays upright
 * enough to clear them and is only a little foreshortened.
 */
export const MAX_SPRITE_LEAN = THREE.MathUtils.degToRad(60);

const billboardEuler = new THREE.Euler();

/** The turn that faces a sprite to the camera, leaning back no further than MAX_SPRITE_LEAN. */
export function billboardTurn(camera: THREE.Camera, out: THREE.Quaternion): THREE.Quaternion {
  billboardEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  billboardEuler.x = Math.max(billboardEuler.x, -MAX_SPRITE_LEAN);
  billboardEuler.z = 0;
  return out.setFromEuler(billboardEuler);
}

/** Yaw of the camera around a point: 0 when the camera sits on its +z side. */
export function cameraYawAround(camera: THREE.Camera, point: THREE.Vector3): number {
  return Math.atan2(camera.position.x - point.x, camera.position.z - point.z);
}

export const SPRITE_VERTEX = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform vec4 frame;
  varying vec2 vUv;
  void main() {
    vUv = frame.xy + uv * frame.zw;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/**
 * Sprites rarely land on a whole number of screen pixels per texel, so nearest sampling would
 * draw texels unevenly wide and make them crawl as pieces move. Instead each texel is drawn
 * flat with a one-screen-pixel blend into its neighbour ("sharp bilinear"): crisp at any scale,
 * steady in motion. Needs linear filtering on the texture.
 */
export const SPRITE_SAMPLE = /* glsl */ `
  uniform vec2 texSize;
  vec2 sharpUv(vec2 uv) {
    vec2 texel = uv * texSize;
    vec2 seam = floor(texel + 0.5);
    texel = seam + clamp((texel - seam) / max(fwidth(texel), vec2(1e-4)), -0.5, 0.5);
    return texel / texSize;
  }
`;

export const SPRITE_FRAGMENT = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D map;
  uniform vec3 tint;
  uniform float flash;
  uniform float opacity;
  uniform float dissolve;
  varying vec2 vUv;
  ${SPRITE_SAMPLE}
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  void main() {
    vec4 texel = texture2D(map, sharpUv(vUv));
    if (texel.a < 0.5) discard;
    // Fades out a pixel at a time in an ordered dither, as pixel art does
    if (dissolve > 0.0 && bayer4(floor(vUv * texSize)) < dissolve) discard;
    gl_FragColor = vec4(mix(texel.rgb * tint, vec3(1.0), flash), opacity);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** Shadow pass: the sprite's current frame as a silhouette, so it casts its own shape. */
export const SPRITE_SHADOW_FRAGMENT = /* glsl */ `
  #include <packing>
  uniform sampler2D map;
  varying vec2 vUv;
  void main() {
    if (texture2D(map, vUv).a < 0.5) discard;
    gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
  }
`;

export const SPRITE_SHADOW_VERTEX = /* glsl */ `
  uniform vec4 frame;
  varying vec2 vUv;
  void main() {
    vUv = frame.xy + uv * frame.zw;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export class SpriteActor implements PieceRig {
  public readonly root = new THREE.Group();
  public readonly animated = true;
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** Invisible stand-in turned toward the sun, so the shadow is a full silhouette. */
  private readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly turn = new THREE.Quaternion();
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  private readonly columns: number;
  private readonly rows: number;
  private action: 'attack' | null = null;
  private actionTime = 0;
  private actionRate = 1;
  private lastAttackAt = -Infinity;
  private clock = 0;
  private walkPhase: number | null = null;
  private readonly yaw = new THREE.Quaternion();
  private readonly worldPosition = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  constructor(
    private readonly sheet: ActorSheet,
    texture: THREE.Texture,
    pixelsPerTile: number,
  ) {
    const [w, h] = sheet.cell;
    const [ax, ay] = sheet.anchor;
    // The quad's origin sits at the feet, so the billboard stands on the board
    const unit = SPRITE_SCALE / pixelsPerTile;
    const geometry = new THREE.PlaneGeometry(w * unit, h * unit);
    geometry.translate((w / 2 - ax) * unit, (ay - h / 2) * unit, 0);
    const image = texture.image as { width: number; height: number };
    this.columns = image.width / w;
    this.rows = image.height / h;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        map: { value: texture },
        texSize: { value: new THREE.Vector2(image.width, image.height) },
        frame: { value: new THREE.Vector4(0, 0, 1 / this.columns, 1 / this.rows) },
        tint: { value: new THREE.Color(1, 1, 1) },
        flash: { value: 0 },
        opacity: { value: 1 },
        dissolve: { value: 0 },
      },
      vertexShader: SPRITE_VERTEX,
      fragmentShader: SPRITE_FRAGMENT,
      fog: true,
    });
    // The art's colours are final; keep them out of filmic tone mapping
    material.toneMapped = false;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'sprite';
    this.root.add(this.mesh);
    // The camera-facing quad would cast a sliver under a side light, so an upright twin that
    // faces the sun casts the shadow instead; it shares the frame, so the shadow animates too
    this.shadow = new THREE.Mesh(
      geometry,
      // Shadow passes draw a material's far side by default, which a lone quad doesn't have
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        shadowSide: THREE.DoubleSide,
      }),
    );
    this.shadow.castShadow = true;
    this.shadow.customDepthMaterial = new THREE.ShaderMaterial({
      uniforms: { map: material.uniforms['map'], frame: material.uniforms['frame'] },
      vertexShader: SPRITE_SHADOW_VERTEX,
      fragmentShader: SPRITE_SHADOW_FRAGMENT,
      side: THREE.DoubleSide,
    });
    this.root.add(this.shadow);
    this.show('idle', 0, 0);
  }

  public has(role: ClipRole): boolean {
    return role === 'walk' ? 'walk' in this.sheet.animations : role in this.sheet.animations;
  }

  public attack(): boolean {
    const attack = this.sheet.animations['attack'];
    if (!attack) return false;
    // Rapid fire would cut the swing short; play it faster to fit the time between attacks
    const interval = this.clock - this.lastAttackAt;
    const duration = attack.duration ?? 0.5;
    this.actionRate = interval < duration ? duration / Math.max(0.12, interval * 0.95) : 1;
    this.lastAttackAt = this.clock;
    this.action = 'attack';
    this.actionTime = 0;
    return true;
  }

  public stride(phase: number): void {
    this.walkPhase = phase;
  }

  public update(dt: number): void {
    this.clock += dt;
    if (this.action) {
      this.actionTime += dt * this.actionRate;
      if (this.actionTime >= (this.sheet.animations[this.action]?.duration ?? 0.5)) {
        this.action = null;
      }
    }
  }

  /** Hit flash (0 to 1) and a cold tint while slowed. */
  public tint(flash: number, slowed: boolean): void {
    const uniforms = this.mesh.material.uniforms;
    uniforms['flash'].value = flash;
    (uniforms['tint'].value as THREE.Color).setRGB(
      slowed ? 0.7 : 1,
      slowed ? 0.85 : 1,
      slowed ? 1.25 : 1,
    );
  }

  /**
   * Fades out (0 visible, 1 gone), flashing white like the miniatures' death; it breaks up a
   * pixel at a time in an ordered dither rather than turning see-through.
   */
  public fade(progress: number): void {
    const uniforms = this.mesh.material.uniforms;
    uniforms['dissolve'].value = progress;
    uniforms['flash'].value = Math.min(1, progress * 2);
  }

  /** Squash and stretch in screen space, unaffected by the holder's facing. */
  public squash(x: number, y: number): void {
    this.mesh.scale.set(x, y, 1);
    this.shadow.scale.set(x, y, 1);
  }

  /**
   * Turns the quad to face the camera and shows the frame for the current action and facing.
   * `sunYaw` turns the shadow caster toward the light. Call after the holder has been placed
   * and turned for this frame.
   */
  public faceCamera(camera: THREE.Camera, sunYaw = 0): void {
    const parent = this.mesh.parent!;
    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(this.yaw);
    // Facing comes from the holder's yaw; the quad itself always faces the camera
    this.euler.setFromQuaternion(this.yaw, 'YXZ');
    const yaw = this.euler.y;
    this.yaw.invert();
    this.mesh.quaternion.copy(this.yaw).multiply(billboardTurn(camera, this.turn));
    this.turn.setFromAxisAngle(SpriteActor.UP, sunYaw);
    this.shadow.quaternion.copy(this.yaw).multiply(this.turn);
    parent.getWorldPosition(this.worldPosition);
    const facing = facingIndex(
      yaw,
      cameraYawAround(camera, this.worldPosition),
      this.sheet.directions,
    );
    this.showCurrent(facing);
  }

  private showCurrent(facing: number): void {
    const animations = this.sheet.animations;
    if (this.action && animations[this.action]) {
      const anim = animations[this.action];
      const u = this.actionTime / (anim.duration ?? 0.5);
      this.show(this.action, facing, Math.min(anim.frames - 1, Math.floor(u * anim.frames)));
    } else if (animations['walk'] && this.walkPhase !== null) {
      const frames = animations['walk'].frames;
      const cycle = (((this.walkPhase / (Math.PI * 2)) % 1) + 1) % 1;
      this.show('walk', facing, Math.floor(cycle * frames) % frames);
    } else if (animations['idle']) {
      const frames = animations['idle'].frames;
      this.show('idle', facing, Math.floor((this.clock / IDLE_SECONDS) * frames) % frames);
    } else if (animations['walk']) {
      this.show('walk', facing, 0);
    }
  }

  private show(name: string, facing: number, frame: number): void {
    const anim = this.sheet.animations[name];
    if (!anim) return;
    const row = anim.row + facing;
    // Texture rows count up from the bottom
    const uniform = this.mesh.material.uniforms['frame'].value as THREE.Vector4;
    uniform.x = frame / this.columns;
    uniform.y = 1 - (row + 1) / this.rows;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.shadow.material.dispose();
    this.shadow.customDepthMaterial?.dispose();
  }
}
