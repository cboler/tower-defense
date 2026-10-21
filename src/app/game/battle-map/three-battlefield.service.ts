import { Injectable, inject, signal } from '@angular/core';
import * as THREE from 'three';
import { animateModel } from './battlefield-models';
import { ColossusHost, ColossusShow, DebrisField } from './colossus-show';
import { PieceRig } from './miniature-rig';
import { ModelKind, ModelLibraryService } from './model-library.service';
import { CLASS_ATTACK, attackDuration, leadArm, poseAttack } from './motions';
import { SpriteActor, billboardTurn } from './sprite-actors';
import {
  PixelRing,
  paintArrow,
  paintBladeStar,
  paintCursorBrackets,
  paintCursorGem,
  paintExplosion,
  paintFireball,
  paintLightPillar,
  paintSlash,
  paintSpark,
  paintSpear,
  paintTimeOrb,
} from './pixel-fx';
import { SpriteLibraryService } from './sprite-library.service';
import {
  Ground,
  Raster,
  SIDE_ATLAS_ROWS,
  SIDE_ROWS,
  TERRAIN_TEXELS,
  TILE_SHAPES,
  paintBoard,
  paintCliff,
  paintSides,
  rasterTexture,
  sharpenPixels,
  sideBand,
} from './pixel-terrain';
import {
  CRYSTAL_PALETTES,
  PropArt,
  paintCloud,
  paintDais,
  paintGate,
  paintGem,
  paintSky,
  paintSkyIsland,
  paintVoidOrb,
} from './pixel-props';
import {
  PROP_PIXEL,
  PropCache,
  SCENERY_THEMES,
  ScenerySprite,
  blocksBoard,
  islandCliffGeometry,
  layoutRimProps,
  paintProp,
  spriteTexture,
} from './pixel-scenery';
import type { Hd2dPost } from './hd2d-post';
import { GameService } from '../../core/services/game.service';
import { TOWER_CLASSES, TowerClassId } from '../../core/models/tower.model';
import { MOB_TYPES, MobInstance, SUPER_BOSS_DEATH_MS, mobScale } from '../../core/models/mob.model';
import { AudioService } from '../../core/services/audio.service';
import { ParticleFx, Projectile } from '../../core/models/game-state.model';
import { TileCode } from '../../core/models/map.model';

export type CameraPreset = 'tactics' | 'isometric' | 'topdown';

/** Miniatures: cel-shaded 3D pieces. HD-2D: pixel sprites on the diorama with lens effects. */
export type BoardLook = 'miniatures' | 'hd2d';

const LOOK_STORAGE_KEY = 'crystal-wardens.look';

type AttackStyle = 'lunge' | 'recoil' | 'cast' | 'slam' | 'hop' | 'none';

/** Miniature materials whose emissive channel carries hit, slow and death tints. */
type TintableMaterial = THREE.MeshStandardMaterial | THREE.MeshToonMaterial;

/** How each hero moves when it acts. */
const ATTACK_STYLE: Record<TowerClassId, AttackStyle> = {
  'blade-warden': 'lunge',
  samurai: 'lunge',
  paladin: 'lunge',
  ranger: 'recoil',
  ninja: 'recoil',
  bard: 'recoil',
  elementalist: 'cast',
  chronomancer: 'cast',
  'red-mage': 'cast',
  astrologian: 'cast',
  lancer: 'slam',
  juggernaut: 'slam',
  rogue: 'hop',
  oracle: 'cast',
  barricade: 'none',
};

/** Arc height per tile of flight distance. */
const PROJECTILE_ARC: Record<Projectile['visualType'], number> = {
  arrow: 0.12,
  'song-arrow': 0.14,
  fireball: 0.28,
  'magic-spark': 0.1,
  'time-orb': 0.12,
  spear: 0.35,
  dagger: 0.03,
};

/** HD-2D projectile art, and whether it is drawn pointing along its flight (to the right). */
const PIXEL_SHOTS: Record<Projectile['visualType'], [() => PropArt, boolean]> = {
  arrow: [() => paintArrow(), true],
  'song-arrow': [() => paintArrow(true), true],
  spear: [paintSpear, true],
  fireball: [paintFireball, true],
  'time-orb': [paintTimeOrb, false],
  dagger: [paintBladeStar, false],
  'magic-spark': [() => paintSpark(), false],
};

/** Trail and impact spark colours per projectile, shared by both looks. */
const SHOT_COLOURS: Record<Projectile['visualType'], { trail: number | null; impact: number }> = {
  arrow: { trail: 0xfef9c3, impact: 0xfde68a },
  'song-arrow': { trail: 0xf472b6, impact: 0xf9a8d4 },
  spear: { trail: 0x7dd3fc, impact: 0x38bdf8 },
  fireball: { trail: 0xf97316, impact: 0xfb923c },
  'time-orb': { trail: 0xa855f7, impact: 0xc084fc },
  dagger: { trail: null, impact: 0x22d3ee },
  'magic-spark': { trail: 0x7dd3fc, impact: 0x38bdf8 },
};

const MAX_PARTICLES = 450;

/** The HD-2D sun stands low to the west, so shadows fall where the camera sees them. */
const HD2D_SUN = new THREE.Vector3(-15, 15, 5);

/** Tiles of wild island around the board in HD-2D. */
const PIXEL_RIM = 1;

/** HD-2D altar crystal: frames per sixth of a turn (one facet of the gem). */
const ALTAR_FRAMES = 8;

/** A painted backdrop piece drifting in the sky. */
interface SkyProp {
  sprite: ScenerySprite;
  base: THREE.Vector3;
  phase: number;
  /** Tiles per second sideways (clouds); 0 for islands and shards that only bob. */
  drift: number;
}

interface BurstOptions {
  speed?: number;
  lift?: number;
  gravity?: number;
  life?: number;
  size?: number;
  additive?: boolean;
  sparkle?: boolean;
}

interface ParticleInstance {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  gravity: number;
  baseScale: number;
  /** HD-2D: edge in sprite pixels of a camera-facing square; shrinks a pixel at a time. */
  pixels?: number;
  sparkle?: boolean;
}

interface TowerVisual {
  group: THREE.Group;
  classId: TowerClassId;
  level: number;
  lastActionTime: number;
  attackAge: number;
  attackDirX: number;
  attackDirZ: number;
  spawnAge: number;
  levelUpAge: number;
  xpRatio: number;
  phase: number;
  rig: PieceRig | null;
  /** Look and model revision this piece was built for. */
  modelKey: string;
}

interface MobVisual {
  group: THREE.Group;
  sprite: THREE.Group;
  rig: PieceRig;
  modelKey: string;
  materials: TintableMaterial[];
  shadow: THREE.Mesh;
  hpGroup: THREE.Group;
  hpFill: THREE.Mesh;
  hpLag: THREE.Mesh;
  hpTrail: number;
  stunStars: THREE.Group;
  /** HD-2D stun stars, painted; they turn to the camera. */
  stunSprites: ScenerySprite[];
  spriteSize: number;
  lastHp: number;
  hitAge: number;
  spawnAge: number;
  stride: number;
  lastX: number;
  lastZ: number;
  lean: number;
  facing: number;
  color: THREE.Color;
  /** Super bosses' footfalls, wounds and death; null for everything else. */
  colossus: ColossusShow | null;
}

interface FadingVisual {
  group: THREE.Group;
  age: number;
  life: number;
  kind: 'mob-death' | 'mob-escape' | 'tower-sell' | 'boss-death';
  mob?: MobVisual;
}

interface ProjectileVisual {
  group: THREE.Group;
  body: THREE.Group;
  prev: THREE.Vector3;
  hasPrev: boolean;
  spin: number;
  trailTimer: number;
  trailColor: number | null;
  impactColor: number;
  /** HD-2D: the painted projectile, rolled to point along its flight on screen. */
  sprite: ScenerySprite | null;
  /** Painted art that already points the way it flies (arrows, spears, fireballs). */
  pointed: boolean;
}

interface EffectVisual {
  object: THREE.Object3D;
  materials: THREE.Material[];
  age: number;
  life: number;
  animate: (progress: number, object: THREE.Object3D) => void;
  dispose?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ThreeBattlefieldService {
  private readonly models = inject(ModelLibraryService);
  private readonly sprites = inject(SpriteLibraryService);
  private readonly audio = inject(AudioService);
  /** Armour shed by super bosses, tumbling across the board. */
  private debris: DebrisField | null = null;
  private simPaused = false;
  /** Effects, shake and sound for super bosses' shows. */
  private readonly colossusHost: ColossusHost = {
    burst: (x, y, z, color, count, opts) => this.spawnBurst(x, y, z, color, count, opts),
    blast: (x, y, z, color, radius) => this.blastAt(x, y, z, color, radius),
    dust: (x, z, radius) => {
      if (this.look() === 'hd2d') this.pixelGroundRing(x, z, '#d6c7a1', radius, 0.55);
      else this.groundRing(x, z, new THREE.Color(0xd6c7a1), radius, 0.55);
    },
    shake: (amount) => this.shake(amount),
    stomp: (weight) => this.audio.playStomp(weight),
  };
  /** Board look, remembered between visits. */
  public readonly look = signal<BoardLook>(storedLook());
  private post: Hd2dPost | null = null;
  private postLoading = false;
  private game: GameService | null = null;
  private ambientLight: THREE.HemisphereLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  /** Direction of the sun around the board, for sprite shadows. */
  private sunYaw = 0;
  /** The HD-2D board painting, regenerated per map. */
  private pixelTextures: THREE.Texture[] = [];
  /** HD-2D props, painted once and shared between every copy. */
  private readonly propCache = new PropCache();
  /** Painted props on and around the board, turned to the camera every frame. */
  private boardProps: ScenerySprite[] = [];
  /** Tall rim props, hidden while they would stand between the camera and the board. */
  private tallProps: { sprite: ScenerySprite; x: number; z: number }[] = [];
  private skyProps: SkyProp[] = [];
  private pixelAltar: { crystal: ScenerySprite; satellites: ScenerySprite[]; spin: number } | null =
    null;
  private pixelOrb: ScenerySprite | null = null;
  private skyTexture: THREE.Texture | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private animFrameId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;

  public readonly isWebGLSupported = signal<boolean>(false);
  public readonly activeCameraMode = signal<CameraPreset>('tactics');
  /** True while the board is shown rotated 90° to fill a portrait canvas. */
  public readonly portraitBoard = signal<boolean>(false);

  // Scene Groups
  private terrainGroup: THREE.Group | null = null;
  private environmentGroup: THREE.Group | null = null;
  private reticleMesh: THREE.Group | null = null;
  private rangeMesh: THREE.Mesh | null = null;
  private supportRangeMesh: THREE.Mesh | null = null;
  /** HD-2D tile cursor: brackets painted on the tile and a crystal bobbing above it. */
  private pixelCursor: { decal: THREE.Mesh; texture: THREE.Texture; gem: ScenerySprite } | null =
    null;
  private pixelRange: PixelRing | null = null;
  private pixelSupportRange: PixelRing | null = null;

  // Key Feature Meshes
  private crystalAltarMesh: THREE.Group | null = null;
  private crystalCore: THREE.Mesh | null = null;
  private crystalShell: THREE.Mesh | null = null;
  private crystalRing: THREE.Mesh | null = null;
  private crystalSatellites: THREE.Mesh[] = [];
  private crystalLight: THREE.PointLight | null = null;
  private crystalBeaconBeam: THREE.Mesh | null = null;

  private spawnVortexMesh: THREE.Group | null = null;
  private spawnDisc: THREE.Mesh | null = null;
  private spawnCore: THREE.Mesh | null = null;

  // Atmospheric Particle System
  private aetherMotes: THREE.Points | null = null;
  private aetherPositions: Float32Array | null = null;
  private aetherVelocities: Float32Array | null = null;
  private cloudRings: THREE.Group | null = null;

  // Entity visuals & effect pools
  private towerVisuals = new Map<string, TowerVisual>();
  private mobVisuals = new Map<string, MobVisual>();
  private projectileVisuals = new Map<string, ProjectileVisual>();
  private fadingVisuals: FadingVisual[] = [];
  private activeEffects: EffectVisual[] = [];
  private seenEffectIds = new Set<string>();
  private activeParticles: ParticleInstance[] = [];
  private mobHeights = new Map<string, number>();
  private readonly tmpVec = new THREE.Vector3();

  // Shared geometry (never disposed per-entity)
  private readonly burstGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  private readonly sparkleGeo = new THREE.OctahedronGeometry(0.045, 0);
  private readonly gemGeo = new THREE.SphereGeometry(0.035, 8, 8);
  private readonly shadowGeo = new THREE.CircleGeometry(0.32, 16);
  private readonly fxSphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private readonly fxRingGeo = new THREE.RingGeometry(0.82, 1, 48);
  private readonly fxArcGeo = new THREE.RingGeometry(0.62, 1, 24, 1, 0, Math.PI * 0.9);
  private readonly fxWideArcGeo = new THREE.RingGeometry(0.78, 1, 48, 1, 0, Math.PI * 1.5);
  /** HD-2D sparks: camera-facing squares sized in whole sprite pixels. */
  private readonly pixelSquareGeo = new THREE.PlaneGeometry(1, 1);
  private sparkleTexture: THREE.DataTexture | null = null;
  private readonly particleTurn = new THREE.Quaternion();
  private readonly fxTurn = new THREE.Quaternion();
  private readonly fxVec = new THREE.Vector3();
  private readonly fx = new THREE.Vector3();
  private readonly fxPillarGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(
    0,
    0.5,
    0,
  );
  private readonly sharedGeometries = new Set<THREE.BufferGeometry>([
    this.burstGeo,
    this.sparkleGeo,
    this.gemGeo,
    this.shadowGeo,
    this.fxSphereGeo,
    this.fxRingGeo,
    this.fxArcGeo,
    this.fxWideArcGeo,
    this.fxPillarGeo,
    this.pixelSquareGeo,
  ]);

  // Reactive scene feedback
  private portalPulseAge = Infinity;
  private crystalHitAge = Infinity;
  private shakeIntensity = 0;
  private readonly reducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // CPU-rasterized WebGL (SwiftShader, llvmpipe, headless CI) can't afford
  // MSAA, shadow maps, or a full-rate loop without starving the main thread
  private softwareRenderer = false;
  private lastRenderTime = 0;
  private readonly SOFTWARE_FRAME_MS = 50;
  private rangeRadius = -1;
  private gridHalfW = 0;
  private gridHalfH = 0;
  private readonly projectVec = new THREE.Vector3();
  private readonly crystalHitColor = new THREE.Color(0xef4444);

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private tileMeshes: { mesh: THREE.Mesh; x: number; y: number }[] = [];

  // Textures Cache
  private textureLoader = new THREE.TextureLoader();
  private textures = new Map<string, THREE.Texture>();
  private sceneryTime = 0;
  private breezeObjects: THREE.Object3D[] = [];

  // Camera Animation Targets
  private cameraTargetPos = new THREE.Vector3(0, 14, 12);
  private cameraLookTarget = new THREE.Vector3(0, 0, 0);
  private cameraBasePos = new THREE.Vector3(0, 14, 12);

  // Sizing: Seamless 1.0 unit grid (Zero gap for cohesive tactical terrain)
  private readonly TILE_SIZE = 1.0;
  private readonly TILE_GAP = 0.0;

  public init(canvas: HTMLCanvasElement, game: GameService): boolean {
    this.canvas = canvas;
    this.game = game;

    // 1. WebGL Support Verification
    // Probe on a throwaway canvas so the real one keeps the context attributes we pick below
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) {
        this.isWebGLSupported.set(false);
        return false;
      }
      this.softwareRenderer = isSoftwareRenderer(gl);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      this.isWebGLSupported.set(false);
      return false;
    }

    this.isWebGLSupported.set(true);
    // Authored models swap in for the sculpted ones as they arrive
    void this.models.load();

    // 2. Initialize Three.js Scene, Camera, Renderer
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 514;

    this.scene = new THREE.Scene();
    this.debris = new DebrisField(this.scene);
    this.scene.background = new THREE.Color(0x060913);
    this.scene.fog = new THREE.FogExp2(0x0a1022, 0.015);

    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 120);
    this.setCameraPreset('tactics', false);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.softwareRenderer,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(
      this.softwareRenderer ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.softwareRenderer;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // 3. Cinematic Atmospheric Lighting
    this.setupLighting();

    // 5. Build Environment & Battlefield
    this.buildAtmosphericEnvironment();
    this.rebuildTerrain(game);
    this.buildReticle();
    this.buildRangeOverlay();

    // 6. Setup Pointer Events
    this.setupPointerEvents(canvas, game);

    // 7. The HD-2D look loads its sprites and lens effects on demand
    this.applyLook();

    // 8. Start Render Loop
    this.startLoop(game);

    return true;
  }

  private setupLighting(): void {
    if (!this.scene) return;

    // Soft celestial ambient skylight
    const ambientLight = new THREE.HemisphereLight(0xc7e6ff, 0x394b47, 2.0);
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight;

    // Warm golden sunlight casting diagonal shadows
    const sunLight = new THREE.DirectionalLight(0xffe4b5, 3.2);
    this.sunLight = sunLight;
    sunLight.position.set(-9, 19, 11);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 45;
    sunLight.shadow.camera.left = -14;
    sunLight.shadow.camera.right = 14;
    sunLight.shadow.camera.top = 14;
    sunLight.shadow.camera.bottom = -14;
    this.scene.add(sunLight);

    // Cool celestial fill light
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    fillLight.position.set(10, 8, -8);
    this.scene.add(fillLight);
    this.fillLight = fillLight;

    // Twilight violet rim light highlighting character contours
    const rimLight = new THREE.DirectionalLight(0xa855f7, 0.75);
    rimLight.position.set(0, -6, -10);
    this.scene.add(rimLight);
    this.rimLight = rimLight;
  }

  /**
   * HD-2D lights the diorama like a stage: a warm, strong key and a cool, dim ambient for
   * contrast. Miniatures keep the even twilight their cel shading was tuned under.
   */
  private applyLookLighting(): void {
    const hd2d = this.look() === 'hd2d';
    this.ambientLight?.color.setHex(hd2d ? 0x9fb4e0 : 0xc7e6ff);
    this.ambientLight?.groundColor.setHex(hd2d ? 0x3a2d48 : 0x394b47);
    if (this.ambientLight) this.ambientLight.intensity = hd2d ? 1.35 : 2.0;
    this.sunLight?.color.setHex(hd2d ? 0xffcf94 : 0xffe4b5);
    // From the side in HD-2D, so shadows fall where the camera can see them
    if (hd2d) this.sunLight?.position.copy(HD2D_SUN);
    else this.sunLight?.position.set(-9, 19, 11);
    const sun = this.sunLight?.position;
    this.sunYaw = sun ? Math.atan2(sun.x, sun.z) : 0;
    if (this.sunLight) this.sunLight.intensity = hd2d ? 4.2 : 3.2;
    this.fillLight?.color.setHex(hd2d ? 0x5b7fd6 : 0x38bdf8);
    if (this.fillLight) this.fillLight.intensity = hd2d ? 0.55 : 0.9;
    if (this.rimLight) this.rimLight.intensity = hd2d ? 1.0 : 0.75;
  }

  public setCameraPreset(preset: CameraPreset, animate = true): void {
    this.activeCameraMode.set(preset);
    if (!this.camera) return;

    this.fitCameraToBoard();

    if (!animate) {
      this.cameraBasePos.copy(this.cameraTargetPos);
      this.camera.position.copy(this.cameraTargetPos);
      this.camera.lookAt(this.cameraLookTarget);
    }
  }

  /**
   * Converts a screen-space step (right = +x, down = +y) into a grid step. When the board
   * is rotated for portrait, grid +x runs down the screen and grid +y runs to the left.
   */
  public screenDeltaToGrid(dx: number, dy: number): [number, number] {
    return this.portraitBoard() ? [dy, -dx] : [dx, dy];
  }

  /**
   * Places the camera so the whole board fits the canvas. On portrait canvases the view
   * orbits 90° so the board's long axis runs down the screen instead of being squeezed.
   */
  private fitCameraToBoard(): void {
    if (!this.camera) return;
    const aspect = this.camera.aspect || 1;
    // Keyed to the screen, not the canvas, so opening the build drawer never flips the board
    const portrait =
      typeof window !== 'undefined' ? window.innerHeight > window.innerWidth * 1.1 : aspect < 1;
    this.portraitBoard.set(portrait);

    const preset = this.activeCameraMode();
    // HD-2D's overhead view stops short of straight down, so the sprites (drawn from the side)
    // still face it rather than lying flat
    const overheadTilt = this.look() === 'hd2d' ? 6 : 0.05;
    const dir =
      preset === 'isometric'
        ? this.tmpVec.set(-9.5, 15, 10.5)
        : preset === 'topdown'
          ? this.tmpVec.set(0, 18.5, overheadTilt)
          : this.tmpVec.set(0, 14.5, 12.5);
    if (portrait) dir.set(dir.z, dir.y, -dir.x);
    dir.normalize();

    const halfW = (this.gridHalfW || 6.5) + 0.9;
    const halfH = (this.gridHalfH || 4) + 0.9;
    let across = portrait ? halfH : halfW;
    let deep = portrait ? halfW : halfH;
    if (preset === 'isometric') {
      across = deep = (halfW + halfH) / Math.SQRT2;
    }

    const elevation = Math.asin(dir.y);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanH = tanV * aspect;
    const fitH = across / tanH;
    const fitV = (deep * Math.sin(elevation) + 0.8 * Math.cos(elevation)) / tanV;
    const distance = Math.max(fitH, fitV) * 1.04 + deep * Math.cos(elevation) * 0.35;

    this.cameraTargetPos.copy(dir).multiplyScalar(Math.max(distance, 10));
    this.cameraLookTarget.set(0, 0, 0);
    this.updatePropVisibility();
  }

  /**
   * Builds distant floating islands, starry dust particles, and celestial sky elements.
   */
  private buildAtmosphericEnvironment(): void {
    if (!this.scene) return;

    if (this.environmentGroup) {
      for (const prop of this.skyProps) prop.sprite.dispose();
      this.disposeObject(this.environmentGroup);
    }
    this.skyProps = [];
    this.cloudRings = null;

    this.environmentGroup = new THREE.Group();

    if (this.look() === 'hd2d') {
      this.buildPixelSky();
    } else {
      this.buildMiniatureSky();
    }

    // 2. Aether Motes (Magical shimmering fireflies floating across the arena)
    const moteCount = 280;
    const moteGeo = new THREE.BufferGeometry();
    this.aetherPositions = new Float32Array(moteCount * 3);
    this.aetherVelocities = new Float32Array(moteCount * 3);

    for (let i = 0; i < moteCount; i++) {
      const idx = i * 3;
      this.aetherPositions[idx] = (Math.random() - 0.5) * 22;
      this.aetherPositions[idx + 1] = Math.random() * 8 - 1;
      this.aetherPositions[idx + 2] = (Math.random() - 0.5) * 18;

      this.aetherVelocities[idx] = (Math.random() - 0.5) * 0.2;
      this.aetherVelocities[idx + 1] = 0.15 + Math.random() * 0.25;
      this.aetherVelocities[idx + 2] = (Math.random() - 0.5) * 0.2;
    }

    moteGeo.setAttribute('position', new THREE.BufferAttribute(this.aetherPositions, 3));

    const moteMat = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.14,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.aetherMotes = new THREE.Points(moteGeo, moteMat);
    this.environmentGroup.add(this.aetherMotes);

    this.scene.add(this.environmentGroup);
  }

  /**
   * HD-2D backdrop, all painted: a dithered twilight sky, distant floating islands with
   * waterfalls, cloud banks drifting beneath the board and crystal shards hovering around it.
   * Backdrop pixels grow with distance so they look the same size as the board's.
   */
  private buildPixelSky(): void {
    if (!this.scene || !this.environmentGroup) return;
    if (!this.skyTexture) {
      this.skyTexture = spriteTexture(paintSky());
      this.skyTexture.magFilter = THREE.NearestFilter;
      this.skyTexture.minFilter = THREE.NearestFilter;
    }
    this.scene.background = this.skyTexture;
    this.fitSky();
    this.scene.fog = new THREE.FogExp2(0x2d4b79, 0.012);

    const eye = this.cameraTargetPos;
    const reference = eye.length();
    const place = (sprite: ScenerySprite, at: THREE.Vector3, phase: number, drift = 0) => {
      sprite.root.position.copy(at);
      this.environmentGroup?.add(sprite.root);
      this.skyProps.push({ sprite, base: at.clone(), phase, drift });
    };
    const pixelAt = (at: THREE.Vector3) => (PROP_PIXEL * at.distanceTo(eye)) / reference;

    const islands = [
      new THREE.Vector3(-12, -1.5, -14),
      new THREE.Vector3(12.5, -0.5, -15),
      new THREE.Vector3(-17, -4.5, 3),
      new THREE.Vector3(17, -5, 2),
    ];
    islands.forEach((at, i) => {
      const sprite = this.propCache.sprite(`sky-island-${i}`, () => paintSkyIsland(i + 1), {
        pixelSize: pixelAt(at),
        phase: i * 0.3,
      });
      place(sprite, at, i * 1.7);
    });

    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + 0.4;
      const at = new THREE.Vector3(
        Math.cos(angle) * (11 + (i % 3) * 3),
        -3.2 - (i % 4) * 0.9,
        Math.sin(angle) * (8 + (i % 2) * 3),
      );
      const sprite = this.propCache.sprite(`cloud-${i % 3}`, () => paintCloud(i % 3), {
        pixelSize: pixelAt(at),
      });
      place(sprite, at, i, 0.12 + (i % 3) * 0.05);
    }

    const halfW = (this.gridHalfW || 6.5) + PIXEL_RIM + 1.5;
    const halfH = (this.gridHalfH || 4) + PIXEL_RIM + 1.5;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.3;
      const at = new THREE.Vector3(
        Math.cos(angle) * halfW,
        -0.6 + (i % 3) * 0.45,
        Math.sin(angle) * halfH,
      );
      const sprite = this.propCache.sprite(
        'sky-shard',
        () =>
          paintGem({
            sides: 4,
            radius: 3.5,
            top: 8,
            bottom: 6,
            palette: CRYSTAL_PALETTES.cyan,
            frames: 4,
            duration: 1.2,
          }),
        { phase: i * 0.37 },
      );
      place(sprite, at, i * 1.1);
    }
  }

  /** Stretches the painted sky over the canvas without distorting its pixels. */
  private fitSky(): void {
    const sky = this.skyTexture;
    const image = sky?.image as { width: number; height: number } | undefined;
    if (!sky || !image || !this.camera) return;
    const ratio = this.camera.aspect / (image.width / image.height);
    if (ratio >= 1) {
      sky.repeat.set(1, 1 / ratio);
      sky.offset.set(0, (1 - 1 / ratio) / 2);
    } else {
      sky.repeat.set(ratio, 1);
      sky.offset.set((1 - ratio) / 2, 0);
    }
  }

  /** The miniatures' backdrop: a smooth twilight sky and distant 3D islands with ruins. */
  private buildMiniatureSky(): void {
    if (!this.scene || !this.environmentGroup) return;
    // A procedural sky stays available offline and needs no large panorama download.
    const cachedSky = this.textures.get('sky');
    if (cachedSky) {
      this.scene.background = cachedSky;
      this.scene.fog = new THREE.FogExp2(0x24475e, 0.012);
    }
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 1024;
    skyCanvas.height = 1024;
    const sky = cachedSky ? null : skyCanvas.getContext('2d');
    if (sky) {
      const gradient = sky.createLinearGradient(0, 0, 0, 1024);
      gradient.addColorStop(0, '#09182d');
      gradient.addColorStop(0.5, '#24475e');
      gradient.addColorStop(1, '#667d89');
      sky.fillStyle = gradient;
      sky.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 18; i++) {
        const x = ((i * 347) % 1200) - 100;
        const y = 300 + ((i * 193) % 750);
        const glow = sky.createRadialGradient(x, y, 0, x, y, 280);
        glow.addColorStop(0, 'rgba(130, 179, 187, 0.09)');
        glow.addColorStop(1, 'rgba(130, 179, 187, 0)');
        sky.fillStyle = glow;
        sky.fillRect(0, 0, 1024, 1024);
      }
      for (let i = 0; i < 130; i++) {
        sky.fillStyle = `rgba(214,237,255,${0.15 + (i % 5) * 0.1})`;
        sky.fillRect((i * 337) % 1024, (i * 157) % 620, i % 7 === 0 ? 2 : 1, 1);
      }
      const skyTexture = new THREE.CanvasTexture(skyCanvas);
      skyTexture.colorSpace = THREE.SRGBColorSpace;
      this.textures.set('sky', skyTexture);
      this.scene.background = skyTexture;
      this.scene.fog = new THREE.FogExp2(0x24475e, 0.012);
    }

    // 1. Distant Floating Mini-Islands in the Sky (Adds immense cinematic depth)
    const islandConfigs = [
      { x: -10, y: -3, z: -12, scale: 1.6, color: 0x334656 },
      { x: 9, y: -2, z: -11, scale: 1.4, color: 0x334656 },
      { x: -13, y: -4, z: 5, scale: 1.2, color: 0x263d4b },
      { x: 12, y: -5, z: 6, scale: 1.3, color: 0x263d4b },
    ];

    for (const cfg of islandConfigs) {
      const miniIsland = new THREE.Group();
      miniIsland.position.set(cfg.x, cfg.y, cfg.z);

      // Top plateau
      const topGeo = new THREE.CylinderGeometry(cfg.scale * 1.2, cfg.scale * 1.6, 0.8, 7);
      const topMat = new THREE.MeshStandardMaterial({
        color: 0x15803d,
        roughness: 0.8,
        metalness: 0.1,
      });
      const topMesh = new THREE.Mesh(topGeo, topMat);
      miniIsland.add(topMesh);

      // Inverted rock keel
      const keelGeo = new THREE.ConeGeometry(cfg.scale * 1.5, cfg.scale * 2.5, 6);
      const keelMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.9,
        metalness: 0.2,
      });
      const keelMesh = new THREE.Mesh(keelGeo, keelMat);
      keelMesh.rotation.x = Math.PI;
      keelMesh.position.y = -cfg.scale * 1.25;
      miniIsland.add(keelMesh);

      // Glowing aether crystal shard on distant island
      const crystalGeo = new THREE.OctahedronGeometry(cfg.scale * 0.4, 0);
      const crystalMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.y = 0.8;
      miniIsland.add(crystal);

      // Broken watchtowers and aqueduct arches give the distant islands a history.
      const ruinMat = new THREE.MeshStandardMaterial({ color: 0x81939b, roughness: 0.95 });
      for (let i = 0; i < 3; i++) {
        const column = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.23, 1.4 + i * 0.3, 7),
          ruinMat,
        );
        column.position.set((i - 1) * 0.75, 0.9 + i * 0.15, -0.45);
        miniIsland.add(column);
      }
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.13, 6, 16, Math.PI), ruinMat);
      arch.position.set(0, 1.55, -0.45);
      miniIsland.add(arch);
      const waterfall = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, cfg.scale * 3),
        new THREE.MeshBasicMaterial({
          color: 0x8edee4,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      waterfall.position.set(cfg.scale, -cfg.scale * 1.3, 0.4);
      miniIsland.add(waterfall);

      this.environmentGroup.add(miniIsland);
    }

    // Broad, translucent mist banks beneath the island, instead of solid torus bands.
    this.cloudRings = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0x91b6c5,
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
    });

    for (let i = 0; i < 6; i++) {
      const ringGeo = new THREE.SphereGeometry(1, 16, 8);
      const ring = new THREE.Mesh(ringGeo, cloudMat);
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.1;
      ring.position.y = -2.2 - i * 0.3;
      ring.position.x = (i - 2.5) * 4;
      ring.position.z = -8 + (i % 3) * 7;
      ring.scale.set(7, 0.3, 3);
      this.cloudRings.add(ring);
    }
    this.environmentGroup.add(this.cloudRings);
  }

  private terrainTexture(url: string): THREE.Texture {
    const cached = this.textures.get(url);
    if (cached) return cached;
    const texture = this.textureLoader.load(url);
    texture.anisotropy = Math.min(8, this.renderer?.capabilities.getMaxAnisotropy() ?? 1);
    this.textures.set(url, texture);
    return texture;
  }

  /** Instancing keeps hundreds of meadow details to three draw calls, independent of map size. */
  private buildGardenDetails(tiles: TileCode[][], halfW: number, halfH: number): void {
    if (!this.terrainGroup) return;
    const grass: THREE.Matrix4[] = [];
    const flowers: THREE.Matrix4[] = [];
    const stones: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    const random = (seed: number) => {
      const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < tiles[r].length; c++) {
        if (tiles[r][c] !== 'B') continue;
        // Dress the edges; the center of every build square remains clear for deployment.
        for (let i = 0; i < 10; i++) {
          const seed = r * 431 + c * 37 + i;
          const angle = random(seed) * Math.PI * 2;
          const radius = 0.35 + random(seed + 1000) * 0.1;
          dummy.position.set(
            c - halfW + Math.cos(angle) * radius,
            0.29,
            r - halfH + Math.sin(angle) * radius,
          );
          dummy.rotation.set(0, angle, (random(seed + 300) - 0.5) * 0.4);
          dummy.scale.set(0.7, 0.6 + random(seed + 200) * 1.1, 0.7);
          dummy.updateMatrix();
          grass.push(dummy.matrix.clone());
          if (i < 2) {
            dummy.position.y += 0.085;
            dummy.scale.setScalar(0.5 + random(seed + 50) * 0.5);
            dummy.updateMatrix();
            flowers.push(dummy.matrix.clone());
          }
          if (i === 3) {
            dummy.position.y = 0.27;
            dummy.scale.set(1, 0.45, 0.7);
            dummy.updateMatrix();
            stones.push(dummy.matrix.clone());
          }
        }
      }
    }
    const batches = [
      {
        matrices: grass,
        geometry: new THREE.ConeGeometry(0.035, 0.17, 3).translate(0, 0.065, 0),
        color: 0x73a97c,
      },
      { matrices: flowers, geometry: new THREE.IcosahedronGeometry(0.04), color: 0xe7cc8d },
      { matrices: stones, geometry: new THREE.DodecahedronGeometry(0.065), color: 0x96a59e },
    ];
    for (const batch of batches) {
      const mesh = new THREE.InstancedMesh(
        batch.geometry,
        new THREE.MeshStandardMaterial({ color: batch.color, roughness: 0.9 }),
        batch.matrices.length,
      );
      batch.matrices.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, new THREE.Color(batch.color).multiplyScalar(0.75 + random(i) * 0.5));
      });
      mesh.receiveShadow = true;
      this.terrainGroup.add(mesh);
    }

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x80929b, roughness: 0.85 });
    const brass = new THREE.MeshStandardMaterial({
      color: 0xc7a76d,
      metalness: 0.65,
      roughness: 0.35,
    });
    for (const side of [-1, 1]) {
      for (const x of [-halfW + 1, halfW - 1]) {
        const z = side * (halfH + 0.55);
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.31, 0.2, 6), stoneMat);
        pedestal.position.set(x, 0.22, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.3, 6), brass);
        pole.position.set(x, 0.95, z);
        const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), brass);
        finial.position.set(x, 1.66, z);
        const flag = new THREE.Group();
        flag.position.set(x, 1.5, z);
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(0.35, 0.58, 3, 5),
          new THREE.MeshStandardMaterial({
            color: side < 0 ? 0x216d82 : 0x71578f,
            side: THREE.DoubleSide,
            roughness: 0.9,
          }),
        );
        cloth.position.set(0.18, -0.27, 0);
        const positions = cloth.geometry.attributes['position'];
        for (let i = 0; i < positions.count; i++)
          positions.setZ(i, Math.sin(positions.getY(i) * 12) * 0.035);
        cloth.geometry.computeVertexNormals();
        flag.add(cloth);
        const sigil = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), brass);
        sigil.scale.z = 0.2;
        sigil.position.set(0.18, -0.22, 0.045);
        flag.add(sigil);
        this.breezeObjects.push(flag);
        this.terrainGroup.add(pedestal, pole, finial, flag);
      }
    }
  }

  public rebuildTerrain(game: GameService): void {
    if (!this.scene) return;

    if (this.terrainGroup) {
      for (const prop of this.boardProps) prop.dispose();
      this.disposeObject(this.terrainGroup);
    }

    this.breezeObjects = [];
    this.boardProps = [];
    this.tallProps = [];
    this.terrainGroup = new THREE.Group();
    this.tileMeshes = [];
    // The altar and portal are rebuilt for the current look below
    this.crystalAltarMesh = this.crystalCore = this.crystalShell = this.crystalRing = null;
    this.crystalLight = null;
    this.crystalBeaconBeam = null;
    this.crystalSatellites = [];
    this.spawnVortexMesh = this.spawnDisc = this.spawnCore = null;
    this.pixelAltar = null;
    this.pixelOrb = null;

    const map = game.activeMap();
    const halfW = (map.width - 1) / 2;
    const halfH = (map.height - 1) / 2;
    this.gridHalfW = halfW;
    this.gridHalfH = halfH;

    // HD-2D paints the board as one pixel-art picture; the last map's painting is let go
    for (const texture of this.pixelTextures) texture.dispose();
    this.pixelTextures = [];
    const pixel = this.look() === 'hd2d' ? this.pixelTerrainMaterials(map.tiles) : null;

    // 1. The island beneath the board: sculpted strata, or in HD-2D a wild rim on a painted cliff
    if (pixel) this.buildPixelIsland(map.width, map.height, pixel.top, pixel.side);
    else this.buildSculptedIslandBase(map.width, map.height);

    // 2. High-Resolution Seamless Terrain Textures
    const cobblestoneTex = this.terrainTexture('assets/tile-cobblestone.png');
    cobblestoneTex.wrapS = THREE.RepeatWrapping;
    cobblestoneTex.wrapT = THREE.RepeatWrapping;
    cobblestoneTex.colorSpace = THREE.SRGBColorSpace;

    const grassTex = this.terrainTexture('assets/tile-grass.png');
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.colorSpace = THREE.SRGBColorSpace;

    const mazeTex = this.terrainTexture('assets/tile-runic-barricade.png');
    mazeTex.wrapS = THREE.RepeatWrapping;
    mazeTex.wrapT = THREE.RepeatWrapping;
    mazeTex.colorSpace = THREE.SRGBColorSpace;

    const volcanicTex = this.terrainTexture('assets/tile-volcanic.png');
    volcanicTex.wrapS = THREE.RepeatWrapping;
    volcanicTex.wrapT = THREE.RepeatWrapping;
    volcanicTex.colorSpace = THREE.SRGBColorSpace;

    // Earthy dark chiseled granite material for cliff drops and tile sidewalls
    const cliffSideMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.92,
      metalness: 0.1,
    });

    // Top face materials
    const pathMat = new THREE.MeshStandardMaterial({
      map: cobblestoneTex,
      bumpMap: cobblestoneTex,
      bumpScale: 0.045,
      color: 0xb2bcb8,
      roughness: 0.8,
      metalness: 0.1,
    });

    const buildMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      color: 0x719b85,
      bumpMap: grassTex,
      bumpScale: 0.025,
      roughness: 0.72,
      metalness: 0.05,
    });

    const mazeMat = new THREE.MeshStandardMaterial({
      map: mazeTex,
      roughness: 0.45,
      metalness: 0.3,
      emissive: 0x0891b2,
      emissiveIntensity: 0.5,
    });

    const obstacleMat = new THREE.MeshStandardMaterial({
      map: volcanicTex,
      roughness: 0.9,
      metalness: 0.2,
      emissive: 0x9a3412,
      emissiveIntensity: 0.35,
    });

    // Curbs and Borders Material
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.75,
      metalness: 0.2,
    });

    // 3. Construct Seamless Grid Tiles
    for (let r = 0; r < map.height; r++) {
      for (let c = 0; c < map.width; c++) {
        const tile = map.tiles[r][c];
        const wx = (c - halfW) * this.TILE_SIZE;
        const wz = (r - halfH) * this.TILE_SIZE;

        // Elevated vantage meadows, a sunken cobblestone road, slabs and basalt between
        const { height: tileHeight, y: yOffset } = TILE_SHAPES[tile];
        let topMat = buildMat;
        if (tile === 'P' || tile === 'C') topMat = pathMat;
        else if (tile === 'M' || tile === 'S') topMat = mazeMat;
        else if (tile === 'O') topMat = obstacleMat;

        const boxGeo = new THREE.BoxGeometry(this.TILE_SIZE, tileHeight, this.TILE_SIZE);

        // Adjust top face UVs so terrain flows continuously across the plateau
        const uvAttr = boxGeo.attributes['uv'] as THREE.BufferAttribute;
        if (tile === 'B') {
          const u0 = c / 3.5;
          const u1 = (c + 1) / 3.5;
          const v0 = r / 3.5;
          const v1 = (r + 1) / 3.5;
          uvAttr.setXY(8, u0, v1);
          uvAttr.setXY(9, u1, v1);
          uvAttr.setXY(10, u0, v0);
          uvAttr.setXY(11, u1, v0);
          uvAttr.needsUpdate = true;
        } else if (tile === 'P') {
          const u0 = c / 2.0;
          const u1 = (c + 1) / 2.0;
          const v0 = r / 2.0;
          const v1 = (r + 1) / 2.0;
          uvAttr.setXY(8, u0, v1);
          uvAttr.setXY(9, u1, v1);
          uvAttr.setXY(10, u0, v0);
          uvAttr.setXY(11, u1, v0);
          uvAttr.needsUpdate = true;
        }

        if (pixel) {
          const [pc, pr] = [c + PIXEL_RIM, r + PIXEL_RIM];
          this.pixelBoxUVs(boxGeo, pc, pr, pc, pr, tile, map.width, map.height);
        }

        // Multi-material: top face gets topMat, all sides get dark bedrock cliffSideMat
        const side = pixel?.side ?? cliffSideMat;
        const materials = [side, side, pixel?.top ?? topMat, side, side, side];

        const mesh = new THREE.Mesh(boxGeo, materials);
        mesh.position.set(wx, yOffset, wz);
        mesh.receiveShadow = true;
        mesh.castShadow = tile === 'O' || tile === 'B';

        this.terrainGroup.add(mesh);
        this.tileMeshes.push({ mesh, x: c, y: r });

        // Add 3D Road Curbs between sunken Path and elevated Grass (painted in HD-2D)
        if (tile === 'P' && !pixel) {
          this.buildRoadCurbs(c, r, wx, wz, map, curbMat);
        }

        // Props on Obstacle tiles, the Sanctuary altar at 'C' and the spawn portal at 'S'
        if (tile === 'O') {
          if (pixel) this.addPixelObstacleProp(wx, wz, c * 31 + r * 17, map.id);
          else this.createObstacleProp(wx, wz, c * 31 + r * 17);
        }
        if (tile === 'C') {
          if (pixel) this.buildPixelAltar(wx, wz);
          else this.buildSanctuaryAltar(wx, wz);
        }
        if (tile === 'S') {
          if (pixel) this.buildPixelGate(wx, wz);
          else this.buildSpawnVortex(wx, wz);
        }
      }
    }

    // 4. Delicate Tactical Grid Line Overlay for tactical precision (painted in HD-2D)
    if (!pixel) this.buildTacticalGridOverlay(map.width, map.height);

    // 5. Scenery around the board: trees, monoliths and crystals on the rim
    if (pixel) this.buildRimProps(map.width, map.height, map.id);
    else this.buildPerimeterScenery(map.width, map.height);
    if (!pixel) this.buildGardenDetails(map.tiles, halfW, halfH);

    this.scene.add(this.terrainGroup);
    this.fitCameraToBoard();
  }

  /** Tops a box with a span of cells of the board painting and walls it with a kind's band. */
  private pixelBoxUVs(
    geometry: THREE.BoxGeometry,
    c0: number,
    r0: number,
    c1: number,
    r1: number,
    ground: Ground,
    mapW: number,
    mapH: number,
  ): void {
    const uv = geometry.attributes['uv'] as THREE.BufferAttribute;
    const position = geometry.attributes['position'] as THREE.BufferAttribute;
    const T = TERRAIN_TEXELS;
    const cols = mapW + PIXEL_RIM * 2;
    const rows = mapH + PIXEL_RIM * 2;
    // Half a texel in from the cell edge so magnified pixels never pick up a neighbour
    const u0 = (c0 * T + 0.5) / (cols * T);
    const u1 = ((c1 + 1) * T - 0.5) / (cols * T);
    const v0 = (r0 * T + 0.5) / (rows * T);
    const v1 = ((r1 + 1) * T - 0.5) / (rows * T);
    // Top face: north-west, north-east, south-west, south-east
    uv.setXY(8, u0, v0);
    uv.setXY(9, u1, v0);
    uv.setXY(10, u0, v1);
    uv.setXY(11, u1, v1);
    // Walls: the band's top row at the rim, as many rows down as the wall is tall
    const top = sideBand(ground) * SIDE_ROWS + 0.01;
    const bottom = top + TILE_SHAPES[ground].height * T;
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23]) {
      const along = i < 8 ? position.getZ(i) : position.getX(i);
      uv.setXY(i, along + 0.5, (position.getY(i) > 0 ? top : bottom) / SIDE_ATLAS_ROWS);
    }
    uv.needsUpdate = true;
  }

  /**
   * The HD-2D island: a step-down rim of wild meadow framing the board (four long blocks sharing
   * the board painting), standing on a painted cliff that tapers to a keel.
   */
  private buildPixelIsland(
    mapW: number,
    mapH: number,
    top: THREE.Material,
    walls: THREE.Material,
  ): void {
    if (!this.terrainGroup) return;
    const cols = mapW + PIXEL_RIM * 2;
    const rows = mapH + PIXEL_RIM * 2;
    const { height, y } = TILE_SHAPES.R;
    const strips = [
      { c0: 0, r0: 0, c1: cols - 1, r1: PIXEL_RIM - 1 },
      { c0: 0, r0: rows - PIXEL_RIM, c1: cols - 1, r1: rows - 1 },
      { c0: 0, r0: PIXEL_RIM, c1: PIXEL_RIM - 1, r1: rows - PIXEL_RIM - 1 },
      { c0: cols - PIXEL_RIM, r0: PIXEL_RIM, c1: cols - 1, r1: rows - PIXEL_RIM - 1 },
    ];
    for (const { c0, r0, c1, r1 } of strips) {
      const w = c1 - c0 + 1;
      const d = r1 - r0 + 1;
      const geometry = new THREE.BoxGeometry(w, height, d);
      this.pixelBoxUVs(geometry, c0, r0, c1, r1, 'R', mapW, mapH);
      const mesh = new THREE.Mesh(geometry, [walls, walls, top, walls, walls, walls]);
      mesh.position.set(c0 + w / 2 - cols / 2, y, r0 + d / 2 - rows / 2);
      mesh.receiveShadow = true;
      this.terrainGroup.add(mesh);
    }

    const { color, glow } = paintCliff();
    const cliffMap = rasterTexture(color);
    const veins = rasterTexture(glow);
    this.pixelTextures.push(cliffMap, veins);
    const cliff = new THREE.Mesh(
      islandCliffGeometry(cols / 2 - 0.01, rows / 2 - 0.01, y - height / 2 + 0.02),
      sharpenPixels(
        new THREE.MeshStandardMaterial({
          map: cliffMap,
          emissiveMap: veins,
          emissive: 0xffffff,
          emissiveIntensity: 1.2,
          roughness: 0.95,
          metalness: 0,
        }),
      ),
    );
    cliff.receiveShadow = true;
    this.terrainGroup.add(cliff);
  }

  /** Adds a painted prop standing on the board at (x, y, z). */
  private addBoardProp(sprite: ScenerySprite, x: number, y: number, z: number): ScenerySprite {
    sprite.root.position.set(x, y, z);
    this.terrainGroup?.add(sprite.root);
    this.boardProps.push(sprite);
    return sprite;
  }

  /** Trees, standing stones, crystals, bushes and rocks over the rim, in the map's flavour. */
  private buildRimProps(mapW: number, mapH: number, mapId: string): void {
    const theme = SCENERY_THEMES[mapId] ?? SCENERY_THEMES['verdant-crossroads'];
    const ground = TILE_SHAPES.R.y + TILE_SHAPES.R.height / 2;
    const [halfW, halfD] = [mapW / 2, mapH / 2];
    layoutRimProps(mapW, mapH, PIXEL_RIM, theme, mapW * 31 + mapH).forEach((prop, i) => {
      // Trees on the sunny side would throw long shadows over the board; only the rest cast
      const shadow =
        prop.tall && !blocksBoard(prop.x, prop.z, HD2D_SUN.x, HD2D_SUN.z, halfW, halfD);
      const sprite = this.propCache.sprite(
        `${prop.kind}-${prop.variant}-${theme.hue}`,
        () => paintProp(prop.kind, prop.variant, theme.hue),
        { shadow, phase: i * 0.61 },
      );
      // A touch darker and cooler than the pieces, so the scenery sits back
      sprite.tint.setRGB(0.82, 0.86, 0.94);
      this.addBoardProp(sprite, prop.x, ground, prop.z);
      if (prop.tall) this.tallProps.push({ sprite, x: prop.x, z: prop.z });
    });
  }

  /**
   * Crystals or a boulder on some basalt tiles; nothing tall, so the paths behind stay in view,
   * and some left bare so the painted lava shows.
   */
  private addPixelObstacleProp(x: number, z: number, seed: number, mapId: string): void {
    const theme = SCENERY_THEMES[mapId] ?? SCENERY_THEMES['verdant-crossroads'];
    const kind = (['crystals', 'rock', null, 'rock'] as const)[seed % 4];
    if (!kind) return;
    const variant = (seed % 5) % 3;
    const sprite = this.propCache.sprite(
      `${kind}-${variant}-${theme.hue}`,
      () => paintProp(kind, variant, theme.hue),
      { shadow: kind !== 'rock', phase: seed * 0.13 },
    );
    const { y, height } = TILE_SHAPES.O;
    this.addBoardProp(sprite, x, y + height / 2, z);
  }

  /**
   * The HD-2D sanctuary: a painted dais with a pulsing rune ring, the crystal turning above it
   * through painted frames, shards circling it, and the same light and beam as the miniature.
   */
  private buildPixelAltar(x: number, z: number): void {
    if (!this.terrainGroup) return;
    const { y, height } = TILE_SHAPES.C;
    const top = y + height / 2;
    this.addBoardProp(this.propCache.sprite('dais', paintDais), x, top, z + 0.32);
    const crystal = this.propCache.sprite(
      'altar-crystal',
      () =>
        paintGem({
          sides: 6,
          radius: 7.5,
          top: 16,
          bottom: 10,
          palette: CRYSTAL_PALETTES.altar,
          frames: ALTAR_FRAMES,
          duration: 1.2,
        }),
      { shadow: true },
    );
    crystal.playing = false;
    this.addBoardProp(crystal, x, top + 0.42, z);
    const satellites = [0, 1, 2, 3].map((i) => {
      const shard = this.propCache.sprite(
        'altar-shard',
        () =>
          paintGem({
            sides: 4,
            radius: 2.5,
            top: 5,
            bottom: 4,
            palette: CRYSTAL_PALETTES.cyan,
            frames: 4,
            duration: 0.8,
          }),
        { phase: i * 0.2 },
      );
      return this.addBoardProp(shard, x, top + 0.6, z);
    });
    this.pixelAltar = { crystal, satellites, spin: 0 };
    this.crystalAltarMesh = new THREE.Group();
    this.crystalAltarMesh.position.set(x, top, z);
    this.crystalBeaconBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.28, 10, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.crystalBeaconBeam.position.y = 5;
    this.crystalLight = new THREE.PointLight(0x38bdf8, 2.6, 7);
    this.crystalLight.position.y = 0.7;
    this.crystalAltarMesh.add(this.crystalBeaconBeam, this.crystalLight);
    this.terrainGroup.add(this.crystalAltarMesh);
  }

  /** The HD-2D spawn rift: a painted obsidian gate around a swirling void orb. */
  private buildPixelGate(x: number, z: number): void {
    const { y, height } = TILE_SHAPES.S;
    const top = y + height / 2;
    this.addBoardProp(this.propCache.sprite('gate', paintGate, { shadow: true }), x, top, z);
    this.pixelOrb = this.addBoardProp(
      this.propCache.sprite('void-orb', paintVoidOrb),
      x,
      top + 0.3,
      z,
    );
  }

  /** Hides tall rim props that would stand between the camera and the board. */
  private updatePropVisibility(): void {
    const eye = this.cameraTargetPos;
    const halfW = this.gridHalfW + 0.5;
    const halfD = this.gridHalfH + 0.5;
    for (const prop of this.tallProps) {
      prop.sprite.root.visible = !blocksBoard(prop.x, prop.z, eye.x, eye.z, halfW, halfD);
    }
  }

  /** Materials for the HD-2D board: one painting for every top face, a wall atlas for sides. */
  private pixelTerrainMaterials(tiles: TileCode[][]): {
    top: THREE.Material;
    side: THREE.Material;
  } {
    const { color, glow } = paintBoard(tiles, PIXEL_RIM);
    const board = rasterTexture(color);
    const runes = rasterTexture(glow);
    const walls = rasterTexture(paintSides());
    board.anisotropy = Math.min(8, this.renderer?.capabilities.getMaxAnisotropy() ?? 1);
    this.pixelTextures.push(board, runes, walls);
    return {
      // Runes and lava light up through the emissive painting and catch the bloom
      top: sharpenPixels(
        new THREE.MeshStandardMaterial({
          map: board,
          emissiveMap: runes,
          emissive: 0xffffff,
          emissiveIntensity: 1.6,
          roughness: 0.92,
          metalness: 0,
        }),
      ),
      side: sharpenPixels(
        new THREE.MeshStandardMaterial({ map: walls, roughness: 0.95, metalness: 0 }),
      ),
    };
  }

  /**
   * Creates a multi-tiered sculpted floating sky island foundation tapering downwards with craggy rock keels.
   */
  private buildSculptedIslandBase(mapW: number, mapH: number): void {
    if (!this.terrainGroup) return;

    const baseGroup = new THREE.Group();

    // 1. Upper Beveled Trim Deck Frame
    const frameGeo = new THREE.BoxGeometry(
      mapW * this.TILE_SIZE + 0.6,
      0.3,
      mapH * this.TILE_SIZE + 0.6,
    );
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.3,
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.set(0, -0.15, 0);
    frameMesh.receiveShadow = true;
    baseGroup.add(frameMesh);

    // 2. Inverted Stepped Rock Strata (Tapering downward like an ancient sky island)
    const strataConfigs = [
      { y: -0.65, h: 0.7, wOffset: 0.2, matColor: 0x111827 },
      { y: -1.3, h: 0.8, wOffset: -0.8, matColor: 0x0f172a },
      { y: -2.0, h: 0.8, wOffset: -2.0, matColor: 0x0a0f1d },
    ];

    for (const sc of strataConfigs) {
      const strataGeo = new THREE.BoxGeometry(
        Math.max(2, mapW * this.TILE_SIZE + sc.wOffset),
        sc.h,
        Math.max(2, mapH * this.TILE_SIZE + sc.wOffset),
      );
      const strataMat = new THREE.MeshStandardMaterial({
        color: sc.matColor,
        roughness: 0.9,
        metalness: 0.1,
      });
      const strataMesh = new THREE.Mesh(strataGeo, strataMat);
      strataMesh.position.set(0, sc.y, 0);
      strataMesh.receiveShadow = true;
      baseGroup.add(strataMesh);
    }

    // 3. Deep Inverted Rock Keel Stalactites
    const keelCount = 5;
    for (let i = 0; i < keelCount; i++) {
      const kx = Math.sin(i * 1.5) * mapW * 0.25 * this.TILE_SIZE;
      const kz = Math.cos(i * 1.5) * mapH * 0.25 * this.TILE_SIZE;
      const keelGeo = new THREE.ConeGeometry(0.8 + i * 0.15, 2.2 + (i % 3) * 0.6, 5);
      const keelMat = new THREE.MeshStandardMaterial({
        color: 0x080d1a,
        roughness: 0.95,
        metalness: 0.1,
      });
      const keelMesh = new THREE.Mesh(keelGeo, keelMat);
      keelMesh.rotation.x = Math.PI;
      keelMesh.position.set(kx, -3.0, kz);
      baseGroup.add(keelMesh);
    }

    // 4. Glowing Aether Power Crystals on the island's underbelly (keeping the island aloft)
    const underCrystalColors = [0x38bdf8, 0xa855f7, 0x06b6d4];
    for (let i = 0; i < 4; i++) {
      const cx = (i % 2 === 0 ? 1 : -1) * (mapW * 0.28);
      const cz = (i < 2 ? 1 : -1) * (mapH * 0.28);
      const cGeo = new THREE.OctahedronGeometry(0.5, 0);
      cGeo.scale(0.8, 1.6, 0.8);
      const cMat = new THREE.MeshStandardMaterial({
        color: underCrystalColors[i % underCrystalColors.length],
        emissive: underCrystalColors[i % underCrystalColors.length],
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.85,
      });
      const crystal = new THREE.Mesh(cGeo, cMat);
      crystal.position.set(cx, -2.1, cz);
      baseGroup.add(crystal);
    }

    this.terrainGroup.add(baseGroup);
  }

  /**
   * Spawns road curbs along edges where a sunken path tile borders an elevated grass platform.
   */
  private buildRoadCurbs(
    c: number,
    r: number,
    wx: number,
    wz: number,
    map: { width: number; height: number; tiles: string[][] },
    curbMat: THREE.Material,
  ): void {
    if (!this.terrainGroup) return;

    const neighbors = [
      { dx: 0, dy: -1, edge: 'top' },
      { dx: 0, dy: 1, edge: 'bottom' },
      { dx: -1, dy: 0, edge: 'left' },
      { dx: 1, dy: 0, edge: 'right' },
    ];

    for (const n of neighbors) {
      const nx = c + n.dx;
      const ny = r + n.dy;
      if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
        const neighborTile = map.tiles[ny][nx];
        if (neighborTile === 'B') {
          // Elevated neighbor: add stone curb step
          let curbGeo: THREE.BoxGeometry;
          let cx = wx;
          let cz = wz;

          if (n.edge === 'top' || n.edge === 'bottom') {
            curbGeo = new THREE.BoxGeometry(this.TILE_SIZE, 0.08, 0.08);
            cz = wz + (n.edge === 'top' ? -0.46 : 0.46);
          } else {
            curbGeo = new THREE.BoxGeometry(0.08, 0.08, this.TILE_SIZE);
            cx = wx + (n.edge === 'left' ? -0.46 : 0.46);
          }

          const curb = new THREE.Mesh(curbGeo, curbMat);
          curb.position.set(cx, 0.02, cz);
          this.terrainGroup.add(curb);
        }
      }
    }
  }

  /**
   * Spawns 3D props (Pine Trees, Ancient Runic Monoliths, or Aether Crystals) on Obstacle tiles.
   */
  private createObstacleProp(x: number, z: number, seed: number): void {
    if (!this.terrainGroup) return;

    const propGroup = new THREE.Group();
    propGroup.position.set(x, 0.28, z);

    const propType = seed % 3;

    if (propType === 0) {
      // 1. Stylized Fantasy Pine Tree
      const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.45, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.22;
      propGroup.add(trunk);

      const coneTiers = [
        { radius: 0.42, height: 0.45, y: 0.52, color: 0x064e3b },
        { radius: 0.32, height: 0.38, y: 0.78, color: 0x047857 },
        { radius: 0.22, height: 0.32, y: 1.0, color: 0x059669 },
      ];

      for (const tier of coneTiers) {
        const coneGeo = new THREE.ConeGeometry(tier.radius, tier.height, 6);
        const coneMat = new THREE.MeshStandardMaterial({
          color: tier.color,
          roughness: 0.8,
          metalness: 0.1,
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.y = tier.y;
        cone.castShadow = true;
        propGroup.add(cone);
      }
      // Layered boughs break up the cones and add a broad, organic silhouette.
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.4 + seed;
        const bough = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.21, 0),
          new THREE.MeshStandardMaterial({ color: i % 2 ? 0x397b65 : 0x25604e, roughness: 0.95 }),
        );
        bough.position.set(Math.cos(angle) * 0.24, 0.53 + (i % 3) * 0.16, Math.sin(angle) * 0.24);
        bough.scale.set(1.2, 0.7, 1);
        bough.castShadow = true;
        propGroup.add(bough);
      }
    } else if (propType === 1) {
      // 2. Ancient Carved Runic Monolith
      const pillarGeo = new THREE.BoxGeometry(0.36, 0.95, 0.36);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.8,
        metalness: 0.2,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.y = 0.48;
      pillar.castShadow = true;
      propGroup.add(pillar);

      // Glowing rune ring around the pillar
      const runeRingGeo = new THREE.BoxGeometry(0.38, 0.12, 0.38);
      const runeRingMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.9,
      });
      const runeRing = new THREE.Mesh(runeRingGeo, runeRingMat);
      runeRing.position.y = 0.52;
      propGroup.add(runeRing);
      for (const y of [0.07, 0.93]) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), pillarMat);
        cap.position.y = y;
        propGroup.add(cap);
      }
      for (let i = 0; i < 3; i++) {
        const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), runeRingMat);
        rune.position.set(0, 0.25 + i * 0.2, 0.19);
        rune.scale.z = 0.25;
        propGroup.add(rune);
      }
    } else {
      // 3. Cluster of Radiant Aether Quartz Crystals
      const crystalColors = [0x38bdf8, 0x818cf8, 0x06b6d4];
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3;
        const dist = 0.14;
        const cGeo = new THREE.ConeGeometry(0.12 + (i % 2) * 0.04, 0.65 + i * 0.12, 6);
        const cMat = new THREE.MeshStandardMaterial({
          color: crystalColors[i],
          emissive: crystalColors[i],
          emissiveIntensity: 0.7,
          transparent: true,
          opacity: 0.88,
          roughness: 0.2,
        });
        const crystal = new THREE.Mesh(cGeo, cMat);
        crystal.position.set(Math.cos(angle) * dist, 0.32, Math.sin(angle) * dist);
        crystal.rotation.z = (Math.random() - 0.5) * 0.25;
        crystal.rotation.x = (Math.random() - 0.5) * 0.25;
        crystal.castShadow = true;
        propGroup.add(crystal);
      }
    }

    this.terrainGroup.add(propGroup);
  }

  /**
   * Spawns scenic perimeter landscape features (Trees, monoliths, hovering crystals)
   * around the outer rim of the floating sky island.
   */
  private buildPerimeterScenery(mapW: number, mapH: number): void {
    if (!this.terrainGroup) return;

    const halfW = (mapW - 1) / 2;
    const halfH = (mapH - 1) / 2;

    // Corner decorative groves
    const corners = [
      { x: -halfW - 0.7, z: -halfH - 0.7, seed: 0 },
      { x: halfW + 0.7, z: -halfH - 0.7, seed: 1 },
      { x: -halfW - 0.7, z: halfH + 0.7, seed: 2 },
      { x: halfW + 0.7, z: halfH + 0.7, seed: 0 },
    ];

    for (const c of corners) {
      this.createObstacleProp(c.x, c.z, c.seed);
    }

    // Outer cliff rim lookouts along north and south
    const rimProps = [
      { x: -3.5, z: -halfH - 0.65, seed: 1 },
      { x: 3.5, z: -halfH - 0.65, seed: 0 },
      { x: -2.5, z: halfH + 0.65, seed: 2 },
      { x: 2.5, z: halfH + 0.65, seed: 1 },
    ];

    for (const p of rimProps) {
      this.createObstacleProp(p.x, p.z, p.seed);
    }

    // Outer Floating Satellite Crystals slowly hovering in the abyss
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const dist = Math.max(mapW, mapH) * 0.75;
      const fx = Math.cos(angle) * dist;
      const fz = Math.sin(angle) * dist * 0.7;
      const shardGeo = new THREE.OctahedronGeometry(0.35 + (i % 2) * 0.15, 0);
      shardGeo.scale(0.7, 1.8, 0.7);
      const shardMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.85,
        roughness: 0.1,
      });
      const shard = new THREE.Mesh(shardGeo, shardMat);
      shard.position.set(fx, -0.4 + (i % 3) * 0.3, fz);
      this.terrainGroup.add(shard);
    }
  }

  /**
   * Delicate tactical grid line overlay giving crisp FFT coordinate perception.
   */
  private buildTacticalGridOverlay(mapW: number, mapH: number): void {
    if (!this.terrainGroup) return;

    const halfW = (mapW - 1) / 2;
    const halfH = (mapH - 1) / 2;
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.14,
    });

    const points: THREE.Vector3[] = [];

    // Horizontal grid lines
    for (let r = 0; r <= mapH; r++) {
      const z = (r - 0.5 - halfH) * this.TILE_SIZE;
      points.push(new THREE.Vector3(-halfW * this.TILE_SIZE - 0.5, 0.11, z));
      points.push(new THREE.Vector3(halfW * this.TILE_SIZE + 0.5, 0.11, z));
    }

    // Vertical grid lines
    for (let c = 0; c <= mapW; c++) {
      const x = (c - 0.5 - halfW) * this.TILE_SIZE;
      points.push(new THREE.Vector3(x, 0.11, -halfH * this.TILE_SIZE - 0.5));
      points.push(new THREE.Vector3(x, 0.11, halfH * this.TILE_SIZE + 0.5));
    }

    const gridGeo = new THREE.BufferGeometry().setFromPoints(points);
    const gridLines = new THREE.LineSegments(gridGeo, lineMat);
    this.terrainGroup.add(gridLines);
  }

  private buildSanctuaryAltar(x: number, z: number): void {
    if (!this.terrainGroup) return;

    this.crystalAltarMesh = new THREE.Group();
    this.crystalAltarMesh.position.set(x, 0.15, z);

    // 1. Tiered Circular Altar Dais Base with carved runic steps
    const daisLower = new THREE.CylinderGeometry(0.48, 0.52, 0.14, 16);
    const daisMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.7,
      metalness: 0.2,
    });
    const daisMesh1 = new THREE.Mesh(daisLower, daisMat);
    daisMesh1.position.y = 0.07;
    daisMesh1.castShadow = true;
    this.crystalAltarMesh.add(daisMesh1);

    const daisUpper = new THREE.CylinderGeometry(0.38, 0.44, 0.12, 16);
    const daisMesh2 = new THREE.Mesh(daisUpper, daisMat);
    daisMesh2.position.y = 0.2;
    daisMesh2.castShadow = true;
    this.crystalAltarMesh.add(daisMesh2);

    // 2. Inner Glowing Core Prismatic Crystal
    const coreGeo = new THREE.OctahedronGeometry(0.34, 0);
    coreGeo.scale(0.85, 1.45, 0.85);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.95,
      roughness: 0.1,
      metalness: 0.4,
    });
    this.crystalCore = new THREE.Mesh(coreGeo, coreMat);
    this.crystalCore.position.set(0, 0.72, 0);
    this.crystalCore.castShadow = true;
    this.crystalAltarMesh.add(this.crystalCore);

    // 3. Outer Faceted Crystal Shell
    const shellGeo = new THREE.OctahedronGeometry(0.4, 0);
    shellGeo.scale(0.95, 1.55, 0.95);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xa5f3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.55,
      roughness: 0.05,
    });
    this.crystalShell = new THREE.Mesh(shellGeo, shellMat);
    this.crystalShell.position.set(0, 0.72, 0);
    this.crystalAltarMesh.add(this.crystalShell);

    // 4. Orbiting Arcane Torus Ring
    const ringGeo = new THREE.TorusGeometry(0.48, 0.022, 8, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.8,
    });
    this.crystalRing = new THREE.Mesh(ringGeo, ringMat);
    this.crystalRing.rotation.x = Math.PI / 2.8;
    this.crystalRing.position.set(0, 0.72, 0);
    this.crystalAltarMesh.add(this.crystalRing);

    // 5. Orbiting Satellite Shards (4 small crystal shards)
    this.crystalSatellites = [];
    for (let i = 0; i < 4; i++) {
      const satGeo = new THREE.OctahedronGeometry(0.08, 0);
      satGeo.scale(0.6, 1.4, 0.6);
      const satMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.8,
      });
      const satMesh = new THREE.Mesh(satGeo, satMat);
      this.crystalSatellites.push(satMesh);
      this.crystalAltarMesh.add(satMesh);
    }

    // 6. Vertical Divine Celestial Light Beam
    const beamGeo = new THREE.CylinderGeometry(0.25, 0.28, 10, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.crystalBeaconBeam = new THREE.Mesh(beamGeo, beamMat);
    this.crystalBeaconBeam.position.set(0, 5.0, 0);
    this.crystalAltarMesh.add(this.crystalBeaconBeam);

    // 7. Dynamic Breathing Point Light
    this.crystalLight = new THREE.PointLight(0x38bdf8, 2.6, 7);
    this.crystalLight.position.set(0, 0.85, 0);
    this.crystalAltarMesh.add(this.crystalLight);

    this.terrainGroup.add(this.crystalAltarMesh);
  }

  private buildSpawnVortex(x: number, z: number): void {
    if (!this.terrainGroup) return;

    this.spawnVortexMesh = new THREE.Group();
    this.spawnVortexMesh.position.set(x, 0.16, z);

    // 1. Twin Obsidian Gate Monoliths flanking the rift
    const obeliskGeo = new THREE.BoxGeometry(0.2, 0.9, 0.2);
    const obeliskMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      emissive: 0x581c87,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });

    const leftObelisk = new THREE.Mesh(obeliskGeo, obeliskMat);
    leftObelisk.position.set(-0.44, 0.45, 0);
    leftObelisk.rotation.z = 0.08;
    this.spawnVortexMesh.add(leftObelisk);

    const rightObelisk = new THREE.Mesh(obeliskGeo, obeliskMat);
    rightObelisk.position.set(0.44, 0.45, 0);
    rightObelisk.rotation.z = -0.08;
    this.spawnVortexMesh.add(rightObelisk);

    // 2. Swirling Ground Accretion Disc
    const discGeo = new THREE.CircleGeometry(0.38, 24);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x7e22ce,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    this.spawnDisc = new THREE.Mesh(discGeo, discMat);
    this.spawnDisc.rotation.x = -Math.PI / 2;
    this.spawnDisc.position.y = 0.04;
    this.spawnVortexMesh.add(this.spawnDisc);

    // 3. Floating Void Energy Core
    const coreGeo = new THREE.OctahedronGeometry(0.22, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      transparent: true,
      opacity: 0.9,
    });
    this.spawnCore = new THREE.Mesh(coreGeo, coreMat);
    this.spawnCore.position.set(0, 0.45, 0);
    this.spawnVortexMesh.add(this.spawnCore);

    this.terrainGroup.add(this.spawnVortexMesh);
  }

  private buildReticle(): void {
    if (!this.scene) return;

    this.reticleMesh = new THREE.Group();

    // 4 Corner Brackets (FF Tactics Selection Cursor)
    const bracketMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const size = 0.44;
    const len = 0.16;
    const thk = 0.035;

    const corners = [
      { x: -size, z: -size, rot: 0 },
      { x: size, z: -size, rot: Math.PI / 2 },
      { x: size, z: size, rot: Math.PI },
      { x: -size, z: size, rot: -Math.PI / 2 },
    ];

    for (const c of corners) {
      const g = new THREE.Group();
      g.position.set(c.x, 0, c.z);
      g.rotation.y = c.rot;

      const h = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, thk), bracketMat);
      h.position.set(len / 2, 0, 0);
      g.add(h);

      const v = new THREE.Mesh(new THREE.BoxGeometry(thk, 0.04, len), bracketMat);
      v.position.set(0, 0, len / 2);
      g.add(v);

      this.reticleMesh.add(g);
    }

    this.scene.add(this.reticleMesh);

    // HD-2D: brackets painted at the board's texel size, and a crystal bobbing overhead
    const texture = spriteTexture(paintCursorBrackets(TERRAIN_TEXELS));
    texture.repeat.set(0.5, 1);
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(this.TILE_SIZE, this.TILE_SIZE),
      sharpenPixels(new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 })),
    );
    decal.material.toneMapped = false;
    decal.rotation.x = -Math.PI / 2;
    decal.visible = false;
    const gem = this.propCache.sprite('cursor-gem', paintCursorGem);
    gem.root.visible = false;
    this.scene.add(decal, gem.root);
    this.pixelCursor = { decal, texture, gem };
  }

  private buildRangeOverlay(): void {
    if (!this.scene) return;

    const geo = new THREE.RingGeometry(0.01, 1.0, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.rangeMesh = new THREE.Mesh(geo, mat);
    this.rangeMesh.rotation.x = -Math.PI / 2;
    this.rangeMesh.position.y = 0.22;
    this.rangeMesh.visible = false;
    this.scene.add(this.rangeMesh);
    this.supportRangeMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.98, 1, 64),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.supportRangeMesh.rotation.x = -Math.PI / 2;
    this.supportRangeMesh.visible = false;
    this.scene.add(this.supportRangeMesh);

    // HD-2D: the same circles drawn in board texels, the attack range with a dithered glow inside
    const texel = 1 / TERRAIN_TEXELS;
    this.pixelRange = new PixelRing({
      color: 0x38bdf8,
      core: 0xd6f6ff,
      pixel: texel,
      ground: true,
    });
    this.pixelSupportRange = new PixelRing({
      color: 0xfbbf24,
      core: 0xfff1b8,
      pixel: texel,
      ground: true,
    });
    for (const ring of [this.pixelRange, this.pixelSupportRange]) {
      ring.mesh.visible = false;
      this.scene.add(ring.mesh);
    }
  }

  private setupPointerEvents(canvas: HTMLCanvasElement, game: GameService): void {
    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (!this.camera || this.tileMeshes.length === 0) return;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const meshes = this.tileMeshes.map((t) => t.mesh);
      const intersects = this.raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const tileInfo = this.tileMeshes.find((t) => t.mesh === hit);
        if (tileInfo) {
          game.selectTile(tileInfo.x, tileInfo.y);
        }
      }
    });
  }

  public resize(): void {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || this.canvas.clientWidth;
    const height = parent?.clientHeight || this.canvas.clientHeight;
    if (width === 0 || height === 0) return;

    const wasPortrait = this.portraitBoard();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.post?.setSize(width, height);
    this.fitCameraToBoard();
    this.fitSky();
    // Snap instead of sweeping when the board flips orientation
    if (wasPortrait !== this.portraitBoard()) {
      this.cameraBasePos.copy(this.cameraTargetPos);
    }
  }

  private startLoop(game: GameService): void {
    let lastTime = performance.now();

    const loop = (time: number) => {
      this.animFrameId = requestAnimationFrame(loop);
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      this.update(game, dt, time * 0.001);
      if (this.softwareRenderer && time - this.lastRenderTime < this.SOFTWARE_FRAME_MS) return;
      this.lastRenderTime = time;
      this.render();
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private update(game: GameService, dt: number, elapsed: number): void {
    if (!this.scene || !this.camera) return;

    const map = game.activeMap();
    const halfW = (map.width - 1) / 2;
    const halfH = (map.height - 1) / 2;

    // Simulation-time delta: creature and attack motion freezes on pause and speeds up at 2x/4x
    const simRunning = !game.isPaused() && !game.isGameOver() && !game.isVictory();
    this.simPaused = game.isPaused();
    const simDt = simRunning ? dt * game.gameSpeed() : 0;
    if (!this.reducedMotion) this.sceneryTime += simDt;
    for (let i = 0; i < this.breezeObjects.length; i++) {
      this.breezeObjects[i].rotation.z = Math.sin(this.sceneryTime * 1.6 + i * 0.7) * 0.07;
    }

    // 1. Smooth Camera Interpolation with decaying impact shake
    this.cameraBasePos.lerp(this.cameraTargetPos, 1 - Math.exp(-dt * 6.0));
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(this.cameraLookTarget);
    if (this.shakeIntensity > 0.001) {
      const s = this.shakeIntensity;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shakeIntensity *= Math.exp(-dt * 12);
    } else {
      this.shakeIntensity = 0;
    }

    // 2. Animate Crystal Altar, Satellites & Light Pillar (flares red when monsters break through)
    this.crystalHitAge += dt;
    const hit = this.crystalHitAge < 0.6 ? 1 - this.crystalHitAge / 0.6 : 0;
    if (this.crystalCore) {
      this.crystalCore.rotation.y += dt * (0.9 + hit * 8);
      this.crystalCore.position.y = 0.72 + Math.sin(elapsed * 2.4) * 0.06;
      // Guarded: crystalHitAge starts at Infinity and 0 * sin(Infinity) is NaN
      this.crystalCore.position.x = hit > 0 ? hit * Math.sin(this.crystalHitAge * 70) * 0.05 : 0;
      const coreMat = this.crystalCore.material as THREE.MeshStandardMaterial;
      coreMat.emissive.setHex(0x0284c7).lerp(this.crystalHitColor, hit);
    }
    if (this.crystalShell) {
      this.crystalShell.rotation.y -= dt * 0.5;
      this.crystalShell.position.y = 0.72 + Math.sin(elapsed * 2.4) * 0.06;
      this.crystalShell.scale.setScalar(1 + hit * 0.18);
    }
    if (this.crystalRing) {
      this.crystalRing.rotation.z += dt * (1.3 + hit * 10);
    }
    if (this.crystalLight) {
      this.crystalLight.intensity = 2.4 + Math.sin(elapsed * 4.0) * 0.6 + hit * 4;
      this.crystalLight.color.setHex(0x38bdf8).lerp(this.crystalHitColor, hit);
    }
    if (this.crystalSatellites.length > 0) {
      for (let i = 0; i < this.crystalSatellites.length; i++) {
        const sat = this.crystalSatellites[i];
        const orbitAngle = elapsed * (1.2 + i * 0.3) + (i * Math.PI) / 2;
        const orbitDist = 0.46 + hit * 0.25;
        sat.position.set(
          Math.cos(orbitAngle) * orbitDist,
          0.72 + Math.sin(elapsed * 3.0 + i) * 0.08,
          Math.sin(orbitAngle) * orbitDist,
        );
        sat.rotation.y += dt * 2.0;
      }
    }

    if (this.pixelAltar) {
      // The painted crystal turns through its frames, faster and flushed red when struck
      const altar = this.pixelAltar;
      altar.spin += dt * (0.9 + hit * 8);
      altar.crystal.setFrame(Math.floor((altar.spin / (Math.PI / 3)) * ALTAR_FRAMES));
      const base = altar.crystal.root.position;
      const top = TILE_SHAPES.C.y + TILE_SHAPES.C.height / 2;
      base.y = top + 0.42 + Math.sin(elapsed * 2.4) * 0.05;
      altar.crystal.tint.setRGB(1 + hit * 0.5, 1 - hit * 0.55, 1 - hit * 0.55);
      const centre = this.crystalAltarMesh?.position;
      base.x = (centre?.x ?? 0) + (hit > 0 ? hit * Math.sin(this.crystalHitAge * 70) * 0.05 : 0);
      altar.satellites.forEach((shard, i) => {
        const orbit = elapsed * (1.2 + i * 0.3) + (i * Math.PI) / 2;
        const radius = 0.42 + hit * 0.25;
        shard.root.position.set(
          (centre?.x ?? 0) + Math.cos(orbit) * radius,
          top + 0.55 + Math.sin(elapsed * 3.0 + i) * 0.08,
          (centre?.z ?? 0) + Math.sin(orbit) * radius,
        );
      });
    }

    // 3. Animate Spawn Portal Vortex (pulses as each monster emerges)
    this.portalPulseAge += simDt;
    const portalPulse = this.portalPulseAge < 0.35 ? 1 - this.portalPulseAge / 0.35 : 0;
    if (this.pixelOrb) {
      this.pixelOrb.root.scale.setScalar(1 + portalPulse * 0.6);
      this.pixelOrb.root.position.y =
        TILE_SHAPES.S.y + TILE_SHAPES.S.height / 2 + 0.3 + Math.sin(elapsed * 3.5) * 0.04;
    }

    // Painted scenery: frames advance in real time and every prop turns to the camera
    const sceneryDt = this.reducedMotion ? 0 : dt;
    for (const prop of this.boardProps) {
      prop.update(sceneryDt);
      prop.faceCamera(this.camera, this.sunYaw);
    }
    for (const prop of this.skyProps) {
      prop.sprite.update(sceneryDt);
      prop.sprite.faceCamera(this.camera, this.sunYaw);
      const at = prop.sprite.root.position;
      at.copy(prop.base);
      at.y += Math.sin(elapsed * 0.5 + prop.phase) * 0.18;
      if (prop.drift) {
        // Clouds drift across and wrap around beneath the island
        const span = 36;
        at.x =
          ((((prop.base.x + elapsed * prop.drift + span / 2) % span) + span) % span) - span / 2;
      }
    }
    if (this.spawnDisc) {
      this.spawnDisc.rotation.z += dt * (2.0 + portalPulse * 6);
      this.spawnDisc.scale.setScalar(1 + portalPulse * 0.35);
    }
    if (this.spawnCore) {
      this.spawnCore.rotation.y += dt * 1.8;
      this.spawnCore.position.y = 0.45 + Math.sin(elapsed * 3.5) * 0.04;
      this.spawnCore.scale.setScalar(1 + portalPulse * 0.5);
    }

    // 4. Animate Aether Motes (Magical fireflies rising through the air)
    this.updateAetherParticles(dt);

    // 5. Animate Cloud Rings slowly orbiting beneath the sky island
    if (this.cloudRings) {
      this.cloudRings.rotation.y += dt * 0.04;
    }

    // 6. Selection Reticle Update (frame-rate independent glide)
    const sel = game.selectedTile();
    if (sel && this.reticleMesh) {
      const follow = 1 - Math.exp(-dt * 18);
      this.reticleMesh.visible = true;
      const targetX = (sel.x - halfW) * this.TILE_SIZE;
      const targetZ = (sel.y - halfH) * this.TILE_SIZE;
      this.reticleMesh.position.x += (targetX - this.reticleMesh.position.x) * follow;
      this.reticleMesh.position.z += (targetZ - this.reticleMesh.position.z) * follow;
      this.reticleMesh.position.y = 0.25 + Math.sin(elapsed * 6.0) * 0.03;
      this.reticleMesh.scale.setScalar(1 + Math.sin(elapsed * 6.0) * 0.04);
    } else if (this.reticleMesh) {
      this.reticleMesh.visible = false;
    }
    const hd2d = this.look() === 'hd2d';
    if (this.pixelCursor && this.reticleMesh) {
      // HD-2D follows the same glide, snapped to whole board texels, on the tile's own top
      const { decal, texture, gem } = this.pixelCursor;
      const show = hd2d && !!sel;
      decal.visible = gem.root.visible = show;
      if (hd2d) this.reticleMesh.visible = false;
      if (show && sel) {
        const tile = map.tiles[sel.y]?.[sel.x];
        const top = tile ? TILE_SHAPES[tile].y + TILE_SHAPES[tile].height / 2 : 0.25;
        const snap = (v: number) => Math.round(v * TERRAIN_TEXELS) / TERRAIN_TEXELS;
        const { x, z } = this.reticleMesh.position;
        decal.position.set(snap(x), top + 0.006, snap(z));
        texture.offset.x = Math.floor(elapsed * 3) % 2 ? 0.5 : 0;
        const above = game.selectedTower() ? 1.95 : 0.85;
        const bob = Math.round(Math.abs(Math.sin(elapsed * 3)) * 3) * PROP_PIXEL;
        gem.root.position.set(decal.position.x, top + above + bob, decal.position.z);
        gem.update(dt);
        gem.faceCamera(this.camera, this.sunYaw);
      }
    }

    // 7. Range Overlay Update (geometry rebuilt only when the radius changes)
    const selTower = game.selectedTower();
    if (this.supportRangeMesh) {
      const classId = selTower?.classId ?? game.selectedClassId();
      const level = TOWER_CLASSES[classId].levels[(selTower?.level ?? 1) - 1];
      const radius = level.auraRange;
      this.supportRangeMesh.visible = !!(
        sel &&
        radius &&
        (selTower || map.tiles[sel.y]?.[sel.x] === 'B')
      );
      if (sel && radius) {
        this.supportRangeMesh.scale.setScalar(radius * this.TILE_SIZE);
        this.supportRangeMesh.position.set(
          (sel.x - halfW) * this.TILE_SIZE,
          0.27,
          (sel.y - halfH) * this.TILE_SIZE,
        );
      }
    }
    if (this.rangeMesh) {
      let rangeRadius = 0;
      if (selTower && selTower.classId !== 'barricade') {
        const def = TOWER_CLASSES[selTower.classId];
        rangeRadius = def.levels[selTower.level - 1].range * this.TILE_SIZE;
      } else if (sel && map.tiles[sel.y]?.[sel.x] === 'B') {
        const curClass = TOWER_CLASSES[game.selectedClassId()];
        if (curClass.id !== 'barricade') {
          rangeRadius = curClass.levels[0].range * this.TILE_SIZE;
        }
      }

      if (rangeRadius > 0 && sel) {
        if (rangeRadius !== this.rangeRadius) {
          this.rangeRadius = rangeRadius;
          this.rangeMesh.geometry.dispose();
          this.rangeMesh.geometry = new THREE.RingGeometry(
            Math.max(0.01, rangeRadius - 0.06),
            rangeRadius,
            64,
          );
        }
        this.rangeMesh.visible = true;
        (this.rangeMesh.material as THREE.MeshBasicMaterial).opacity =
          0.26 + Math.sin(elapsed * 4) * 0.08;
        this.rangeMesh.position.set(
          (sel.x - halfW) * this.TILE_SIZE,
          0.24,
          (sel.y - halfH) * this.TILE_SIZE,
        );
      } else {
        this.rangeMesh.visible = false;
      }
    }
    // HD-2D draws the same circles in board texels, just above the meadows so they show on all
    const texel = 1 / TERRAIN_TEXELS;
    if (this.pixelRange && this.rangeMesh) {
      const show = hd2d && this.rangeMesh.visible;
      this.pixelRange.mesh.visible = show;
      if (hd2d) this.rangeMesh.visible = false;
      if (show) {
        this.pixelRange.setRadius(this.rangeRadius - texel, 2 * texel);
        this.pixelRange.setFill(0.45, 0.32 + Math.sin(elapsed * 4) * 0.1);
        const { x, z } = this.rangeMesh.position;
        this.pixelRange.mesh.position.set(x, 0.265, z);
      }
    }
    if (this.pixelSupportRange && this.supportRangeMesh) {
      const show = hd2d && this.supportRangeMesh.visible;
      this.pixelSupportRange.mesh.visible = show;
      if (hd2d) this.supportRangeMesh.visible = false;
      if (show) {
        this.pixelSupportRange.setRadius(this.supportRangeMesh.scale.x - texel, 2 * texel);
        const { x, z } = this.supportRangeMesh.position;
        this.pixelSupportRange.mesh.position.set(x, 0.27, z);
      }
    }

    // 8. Synchronize Dynamic Entities & Effects
    this.syncTowers(game, halfW, halfH, dt, simDt, elapsed);
    this.syncMobs(game, halfW, halfH, dt, simDt);
    this.syncProjectiles(game, halfW, halfH, simDt);
    this.syncEffects(game, halfW, halfH);
    this.updateEffects(dt);
    this.updateFadingVisuals(dt);
    this.debris?.update(this.simPaused ? 0 : dt);
    this.updateParticles(dt);
  }

  /**
   * Projects a grid coordinate (lifted above the terrain) into percentage offsets of the
   * canvas, so HTML overlays like floating combat text track the 3D scene.
   */
  public projectGridToStage(
    gx: number,
    gy: number,
    lift = 0.9,
  ): { left: number; top: number } | null {
    if (!this.camera) return null;
    const v = this.projectVec
      .set((gx - this.gridHalfW) * this.TILE_SIZE, lift, (gy - this.gridHalfH) * this.TILE_SIZE)
      .project(this.camera);
    return { left: (v.x + 1) * 50, top: (1 - v.y) * 50 };
  }

  private updateAetherParticles(dt: number): void {
    if (!this.aetherMotes || !this.aetherPositions || !this.aetherVelocities) return;

    const count = this.aetherPositions.length / 3;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      this.aetherPositions[idx] += this.aetherVelocities[idx] * dt;
      this.aetherPositions[idx + 1] += this.aetherVelocities[idx + 1] * dt;
      this.aetherPositions[idx + 2] += this.aetherVelocities[idx + 2] * dt;

      // Wrap around when rising past ceiling
      if (this.aetherPositions[idx + 1] > 7.5) {
        this.aetherPositions[idx + 1] = -1.0;
        this.aetherPositions[idx] = (Math.random() - 0.5) * 22;
        this.aetherPositions[idx + 2] = (Math.random() - 0.5) * 18;
      }
    }

    this.aetherMotes.geometry.attributes['position'].needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Heroes (towers)
  // ---------------------------------------------------------------------------

  private syncTowers(
    game: GameService,
    halfW: number,
    halfH: number,
    dt: number,
    simDt: number,
    elapsed: number,
  ): void {
    const towers = game.towers();
    const activeIds = new Set<string>();

    for (const t of towers) {
      activeIds.add(t.id);
      let vis = this.towerVisuals.get(t.id);

      if (!vis) {
        const group = this.createTowerMesh(t);
        vis = {
          group,
          classId: t.classId,
          level: t.level,
          lastActionTime: t.lastActionTime,
          attackAge: Infinity,
          attackDirX: 0,
          attackDirZ: 0,
          spawnAge: 0,
          levelUpAge: Infinity,
          xpRatio: -1,
          phase: Math.random() * Math.PI * 2,
          rig: null,
          modelKey: '',
        };
        this.towerVisuals.set(t.id, vis);
        this.scene?.add(group);
        const wx = (t.x - halfW) * this.TILE_SIZE;
        const wz = (t.y - halfH) * this.TILE_SIZE;
        this.spawnBurst(wx, 0.25, wz, new THREE.Color(TOWER_CLASSES[t.classId].color), 12, {
          speed: 1.6,
          lift: 1.2,
        });
      }

      const group = vis.group;
      group.position.set((t.x - halfW) * this.TILE_SIZE, 0.18, (t.y - halfH) * this.TILE_SIZE);

      // Placement: drop in with an elastic overshoot
      vis.spawnAge += dt;
      const spawnP = Math.min(1, vis.spawnAge / 0.5);
      const spawnScale = this.easeOutBack(spawnP);
      group.scale.setScalar(Math.max(0.001, spawnScale));

      if (t.classId === 'barricade') continue;

      // (Re)build the piece when it is new, its authored model changed or the look switched
      const key = this.pieceKey('heroes', t.classId);
      if (vis.modelKey !== key) {
        vis.modelKey = key;
        const rig = this.buildPiece('heroes', t.classId);
        this.mountRig(group.getObjectByName('hero-model') as THREE.Group, rig, vis.rig);
        vis.rig = rig;
      }

      // Promotion: rebuild level gems and play the level-up pose
      if (t.level !== vis.level) {
        if (t.level > vis.level) vis.levelUpAge = 0;
        vis.level = t.level;
        this.rebuildLevelGems(group, t.level);
      }
      vis.levelUpAge += dt;

      // Attack detection: the game stamps lastActionTime whenever a hero acts
      if (t.lastActionTime !== vis.lastActionTime) {
        vis.lastActionTime = t.lastActionTime;
        vis.attackAge = 0;
        const angle = t.attackAngleRad;
        vis.attackDirX = angle === undefined ? 0 : Math.cos(angle);
        vis.attackDirZ = angle === undefined ? 0 : Math.sin(angle);
        if (!this.reducedMotion) vis.rig?.attack();
      }
      vis.attackAge += simDt;

      const pose = this.attackPose(ATTACK_STYLE[t.classId], vis.attackAge);
      const sprite = vis.rig instanceof SpriteActor ? vis.rig : null;
      // Sprites and clip-less miniatures act out the shared motions, step and all, so the
      // holder only adds the clip-driven models' whole-body lunge
      const body =
        sprite || !vis.rig?.animated ? { forward: 0, lift: 0, scaleX: 0, scaleY: 0 } : pose;

      // Idle breathing, attack pose, spawn drop and level-up hop layered together
      const billboard = group.getObjectByName('hero-model') as THREE.Group | undefined;
      if (billboard && this.camera) {
        const breathe =
          this.reducedMotion || sprite ? 0 : Math.sin(this.sceneryTime * 2.4 + vis.phase);
        const levelP = vis.levelUpAge < 0.9 ? vis.levelUpAge / 0.9 : 1;
        const levelHop = levelP < 1 ? Math.sin(levelP * Math.PI) * 0.35 : 0;
        const levelSpin = levelP < 1 ? Math.sin(levelP * Math.PI * 4) * 0.25 * (1 - levelP) : 0;
        const dropIn = (1 - this.easeOutCubic(spawnP)) * 0.9;

        if (t.attackAngleRad !== undefined) billboard.rotation.y = Math.PI / 2 - t.attackAngleRad;
        billboard.rotation.z = this.reducedMotion || sprite ? 0 : levelSpin;
        if (vis.rig && !vis.rig.animated) {
          // Capes and charms keep their procedural sway; the attack comes from the motions
          animateModel(
            billboard,
            this.reducedMotion ? 0 : this.sceneryTime * 2.4 + vis.phase,
            0,
            0,
          );
          const motion = CLASS_ATTACK[t.classId];
          const swing = this.reducedMotion ? 1 : vis.attackAge / attackDuration(motion);
          poseAttack(vis.rig.root, motion, Math.min(1, swing), leadArm(t.classId));
        }
        vis.rig?.update(this.reducedMotion ? 0 : simDt);
        billboard.position.set(
          vis.attackDirX * body.forward,
          0.08 + breathe * 0.015 + body.lift + levelHop + dropIn,
          vis.attackDirZ * body.forward,
        );
        const levelPop = levelP < 1 ? Math.sin(levelP * Math.PI) * 0.18 : 0;
        if (sprite) {
          billboard.scale.setScalar(1);
          sprite.squash(1 + levelPop, 1 + levelPop);
          sprite.faceCamera(this.camera, this.sunYaw);
        } else {
          billboard.scale.set(
            1 + breathe * 0.012 + body.scaleX + levelPop,
            1 - breathe * 0.012 + body.scaleY + levelPop,
            1,
          );
        }
      }

      // Aura ring spins steadily and flares on every action
      const auraRing = group.getObjectByName('aura-ring') as THREE.Mesh | undefined;
      if (auraRing) {
        auraRing.rotation.z += dt * (1.2 + pose.flash * 10);
        const mat = auraRing.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(
          1,
          0.65 + pose.flash * 0.35 + Math.sin(elapsed * 3 + vis.phase) * 0.1,
        );
        const s = 1 + pose.flash * 0.25;
        auraRing.scale.set(s, s, 1);
      }

      // Experience ring fills around the plinth
      const needed = game.rules.xpToNextLevel(t);
      const ratio = needed === null ? 0 : Math.min(1, t.xp / needed);
      const quantized = Math.round(ratio * 64) / 64;
      if (quantized !== vis.xpRatio) {
        vis.xpRatio = quantized;
        this.updateXpRing(group, quantized);
      }

      // HD-2D swaps both plinth rings for their pixel twins; the aura swells on every action
      const hd2d = this.look() === 'hd2d';
      const pixelAura = group.getObjectByName('pixel-aura')?.userData['ring'] as
        PixelRing | undefined;
      const pixelXp = group.getObjectByName('pixel-xp')?.userData['ring'] as PixelRing | undefined;
      const xpRing = group.getObjectByName('xp-ring');
      if (auraRing) auraRing.visible = !hd2d;
      if (xpRing) xpRing.visible = !hd2d && vis.xpRatio > 0;
      if (pixelAura) {
        pixelAura.mesh.visible = hd2d;
        if (hd2d) pixelAura.setRadius(0.38 * (1 + pose.flash * 0.25), 3 / TERRAIN_TEXELS);
      }
      if (pixelXp) {
        pixelXp.mesh.visible = hd2d && vis.xpRatio > 0;
        // From the top of the plinth round clockwise, as the 3D arc fills
        pixelXp.setArc(-Math.PI / 2, Math.PI * 2 * vis.xpRatio);
      }
    }

    // Dismissed heroes sink away instead of vanishing
    for (const [id, vis] of this.towerVisuals.entries()) {
      if (!activeIds.has(id)) {
        this.towerVisuals.delete(id);
        this.fadingVisuals.push({ group: vis.group, age: 0, life: 0.35, kind: 'tower-sell' });
        this.spawnBurst(vis.group.position.x, 0.3, vis.group.position.z, 0xfbbf24, 10, {
          lift: 1.5,
        });
      }
    }
  }

  private attackPose(
    style: AttackStyle,
    age: number,
  ): { forward: number; lift: number; scaleX: number; scaleY: number; flash: number } {
    const rest = { forward: 0, lift: 0, scaleX: 0, scaleY: 0, flash: 0 };
    switch (style) {
      case 'lunge': {
        // Snap toward the target, then ease back to guard
        const d = 0.3;
        if (age >= d) return rest;
        const p = age / d;
        const f =
          p < 0.25 ? this.easeOutCubic(p / 0.25) : 1 - this.easeInOutSine((p - 0.25) / 0.75);
        return { forward: f * 0.26, lift: f * 0.04, scaleX: f * 0.14, scaleY: -f * 0.08, flash: f };
      }
      case 'recoil': {
        const d = 0.24;
        if (age >= d) return rest;
        const p = age / d;
        const f = p < 0.2 ? p / 0.2 : 1 - this.easeOutCubic((p - 0.2) / 0.8);
        return { forward: -f * 0.09, lift: 0, scaleX: f * 0.05, scaleY: -f * 0.07, flash: f * 0.7 };
      }
      case 'cast': {
        const d = 0.38;
        if (age >= d) return rest;
        const f = Math.sin((age / d) * Math.PI);
        return { forward: 0, lift: f * 0.09, scaleX: f * 0.08, scaleY: f * 0.12, flash: f };
      }
      case 'slam': {
        // Wind up, leap, crash down with a squash
        const d = 0.45;
        if (age >= d) return rest;
        const p = age / d;
        if (p < 0.55) {
          const f = Math.sin((p / 0.55) * Math.PI);
          return { forward: 0, lift: f * 0.3, scaleX: -f * 0.06, scaleY: f * 0.1, flash: 0.3 };
        }
        const f = 1 - (p - 0.55) / 0.45;
        return { forward: 0, lift: 0, scaleX: f * 0.22, scaleY: -f * 0.22, flash: f };
      }
      case 'hop': {
        const d = 0.3;
        if (age >= d) return rest;
        const f = Math.sin((age / d) * Math.PI);
        return { forward: 0, lift: f * 0.14, scaleX: 0, scaleY: f * 0.05, flash: f * 0.6 };
      }
      default:
        return rest;
    }
  }

  private rebuildLevelGems(group: THREE.Group, level: number): void {
    for (const old of group.children.filter((c) => c.name === 'level-gem')) {
      group.remove(old);
      ((old as THREE.Mesh).material as THREE.Material).dispose();
    }
    for (let i = 0; i < level; i++) {
      const star = new THREE.Mesh(
        this.gemGeo,
        new THREE.MeshBasicMaterial({ color: level >= 5 ? 0xfde68a : 0xfacc15 }),
      );
      star.name = 'level-gem';
      const starAngle = (i - (level - 1) / 2) * 0.22;
      star.position.set(Math.sin(starAngle) * 0.44, 0.07, Math.cos(starAngle) * 0.44);
      group.add(star);
    }
  }

  private updateXpRing(group: THREE.Group, ratio: number): void {
    const ring = group.getObjectByName('xp-ring') as THREE.Mesh | undefined;
    if (!ring) return;
    ring.geometry.dispose();
    ring.visible = ratio > 0;
    ring.geometry = new THREE.RingGeometry(0.27, 0.32, 40, 1, Math.PI / 2, -Math.PI * 2 * ratio);
  }

  private createTowerMesh(tower: { classId: TowerClassId; level: number }): THREE.Group {
    const group = new THREE.Group();

    if (tower.classId === 'barricade') {
      const stone = new THREE.MeshStandardMaterial({
        color: 0x435666,
        roughness: 0.7,
        metalness: 0.3,
      });
      const brass = new THREE.MeshStandardMaterial({
        color: 0xc2a678,
        roughness: 0.4,
        metalness: 0.7,
      });
      const core = new THREE.MeshStandardMaterial({
        color: 0x71dbe4,
        emissive: 0x0891b2,
        emissiveIntensity: 1.1,
      });
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.14, 0.85), stone);
      base.position.y = 0.05;
      group.add(base);
      for (const x of [-0.3, 0.3]) {
        for (const z of [-0.3, 0.3]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.65, 6), stone);
          post.position.set(x, 0.38, z);
          const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), brass);
          cap.position.set(x, 0.74, z);
          group.add(post, cap);
        }
      }
      for (const y of [0.22, 0.55]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 5, 4), brass);
        band.rotation.set(Math.PI / 2, 0, Math.PI / 4);
        band.position.y = y;
        group.add(band);
      }
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.27), core);
      crystal.scale.set(0.8, 1.4, 0.8);
      crystal.position.y = 0.4;
      group.add(crystal);
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      return group;
    }

    const classDef = TOWER_CLASSES[tower.classId];

    // Carved Plinth Base
    const plinthGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.14, 16);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.75,
      metalness: 0.2,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.castShadow = true;
    group.add(plinth);

    // Level indicator gems on plinth face
    this.rebuildLevelGems(group, tower.level);

    // Glowing Class Elemental Ring on Plinth
    const auraGeo = new THREE.RingGeometry(0.34, 0.42, 24);
    const auraMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(classDef.color),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.name = 'aura-ring';
    auraMesh.rotation.x = -Math.PI / 2;
    auraMesh.position.y = 0.08;
    group.add(auraMesh);

    // Golden experience arc that fills toward the next free promotion
    const xpRing = new THREE.Mesh(
      new THREE.RingGeometry(0.27, 0.32, 8),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    xpRing.name = 'xp-ring';
    xpRing.rotation.x = -Math.PI / 2;
    xpRing.position.y = 0.085;
    xpRing.visible = false;
    group.add(xpRing);

    // HD-2D twins of both rings, in board texels; syncTowers shows whichever the look wants
    const texel = 1 / TERRAIN_TEXELS;
    const pixelAura = new PixelRing({ color: classDef.color, pixel: texel, ground: true });
    pixelAura.setRadius(0.38, 3 * texel);
    pixelAura.mesh.name = 'pixel-aura';
    pixelAura.mesh.userData['ring'] = pixelAura;
    pixelAura.mesh.position.y = 0.075;
    const pixelXp = new PixelRing({ color: 0xfacc15, core: 0xfff3b0, pixel: texel, ground: true });
    pixelXp.setRadius(0.27, 2 * texel);
    pixelXp.mesh.name = 'pixel-xp';
    pixelXp.mesh.userData['ring'] = pixelXp;
    pixelXp.mesh.position.y = 0.08;
    pixelAura.mesh.visible = pixelXp.mesh.visible = false;
    group.add(pixelAura.mesh, pixelXp.mesh);

    // The miniature itself is mounted (and swapped when its model changes) in syncTowers
    const model = new THREE.Group();
    model.name = 'hero-model';
    group.add(model);

    return group;
  }

  /**
   * Puts a fresh miniature inside a hero or monster holder, replacing any older one. The
   * holder carries all battlefield motion, so a swap never interrupts it.
   */
  private mountRig(holder: THREE.Group, rig: PieceRig, previous: PieceRig | null, scale = 1): void {
    if (previous) {
      previous.dispose();
      holder.remove(previous.root);
      this.disposeObject(previous.root);
    } else {
      // The holder takes over the miniature's resting turn; attacks then aim it outright
      holder.rotation.y = rig.root.rotation.y;
    }
    rig.root.rotation.y = 0;
    rig.root.scale.setScalar(scale);
    holder.add(rig.root);
  }

  /** Materials whose emissive channel carries hit, slow and death tints. */
  private tintMaterials(model: THREE.Object3D): TintableMaterial[] {
    const materials = new Set<TintableMaterial>();
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshToonMaterial
        ) {
          materials.add(material);
          material.userData['baseEmissive'] = material.emissive.clone();
        }
      }
    });
    return [...materials];
  }

  // ---------------------------------------------------------------------------
  // Monsters
  // ---------------------------------------------------------------------------

  private syncMobs(
    game: GameService,
    halfW: number,
    halfH: number,
    dt: number,
    simDt: number,
  ): void {
    const mobs = game.mobs();
    const activeIds = new Set<string>();
    this.mobHeights.clear();

    for (const mob of mobs) {
      if (mob.hasEscaped) continue;
      let vis = this.mobVisuals.get(mob.id);

      if (mob.isDead) {
        // Killing blow landed this frame: hand the body to the death animation
        if (vis) this.beginMobDeath(mob.id, vis);
        continue;
      }
      activeIds.add(mob.id);

      const wx = (mob.x - halfW) * this.TILE_SIZE;
      const wz = (mob.y - halfH) * this.TILE_SIZE;

      if (!vis) {
        vis = this.createMobVisual(mob, wx, wz);
        this.mobVisuals.set(mob.id, vis);
        this.scene?.add(vis.group);
        this.portalPulseAge = 0;
      }
      const key = this.pieceKey('monsters', mob.typeId);
      if (vis.modelKey !== key) {
        vis.modelKey = key;
        const rig = this.buildPiece('monsters', mob.typeId);
        // Sprites are baked at board size; miniatures take the boss scale here
        this.mountRig(vis.sprite, rig, vis.rig, rig instanceof SpriteActor ? 1 : vis.spriteSize);
        vis.rig = rig;
        vis.materials = this.tintMaterials(vis.sprite);
      }

      const yAlt = mob.isFlying ? 0.95 : 0.2;
      vis.group.position.set(wx, yAlt, wz);
      // Shots aim at the body: low once a super boss is down on its belly
      const body = vis.colossus?.crawling ? 0.55 : vis.spriteSize * 0.45;
      this.mobHeights.set(mob.id, yAlt + body);

      vis.spawnAge += simDt;
      vis.hitAge += simDt;

      const stunned = mob.statusEffects.some((e) => e.type === 'stun' && e.remainingMs > 0);
      const slowed = mob.statusEffects.some((e) => e.type === 'slow' && e.remainingMs > 0);

      // Damage taken since last frame -> white flash + recoil
      if (mob.hp < vis.lastHp) vis.hitAge = 0;
      vis.lastHp = mob.hp;

      // Walk cycle advances with distance travelled, so slowed monsters visibly trudge
      const moved = Math.hypot(wx - vis.lastX, wz - vis.lastZ);
      if (!stunned && !vis.colossus) {
        vis.stride += moved * (mob.isFlying ? 3.2 : 7.5) + simDt * 1.5;
      }
      const moveX = wx - vis.lastX;
      const moveZ = wz - vis.lastZ;
      vis.lastX = wx;
      vis.lastZ = wz;

      if (this.camera) {
        // Lean into the direction of travel as seen on screen
        this.tmpVec.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const screenDx = moved > 1e-5 ? (moveX * this.tmpVec.x + moveZ * this.tmpVec.z) / moved : 0;
        const targetLean = -screenDx * 0.1;
        vis.lean += (targetLean - vis.lean) * Math.min(1, dt * 8);

        const sprite = vis.sprite;
        if (moved > 1e-5) vis.facing = Math.atan2(moveX, moveZ);
        const turn = Math.atan2(
          Math.sin(vis.facing - sprite.rotation.y),
          Math.cos(vis.facing - sprite.rotation.y),
        );
        sprite.rotation.y += turn * Math.min(1, simDt * 12);

        let bob: number;
        let rock: number;
        let squashY = 0;
        if (vis.colossus) {
          // Its own rig carries every sway and stomp
          bob = 0;
          rock = stunned ? Math.sin(vis.spawnAge * 18) * 0.04 : 0;
        } else if (stunned) {
          bob = 0;
          rock = Math.sin(vis.spawnAge * 18) * 0.12;
        } else if (mob.isFlying) {
          bob = Math.sin(vis.stride) * 0.09;
          rock = Math.sin(vis.stride * 0.5) * 0.05;
          squashY = Math.sin(vis.stride * 2) * 0.05; // wingbeat
        } else {
          const step = Math.abs(Math.sin(vis.stride));
          bob = step * 0.07;
          rock = Math.sin(vis.stride) * 0.09;
          squashY = (step - 0.5) * 0.06;
        }

        // Hit reaction
        // Super bosses only glint when struck, or they would glow white under constant fire
        const hitP =
          (vis.hitAge < 0.18 ? 1 - vis.hitAge / 0.18 : 0) *
          (vis.colossus ? ColossusShow.HIT_FLASH : 1);
        const flash = Math.max(hitP, vis.colossus?.flashAmount ?? 0);
        // Guarded: hitAge starts at Infinity and 0 * sin(Infinity) is NaN, which hides the sprite
        const jitter = hitP > 0 ? hitP * 0.05 * Math.sin(vis.hitAge * 90) : 0;

        // Emerge from the portal
        const spawnP = Math.min(1, vis.spawnAge / 0.4);
        const emerge = this.easeOutBack(spawnP);

        const actor = vis.rig instanceof SpriteActor ? vis.rig : null;
        sprite.rotation.z = this.reducedMotion || actor ? 0 : rock * 0.4 + vis.lean;
        if (vis.colossus) {
          vis.colossus.update(
            mob,
            vis.rig,
            sprite,
            vis.group,
            stunned ? 0 : moved,
            simDt,
            this.reducedMotion,
          );
        } else if (vis.rig.has('walk')) {
          if (!this.reducedMotion) vis.rig.stride(vis.stride);
        } else {
          animateModel(
            sprite,
            this.reducedMotion ? 0 : vis.stride,
            stunned || this.reducedMotion ? 0 : 0.55,
          );
        }
        vis.rig.update(this.reducedMotion ? 0 : simDt);
        // Pixel sprites bob by a pixel or so; their walk frames carry the rest
        sprite.position.set(jitter, (actor ? bob * 0.4 : bob) - (1 - spawnP) * 0.3, 0);
        const scaleX = Math.max(0.001, emerge * (1 + hitP * 0.12 - squashY * 0.5));
        const scaleY = Math.max(0.001, emerge * (1 - hitP * 0.1 + squashY));
        if (actor) {
          sprite.scale.setScalar(1);
          actor.squash(scaleX, scaleY);
          actor.tint(flash, slowed);
          actor.faceCamera(this.camera, this.sunYaw);
        } else {
          sprite.scale.set(scaleX, scaleY, 1);
        }

        // Tint: hit flash > stun gold > slow frost
        for (const mat of vis.materials) {
          const original = mat.userData['baseEmissive'] as THREE.Color;
          mat.emissive.copy(original);
          if (flash > 0) mat.emissive.lerp(new THREE.Color(0xffffff), flash);
          else if (slowed) mat.emissive.lerp(new THREE.Color(0x216bbb), 0.5);
        }

        const shadowSize = vis.colossus ? (vis.colossus.crawling ? 3.2 : 2.4) : 1;
        vis.shadow.scale.setScalar(Math.max(0.001, emerge * shadowSize * (1 - bob * 1.5)));

        // Health bar faces the camera; super bosses get the HUD's boss bar instead
        vis.hpGroup.quaternion.copy(this.camera.quaternion);
        vis.hpGroup.visible = spawnP >= 1 && !vis.colossus;
        if (vis.colossus)
          vis.stunStars.position.y = vis.colossus.crawling ? 1.1 : vis.spriteSize + 0.1;
        const ratio = Math.max(0, Math.min(1, mob.hp / mob.maxHp));
        vis.hpTrail = Math.max(ratio, vis.hpTrail - dt * 0.6);
        vis.hpFill.scale.set(Math.max(0.001, ratio), 1, 1);
        vis.hpFill.position.x = -(1 - ratio) * 0.27;
        vis.hpLag.scale.set(Math.max(0.001, vis.hpTrail), 1, 1);
        vis.hpLag.position.x = -(1 - vis.hpTrail) * 0.27;
        const hpMat = vis.hpFill.material as THREE.MeshBasicMaterial;
        if (ratio > 0.6) hpMat.color.setHex(0x10b981);
        else if (ratio > 0.25) hpMat.color.setHex(0xf59e0b);
        else hpMat.color.setHex(0xef4444);

        // Dizzy stars orbit stunned heads
        vis.stunStars.visible = stunned;
        if (stunned) {
          vis.stunStars.rotation.y += dt * 6;
          const hd2d = this.look() === 'hd2d';
          for (const star of vis.stunStars.children) {
            star.visible = star.userData['pixel'] ? hd2d : !hd2d;
          }
          if (hd2d && this.camera) {
            for (const twinkle of vis.stunSprites) {
              twinkle.update(dt);
              twinkle.faceCamera(this.camera, this.sunYaw);
            }
          }
        }
      }
    }

    // Monsters that vanished without dying slipped through to the crystal
    for (const [id, vis] of this.mobVisuals.entries()) {
      if (activeIds.has(id)) continue;
      if (vis.lastHp <= 0) {
        this.beginMobDeath(id, vis);
      } else {
        this.mobVisuals.delete(id);
        this.fadingVisuals.push({ group: vis.group, age: 0, life: 0.35, kind: 'mob-escape' });
        this.crystalHitAge = 0;
        this.shake(0.12);
        this.spawnBurst(vis.group.position.x, 0.6, vis.group.position.z, 0xef4444, 14, {
          speed: 2.4,
        });
      }
    }
  }

  private beginMobDeath(id: string, vis: MobVisual): void {
    this.mobVisuals.delete(id);
    vis.hpGroup.visible = false;
    vis.stunStars.visible = false;
    if (vis.colossus) {
      vis.colossus.beginDeath(vis.rig, vis.sprite, vis.group);
      this.fadingVisuals.push({
        group: vis.group,
        age: 0,
        life: SUPER_BOSS_DEATH_MS / 1000,
        kind: 'boss-death',
        mob: vis,
      });
      return;
    }
    this.fadingVisuals.push({ group: vis.group, age: 0, life: 0.45, kind: 'mob-death', mob: vis });
    const p = vis.group.position;
    this.spawnBurst(p.x, p.y + vis.spriteSize * 0.4, p.z, vis.color, 14, { speed: 2.2 });
    this.spawnBurst(p.x, p.y + vis.spriteSize * 0.4, p.z, 0xffffff, 5, { speed: 1.2, lift: 2.5 });
  }

  private createMobVisual(mob: MobInstance, wx: number, wz: number): MobVisual {
    const group = new THREE.Group();

    // Soft drop shadow grounds creeps in 3D space
    const shadow = new THREE.Mesh(
      this.shadowGeo,
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = mob.isFlying ? -0.7 : 0.03;
    group.add(shadow);

    const sprSize = mobScale(mob.typeId);

    // Boss scale sits on the miniature inside the holder, so hit/spawn squash stays relative to 1
    const sprite = new THREE.Group();
    sprite.name = 'mob-model';
    const rig = this.buildPiece('monsters', mob.typeId);
    this.mountRig(sprite, rig, null, rig instanceof SpriteActor ? 1 : sprSize);
    group.add(sprite);

    // Camera-facing health bar with a trailing "recent damage" segment
    const hpGroup = new THREE.Group();
    hpGroup.position.y = sprSize + 0.08;
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x0f172a }),
    );
    const hpLag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xfef3c7 }),
    );
    hpLag.position.z = 0.003;
    const hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x10b981 }),
    );
    hpFill.position.z = 0.006;
    hpGroup.add(hpBg, hpLag, hpFill);
    hpGroup.visible = false;
    group.add(hpGroup);

    const stunStars = new THREE.Group();
    stunStars.position.y = sprSize + 0.22;
    const starMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(this.sparkleGeo, starMat);
      const a = (i / 3) * Math.PI * 2;
      star.position.set(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
      star.scale.setScalar(1.4);
      stunStars.add(star);
    }
    // Painted twinkling stars for HD-2D, swapped in for the 3D ones while that look is on
    const stunSprites = [0, 1, 2].map((i) => {
      const twinkle = this.propCache.sprite('stun-star', () => paintSpark('#facc15', [1, 2]), {
        phase: i * 0.12,
      });
      const a = (i / 3) * Math.PI * 2;
      twinkle.root.position.set(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24);
      twinkle.root.userData['pixel'] = true;
      stunStars.add(twinkle.root);
      return twinkle;
    });
    stunStars.visible = false;
    group.add(stunStars);

    return {
      group,
      sprite,
      rig,
      modelKey: this.pieceKey('monsters', mob.typeId),
      materials: this.tintMaterials(sprite),
      shadow,
      hpGroup,
      hpFill,
      hpLag,
      hpTrail: 1,
      stunStars,
      stunSprites,
      spriteSize: sprSize,
      lastHp: mob.hp,
      hitAge: Infinity,
      spawnAge: 0,
      stride: Math.random() * Math.PI * 2,
      lastX: wx,
      lastZ: wz,
      lean: 0,
      facing: 0,
      color: new THREE.Color(mob.color),
      colossus:
        MOB_TYPES[mob.typeId].damageStages && this.debris
          ? new ColossusShow(this.colossusHost, this.debris)
          : null,
    };
  }

  /** Death, escape and dismissal animations that outlive their game entity. */
  private updateFadingVisuals(dt: number): void {
    for (let i = this.fadingVisuals.length - 1; i >= 0; i--) {
      const f = this.fadingVisuals[i];
      // A super boss's death plays out in step with the game, which holds the wave for it
      const step = f.kind === 'boss-death' && this.simPaused ? 0 : dt;
      f.age += step;
      const p = Math.min(1, f.age / f.life);

      if (f.kind === 'boss-death' && f.mob?.colossus) {
        const vis = f.mob;
        const sprite = vis.sprite;
        const { flash, sink } = vis.colossus!.updateDeath(step, vis.rig, sprite, vis.group);
        vis.rig.update(0);
        const actor = vis.rig instanceof SpriteActor ? vis.rig : null;
        sprite.position.set(0, -sink * 0.25, 0);
        if (actor && this.camera) {
          actor.squash(1, 1);
          actor.tint(flash, false);
          if (sink > 0) actor.fade(sink);
          actor.faceCamera(this.camera, this.sunYaw);
        } else {
          sprite.rotation.z = 0;
          sprite.scale.set(1, 1, 1);
          for (const mat of vis.materials) {
            const original = mat.userData['baseEmissive'] as THREE.Color;
            mat.emissive.copy(original).lerp(new THREE.Color(0xffffff), flash);
            if (sink > 0) {
              mat.transparent = true;
              mat.opacity = 1 - sink;
            }
          }
        }
        (vis.shadow.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - sink);
      } else if (f.kind === 'mob-death' && f.mob) {
        // Flash white, flatten and float up as the spirit leaves
        const sprite = f.mob.sprite;
        sprite.position.y = p * 0.35;
        const actor = f.mob.rig instanceof SpriteActor ? f.mob.rig : null;
        if (actor && this.camera) {
          actor.squash(1 + p * 0.5, Math.max(0.001, 1 - p * 0.85));
          actor.fade(p);
          actor.faceCamera(this.camera, this.sunYaw);
        } else {
          sprite.rotation.z = p * 0.6;
          sprite.scale.set(1 + p * 0.5, Math.max(0.001, 1 - p * 0.85), 1);
        }
        for (const mat of f.mob.materials) {
          mat.emissive.setRGB(1, 1, 1);
          mat.transparent = true;
          mat.opacity = 1 - p;
        }
        (f.mob.shadow.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - p);
      } else if (f.kind === 'mob-escape') {
        f.group.scale.setScalar(Math.max(0.001, 1 - this.easeInOutSine(p)));
        f.group.position.y += dt * 1.5;
      } else {
        f.group.scale.setScalar(Math.max(0.001, 1 - this.easeInOutSine(p)));
        f.group.position.y -= dt * 0.6;
      }

      if (p >= 1) {
        this.disposeObject(f.group);
        this.fadingVisuals.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Projectiles
  // ---------------------------------------------------------------------------

  private syncProjectiles(game: GameService, halfW: number, halfH: number, simDt: number): void {
    const projs = game.projectiles();
    const activeIds = new Set<string>();

    for (const p of projs) {
      activeIds.add(p.id);
      let vis = this.projectileVisuals.get(p.id);

      if (!vis) {
        vis = this.createProjectileVisual(p.visualType);
        this.projectileVisuals.set(p.id, vis);
        this.scene?.add(vis.group);
      }

      // Parabolic flight from the hero's hands to the monster's body
      const traveled = Math.hypot(p.currentX - p.startX, p.currentY - p.startY);
      const remaining = Math.hypot(p.targetX - p.currentX, p.targetY - p.currentY);
      const total = Math.max(0.0001, traveled + remaining);
      const prog = traveled / total;
      const endH = this.mobHeights.get(p.targetMobId) ?? 0.6;
      const startH = 0.95;
      const arc = Math.min(1.6, total * PROJECTILE_ARC[p.visualType]);
      const y = startH + (endH - startH) * prog + arc * 4 * prog * (1 - prog);

      const wx = (p.currentX - halfW) * this.TILE_SIZE;
      const wz = (p.currentY - halfH) * this.TILE_SIZE;
      vis.group.position.set(wx, y, wz);

      if (vis.sprite && this.camera) {
        // Painted shots turn in the screen plane to point the way they move on screen
        if (vis.pointed && vis.hasPrev) {
          const from = this.fxVec.copy(vis.prev).project(this.camera);
          const to = this.fx.set(wx, y, wz).project(this.camera);
          const dx = (to.x - from.x) * this.camera.aspect;
          const dy = to.y - from.y;
          if (dx * dx + dy * dy > 1e-10) vis.sprite.roll = Math.atan2(dy, dx);
        }
        vis.sprite.update(simDt);
        vis.sprite.faceCamera(this.camera, this.sunYaw);
      } else if (vis.hasPrev) {
        // Point along the flight path
        this.tmpVec.set(wx - vis.prev.x, y - vis.prev.y, wz - vis.prev.z);
        if (this.tmpVec.lengthSq() > 1e-8) {
          this.tmpVec.add(vis.group.position);
          vis.group.lookAt(this.tmpVec);
        }
      }
      vis.prev.set(wx, y, wz);
      vis.hasPrev = true;

      // Per-type flair (painted shots carry their own in their frames)
      vis.spin += simDt;
      if (!vis.sprite && p.visualType === 'dagger') {
        vis.body.rotation.y = vis.spin * 28;
      } else if (!vis.sprite && (p.visualType === 'fireball' || p.visualType === 'time-orb')) {
        const pulse = 1 + Math.sin(vis.spin * 30) * 0.12;
        vis.body.scale.setScalar(pulse);
      }

      // Glowing trails
      vis.trailTimer -= simDt;
      if (vis.trailColor !== null && vis.trailTimer <= 0) {
        vis.trailTimer = 0.025;
        this.spawnBurst(wx, y, wz, vis.trailColor, 1, {
          speed: 0.25,
          lift: 0.4,
          gravity: -0.5,
          life: 0.32,
          size: p.visualType === 'fireball' ? 2.4 : 1.6,
          additive: true,
        });
      }
    }

    for (const [id, vis] of this.projectileVisuals.entries()) {
      if (!activeIds.has(id)) {
        const pos = vis.group.position;
        this.spawnBurst(pos.x, pos.y, pos.z, vis.impactColor, 7, { speed: 1.8, additive: true });
        this.disposeObject(vis.group);
        this.projectileVisuals.delete(id);
      }
    }
  }

  private createProjectileVisual(type: Projectile['visualType']): ProjectileVisual {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    if (this.look() === 'hd2d') {
      // A painted shot; arrows, spears and fireballs are drawn pointing right and rolled to fly
      const [paint, pointed] = PIXEL_SHOTS[type];
      const sprite = this.propCache.sprite(`shot-${type}`, paint);
      body.add(sprite.root);
      const { trail, impact } = SHOT_COLOURS[type];
      return {
        group,
        body,
        prev: new THREE.Vector3(),
        hasPrev: false,
        spin: 0,
        trailTimer: 0,
        trailColor: trail,
        impactColor: impact,
        sprite,
        pointed,
      };
    }

    if (type === 'fireball') {
      body.add(new THREE.Mesh(this.fxSphereGeo, new THREE.MeshBasicMaterial({ color: 0xfff7ed })));
      body.children[0].scale.setScalar(0.11);
      const glow = new THREE.Mesh(this.fxSphereGeo, this.additiveMat(0xf97316, 0.55));
      glow.scale.setScalar(0.24);
      body.add(glow);
    } else if (type === 'time-orb') {
      body.add(new THREE.Mesh(this.fxSphereGeo, new THREE.MeshBasicMaterial({ color: 0xf5d0fe })));
      body.children[0].scale.setScalar(0.1);
      const glow = new THREE.Mesh(this.fxSphereGeo, this.additiveMat(0xa855f7, 0.5));
      glow.scale.setScalar(0.22);
      body.add(glow);
      const ring = new THREE.Mesh(this.fxRingGeo, this.additiveMat(0xc084fc, 0.8));
      ring.scale.setScalar(0.2);
      body.add(ring);
    } else if (type === 'arrow' || type === 'song-arrow') {
      // Built along +Z so lookAt() aims it down the flight path; Bard song arrows glow pink
      const song = type === 'song-arrow';
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.42, 5),
        new THREE.MeshBasicMaterial({ color: song ? 0xfbcfe8 : 0xfef08a }),
      );
      shaft.rotation.x = Math.PI / 2;
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.1, 6),
        new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }),
      );
      head.rotation.x = Math.PI / 2;
      head.position.z = 0.24;
      body.add(shaft, head);
    } else if (type === 'dagger') {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.12, 0),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9 }),
      );
      star.scale.set(1, 0.15, 1);
      body.add(star);
    } else {
      // Spear
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6),
        new THREE.MeshBasicMaterial({ color: 0x94a3b8 }),
      );
      shaft.rotation.x = Math.PI / 2;
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.18, 6),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
      );
      head.rotation.x = Math.PI / 2;
      head.position.z = 0.36;
      body.add(shaft, head);
    }

    return {
      group,
      body,
      prev: new THREE.Vector3(),
      hasPrev: false,
      spin: 0,
      trailTimer: 0,
      trailColor: SHOT_COLOURS[type].trail,
      impactColor: SHOT_COLOURS[type].impact,
      sprite: null,
      pointed: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Combat effects (driven by GameService.particles)
  // ---------------------------------------------------------------------------

  private syncEffects(game: GameService, halfW: number, halfH: number): void {
    const fxList = game.particles();
    const live = new Set<string>();
    for (const fx of fxList) {
      live.add(fx.id);
      if (this.seenEffectIds.has(fx.id)) continue;
      this.seenEffectIds.add(fx.id);
      this.spawnEffect(fx, (fx.x - halfW) * this.TILE_SIZE, (fx.y - halfH) * this.TILE_SIZE);
    }
    for (const id of this.seenEffectIds) {
      if (!live.has(id)) this.seenEffectIds.delete(id);
    }
  }

  private spawnEffect(fx: ParticleFx, wx: number, wz: number): void {
    if (!this.scene) return;
    if (this.look() === 'hd2d') {
      this.spawnPixelEffect(fx, wx, wz);
      return;
    }
    const color = new THREE.Color(fx.color);
    const r = fx.maxRadius;

    switch (fx.type) {
      case 'slash': {
        if (r > 1.5) {
          // Whirlwind: a full sweeping blade arc around the hero
          const mat = this.additiveMat(color, 0.9);
          const arc = new THREE.Mesh(this.fxWideArcGeo, mat);
          arc.rotation.x = -Math.PI / 2;
          arc.position.set(wx, 0.45, wz);
          this.addEffect(arc, [mat], 0.35, (p, o) => {
            o.rotation.z = -p * Math.PI * 2.2;
            o.scale.setScalar(r * (0.6 + 0.4 * this.easeOutCubic(p)));
            mat.opacity = 0.9 * (1 - p);
          });
        } else {
          // Crescent slash facing the camera at the monster
          const mat = this.additiveMat(color, 1);
          const arc = new THREE.Mesh(this.fxArcGeo, mat);
          arc.position.set(wx, 0.6, wz);
          const tilt = Math.random() * Math.PI;
          this.addEffect(arc, [mat], 0.22, (p, o) => {
            if (this.camera) o.quaternion.copy(this.camera.quaternion);
            o.rotateZ(tilt - p * 2.4);
            o.scale.setScalar(0.35 + p * 0.25);
            mat.opacity = 1 - p * p;
          });
        }
        this.spawnBurst(wx, 0.6, wz, color, 4, { speed: 1.6, additive: true });
        break;
      }

      case 'death': {
        // The body's own death animation carries the kill; this is just a soft ground flash
        this.groundRing(wx, wz, color, r * 0.6, 0.3);
        break;
      }

      case 'explosion': {
        const coreMat = this.additiveMat(color, 0.65);
        const core = new THREE.Mesh(this.fxSphereGeo, coreMat);
        core.position.set(wx, 0.5, wz);
        this.addEffect(core, [coreMat], 0.4, (p, o) => {
          o.scale.setScalar(Math.max(0.001, r * 0.5 * this.easeOutCubic(p)));
          coreMat.opacity = 0.65 * (1 - p) * (1 - p);
        });
        this.groundRing(wx, wz, color, r, 0.45);
        this.spawnBurst(wx, 0.5, wz, color, 10, { speed: 2.4, additive: true });
        this.shake(Math.min(0.08, 0.025 * r));
        break;
      }

      case 'tremor': {
        this.groundRing(wx, wz, color, r, 0.5);
        this.groundRing(wx, wz, new THREE.Color(0xfde68a), r * 0.7, 0.4, 0.08);
        this.spawnBurst(wx, 0.25, wz, 0x78716c, 12, { speed: 2.8, lift: 1.6 });
        this.shake(0.09);
        break;
      }

      case 'time-pulse': {
        const mat = this.additiveMat(color, 0.9);
        const ring = new THREE.Mesh(this.fxRingGeo, mat);
        ring.position.set(wx, 0.55, wz);
        this.addEffect(ring, [mat], 0.45, (p, o) => {
          if (this.camera) o.quaternion.copy(this.camera.quaternion);
          o.scale.setScalar(Math.max(0.001, 0.75 * (1 - this.easeOutCubic(p)) + 0.1));
          mat.opacity = 0.9 * (1 - p);
        });
        break;
      }

      case 'aura': {
        const mat = this.additiveMat(color, 0.8);
        const ring = new THREE.Mesh(this.fxRingGeo, mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(wx, 0.2, wz);
        this.addEffect(ring, [mat], 0.6, (p, o) => {
          o.position.y = 0.2 + p * 0.8;
          o.scale.setScalar(Math.max(0.001, r * 0.45 * (0.5 + p * 0.5)));
          mat.opacity = 0.8 * (1 - p);
        });
        this.spawnBurst(wx, 0.4, wz, color, 6, { speed: 0.6, lift: 1.4, gravity: -1.5 });
        break;
      }

      case 'levelup': {
        // Pillar of golden light with rising halos and sparkles
        const pillarMat = this.additiveMat(color, 0.6);
        const pillar = new THREE.Mesh(this.fxPillarGeo, pillarMat);
        pillar.position.set(wx, 0.15, wz);
        this.addEffect(pillar, [pillarMat], 1.0, (p, o) => {
          const grow = this.easeOutCubic(Math.min(1, p * 3));
          o.scale.set(0.38 * (1 - p * 0.5), Math.max(0.001, 3 * grow), 0.38 * (1 - p * 0.5));
          pillarMat.opacity = 0.6 * (1 - p);
        });
        for (let i = 0; i < 3; i++) {
          const mat = this.additiveMat(color, 0.9);
          const halo = new THREE.Mesh(this.fxRingGeo, mat);
          halo.rotation.x = -Math.PI / 2;
          halo.position.set(wx, 0.2, wz);
          const delay = i * 0.15;
          this.addEffect(halo, [mat], 0.9, (p, o) => {
            const q = Math.max(0, Math.min(1, (p * 0.9 - delay) / (0.9 - delay)));
            o.position.y = 0.2 + q * 1.6;
            o.scale.setScalar(Math.max(0.001, 0.55 - q * 0.25));
            mat.opacity = q <= 0 ? 0 : 0.9 * (1 - q);
          });
        }
        this.spawnBurst(wx, 0.4, wz, color, 18, {
          speed: 1.1,
          lift: 2.6,
          gravity: -0.6,
          life: 0.9,
          size: 1.4,
          additive: true,
          sparkle: true,
        });
        break;
      }

      case 'stun': {
        this.spawnBurst(wx, 0.8, wz, color, 6, { speed: 1, additive: true, sparkle: true });
        break;
      }
    }
  }

  /** An explosion at any height, in either look: super bosses' blasts. */
  private blastAt(x: number, y: number, z: number, color: string, radius: number): void {
    if (this.look() === 'hd2d') {
      const pixels = Math.max(5, Math.round((radius * 0.5) / PROP_PIXEL));
      this.addSpriteEffect(
        `boom-${color}-${pixels}`,
        () => paintExplosion(color, pixels),
        x,
        y,
        z,
        0.45,
      );
    } else {
      const mat = this.additiveMat(color, 0.75);
      const core = new THREE.Mesh(this.fxSphereGeo, mat);
      core.position.set(x, y, z);
      this.addEffect(core, [mat], 0.4, (p, o) => {
        o.scale.setScalar(Math.max(0.001, radius * 0.5 * this.easeOutCubic(p)));
        mat.opacity = 0.75 * (1 - p) * (1 - p);
      });
    }
    this.spawnBurst(x, y, z, color, Math.round(6 + radius * 4), {
      speed: 1.6 + radius,
      additive: true,
    });
  }

  private groundRing(
    wx: number,
    wz: number,
    color: THREE.Color,
    radius: number,
    life: number,
    y = 0.16,
  ): void {
    const mat = this.additiveMat(color, 0.85);
    const ring = new THREE.Mesh(this.fxRingGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(wx, y, wz);
    this.addEffect(ring, [mat], life, (p, o) => {
      o.scale.setScalar(Math.max(0.001, radius * this.easeOutCubic(p)));
      mat.opacity = 0.85 * (1 - p);
    });
  }

  /**
   * HD-2D versions of the combat effects: painted slashes, explosions and light pillars, pixel
   * rings on the board's grid, and square sparks, all fading by dither.
   */
  private spawnPixelEffect(fx: ParticleFx, wx: number, wz: number): void {
    const r = fx.maxRadius;
    const texel = 1 / TERRAIN_TEXELS;
    switch (fx.type) {
      case 'slash': {
        if (r > 1.5) {
          // Whirlwind: a blade arc sweeping round the hero
          this.addRingEffect(fx.color, wx, 0.45, wz, 0.35, (p, ring) => {
            ring.setRadius(r * 0.9 * (0.6 + 0.4 * this.easeOutCubic(p)), r * 0.2);
            ring.setArc(-p * Math.PI * 2.2, Math.PI * 1.5);
            ring.density = 1 - p * p;
          });
        } else {
          const roll = Math.random() * Math.PI * 2;
          this.addSpriteEffect(
            `slash-${fx.color}`,
            () => paintSlash(fx.color),
            wx,
            0.6,
            wz,
            0.22,
            roll,
          );
        }
        this.spawnBurst(wx, 0.6, wz, fx.color, 4, { speed: 1.6, additive: true });
        break;
      }

      case 'death':
        this.pixelGroundRing(wx, wz, fx.color, r * 0.6, 0.3);
        break;

      case 'explosion': {
        const radius = Math.max(6, Math.round((r * 0.5) / PROP_PIXEL));
        this.addSpriteEffect(
          `boom-${fx.color}-${radius}`,
          () => paintExplosion(fx.color, radius),
          wx,
          0.5,
          wz,
          0.45,
        );
        this.pixelGroundRing(wx, wz, fx.color, r, 0.45);
        this.spawnBurst(wx, 0.5, wz, fx.color, 10, { speed: 2.4, additive: true });
        this.shake(Math.min(0.08, 0.025 * r));
        break;
      }

      case 'tremor':
        this.pixelGroundRing(wx, wz, fx.color, r, 0.5);
        this.pixelGroundRing(wx, wz, '#fde68a', r * 0.7, 0.4);
        this.spawnBurst(wx, 0.25, wz, 0x78716c, 12, { speed: 2.8, lift: 1.6 });
        this.shake(0.09);
        break;

      case 'time-pulse':
        this.addRingEffect(
          fx.color,
          wx,
          0.55,
          wz,
          0.45,
          (p, ring) => {
            ring.setRadius(0.75 * (1 - this.easeOutCubic(p)) + 0.1, 2 * PROP_PIXEL);
            ring.density = 1 - p;
          },
          false,
        );
        break;

      case 'aura':
        this.addRingEffect(fx.color, wx, 0.2, wz, 0.6, (p, ring) => {
          ring.mesh.position.y = 0.2 + p * 0.8;
          ring.setRadius(r * 0.45 * (0.5 + p * 0.5), 2 * texel);
          ring.density = 1 - p;
        });
        this.spawnBurst(wx, 0.4, wz, fx.color, 6, { speed: 0.6, lift: 1.4, gravity: -1.5 });
        break;

      case 'levelup': {
        this.addSpriteEffect(
          `pillar-${fx.color}`,
          () => paintLightPillar(fx.color),
          wx,
          0.15,
          wz,
          1,
        );
        for (let i = 0; i < 3; i++) {
          const delay = i * 0.15;
          this.addRingEffect(fx.color, wx, 0.2, wz, 0.9, (p, ring) => {
            const q = Math.max(0, Math.min(1, (p * 0.9 - delay) / (0.9 - delay)));
            ring.mesh.position.y = 0.2 + q * 1.6;
            ring.setRadius(0.55 - q * 0.25, 2 * texel);
            ring.density = q <= 0 ? 0 : 1 - q;
          });
        }
        this.spawnBurst(wx, 0.4, wz, fx.color, 18, {
          speed: 1.1,
          lift: 2.6,
          gravity: -0.6,
          life: 0.9,
          size: 1.4,
          additive: true,
          sparkle: true,
        });
        break;
      }

      case 'stun':
        this.spawnBurst(wx, 0.8, wz, fx.color, 6, { speed: 1, additive: true, sparkle: true });
        break;
    }
  }

  /** A painted effect played once through its frames over `life` seconds, facing the camera. */
  private addSpriteEffect(
    key: string,
    paint: () => PropArt,
    x: number,
    y: number,
    z: number,
    life: number,
    roll = 0,
  ): void {
    const { art } = this.propCache.get(key, paint);
    const sprite = this.propCache.sprite(key, paint);
    sprite.playing = false;
    sprite.roll = roll;
    sprite.root.position.set(x, y, z);
    this.addEffect(
      sprite.root,
      [],
      life,
      (p) => {
        sprite.setFrame(Math.min(art.frames - 1, Math.floor(p * art.frames)));
        if (this.camera) sprite.faceCamera(this.camera, this.sunYaw);
      },
      () => sprite.dispose(),
    );
  }

  /** A pixel ring effect lying on the board, or facing the camera when not `ground`. */
  private addRingEffect(
    colour: string,
    x: number,
    y: number,
    z: number,
    life: number,
    animate: (progress: number, ring: PixelRing) => void,
    ground = true,
  ): void {
    const ring = new PixelRing({
      color: colour,
      pixel: ground ? 1 / TERRAIN_TEXELS : PROP_PIXEL,
      ground,
    });
    ring.mesh.position.set(x, y, z);
    this.addEffect(
      ring.mesh,
      [],
      life,
      (p) => {
        if (!ground && this.camera)
          ring.mesh.quaternion.copy(billboardTurn(this.camera, this.fxTurn));
        animate(p, ring);
      },
      () => ring.dispose(),
    );
  }

  /** A ring spreading over the board and dithering away; above the meadows so it shows on all. */
  private pixelGroundRing(
    x: number,
    z: number,
    colour: string,
    radius: number,
    life: number,
  ): void {
    this.addRingEffect(colour, x, 0.265, z, life, (p, ring) => {
      ring.setRadius(Math.max(0.02, radius * this.easeOutCubic(p)), 2 / TERRAIN_TEXELS);
      ring.density = 1 - p;
    });
  }

  private addEffect(
    object: THREE.Object3D,
    materials: THREE.Material[],
    life: number,
    animate: (progress: number, object: THREE.Object3D) => void,
    dispose?: () => void,
  ): void {
    if (!this.scene) return;
    animate(0, object);
    this.scene.add(object);
    this.activeEffects.push({ object, materials, age: 0, life, animate, dispose });
  }

  private updateEffects(dt: number): void {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const e = this.activeEffects[i];
      e.age += dt;
      const p = Math.min(1, e.age / e.life);
      e.animate(p, e.object);
      if (p >= 1) {
        this.scene?.remove(e.object);
        e.materials.forEach((m) => m.dispose());
        e.dispose?.();
        this.activeEffects.splice(i, 1);
      }
    }
  }

  private additiveMat(color: THREE.ColorRepresentation, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  // ---------------------------------------------------------------------------
  // Spark particles
  // ---------------------------------------------------------------------------

  public spawnBurst(
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    count = 8,
    opts: BurstOptions = {},
  ): void {
    if (!this.scene) return;
    const budget = MAX_PARTICLES - this.activeParticles.length;
    const n = Math.min(count, budget);
    if (n <= 0) return;

    const speedBase = opts.speed ?? 2.0;
    // HD-2D sparks are flat squares (or pixel crosses) a whole number of sprite pixels across
    const pixel = this.look() === 'hd2d';
    const geo = pixel ? this.pixelSquareGeo : opts.sparkle ? this.sparkleGeo : this.burstGeo;

    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        ...(pixel && opts.sparkle ? { map: this.sparkle(), alphaTest: 0.5 } : {}),
      });
      if (pixel) mat.toneMapped = false;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = speedBase * (0.5 + Math.random() * 0.8);
      const baseScale = (opts.size ?? 1) * (0.7 + Math.random() * 0.6);
      mesh.scale.setScalar(baseScale);

      this.activeParticles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: (opts.lift ?? 2.0) * (0.6 + Math.random() * 0.8),
        vz: Math.sin(angle) * speed,
        life: 0,
        maxLife: (opts.life ?? 0.45) * (0.75 + Math.random() * 0.5),
        gravity: opts.gravity ?? 9.8,
        baseScale,
        pixels: pixel ? Math.max(1, Math.round(baseScale * 1.8)) : undefined,
        sparkle: opts.sparkle,
      });
    }
  }

  private updateParticles(dt: number): void {
    if (this.camera) billboardTurn(this.camera, this.particleTurn);
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.scene?.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.activeParticles.splice(i, 1);
        continue;
      }

      p.vy -= p.gravity * dt;
      p.vx *= 1 - Math.min(1, dt * 2.5);
      p.vz *= 1 - Math.min(1, dt * 2.5);
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const remaining = 1 - p.life / p.maxLife;
      if (p.pixels !== undefined) {
        // Faces the camera and shrinks a whole pixel at a time instead of fading
        p.mesh.quaternion.copy(this.particleTurn);
        const size = p.sparkle
          ? 3 * Math.max(1, Math.round(p.pixels * remaining * 0.7))
          : Math.max(1, Math.round(p.pixels * remaining + 0.3));
        p.mesh.scale.setScalar(size * PROP_PIXEL);
        continue;
      }
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 4;

      p.mesh.scale.setScalar(Math.max(0.001, p.baseScale * remaining));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, remaining * 1.6);
    }
  }

  /** A white pixel cross that HD-2D sparkles tint with their colour. */
  private sparkle(): THREE.DataTexture {
    if (!this.sparkleTexture) {
      const cross = new Raster(3, 3);
      for (const [x, y] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
      ]) {
        cross.set(x, y, [255, 255, 255]);
      }
      this.sparkleTexture = spriteTexture(cross);
      this.sparkleTexture.magFilter = THREE.NearestFilter;
      this.sparkleTexture.minFilter = THREE.NearestFilter;
    }
    return this.sparkleTexture;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private shake(amount: number): void {
    if (this.reducedMotion) return;
    this.shakeIntensity = Math.min(0.2, Math.max(this.shakeIntensity, amount));
  }

  private disposeObject(root: THREE.Object3D): void {
    this.scene?.remove(root);
    root.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.Points ||
        obj instanceof THREE.LineSegments
      ) {
        // Authored models share geometry across every instance of the piece
        if (!this.sharedGeometries.has(obj.geometry) && !obj.geometry.userData['shared']) {
          obj.geometry.dispose();
        }
        if (obj instanceof THREE.InstancedMesh) obj.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose()); // textures are shared and stay cached
      }
    });
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private easeInOutSine(t: number): number {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  private render(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    if (this.post && this.look() === 'hd2d') {
      this.focusOnBoard(this.post);
      this.post.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Fits the tilt-shift focus band to the board as it lands on screen, pieces standing on its
   * back row included, so play stays sharp on any canvas and only the scenery beyond blurs.
   */
  private focusOnBoard(post: Hd2dPost): void {
    if (!this.camera) return;
    const halfW = this.gridHalfW + 0.5;
    const halfD = this.gridHalfH + 0.5;
    let low = Infinity;
    let high = -Infinity;
    for (const x of [-halfW, halfW]) {
      for (const z of [-halfD, halfD]) {
        for (const y of [0.1, 1.3]) {
          const v = this.projectVec.set(x, y, z).project(this.camera);
          low = Math.min(low, (v.y + 1) / 2);
          high = Math.max(high, (v.y + 1) / 2);
        }
      }
    }
    // Capped, so tall canvases keep the miniature-diorama blur on the scenery
    post.setFocus((low + high) / 2, THREE.MathUtils.clamp((high - low) / 2, 0.22, 0.38));
  }

  // ---------------------------------------------------------------------------
  // Board look
  // ---------------------------------------------------------------------------

  public setLook(look: BoardLook): void {
    if (look === this.look()) return;
    this.look.set(look);
    this.buildAtmosphericEnvironment();
    if (this.game) this.rebuildTerrain(this.game);
    try {
      localStorage.setItem(LOOK_STORAGE_KEY, look);
    } catch {
      // Private windows may refuse storage; the look still applies for this visit
    }
    this.applyLook();
  }

  public toggleLook(): void {
    this.setLook(this.look() === 'hd2d' ? 'miniatures' : 'hd2d');
  }

  /** Loads what the HD-2D look needs: sprite sheets, and the lens effects unless CPU-rendered. */
  private applyLook(): void {
    this.applyLookLighting();
    if (this.look() !== 'hd2d') return;
    void this.sprites.load();
    if (this.softwareRenderer || this.post || this.postLoading) return;
    this.postLoading = true;
    void import('./hd2d-post').then(({ Hd2dPost }) => {
      this.postLoading = false;
      if (this.renderer && this.scene && this.camera) {
        this.post = new Hd2dPost(this.renderer, this.scene, this.camera);
      }
    });
  }

  /** Changes whenever a piece should be rebuilt: new authored model, look switch, sprites ready. */
  private pieceKey(kind: ModelKind, id: string): string {
    const sprites = this.look() === 'hd2d' && this.sprites.ready();
    return `${sprites ? 'sprite' : 'miniature'}:${this.models.revision(kind, id)}`;
  }

  private buildPiece(kind: ModelKind, id: string): PieceRig {
    if (this.look() === 'hd2d' && this.sprites.ready()) {
      const actor = this.sprites.actor(kind, id);
      if (actor) return actor;
    }
    return this.models.piece(kind, id, { outline: !this.softwareRenderer });
  }

  public destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.post?.dispose();
    this.post = null;
    for (const texture of this.pixelTextures) texture.dispose();
    this.pixelTextures = [];
    for (const prop of [...this.boardProps, ...this.skyProps.map((p) => p.sprite)]) prop.dispose();
    this.boardProps = [];
    this.tallProps = [];
    this.skyProps = [];
    this.pixelAltar = null;
    this.pixelOrb = null;
    this.propCache.dispose();
    this.skyTexture?.dispose();
    this.skyTexture = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    if (this.scene) this.disposeObject(this.scene);
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.breezeObjects = [];
    this.scene = null;
    this.camera = null;
    this.towerVisuals.clear();
    this.mobVisuals.clear();
    this.projectileVisuals.clear();
    this.fadingVisuals = [];
    this.debris = null;
    this.activeEffects = [];
    this.seenEffectIds.clear();
    this.activeParticles = [];
    this.rangeRadius = -1;
  }
}

const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  return SOFTWARE_RENDERER_PATTERN.test(renderer);
}

/** The look chosen on a previous visit; storage can be unavailable in private windows. */
function storedLook(): BoardLook {
  try {
    return localStorage.getItem(LOOK_STORAGE_KEY) === 'hd2d' ? 'hd2d' : 'miniatures';
  } catch {
    return 'miniatures';
  }
}
