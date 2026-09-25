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

  // Scene Objects
  private terrainGroup: THREE.Group | null = null;
  private reticleMesh: THREE.Group | null = null;
  private rangeMesh: THREE.Mesh | null = null;
  private crystalAltarMesh: THREE.Group | null = null;
  private crystalCore: THREE.Mesh | null = null;
  private crystalRing: THREE.Mesh | null = null;
  private crystalLight: THREE.PointLight | null = null;
  private spawnVortexMesh: THREE.Group | null = null;

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

  // Camera animation target
  private cameraTargetPos = new THREE.Vector3(0, 14, 12);
  private cameraLookTarget = new THREE.Vector3(0, 0, 0);

  // Grid sizing constants
  private readonly TILE_SIZE = 1.0;
  private readonly TILE_GAP = 0.04;

  public init(canvas: HTMLCanvasElement, game: GameService): boolean {
    this.canvas = canvas;

    // 1. WebGL Support Verification (Graceful fallback for unit test / mock envs)
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
    this.scene.background = new THREE.Color(0x080c14);
    this.scene.fog = new THREE.FogExp2(0x080c14, 0.018);

    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
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

    // 3. Lighting Setup (Atmospheric JRPG Fantasy Palette)
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 1.25);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
    sunLight.position.set(-8, 18, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.bias = -0.001;
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    rimLight.position.set(8, -4, -10);
    this.scene.add(rimLight);

    // 4. Preload Textures
    this.preloadTextures();

    // 5. Build Initial World
    this.rebuildTerrain(game);
    this.buildReticle();
    this.buildRangeOverlay();

    // 6. Setup Pointer Events
    this.setupPointerEvents(canvas, game);

    // 7. Start Render Loop
    this.startLoop(game);

    return true;
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
      // Classic 2.5D Tactics angle
      this.cameraTargetPos.set(0, 14.5, 12.5);
      this.cameraLookTarget.set(0, 0, 0);
    } else if (preset === 'isometric') {
      // 45-degree corner isometric diorama
      this.cameraTargetPos.set(-9.5, 15, 10.5);
      this.cameraLookTarget.set(0, 0, 0);
    } else if (preset === 'topdown') {
      // High-angle top-down retro tactical
      this.cameraTargetPos.set(0, 18.5, 0.05);
      this.cameraLookTarget.set(0, 0, 0);
    }

    if (!animate) {
      this.camera.position.copy(this.cameraTargetPos);
      this.camera.lookAt(this.cameraLookTarget);
    }
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

    // Island Pedestal Floating Underneath Arena
    const islandGeo = new THREE.BoxGeometry(
      map.width * this.TILE_SIZE + 0.8,
      1.4,
      map.height * this.TILE_SIZE + 0.8,
    );
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.85,
      metalness: 0.1,
    });
    const islandMesh = new THREE.Mesh(islandGeo, islandMat);
    islandMesh.position.set(0, -0.75, 0);
    islandMesh.receiveShadow = true;
    this.terrainGroup.add(islandMesh);

    // Island Rim Trim
    const rimGeo = new THREE.BoxGeometry(
      map.width * this.TILE_SIZE + 1.0,
      0.15,
      map.height * this.TILE_SIZE + 1.0,
    );
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.3,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.set(0, -0.05, 0);
    this.terrainGroup.add(rimMesh);

    // Standard tile materials
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.9,
      metalness: 0.05,
    });
    const buildMat = new THREE.MeshStandardMaterial({
      color: 0x14532d,
      roughness: 0.75,
      metalness: 0.1,
    });
    const mazeMat = new THREE.MeshStandardMaterial({
      color: 0x2e1065,
      roughness: 0.6,
      metalness: 0.25,
      emissive: 0x1e1b4b,
    });
    const obstacleMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.95,
      metalness: 0.1,
    });

    const boxGeo = new THREE.BoxGeometry(
      this.TILE_SIZE - this.TILE_GAP,
      0.35,
      this.TILE_SIZE - this.TILE_GAP,
    );

    for (let r = 0; r < map.height; r++) {
      for (let c = 0; c < map.width; c++) {
        const tile = map.tiles[r][c];
        const wx = (c - halfW) * this.TILE_SIZE;
        const wz = (r - halfH) * this.TILE_SIZE;

        let mat = buildMat;
        let yOffset = 0;

        if (tile === 'P') {
          mat = pathMat;
          yOffset = -0.05;
        } else if (tile === 'M') {
          mat = mazeMat;
          yOffset = 0;
        } else if (tile === 'O') {
          mat = obstacleMat;
          yOffset = 0.08;
        } else if (tile === 'S') {
          mat = mazeMat;
          yOffset = -0.02;
        } else if (tile === 'C') {
          mat = pathMat;
          yOffset = 0;
        }

        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.position.set(wx, yOffset, wz);
        mesh.receiveShadow = true;
        mesh.castShadow = tile === 'O' || tile === 'B';

        this.terrainGroup.add(mesh);
        this.tileMeshes.push({ mesh, x: c, y: r });

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

    this.scene.add(this.terrainGroup);
  }

  private buildSanctuaryAltar(x: number, z: number): void {
    if (!this.terrainGroup) return;

    this.crystalAltarMesh = new THREE.Group();
    this.crystalAltarMesh.position.set(x, 0.2, z);

    // Stone Dais Base
    const daisGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.25, 8);
    const daisMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
      metalness: 0.2,
    });
    const daisMesh = new THREE.Mesh(daisGeo, daisMat);
    daisMesh.castShadow = true;
    this.crystalAltarMesh.add(daisMesh);

    // Sacred Glowing Aether Crystal (Octahedron / Hexagonal Prism)
    const crystalGeo = new THREE.OctahedronGeometry(0.38, 0);
    crystalGeo.scale(0.8, 1.45, 0.8);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.85,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.92,
    });
    this.crystalCore = new THREE.Mesh(crystalGeo, crystalMat);
    this.crystalCore.position.set(0, 0.65, 0);
    this.crystalCore.castShadow = true;
    this.crystalAltarMesh.add(this.crystalCore);

    // Orbiting Arcane Rune Ring
    const ringGeo = new THREE.TorusGeometry(0.45, 0.02, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.75,
    });
    this.crystalRing = new THREE.Mesh(ringGeo, ringMat);
    this.crystalRing.rotation.x = Math.PI / 2.5;
    this.crystalRing.position.set(0, 0.65, 0);
    this.crystalAltarMesh.add(this.crystalRing);

    // Point Light Illuminating Surrounding Dais
    this.crystalLight = new THREE.PointLight(0x38bdf8, 2.5, 6);
    this.crystalLight.position.set(0, 0.8, 0);
    this.crystalAltarMesh.add(this.crystalLight);

    this.terrainGroup.add(this.crystalAltarMesh);
  }

  private buildSpawnVortex(x: number, z: number): void {
    if (!this.terrainGroup) return;

    this.spawnVortexMesh = new THREE.Group();
    this.spawnVortexMesh.position.set(x, 0.22, z);

    // Swirling Void Rift Ring
    const torusGeo = new THREE.TorusGeometry(0.36, 0.06, 12, 32);
    const torusMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x7e22ce,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    });
    const ringMesh = new THREE.Mesh(torusGeo, torusMat);
    ringMesh.rotation.x = Math.PI / 2;
    this.spawnVortexMesh.add(ringMesh);

    // Inner Void Core Disc
    const coreGeo = new THREE.CircleGeometry(0.3, 24);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x1e1b4b,
      side: THREE.DoubleSide,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.rotation.x = -Math.PI / 2;
    this.spawnVortexMesh.add(coreMesh);

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

      const seg1 = new THREE.Mesh(new THREE.BoxGeometry(len, thk, thk), bracketMat);
      seg1.position.set(len / 2, 0, 0);

      const seg2 = new THREE.Mesh(new THREE.BoxGeometry(thk, thk, len), bracketMat);
      seg2.position.set(0, 0, len / 2);

      g.add(seg1);
      g.add(seg2);
      this.reticleMesh.add(g);
    }

    this.reticleMesh.position.set(0, 0.25, 0);
    this.reticleMesh.visible = false;
    this.scene.add(this.reticleMesh);
  }

  private buildRangeOverlay(): void {
    if (!this.scene) return;

    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    });

    this.rangeMesh = new THREE.Mesh(ringGeo, ringMat);
    this.rangeMesh.rotation.x = -Math.PI / 2;
    this.rangeMesh.position.set(0, 0.21, 0);
    this.rangeMesh.visible = false;
    this.scene.add(this.rangeMesh);
  }

  private setupPointerEvents(canvas: HTMLCanvasElement, game: GameService): void {
    canvas.addEventListener('click', (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (!this.camera) return;
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

    // 2. Animate Crystal Altar & Void Rift
    if (this.crystalCore) {
      this.crystalCore.rotation.y += dt * 0.8;
      this.crystalCore.position.y = 0.65 + Math.sin(elapsed * 2.2) * 0.06;
    }
    if (this.crystalRing) {
      this.crystalRing.rotation.z += dt * 1.4;
    }
    if (this.crystalLight) {
      this.crystalLight.intensity = 2.2 + Math.sin(elapsed * 4.0) * 0.6;
    }
    if (this.spawnVortexMesh) {
      this.spawnVortexMesh.rotation.y += dt * 1.5;
    }

    // 3. Selection Reticle Update
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

    // 4. Range Overlay Update
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
        this.rangeMesh.position.set(
          (sel.x - halfW) * this.TILE_SIZE,
          0.21,
          (sel.y - halfH) * this.TILE_SIZE,
        );
        this.rangeMesh.scale.set(rangeRadius, rangeRadius, 1);
      } else {
        this.rangeMesh.visible = false;
      }
    }

    // 5. Sync Placed Towers & Barricades
    this.syncTowers(game, halfW, halfH, elapsed);

    // 6. Sync Creeps / Monsters
    this.syncMobs(game, halfW, halfH, dt, elapsed);

    // 7. Sync Projectiles
    this.syncProjectiles(game, halfW, halfH);

    // 8. Update 3D Particle Bursts
    this.updateParticles(dt);
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

    // Carved Plinth Base
    const plinthGeo = new THREE.CylinderGeometry(0.38, 0.42, 0.14, 8);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.2,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.castShadow = true;
    group.add(plinth);

    // High-Res Character Billboard Sprite
    const texture = this.textures.get(tower.classId);
    const spriteMat = new THREE.MeshBasicMaterial({
      map: texture || null,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const spriteGeo = new THREE.PlaneGeometry(0.9, 0.9);
    const spriteMesh = new THREE.Mesh(spriteGeo, spriteMat);
    spriteMesh.name = 'billboard';
    spriteMesh.position.set(0, 0.45, 0);
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
          ? 0.45 + Math.sin(elapsed * 5.0 + mob.spawnTimeMs) * 0.08
          : 0.38 + Math.sin(elapsed * 8.0) * 0.04;
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

    // Soft Drop Shadow (Essential for flying creeps)
    const shadowGeo = new THREE.CircleGeometry(0.3, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = mob.isFlying ? -0.7 : -0.05;
    group.add(shadow);

    // Monster Sprite Billboard
    const texture = this.textures.get(mob.typeId);
    const spriteMat = new THREE.MeshBasicMaterial({
      map: texture || null,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const spriteMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), spriteMat);
    spriteMesh.name = 'mob-sprite';
    spriteMesh.position.set(0, 0.38, 0);
    group.add(spriteMesh);

    // 3D Mini Health Bar
    const hpGroup = new THREE.Group();
    hpGroup.position.set(0, 0.88, 0);

    const bgMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.07), bgMat);
    hpGroup.add(bgMesh);

    const fillMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const fillMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.055), fillMat);
    fillMesh.name = 'hp-fill';
    hpGroup.add(fillMesh);

    group.add(hpGroup);

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

      // Spin or pulse
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
      const geo = new THREE.SphereGeometry(0.16, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
      group.add(new THREE.Mesh(geo, mat));
    } else if (type === 'arrow') {
      const geo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.z = Math.PI / 2;
      group.add(m);
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
