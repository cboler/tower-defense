import { Injectable, signal } from '@angular/core';
import * as THREE from 'three';
import { GameService } from '../../core/services/game.service';
import { TOWER_CLASSES, TowerClassId } from '../../core/models/tower.model';
import { MobInstance } from '../../core/models/mob.model';
import { ParticleFx, Projectile } from '../../core/models/game-state.model';

export type CameraPreset = 'tactics' | 'isometric' | 'topdown';

type AttackStyle = 'lunge' | 'recoil' | 'cast' | 'slam' | 'hop' | 'none';

/** How each hero's billboard moves when it acts. */
const ATTACK_STYLE: Record<TowerClassId, AttackStyle> = {
  'blade-warden': 'lunge',
  samurai: 'lunge',
  paladin: 'lunge',
  ranger: 'recoil',
  ninja: 'recoil',
  elementalist: 'cast',
  chronomancer: 'cast',
  'red-mage': 'cast',
  astrologian: 'cast',
  lancer: 'slam',
  juggernaut: 'slam',
  rogue: 'hop',
  oracle: 'none',
  barricade: 'none',
};

/** Arc height per tile of flight distance. */
const PROJECTILE_ARC: Record<Projectile['visualType'], number> = {
  arrow: 0.12,
  fireball: 0.28,
  'magic-spark': 0.1,
  'time-orb': 0.12,
  spear: 0.35,
  dagger: 0.03,
};

const MAX_PARTICLES = 450;

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
}

interface MobVisual {
  group: THREE.Group;
  sprite: THREE.Mesh;
  spriteMat: THREE.MeshBasicMaterial;
  shadow: THREE.Mesh;
  hpGroup: THREE.Group;
  hpFill: THREE.Mesh;
  hpLag: THREE.Mesh;
  hpTrail: number;
  stunStars: THREE.Group;
  spriteSize: number;
  lastHp: number;
  hitAge: number;
  spawnAge: number;
  stride: number;
  lastX: number;
  lastZ: number;
  lean: number;
  color: THREE.Color;
}

interface FadingVisual {
  group: THREE.Group;
  age: number;
  life: number;
  kind: 'mob-death' | 'mob-escape' | 'tower-sell';
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
}

interface EffectVisual {
  object: THREE.Object3D;
  materials: THREE.Material[];
  age: number;
  life: number;
  animate: (progress: number, object: THREE.Object3D) => void;
}

@Injectable({ providedIn: 'root' })
export class ThreeBattlefieldService {
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
  /** Camera-facing orientation for character sprites, with the backward lean capped. */
  private readonly billboardQuat = new THREE.Quaternion();
  private readonly billboardEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  // Past this lean, sprites lie low enough to sink into the walls flanking the road
  private readonly MAX_BILLBOARD_TILT = THREE.MathUtils.degToRad(58);

  // Shared geometry (never disposed per-entity)
  private readonly burstGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  private readonly sparkleGeo = new THREE.OctahedronGeometry(0.045, 0);
  private readonly gemGeo = new THREE.SphereGeometry(0.035, 8, 8);
  private readonly shadowGeo = new THREE.CircleGeometry(0.32, 16);
  private readonly fxSphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private readonly fxRingGeo = new THREE.RingGeometry(0.82, 1, 48);
  private readonly fxArcGeo = new THREE.RingGeometry(0.62, 1, 24, 1, 0, Math.PI * 0.9);
  private readonly fxWideArcGeo = new THREE.RingGeometry(0.78, 1, 48, 1, 0, Math.PI * 1.5);
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
  ]);

  // Reactive scene feedback
  private portalPulseAge = Infinity;
  private crystalHitAge = Infinity;
  private shakeIntensity = 0;
  private readonly reducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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

  // Camera Animation Targets
  private cameraTargetPos = new THREE.Vector3(0, 14, 12);
  private cameraLookTarget = new THREE.Vector3(0, 0, 0);
  private cameraBasePos = new THREE.Vector3(0, 14, 12);

  // Sizing: Seamless 1.0 unit grid (Zero gap for cohesive tactical terrain)
  private readonly TILE_SIZE = 1.0;
  private readonly TILE_GAP = 0.0;

  public init(canvas: HTMLCanvasElement, game: GameService): boolean {
    this.canvas = canvas;

    // 1. WebGL Support Verification
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        this.isWebGLSupported.set(false);
        return false;
      }
    } catch {
      this.isWebGLSupported.set(false);
      return false;
    }

    this.isWebGLSupported.set(true);

    // 2. Initialize Three.js Scene, Camera, Renderer
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 514;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913);
    this.scene.fog = new THREE.FogExp2(0x0a1022, 0.015);

    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 120);
    this.setCameraPreset('tactics', false);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // 3. Cinematic Atmospheric Lighting
    this.setupLighting();

    // 4. Preload Character & Monster Textures
    this.preloadTextures();

    // 5. Build Environment & Battlefield
    this.buildAtmosphericEnvironment();
    this.rebuildTerrain(game);
    this.buildReticle();
    this.buildRangeOverlay();

    // 6. Setup Pointer Events
    this.setupPointerEvents(canvas, game);

    // 7. Start Render Loop
    this.startLoop(game);

    return true;
  }

  private setupLighting(): void {
    if (!this.scene) return;

    // Soft celestial ambient skylight
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 1.25);
    this.scene.add(ambientLight);

    // Warm golden sunlight casting diagonal shadows
    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.8);
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

    // Twilight violet rim light highlighting character contours
    const rimLight = new THREE.DirectionalLight(0xa855f7, 0.75);
    rimLight.position.set(0, -6, -10);
    this.scene.add(rimLight);
  }

  private preloadTextures(): void {
    const classIds: TowerClassId[] = [
      'blade-warden',
      'ranger',
      'elementalist',
      'chronomancer',
      'oracle',
      'rogue',
      'lancer',
      'juggernaut',
      'red-mage',
      'ninja',
      'samurai',
      'paladin',
      'astrologian',
    ];

    for (const id of classIds) {
      this.textures.set(id, this.loadSpriteTexture(`assets/sprites/${id}.png`));
    }

    const mobIds = [
      'skulker',
      'swiftbeak',
      'prismatic-ooze',
      'pyre-core',
      'dread-gaze',
      'bonewalker',
      'bramble-golem',
      'sky-sovereign',
    ];

    for (const id of mobIds) {
      this.textures.set(id, this.loadSpriteTexture(`assets/monsters/${id}-sprite.png`));
    }
  }

  /** Character art is authored in sRGB; tagging it keeps colors from washing out. */
  private loadSpriteTexture(url: string): THREE.Texture {
    const tex = this.textureLoader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Billboards tilt back with the camera, so filter anisotropically to keep them crisp
    tex.anisotropy = this.renderer?.capabilities.getMaxAnisotropy() ?? 1;
    return tex;
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
    const dir =
      preset === 'isometric'
        ? this.tmpVec.set(-9.5, 15, 10.5)
        : preset === 'topdown'
          ? this.tmpVec.set(0, 18.5, 0.05)
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
  }

  /**
   * Builds distant floating islands, starry dust particles, and celestial sky elements.
   */
  private buildAtmosphericEnvironment(): void {
    if (!this.scene) return;

    if (this.environmentGroup) {
      this.scene.remove(this.environmentGroup);
    }

    this.environmentGroup = new THREE.Group();

    // 1. Distant Floating Mini-Islands in the Sky (Adds immense cinematic depth)
    const islandConfigs = [
      { x: -24, y: 5, z: -18, scale: 2.2, color: 0x1e293b },
      { x: 22, y: 8, z: -16, scale: 1.8, color: 0x1e293b },
      { x: -16, y: -4, z: 20, scale: 1.4, color: 0x0f172a },
      { x: 26, y: -2, z: 18, scale: 1.6, color: 0x0f172a },
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

      this.environmentGroup.add(miniIsland);
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

    // 3. Circling Cloud Rings beneath the main island
    this.cloudRings = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });

    for (let i = 0; i < 6; i++) {
      const ringGeo = new THREE.TorusGeometry(10 + i * 1.5, 0.45, 8, 36);
      const ring = new THREE.Mesh(ringGeo, cloudMat);
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.1;
      ring.position.y = -2.2 - i * 0.3;
      this.cloudRings.add(ring);
    }
    this.environmentGroup.add(this.cloudRings);

    this.scene.add(this.environmentGroup);
  }

  public rebuildTerrain(game: GameService): void {
    if (!this.scene) return;

    if (this.terrainGroup) {
      this.scene.remove(this.terrainGroup);
      this.terrainGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }

    this.terrainGroup = new THREE.Group();
    this.tileMeshes = [];

    const map = game.activeMap();
    const halfW = (map.width - 1) / 2;
    const halfH = (map.height - 1) / 2;
    this.gridHalfW = halfW;
    this.gridHalfH = halfH;
    this.fitCameraToBoard();

    // 1. Build Sculpted Floating Sky Island Base
    this.buildSculptedIslandBase(map.width, map.height);

    // 2. High-Resolution Seamless Terrain Textures
    const cobblestoneTex = this.textureLoader.load('assets/tile-cobblestone.png');
    cobblestoneTex.wrapS = THREE.RepeatWrapping;
    cobblestoneTex.wrapT = THREE.RepeatWrapping;
    cobblestoneTex.colorSpace = THREE.SRGBColorSpace;

    const grassTex = this.textureLoader.load('assets/tile-grass.png');
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.colorSpace = THREE.SRGBColorSpace;

    const mazeTex = this.textureLoader.load('assets/tile-runic-barricade.png');
    mazeTex.wrapS = THREE.RepeatWrapping;
    mazeTex.wrapT = THREE.RepeatWrapping;
    mazeTex.colorSpace = THREE.SRGBColorSpace;

    const volcanicTex = this.textureLoader.load('assets/tile-volcanic.png');
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
      roughness: 0.8,
      metalness: 0.1,
    });

    const buildMat = new THREE.MeshStandardMaterial({
      map: grassTex,
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

        let topMat = buildMat;
        let tileHeight = 0.36;
        let yOffset = 0.07; // Elevated vantage meadows

        if (tile === 'P') {
          topMat = pathMat;
          tileHeight = 0.24;
          yOffset = -0.05; // Sunken cobblestone road
        } else if (tile === 'M') {
          topMat = mazeMat;
          tileHeight = 0.28;
          yOffset = -0.02;
        } else if (tile === 'O') {
          topMat = obstacleMat;
          tileHeight = 0.42;
          yOffset = 0.1;
        } else if (tile === 'S') {
          topMat = mazeMat;
          tileHeight = 0.26;
          yOffset = -0.04;
        } else if (tile === 'C') {
          topMat = pathMat;
          tileHeight = 0.3;
          yOffset = -0.02;
        }

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

        // Multi-material: top face gets topMat, all sides get dark bedrock cliffSideMat
        const materials = [
          cliffSideMat,
          cliffSideMat,
          topMat,
          cliffSideMat,
          cliffSideMat,
          cliffSideMat,
        ];

        const mesh = new THREE.Mesh(boxGeo, materials);
        mesh.position.set(wx, yOffset, wz);
        mesh.receiveShadow = true;
        mesh.castShadow = tile === 'O' || tile === 'B';

        this.terrainGroup.add(mesh);
        this.tileMeshes.push({ mesh, x: c, y: r });

        // Add 3D Road Curbs between sunken Path and elevated Grass
        if (tile === 'P') {
          this.buildRoadCurbs(c, r, wx, wz, map, curbMat);
        }

        // Add 3D Tactical Environmental Props on Obstacle tiles
        if (tile === 'O') {
          this.createObstacleProp(wx, wz, c * 31 + r * 17);
        }

        // Build Sanctuary Crystal Altar at 'C'
        if (tile === 'C') {
          this.buildSanctuaryAltar(wx, wz);
        }

        // Build Spawn Portal Vortex at 'S'
        if (tile === 'S') {
          this.buildSpawnVortex(wx, wz);
        }
      }
    }

    // 4. Delicate Tactical Grid Line Overlay for tactical precision
    this.buildTacticalGridOverlay(map.width, map.height);

    // 5. Scenic Perimeter Environment (Trees, Monoliths, Floating Crystals on island rim)
    this.buildPerimeterScenery(map.width, map.height);

    this.scene.add(this.terrainGroup);
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
    this.fitCameraToBoard();
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
    const simDt = simRunning ? dt * game.gameSpeed() : 0;

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
    this.billboardEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.billboardEuler.x = Math.max(this.billboardEuler.x, -this.MAX_BILLBOARD_TILT);
    this.billboardEuler.z = 0;
    this.billboardQuat.setFromEuler(this.billboardEuler);

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

    // 3. Animate Spawn Portal Vortex (pulses as each monster emerges)
    this.portalPulseAge += simDt;
    const portalPulse = this.portalPulseAge < 0.35 ? 1 - this.portalPulseAge / 0.35 : 0;
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

    // 7. Range Overlay Update (geometry rebuilt only when the radius changes)
    const selTower = game.selectedTower();
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

    // 8. Synchronize Dynamic Entities & Effects
    this.syncTowers(game, halfW, halfH, dt, simDt, elapsed);
    this.syncMobs(game, halfW, halfH, dt, simDt);
    this.syncProjectiles(game, halfW, halfH, simDt);
    this.syncEffects(game, halfW, halfH);
    this.updateEffects(dt);
    this.updateFadingVisuals(dt);
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
      }
      vis.attackAge += simDt;

      const pose = this.attackPose(ATTACK_STYLE[t.classId], vis.attackAge);

      // Idle breathing, attack pose, spawn drop and level-up hop layered together
      const billboard = group.getObjectByName('billboard') as THREE.Mesh | undefined;
      if (billboard && this.camera) {
        const breathe = Math.sin(elapsed * 2.4 + vis.phase);
        const levelP = vis.levelUpAge < 0.9 ? vis.levelUpAge / 0.9 : 1;
        const levelHop = levelP < 1 ? Math.sin(levelP * Math.PI) * 0.35 : 0;
        const levelSpin = levelP < 1 ? Math.sin(levelP * Math.PI * 4) * 0.25 * (1 - levelP) : 0;
        const dropIn = (1 - this.easeOutCubic(spawnP)) * 0.9;

        billboard.quaternion.copy(this.billboardQuat);
        if (levelSpin !== 0) billboard.rotateZ(levelSpin);
        billboard.position.set(
          vis.attackDirX * pose.forward,
          -0.06 + breathe * 0.025 + pose.lift + levelHop + dropIn,
          vis.attackDirZ * pose.forward,
        );
        const levelPop = levelP < 1 ? Math.sin(levelP * Math.PI) * 0.18 : 0;
        billboard.scale.set(
          1 + breathe * 0.012 + pose.scaleX + levelPop,
          1 - breathe * 0.012 + pose.scaleY + levelPop,
          1,
        );
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
      // 3D Glowing Runic Barricade Monolith
      const monolithGeo = new THREE.BoxGeometry(0.85, 0.75, 0.85);
      const monolithMat = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x0891b2,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.4,
      });
      const monolith = new THREE.Mesh(monolithGeo, monolithMat);
      monolith.position.set(0, 0.38, 0);
      monolith.castShadow = true;
      group.add(monolith);
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

    // High-Res Heroic Character Billboard Sprite
    const texture = this.textures.get(tower.classId);
    const spriteMat = new THREE.MeshBasicMaterial({
      map: texture || null,
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Pivot the sprite at its feet so squash & stretch reads as weight, not scaling
    const spriteGeo = new THREE.PlaneGeometry(1.05, 1.05);
    spriteGeo.translate(0, 0.525, 0);
    const spriteMesh = new THREE.Mesh(spriteGeo, spriteMat);
    spriteMesh.name = 'billboard';
    spriteMesh.position.set(0, 0.0, 0);
    group.add(spriteMesh);

    return group;
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
      const yAlt = mob.isFlying ? 0.95 : 0.2;
      vis.group.position.set(wx, yAlt, wz);
      this.mobHeights.set(mob.id, yAlt + vis.spriteSize * 0.45);

      vis.spawnAge += simDt;
      vis.hitAge += simDt;

      const stunned = mob.statusEffects.some((e) => e.type === 'stun' && e.remainingMs > 0);
      const slowed = mob.statusEffects.some((e) => e.type === 'slow' && e.remainingMs > 0);

      // Damage taken since last frame -> white flash + recoil
      if (mob.hp < vis.lastHp) vis.hitAge = 0;
      vis.lastHp = mob.hp;

      // Walk cycle advances with distance travelled, so slowed monsters visibly trudge
      const moved = Math.hypot(wx - vis.lastX, wz - vis.lastZ);
      if (!stunned) vis.stride += moved * (mob.isFlying ? 3.2 : 7.5) + simDt * 1.5;
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
        sprite.quaternion.copy(this.billboardQuat);

        let bob: number;
        let rock: number;
        let squashY = 0;
        if (stunned) {
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
        const hitP = vis.hitAge < 0.18 ? 1 - vis.hitAge / 0.18 : 0;
        // Guarded: hitAge starts at Infinity and 0 * sin(Infinity) is NaN, which hides the sprite
        const jitter = hitP > 0 ? hitP * 0.05 * Math.sin(vis.hitAge * 90) : 0;

        // Emerge from the portal
        const spawnP = Math.min(1, vis.spawnAge / 0.4);
        const emerge = this.easeOutBack(spawnP);

        sprite.rotateZ(rock + vis.lean);
        sprite.position.set(jitter, bob - (1 - spawnP) * 0.3, 0);
        sprite.scale.set(
          Math.max(0.001, emerge * (1 + hitP * 0.12 - squashY * 0.5)),
          Math.max(0.001, emerge * (1 - hitP * 0.1 + squashY)),
          1,
        );

        // Tint: hit flash > stun gold > slow frost
        const c = vis.spriteMat.color;
        if (hitP > 0) c.setRGB(1 + hitP * 2.5, 1 + hitP * 2.2, 1 + hitP * 2.2);
        else if (slowed) c.setRGB(0.62, 0.82, 1.35);
        else c.setRGB(1, 1, 1);

        vis.shadow.scale.setScalar(Math.max(0.001, emerge * (1 - bob * 1.5)));

        // Health bar faces the camera
        vis.hpGroup.quaternion.copy(this.camera.quaternion);
        vis.hpGroup.visible = spawnP >= 1;
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
        if (stunned) vis.stunStars.rotation.y += dt * 6;
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

    const isBoss = mob.typeId === 'sky-sovereign' || mob.typeId === 'bramble-golem';
    const sprSize = isBoss ? 1.35 : 0.95;

    const spriteMat = new THREE.MeshBasicMaterial({
      map: this.textures.get(mob.typeId) || null,
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // Feet-anchored pivot so bobbing and squashing stay planted on the road
    const spriteGeo = new THREE.PlaneGeometry(sprSize, sprSize);
    spriteGeo.translate(0, sprSize * 0.5, 0);
    const sprite = new THREE.Mesh(spriteGeo, spriteMat);
    sprite.name = 'mob-sprite';
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
    stunStars.visible = false;
    group.add(stunStars);

    return {
      group,
      sprite,
      spriteMat,
      shadow,
      hpGroup,
      hpFill,
      hpLag,
      hpTrail: 1,
      stunStars,
      spriteSize: sprSize,
      lastHp: mob.hp,
      hitAge: Infinity,
      spawnAge: 0,
      stride: Math.random() * Math.PI * 2,
      lastX: wx,
      lastZ: wz,
      lean: 0,
      color: new THREE.Color(mob.color),
    };
  }

  /** Death, escape and dismissal animations that outlive their game entity. */
  private updateFadingVisuals(dt: number): void {
    for (let i = this.fadingVisuals.length - 1; i >= 0; i--) {
      const f = this.fadingVisuals[i];
      f.age += dt;
      const p = Math.min(1, f.age / f.life);

      if (f.kind === 'mob-death' && f.mob) {
        // Flash white, flatten and float up as the spirit leaves
        const sprite = f.mob.sprite;
        sprite.quaternion.copy(this.billboardQuat);
        sprite.rotateZ(p * 0.6);
        sprite.position.y = p * 0.35;
        sprite.scale.set(1 + p * 0.5, Math.max(0.001, 1 - p * 0.85), 1);
        f.mob.spriteMat.color.setRGB(3, 3, 3);
        f.mob.spriteMat.opacity = 1 - p;
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

      // Point along the flight path
      if (vis.hasPrev) {
        this.tmpVec.set(wx - vis.prev.x, y - vis.prev.y, wz - vis.prev.z);
        if (this.tmpVec.lengthSq() > 1e-8) {
          this.tmpVec.add(vis.group.position);
          vis.group.lookAt(this.tmpVec);
        }
      }
      vis.prev.set(wx, y, wz);
      vis.hasPrev = true;

      // Per-type flair
      vis.spin += simDt;
      if (p.visualType === 'dagger') {
        vis.body.rotation.y = vis.spin * 28;
      } else if (p.visualType === 'fireball' || p.visualType === 'time-orb') {
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
    let trailColor: number | null = null;
    let impactColor: number;

    if (type === 'fireball') {
      body.add(new THREE.Mesh(this.fxSphereGeo, new THREE.MeshBasicMaterial({ color: 0xfff7ed })));
      body.children[0].scale.setScalar(0.11);
      const glow = new THREE.Mesh(this.fxSphereGeo, this.additiveMat(0xf97316, 0.55));
      glow.scale.setScalar(0.24);
      body.add(glow);
      trailColor = 0xf97316;
      impactColor = 0xfb923c;
    } else if (type === 'time-orb') {
      body.add(new THREE.Mesh(this.fxSphereGeo, new THREE.MeshBasicMaterial({ color: 0xf5d0fe })));
      body.children[0].scale.setScalar(0.1);
      const glow = new THREE.Mesh(this.fxSphereGeo, this.additiveMat(0xa855f7, 0.5));
      glow.scale.setScalar(0.22);
      body.add(glow);
      const ring = new THREE.Mesh(this.fxRingGeo, this.additiveMat(0xc084fc, 0.8));
      ring.scale.setScalar(0.2);
      body.add(ring);
      trailColor = 0xa855f7;
      impactColor = 0xc084fc;
    } else if (type === 'arrow') {
      // Built along +Z so lookAt() aims it down the flight path
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.42, 5),
        new THREE.MeshBasicMaterial({ color: 0xfef08a }),
      );
      shaft.rotation.x = Math.PI / 2;
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.1, 6),
        new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }),
      );
      head.rotation.x = Math.PI / 2;
      head.position.z = 0.24;
      body.add(shaft, head);
      trailColor = 0xfef9c3;
      impactColor = 0xfde68a;
    } else if (type === 'dagger') {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.12, 0),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9 }),
      );
      star.scale.set(1, 0.15, 1);
      body.add(star);
      impactColor = 0x22d3ee;
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
      trailColor = 0x7dd3fc;
      impactColor = 0x38bdf8;
    }

    return {
      group,
      body,
      prev: new THREE.Vector3(),
      hasPrev: false,
      spin: 0,
      trailTimer: 0,
      trailColor,
      impactColor,
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

  private addEffect(
    object: THREE.Object3D,
    materials: THREE.Material[],
    life: number,
    animate: (progress: number, object: THREE.Object3D) => void,
  ): void {
    if (!this.scene) return;
    animate(0, object);
    this.scene.add(object);
    this.activeEffects.push({ object, materials, age: 0, life, animate });
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
    const geo = opts.sparkle ? this.sparkleGeo : this.burstGeo;

    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
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
      });
    }
  }

  private updateParticles(dt: number): void {
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
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 4;

      const remaining = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.001, p.baseScale * remaining));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, remaining * 1.6);
    }
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
      if (obj instanceof THREE.Mesh) {
        if (!this.sharedGeometries.has(obj.geometry)) obj.geometry.dispose();
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
    this.renderer.render(this.scene, this.camera);
  }

  public destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
    this.towerVisuals.clear();
    this.mobVisuals.clear();
    this.projectileVisuals.clear();
    this.fadingVisuals = [];
    this.activeEffects = [];
    this.seenEffectIds.clear();
    this.activeParticles = [];
    this.rangeRadius = -1;
  }
}
