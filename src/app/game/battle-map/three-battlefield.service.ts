import { Injectable, signal } from '@angular/core';
import * as THREE from 'three';
import { GameService } from '../../core/services/game.service';
import { TOWER_CLASSES, TowerClassId } from '../../core/models/tower.model';
import { MobInstance } from '../../core/models/mob.model';

export type CameraPreset = 'tactics' | 'isometric' | 'topdown';

interface ParticleInstance {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
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

  // Pools
  private towerSprites = new Map<string, THREE.Group>();
  private mobSprites = new Map<string, THREE.Group>();
  private projectileMeshes = new Map<string, THREE.Group>();
  private activeParticles: ParticleInstance[] = [];

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
      this.textures.set(id, this.textureLoader.load(`assets/sprites/${id}.png`));
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
      this.textures.set(id, this.textureLoader.load(`assets/monsters/${id}-sprite.png`));
    }
  }

  public setCameraPreset(preset: CameraPreset, animate = true): void {
    this.activeCameraMode.set(preset);
    if (!this.camera) return;

    if (preset === 'tactics') {
      // Classic 2.5D Tactics isometric elevation
      this.cameraTargetPos.set(0, 14.5, 12.5);
      this.cameraLookTarget.set(0, 0, 0);
    } else if (preset === 'isometric') {
      // 45-degree corner isometric diorama
      this.cameraTargetPos.set(-9.5, 15, 10.5);
      this.cameraLookTarget.set(0, 0, 0);
    } else if (preset === 'topdown') {
      // High-angle retro tactical
      this.cameraTargetPos.set(0, 18.5, 0.05);
      this.cameraLookTarget.set(0, 0, 0);
    }

    if (!animate) {
      this.camera.position.copy(this.cameraTargetPos);
      this.camera.lookAt(this.cameraLookTarget);
    }
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

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
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

    // 1. Smooth Camera Interpolation
    this.camera.position.lerp(this.cameraTargetPos, dt * 6.0);
    this.camera.lookAt(this.cameraLookTarget);

    // 2. Animate Crystal Altar, Satellites & Light Pillar
    if (this.crystalCore) {
      this.crystalCore.rotation.y += dt * 0.9;
      this.crystalCore.position.y = 0.72 + Math.sin(elapsed * 2.4) * 0.06;
    }
    if (this.crystalShell) {
      this.crystalShell.rotation.y -= dt * 0.5;
      this.crystalShell.position.y = 0.72 + Math.sin(elapsed * 2.4) * 0.06;
    }
    if (this.crystalRing) {
      this.crystalRing.rotation.z += dt * 1.3;
    }
    if (this.crystalLight) {
      this.crystalLight.intensity = 2.4 + Math.sin(elapsed * 4.0) * 0.6;
    }
    if (this.crystalSatellites.length > 0) {
      for (let i = 0; i < this.crystalSatellites.length; i++) {
        const sat = this.crystalSatellites[i];
        const orbitAngle = elapsed * (1.2 + i * 0.3) + (i * Math.PI) / 2;
        const orbitDist = 0.46;
        sat.position.set(
          Math.cos(orbitAngle) * orbitDist,
          0.72 + Math.sin(elapsed * 3.0 + i) * 0.08,
          Math.sin(orbitAngle) * orbitDist,
        );
        sat.rotation.y += dt * 2.0;
      }
    }

    // 3. Animate Spawn Portal Vortex
    if (this.spawnDisc) {
      this.spawnDisc.rotation.z += dt * 2.0;
    }
    if (this.spawnCore) {
      this.spawnCore.rotation.y += dt * 1.8;
      this.spawnCore.position.y = 0.45 + Math.sin(elapsed * 3.5) * 0.04;
    }

    // 4. Animate Aether Motes (Magical fireflies rising through the air)
    this.updateAetherParticles(dt);

    // 5. Animate Cloud Rings slowly orbiting beneath the sky island
    if (this.cloudRings) {
      this.cloudRings.rotation.y += dt * 0.04;
    }

    // 6. Selection Reticle Update
    const sel = game.selectedTile();
    if (sel && this.reticleMesh) {
      this.reticleMesh.visible = true;
      const targetX = (sel.x - halfW) * this.TILE_SIZE;
      const targetZ = (sel.y - halfH) * this.TILE_SIZE;
      this.reticleMesh.position.x = THREE.MathUtils.lerp(
        this.reticleMesh.position.x,
        targetX,
        0.25,
      );
      this.reticleMesh.position.z = THREE.MathUtils.lerp(
        this.reticleMesh.position.z,
        targetZ,
        0.25,
      );
      this.reticleMesh.position.y = 0.25 + Math.sin(elapsed * 6.0) * 0.03;
    } else if (this.reticleMesh) {
      this.reticleMesh.visible = false;
    }

    // 7. Range Overlay Update
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
        this.rangeMesh.visible = true;
        this.rangeMesh.geometry.dispose();
        this.rangeMesh.geometry = new THREE.RingGeometry(
          Math.max(0.01, rangeRadius - 0.06),
          rangeRadius,
          48,
        );
        this.rangeMesh.position.set(
          (sel.x - halfW) * this.TILE_SIZE,
          0.24,
          (sel.y - halfH) * this.TILE_SIZE,
        );
      } else {
        this.rangeMesh.visible = false;
      }
    }

    // 8. Synchronize Dynamic Entities
    this.syncTowers(game, halfW, halfH, elapsed);
    this.syncMobs(game, halfW, halfH, dt, elapsed);
    this.syncProjectiles(game, halfW, halfH);
    this.updateParticles(dt);
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

  private syncTowers(game: GameService, halfW: number, halfH: number, elapsed: number): void {
    const towers = game.towers();
    const activeIds = new Set<string>();

    for (const t of towers) {
      activeIds.add(t.id);
      let group = this.towerSprites.get(t.id);

      if (!group) {
        group = this.createTowerMesh(t);
        this.towerSprites.set(t.id, group);
        this.scene?.add(group);
      }

      const wx = (t.x - halfW) * this.TILE_SIZE;
      const wz = (t.y - halfH) * this.TILE_SIZE;
      group.position.set(wx, 0.18, wz);

      // Idle Bob & Camera-facing billboard
      const spriteObj = group.getObjectByName('billboard');
      if (spriteObj && this.camera) {
        spriteObj.quaternion.copy(this.camera.quaternion);
        spriteObj.position.y = 0.45 + Math.sin(elapsed * 2.8 + t.x * 3) * 0.03;
      }

      // Rotating Aura Ring
      const auraRing = group.getObjectByName('aura-ring');
      if (auraRing) {
        auraRing.rotation.z += 0.02;
      }
    }

    // Cleanup sold towers
    for (const [id, group] of this.towerSprites.entries()) {
      if (!activeIds.has(id)) {
        this.scene?.remove(group);
        this.towerSprites.delete(id);
      }
    }
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
    for (let i = 0; i < tower.level; i++) {
      const starGeo = new THREE.SphereGeometry(0.035, 8, 8);
      const starMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
      const star = new THREE.Mesh(starGeo, starMat);
      const starAngle = (i - (tower.level - 1) / 2) * 0.22;
      star.position.set(Math.sin(starAngle) * 0.44, 0.07, Math.cos(starAngle) * 0.44);
      group.add(star);
    }

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

    // High-Res Heroic Character Billboard Sprite
    const texture = this.textures.get(tower.classId);
    const spriteMat = new THREE.MeshBasicMaterial({
      map: texture || null,
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const spriteGeo = new THREE.PlaneGeometry(1.05, 1.05);
    const spriteMesh = new THREE.Mesh(spriteGeo, spriteMat);
    spriteMesh.name = 'billboard';
    spriteMesh.position.set(0, 0.52, 0);
    group.add(spriteMesh);

    return group;
  }

  private syncMobs(
    game: GameService,
    halfW: number,
    halfH: number,
    dt: number,
    elapsed: number,
  ): void {
    const mobs = game.mobs();
    const activeIds = new Set<string>();

    for (const mob of mobs) {
      if (mob.isDead || mob.hasEscaped) continue;
      activeIds.add(mob.id);

      let group = this.mobSprites.get(mob.id);
      if (!group) {
        group = this.createMobMesh(mob);
        this.mobSprites.set(mob.id, group);
        this.scene?.add(group);
      }

      const wx = (mob.x - halfW) * this.TILE_SIZE;
      const wz = (mob.y - halfH) * this.TILE_SIZE;
      const yAlt = mob.isFlying ? 0.95 : 0.28;

      group.position.set(wx, yAlt, wz);

      // Facing Billboard & Idle animation
      const spriteObj = group.getObjectByName('mob-sprite');
      if (spriteObj && this.camera) {
        spriteObj.quaternion.copy(this.camera.quaternion);
        spriteObj.position.y = mob.isFlying
          ? 0.48 + Math.sin(elapsed * 5.0 + mob.spawnTimeMs) * 0.08
          : 0.42 + Math.sin(elapsed * 8.0) * 0.04;
      }

      // Update 3D Health Bar
      const hpFill = group.getObjectByName('hp-fill') as THREE.Mesh;
      if (hpFill) {
        const ratio = Math.max(0, Math.min(1, mob.hp / mob.maxHp));
        hpFill.scale.set(ratio, 1, 1);
        hpFill.position.x = -(1 - ratio) * 0.25;

        const mat = hpFill.material as THREE.MeshBasicMaterial;
        if (ratio > 0.6) mat.color.setHex(0x10b981);
        else if (ratio > 0.25) mat.color.setHex(0xf59e0b);
        else mat.color.setHex(0xef4444);
      }
    }

    // Cleanup dead creeps & trigger particles on death
    for (const [id, group] of this.mobSprites.entries()) {
      if (!activeIds.has(id)) {
        this.spawnBurst(group.position.x, group.position.y + 0.3, group.position.z, 0xf87171, 10);
        this.scene?.remove(group);
        this.mobSprites.delete(id);
      }
    }
  }

  private createMobMesh(mob: MobInstance): THREE.Group {
    const group = new THREE.Group();

    // Soft Drop Shadow (Essential for grounding creeps in 3D space)
    const shadowGeo = new THREE.CircleGeometry(0.32, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = mob.isFlying ? -0.7 : -0.05;
    group.add(shadow);

    // Monster Sprite Billboard with heroic sizing for bosses
    const isBoss = mob.typeId === 'sky-sovereign' || mob.typeId === 'bramble-golem';
    const sprSize = isBoss ? 1.35 : 0.95;

    const texture = this.textures.get(mob.typeId);
    const spriteMat = new THREE.MeshBasicMaterial({
      map: texture || null,
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const spriteMesh = new THREE.Mesh(new THREE.PlaneGeometry(sprSize, sprSize), spriteMat);
    spriteMesh.name = 'mob-sprite';
    spriteMesh.position.set(0, sprSize * 0.45, 0);
    group.add(spriteMesh);

    // 3D Mini Health Bar
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x0f172a }),
    );
    hpBg.position.set(0, sprSize + 0.06, 0);

    const hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x10b981 }),
    );
    hpFill.name = 'hp-fill';
    hpFill.position.set(0, sprSize + 0.06, 0.005);

    group.add(hpBg);
    group.add(hpFill);

    return group;
  }

  private syncProjectiles(game: GameService, halfW: number, halfH: number): void {
    const projs = game.projectiles();
    const activeIds = new Set<string>();

    for (const p of projs) {
      activeIds.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);

      if (!mesh) {
        mesh = this.createProjectileMesh(p.visualType);
        this.projectileMeshes.set(p.id, mesh);
        this.scene?.add(mesh);
      }

      const wx = (p.currentX - halfW) * this.TILE_SIZE;
      const wz = (p.currentY - halfH) * this.TILE_SIZE;
      mesh.position.set(wx, 0.55, wz);

      mesh.rotation.y += 0.2;
    }

    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.spawnBurst(mesh.position.x, mesh.position.y, mesh.position.z, 0xfbbf24, 6);
        this.scene?.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }
  }

  private createProjectileMesh(type: string): THREE.Group {
    const group = new THREE.Group();

    if (type === 'fireball') {
      const geo = new THREE.SphereGeometry(0.18, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
      group.add(new THREE.Mesh(geo, mat));

      const light = new THREE.PointLight(0xf97316, 1.8, 3);
      group.add(light);
    } else if (type === 'time-orb') {
      const geo = new THREE.SphereGeometry(0.18, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
      group.add(new THREE.Mesh(geo, mat));

      const light = new THREE.PointLight(0xc084fc, 1.6, 3);
      group.add(light);
    } else if (type === 'arrow') {
      const geo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.z = Math.PI / 2;
      group.add(m);
    } else if (type === 'dagger') {
      // Shuriken / Throwing Dagger
      const geo = new THREE.BoxGeometry(0.2, 0.02, 0.2);
      const mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
      group.add(new THREE.Mesh(geo, mat));
    } else {
      const geo = new THREE.ConeGeometry(0.08, 0.4, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      group.add(new THREE.Mesh(geo, mat));
    }

    return group;
  }

  public spawnBurst(x: number, y: number, z: number, colorHex: number, count = 8): void {
    if (!this.scene) return;

    const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const color = new THREE.Color(colorHex);

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.0;

      this.activeParticles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 1.5 + Math.random() * 2.5,
        vz: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
        color,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.scene?.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.activeParticles.splice(i, 1);
        continue;
      }

      p.vy -= 9.8 * dt; // gravity
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      const progress = 1 - p.life / p.maxLife;
      p.mesh.scale.set(progress, progress, progress);
    }
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
    this.towerSprites.clear();
    this.mobSprites.clear();
    this.projectileMeshes.clear();
    this.activeParticles = [];
  }
}
