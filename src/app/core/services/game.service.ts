import { Injectable, NgZone, OnDestroy, computed, inject, signal } from '@angular/core';
import { MAP_VERDANT_CROSSROADS, MapDefinition, Point } from '../models/map.model';
import {
  DamageType,
  TOWER_CLASSES,
  TargetPriority,
  TowerClassId,
  TowerInstance,
  TowerLevelConfig,
} from '../models/tower.model';
import { MOB_TYPES, MobInstance, MobTypeId, StatusEffect } from '../models/mob.model';
import { FloatingText, GameSpeed, ParticleFx, Projectile } from '../models/game-state.model';
import { PathfindingService } from './pathfinding.service';
import { AudioService } from './audio.service';

interface SpawnQueueItem {
  mobType: MobTypeId;
  spawnTimeMs: number;
  hpMultiplier: number;
}

@Injectable({ providedIn: 'root' })
export class GameService implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly pathfinding = inject(PathfindingService);
  private readonly audio = inject(AudioService);

  // Core Game Signals
  public readonly activeMap = signal<MapDefinition>(MAP_VERDANT_CROSSROADS);
  public readonly gold = signal<number>(420);
  public readonly crystals = signal<number>(20);
  public readonly maxCrystals = signal<number>(20);
  public readonly score = signal<number>(0);
  public readonly currentWaveIndex = signal<number>(0); // 0-based
  public readonly totalWaves = signal<number>(15);
  public readonly waveActive = signal<boolean>(false);
  public readonly gameSpeed = signal<GameSpeed>(1);
  public readonly isPaused = signal<boolean>(false);
  public readonly isGameOver = signal<boolean>(false);
  public readonly isVictory = signal<boolean>(false);

  // Selection & Interactivity
  public readonly selectedClassId = signal<TowerClassId>('blade-warden');
  public readonly selectedTile = signal<Point | null>({ x: 0, y: 0 });

  // Entities
  public readonly towers = signal<TowerInstance[]>([]);
  public readonly mobs = signal<MobInstance[]>([]);
  public readonly projectiles = signal<Projectile[]>([]);
  public readonly floatingTexts = signal<FloatingText[]>([]);
  public readonly particles = signal<ParticleFx[]>([]);
  public readonly barricades = signal<Set<string>>(new Set());

  // Paths
  public readonly groundPath = signal<Point[]>([]);
  public readonly airPath = signal<Point[]>([]);

  // Computed Helpers
  public readonly selectedTower = computed<TowerInstance | null>(() => {
    const tile = this.selectedTile();
    if (!tile) return null;
    return this.towers().find((t) => t.x === tile.x && t.y === tile.y) ?? null;
  });

  public readonly currentWaveDef = computed(() => {
    const map = this.activeMap();
    const idx = this.currentWaveIndex();
    return map.waves[idx] ?? null;
  });

  private frameId: number | null = null;
  private lastTime = 0;
  private gameTimeMs = 0;
  private spawnQueue: SpawnQueueItem[] = [];

  constructor() {
    this.loadMap(MAP_VERDANT_CROSSROADS);
  }

  public startLoop(): void {
    if (this.frameId !== null) return;
    this.lastTime = performance.now();
    this.zone.runOutsideAngular(() => {
      this.frameId = requestAnimationFrame(this.tick);
    });
  }

  public ngOnDestroy(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  public loadMap(map: MapDefinition): void {
    this.activeMap.set(map);
    this.gold.set(map.startingGold);
    this.crystals.set(map.startingCrystals);
    this.maxCrystals.set(map.startingCrystals);
    this.score.set(0);
    this.currentWaveIndex.set(0);
    this.totalWaves.set(map.waves.length);
    this.waveActive.set(false);
    this.isPaused.set(false);
    this.isGameOver.set(false);
    this.isVictory.set(false);
    this.selectedTile.set({ x: 0, y: 0 });
    this.towers.set([]);
    this.mobs.set([]);
    this.projectiles.set([]);
    this.floatingTexts.set([]);
    this.particles.set([]);
    this.barricades.set(new Set());
    this.spawnQueue = [];

    this.recalculatePaths();
    this.startLoop();
  }

  public recalculatePaths(): void {
    const map = this.activeMap();
    const barricades = this.barricades();
    const ground = this.pathfinding.findGroundPath(map, barricades) ?? [];
    const air = this.pathfinding.findAirPath(map);
    this.groundPath.set(ground);
    this.airPath.set(air);
  }

  public startNextWave(): void {
    if (this.waveActive() || this.isGameOver() || this.isVictory()) return;

    const wave = this.currentWaveDef();
    if (!wave) return;

    this.waveActive.set(true);
    this.audio.playWaveStart();

    // Prepare spawn queue
    this.spawnQueue = [];

    for (const group of wave.groups) {
      const delay = group.spawnDelayMs;
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({
          mobType: group.mobType,
          spawnTimeMs: this.gameTimeMs + delay + i * group.intervalMs,
          hpMultiplier: group.hpMultiplier ?? 1.0,
        });
      }
    }

    // Sort queue by spawn time
    this.spawnQueue.sort((a, b) => a.spawnTimeMs - b.spawnTimeMs);
  }

  public togglePause(): void {
    this.isPaused.update((p) => !p);
  }

  public cycleSpeed(): void {
    const current = this.gameSpeed();
    const next: GameSpeed = current === 1 ? 2 : current === 2 ? 4 : 1;
    this.gameSpeed.set(next);
  }

  public setSelectedClass(classId: TowerClassId): void {
    this.selectedClassId.set(classId);
    this.audio.playSelect();
  }

  public cycleClass(direction: 'next' | 'prev'): void {
    const classIds = Object.keys(TOWER_CLASSES) as TowerClassId[];
    const current = this.selectedClassId();
    const index = classIds.indexOf(current);
    const nextIndex =
      direction === 'next'
        ? (index + 1) % classIds.length
        : (index - 1 + classIds.length) % classIds.length;
    this.setSelectedClass(classIds[nextIndex]);
  }

  public selectTile(x: number, y: number): void {
    if (x < 0 || y < 0) {
      this.selectedTile.set(null);
      return;
    }
    const map = this.activeMap();
    if (x >= map.width || y >= map.height) return;
    this.selectedTile.set({ x, y });
    this.audio.playSelect();
  }

  public cycleTargetPriorityForTower(towerId: string): void {
    const t = this.towers().find((tower) => tower.id === towerId);
    if (!t || t.classId === 'barricade' || t.classId === 'oracle') return;
    const priorities: TargetPriority[] = [
      'first',
      'strongest',
      'weakest',
      'flying',
      'closest',
      'last',
    ];
    const curIdx = priorities.indexOf(t.targetPriority);
    const nextPriority = priorities[(curIdx + 1) % priorities.length];
    this.setTargetPriority(towerId, nextPriority);
    this.audio.playSelect();
  }

  public moveCursor(dx: number, dy: number): void {
    const map = this.activeMap();
    const current = this.selectedTile() ?? { x: 0, y: 1 };
    const nx = Math.max(0, Math.min(map.width - 1, current.x + dx));
    const ny = Math.max(0, Math.min(map.height - 1, current.y + dy));
    this.selectTile(nx, ny);
  }

  public placeTower(x: number, y: number, classId: TowerClassId): boolean {
    const map = this.activeMap();
    const tile = map.tiles[y]?.[x];
    if (!tile) return false;

    // Check if cell already contains a tower
    if (this.towers().some((t) => t.x === x && t.y === y)) {
      return false;
    }

    const def = TOWER_CLASSES[classId];
    if (this.gold() < def.cost) {
      this.addFloatingText('Need More Gold!', x, y, '#ef4444', 'alert');
      return false;
    }

    if (classId === 'barricade') {
      if (tile !== 'M') {
        this.addFloatingText('Only Maze Slots!', x, y, '#f97316', 'alert');
        return false;
      }
      if (!this.pathfinding.canPlaceBarricade(map, this.barricades(), x, y)) {
        this.addFloatingText('Cannot Block All Paths!', x, y, '#ef4444', 'alert');
        return false;
      }
      // Add barricade
      this.barricades.update((b) => {
        const next = new Set(b);
        next.add(`${x},${y}`);
        return next;
      });
      this.recalculatePaths();
    } else {
      if (tile !== 'B') {
        this.addFloatingText('Only Build Tiles!', x, y, '#f97316', 'alert');
        return false;
      }
    }

    this.gold.update((g) => g - def.cost);
    const newTower: TowerInstance = {
      id: `tower-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      classId,
      x,
      y,
      level: 1,
      totalInvested: def.cost,
      targetPriority: 'first',
      lastActionTime: 0,
      kills: 0,
      damageDealt: 0,
      goldGenerated: 0,
    };

    this.towers.update((ts) => [...ts, newTower]);
    this.audio.playBuff();
    this.addFloatingText(`-${def.cost}G`, x, y, '#fbbf24', 'gold');
    return true;
  }

  public upgradeTower(towerId: string): boolean {
    const tower = this.towers().find((t) => t.id === towerId);
    if (!tower) return false;

    const def = TOWER_CLASSES[tower.classId];
    if (tower.level >= def.levels.length) {
      this.addFloatingText('Max Level!', tower.x, tower.y, '#38bdf8', 'alert');
      return false;
    }

    const nextLevelConfig = def.levels[tower.level];
    const cost = nextLevelConfig.upgradeCost;

    if (this.gold() < cost) {
      this.addFloatingText('Need More Gold!', tower.x, tower.y, '#ef4444', 'alert');
      return false;
    }

    this.gold.update((g) => g - cost);
    this.towers.update((ts) =>
      ts.map((t) =>
        t.id === towerId
          ? {
              ...t,
              level: t.level + 1,
              totalInvested: t.totalInvested + cost,
            }
          : t,
      ),
    );

    this.audio.playBuff();
    this.addFloatingText(`Level ${tower.level + 1}!`, tower.x, tower.y, '#38bdf8', 'buff');
    this.addParticle(tower.x, tower.y, '#38bdf8', 1.8, 'aura');
    return true;
  }

  public sellTower(towerId: string): void {
    const tower = this.towers().find((t) => t.id === towerId);
    if (!tower) return;

    const refund = Math.floor(tower.totalInvested * 0.7);
    this.gold.update((g) => g + refund);

    if (tower.classId === 'barricade') {
      this.barricades.update((b) => {
        const next = new Set(b);
        next.delete(`${tower.x},${tower.y}`);
        return next;
      });
      this.recalculatePaths();
    }

    this.towers.update((ts) => ts.filter((t) => t.id !== towerId));
    this.audio.playCoin();
    this.addFloatingText(`+${refund}G`, tower.x, tower.y, '#fbbf24', 'gold');
  }

  public setTargetPriority(towerId: string, priority: TargetPriority): void {
    this.towers.update((ts) =>
      ts.map((t) => (t.id === towerId ? { ...t, targetPriority: priority } : t)),
    );
    this.audio.playSelect();
  }

  private readonly tick = (timestamp: number): void => {
    const rawDelta = Math.min(100, timestamp - this.lastTime);
    this.lastTime = timestamp;

    if (!this.isPaused() && !this.isGameOver() && !this.isVictory()) {
      const deltaMs = rawDelta * this.gameSpeed();
      this.gameTimeMs += deltaMs;
      this.update(deltaMs);
    }

    this.frameId = requestAnimationFrame(this.tick);
  };

  private update(deltaMs: number): void {
    const deltaSeconds = deltaMs / 1000;

    // 1. Spawn monsters from queue
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].spawnTimeMs <= this.gameTimeMs) {
      const item = this.spawnQueue.shift()!;
      this.spawnMob(item.mobType, item.hpMultiplier);
    }

    // 2. Oracle tower buff calculation (pre-pass)
    const oracleBuffs = this.calculateOracleBuffs();

    // 3. Move mobs
    this.updateMobs(deltaSeconds);

    // 4. Update towers (attacks & abilities)
    this.updateTowers(oracleBuffs);

    // 5. Update projectiles
    this.updateProjectiles(deltaSeconds);

    // 6. Update visual effects
    this.updateVisuals();

    // 7. Check wave completion
    this.checkWaveProgress();
  }

  private calculateOracleBuffs(): Map<string, { speedMult: number; damageMult: number }> {
    const buffs = new Map<string, { speedMult: number; damageMult: number }>();
    const towers = this.towers();

    for (const oracle of towers) {
      if (oracle.classId !== 'oracle') continue;
      const def = TOWER_CLASSES.oracle;
      const lvl = def.levels[oracle.level - 1];
      const range = lvl.range;

      for (const target of towers) {
        if (target.id === oracle.id) continue;
        const dist = Math.hypot(target.x - oracle.x, target.y - oracle.y);
        if (dist <= range) {
          const current = buffs.get(target.id) ?? { speedMult: 1.0, damageMult: 1.0 };
          current.speedMult += lvl.buffSpeedPercent ?? 0.25;
          current.damageMult += lvl.buffDamagePercent ?? 0.15;
          buffs.set(target.id, current);
        }
      }
    }
    return buffs;
  }

  private spawnMob(typeId: MobTypeId, hpMultiplier: number): void {
    const def = MOB_TYPES[typeId];
    const path = def.isFlying ? this.airPath() : this.groundPath();
    if (path.length === 0) return;

    const start = path[0];
    const newMob: MobInstance = {
      id: `mob-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      typeId,
      name: def.name,
      icon: def.icon,
      color: def.color,
      hp: Math.round(def.baseHp * hpMultiplier),
      maxHp: Math.round(def.baseHp * hpMultiplier),
      baseSpeed: def.baseSpeed,
      effectiveSpeed: def.baseSpeed,
      armor: def.armor,
      magicResist: def.magicResist,
      isFlying: def.isFlying,
      crystalLoss: def.crystalLoss,
      goldReward: def.goldReward,
      x: start.x,
      y: start.y,
      waypointIndex: 0,
      pathLengthWalked: 0,
      statusEffects: [],
      isDead: false,
      hasEscaped: false,
      spawnTimeMs: this.gameTimeMs,
    };

    this.mobs.update((ms) => [...ms, newMob]);
  }

  private updateMobs(deltaSeconds: number): void {
    const currentMobs = this.mobs();
    if (currentMobs.length === 0) return;

    const survivingMobs: MobInstance[] = [];

    for (const mob of currentMobs) {
      if (mob.isDead) continue;

      // Update status effects
      let speedFactor = 1.0;
      let isStunned = false;
      const nextEffects: StatusEffect[] = [];

      for (const effect of mob.statusEffects) {
        effect.remainingMs -= deltaSeconds * 1000;
        if (effect.remainingMs > 0) {
          nextEffects.push(effect);
          if (effect.type === 'slow') {
            // Swiftbeak cuts slow in half!
            const reduction =
              mob.typeId === 'swiftbeak' ? effect.intensity * 0.5 : effect.intensity;
            speedFactor *= 1 - reduction;
          } else if (effect.type === 'stun') {
            isStunned = true;
          }
        }
      }
      mob.statusEffects = nextEffects;

      // Pyre Core enrage when low on HP (<40%)
      if (mob.typeId === 'pyre-core' && mob.hp < mob.maxHp * 0.4) {
        speedFactor *= 1.5;
      }

      if (isStunned) {
        survivingMobs.push(mob);
        continue;
      }

      const path = mob.isFlying ? this.airPath() : this.groundPath();
      if (path.length === 0) continue;

      const effectiveSpeed = mob.baseSpeed * Math.max(0.2, speedFactor);
      mob.effectiveSpeed = effectiveSpeed;
      const stepDistance = effectiveSpeed * deltaSeconds;

      // Move toward next waypoint
      let remainingDistance = stepDistance;
      while (remainingDistance > 0 && mob.waypointIndex < path.length - 1) {
        const nextPoint = path[mob.waypointIndex + 1];
        const dx = nextPoint.x - mob.x;
        const dy = nextPoint.y - mob.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= remainingDistance) {
          mob.x = nextPoint.x;
          mob.y = nextPoint.y;
          mob.pathLengthWalked += dist;
          remainingDistance -= dist;
          mob.waypointIndex++;
        } else {
          mob.x += (dx / dist) * remainingDistance;
          mob.y += (dy / dist) * remainingDistance;
          mob.pathLengthWalked += remainingDistance;
          remainingDistance = 0;
        }
      }

      // Check if reached sanctuary
      if (mob.waypointIndex >= path.length - 1) {
        mob.hasEscaped = true;
        this.crystals.update((c) => Math.max(0, c - mob.crystalLoss));
        this.audio.playCrystalDamage();
        this.addFloatingText(`-${mob.crystalLoss} Crystals!`, mob.x, mob.y, '#ef4444', 'alert');
        this.addParticle(mob.x, mob.y, '#ef4444', 2.0, 'explosion');

        if (this.crystals() <= 0) {
          this.isGameOver.set(true);
          this.audio.playDefeat();
        }
      } else {
        survivingMobs.push(mob);
      }
    }

    this.mobs.set(survivingMobs);
  }

  private updateTowers(oracleBuffs: Map<string, { speedMult: number; damageMult: number }>): void {
    const towers = this.towers();
    const mobs = this.mobs();
    if (towers.length === 0 || mobs.length === 0) return;

    for (const tower of towers) {
      if (tower.classId === 'barricade' || tower.classId === 'oracle') continue;

      const def = TOWER_CLASSES[tower.classId];
      const lvl = def.levels[tower.level - 1];
      const buff = oracleBuffs.get(tower.id) ?? { speedMult: 1.0, damageMult: 1.0 };

      const effectiveCadence = lvl.cadence / buff.speedMult;
      const effectiveDamage = Math.round(lvl.damage * buff.damageMult);

      if (this.gameTimeMs - tower.lastActionTime < effectiveCadence * 1000) {
        continue;
      }

      // Find valid target in range
      const target = this.acquireTarget(tower, lvl.range, def.targetsAir, def.targetsGround);
      if (!target) continue;

      tower.lastActionTime = this.gameTimeMs;
      tower.attackAngleRad = Math.atan2(target.y - tower.y, target.x - tower.x);

      // Execute attack based on class
      this.executeTowerAttack(tower, target, lvl, effectiveDamage);
    }
  }

  private acquireTarget(
    tower: TowerInstance,
    range: number,
    targetsAir: boolean,
    targetsGround: boolean,
  ): MobInstance | null {
    const candidates = this.mobs().filter((m) => {
      if (m.isDead || m.hasEscaped) return false;
      if (m.isFlying && !targetsAir) return false;
      if (!m.isFlying && !targetsGround) return false;
      const dist = Math.hypot(m.x - tower.x, m.y - tower.y);
      return dist <= range;
    });

    if (candidates.length === 0) return null;

    switch (tower.targetPriority) {
      case 'first':
        return candidates.reduce((prev, curr) =>
          curr.pathLengthWalked > prev.pathLengthWalked ? curr : prev,
        );
      case 'last':
        return candidates.reduce((prev, curr) =>
          curr.pathLengthWalked < prev.pathLengthWalked ? curr : prev,
        );
      case 'strongest':
        return candidates.reduce((prev, curr) => (curr.hp > prev.hp ? curr : prev));
      case 'weakest':
        return candidates.reduce((prev, curr) => (curr.hp < prev.hp ? curr : prev));
      case 'closest':
        return candidates.reduce((prev, curr) =>
          Math.hypot(curr.x - tower.x, curr.y - tower.y) <
          Math.hypot(prev.x - tower.x, prev.y - tower.y)
            ? curr
            : prev,
        );
      case 'flying': {
        const flyer = candidates.find((m) => m.isFlying);
        return flyer ?? candidates[0];
      }
      default:
        return candidates[0];
    }
  }

  private executeTowerAttack(
    tower: TowerInstance,
    target: MobInstance,
    lvl: TowerLevelConfig,
    damage: number,
  ): void {
    switch (tower.classId) {
      case 'blade-warden': {
        // Melee slash instantaneous
        this.audio.playSlash();
        this.addParticle(target.x, target.y, '#38bdf8', 1.2, 'slash');
        this.dealDamage(target, damage, 'physical', tower);
        break;
      }

      case 'ranger': {
        // Projectile arrow
        this.audio.playArrow();
        this.spawnProjectile({
          sourceTowerId: tower.id,
          targetMobId: target.id,
          startX: tower.x,
          startY: tower.y,
          currentX: tower.x,
          currentY: tower.y,
          targetX: target.x,
          targetY: target.y,
          speed: 12.0,
          damage,
          damageType: 'physical',
          isAirBonus: true,
          visualType: 'arrow',
        });
        break;
      }

      case 'elementalist': {
        // Exploding fireball
        this.spawnProjectile({
          sourceTowerId: tower.id,
          targetMobId: target.id,
          startX: tower.x,
          startY: tower.y,
          currentX: tower.x,
          currentY: tower.y,
          targetX: target.x,
          targetY: target.y,
          speed: 7.5,
          damage,
          damageType: 'magic',
          splashRadius: lvl.splashRadius ?? 0.8,
          visualType: 'fireball',
        });
        break;
      }

      case 'chronomancer': {
        // Temporal gravity pulse
        this.audio.playSlowPulse();
        this.spawnProjectile({
          sourceTowerId: tower.id,
          targetMobId: target.id,
          startX: tower.x,
          startY: tower.y,
          currentX: tower.x,
          currentY: tower.y,
          targetX: target.x,
          targetY: target.y,
          speed: 8.5,
          damage,
          damageType: 'magic',
          slowPercent: lvl.slowPercent ?? 0.4,
          slowDuration: lvl.slowDuration ?? 3.0,
          visualType: 'time-orb',
        });
        break;
      }

      case 'rogue': {
        // Fast dagger strike with plunder
        this.audio.playSlash();
        this.addParticle(target.x, target.y, '#facc15', 0.9, 'slash');
        this.dealDamage(target, damage, 'physical', tower);
        const goldGain = lvl.goldPerHit ?? 2;
        this.gold.update((g) => g + goldGain);
        tower.goldGenerated += goldGain;
        this.addFloatingText(`+${goldGain}G`, tower.x, tower.y, '#facc15', 'gold');
        break;
      }

      case 'lancer': {
        // Spear plunge / jump
        this.spawnProjectile({
          sourceTowerId: tower.id,
          targetMobId: target.id,
          startX: tower.x,
          startY: tower.y,
          currentX: tower.x,
          currentY: tower.y,
          targetX: target.x,
          targetY: target.y,
          speed: 9.0,
          damage,
          damageType: 'physical',
          stunChance: lvl.stunChance ?? 0.3,
          visualType: 'spear',
        });
        break;
      }

      case 'juggernaut': {
        // Ground tremor slam (hits all in range)
        this.audio.playExplosion();
        this.addParticle(tower.x, tower.y, '#e11d48', lvl.range, 'tremor');
        const inRangeGround = this.mobs().filter(
          (m) => !m.isFlying && !m.isDead && Math.hypot(m.x - tower.x, m.y - tower.y) <= lvl.range,
        );
        for (const mob of inRangeGround) {
          this.dealDamage(mob, damage, 'physical', tower);
        }
        break;
      }
    }
  }

  private spawnProjectile(proj: Omit<Projectile, 'id'>): void {
    const newProj: Projectile = {
      ...proj,
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    this.projectiles.update((ps) => [...ps, newProj]);
  }

  private updateProjectiles(deltaSeconds: number): void {
    const currentProj = this.projectiles();
    if (currentProj.length === 0) return;

    const remainingProj: Projectile[] = [];

    for (const proj of currentProj) {
      const target = this.mobs().find((m) => m.id === proj.targetMobId);
      if (target && !target.isDead) {
        proj.targetX = target.x;
        proj.targetY = target.y;
      }

      const dx = proj.targetX - proj.currentX;
      const dy = proj.targetY - proj.currentY;
      const dist = Math.hypot(dx, dy);
      const step = proj.speed * deltaSeconds;

      if (dist <= step) {
        // Hit target!
        this.onProjectileHit(proj, target ?? null);
      } else {
        proj.currentX += (dx / dist) * step;
        proj.currentY += (dy / dist) * step;
        remainingProj.push(proj);
      }
    }

    this.projectiles.set(remainingProj);
  }

  private onProjectileHit(proj: Projectile, target: MobInstance | null): void {
    const tower = this.towers().find((t) => t.id === proj.sourceTowerId);

    if (proj.splashRadius && proj.splashRadius > 0) {
      // Splash damage
      this.audio.playExplosion();
      this.addParticle(proj.targetX, proj.targetY, '#f97316', proj.splashRadius, 'explosion');

      const affected = this.mobs().filter(
        (m) =>
          !m.isDead && Math.hypot(m.x - proj.targetX, m.y - proj.targetY) <= proj.splashRadius!,
      );

      for (const mob of affected) {
        this.dealDamage(mob, proj.damage, proj.damageType, tower ?? null);
      }
    } else if (target && !target.isDead) {
      // Single target hit
      let finalDamage = proj.damage;
      if (proj.isAirBonus && target.isFlying) {
        finalDamage = Math.round(finalDamage * 1.5);
      }

      if (proj.stunChance && Math.random() < proj.stunChance) {
        target.statusEffects.push({
          type: 'stun',
          intensity: 1.0,
          durationMs: 1200,
          remainingMs: 1200,
        });
        this.addFloatingText('STUNNED!', target.x, target.y, '#06b6d4', 'alert');
      }

      if (proj.slowPercent) {
        target.statusEffects.push({
          type: 'slow',
          intensity: proj.slowPercent,
          durationMs: (proj.slowDuration ?? 3) * 1000,
          remainingMs: (proj.slowDuration ?? 3) * 1000,
        });
        this.addParticle(target.x, target.y, '#a855f7', 0.8, 'time-pulse');
      }

      this.dealDamage(target, finalDamage, proj.damageType, tower ?? null);
    }
  }

  public dealDamage(
    mob: MobInstance,
    rawDamage: number,
    damageType: DamageType,
    tower: TowerInstance | null,
  ): void {
    let effectiveDamage = rawDamage;

    if (damageType === 'physical') {
      // Physical damage reduced by armor
      effectiveDamage = Math.max(1, Math.round(rawDamage * (1 - mob.armor)));
    } else if (damageType === 'magic') {
      // Magic damage ignores physical armor; reduced only by magic resistance
      effectiveDamage = Math.max(1, Math.round(rawDamage * (1 - mob.magicResist)));
    }

    mob.hp -= effectiveDamage;
    if (tower) {
      tower.damageDealt += effectiveDamage;
    }

    const textColor = damageType === 'magic' ? '#c084fc' : '#f87171';
    this.addFloatingText(
      `-${effectiveDamage}`,
      mob.x + (Math.random() - 0.5) * 0.4,
      mob.y - 0.2,
      textColor,
      damageType === 'magic' ? 'magic' : 'damage',
    );

    if (mob.hp <= 0 && !mob.isDead) {
      mob.isDead = true;
      this.onMobDefeated(mob, tower);
    }
  }

  private onMobDefeated(mob: MobInstance, tower: TowerInstance | null): void {
    this.gold.update((g) => g + mob.goldReward);
    this.score.update((s) => s + mob.goldReward * 10);
    this.audio.playCoin();

    if (tower) {
      tower.kills++;
    }

    this.addFloatingText(`+${mob.goldReward}G`, mob.x, mob.y, '#fbbf24', 'gold');
    this.addParticle(mob.x, mob.y, mob.color, 1.0, 'explosion');
  }

  private updateVisuals(): void {
    const now = this.gameTimeMs;

    this.floatingTexts.update((texts) => texts.filter((t) => now - t.createdAt < t.durationMs));

    this.particles.update((particles) => particles.filter((p) => now - p.createdAt < p.durationMs));
  }

  private checkWaveProgress(): void {
    if (!this.waveActive()) return;

    const noMoreSpawns = this.spawnQueue.length === 0;
    const noLivingMobs = this.mobs().every((m) => m.isDead || m.hasEscaped);

    if (noMoreSpawns && noLivingMobs) {
      // Wave completed!
      this.waveActive.set(false);
      this.mobs.set([]);
      this.projectiles.set([]);

      const wave = this.currentWaveDef();
      const bonus = wave?.bonusGold ?? 50;
      this.gold.update((g) => g + bonus);
      this.score.update((s) => s + bonus * 20);
      this.audio.playVictory();

      this.addFloatingText(
        `Wave Complete! +${bonus}G Bonus`,
        this.activeMap().width / 2,
        this.activeMap().height / 2,
        '#38bdf8',
        'buff',
      );

      const nextIdx = this.currentWaveIndex() + 1;
      if (nextIdx >= this.totalWaves()) {
        this.isVictory.set(true);
        this.audio.playVictory();
      } else {
        this.currentWaveIndex.set(nextIdx);
      }
    }
  }

  public addFloatingText(
    text: string,
    x: number,
    y: number,
    color: string,
    style: FloatingText['style'],
  ): void {
    const item: FloatingText = {
      id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      x,
      y,
      color,
      createdAt: this.gameTimeMs,
      durationMs: 900,
      style,
    };
    this.floatingTexts.update((ts) => [...ts, item]);
  }

  public addParticle(
    x: number,
    y: number,
    color: string,
    maxRadius: number,
    type: ParticleFx['type'],
  ): void {
    const item: ParticleFx = {
      id: `particle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      x,
      y,
      color,
      radius: 0.1,
      maxRadius,
      createdAt: this.gameTimeMs,
      durationMs: 400,
      type,
    };
    this.particles.update((ps) => [...ps, item]);
  }
}
