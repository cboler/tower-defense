import { Injectable, NgZone, OnDestroy, computed, inject, signal } from '@angular/core';
import { MAP_VERDANT_CROSSROADS, MapDefinition, Point } from '../models/map.model';
import {
  DamageType,
  JOB_UNLOCK_RULES,
  TOWER_CLASSES,
  TargetPriority,
  TowerClassId,
  TowerInstance,
  TowerLevelConfig,
} from '../models/tower.model';
import { MOB_TYPES, MobInstance, MobTypeId } from '../models/mob.model';
import { FloatingText, GameSpeed, ParticleFx, Projectile } from '../models/game-state.model';
import { PathfindingService } from './pathfinding.service';
import { AudioService } from './audio.service';
import { CampaignService } from './campaign.service';
import { CampaignMission } from '../models/campaign.model';
import { GameRulesService } from './game-rules.service';
import { StoryService } from './story.service';

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
  public readonly campaign = inject(CampaignService);
  public readonly rules = inject(GameRulesService);
  public readonly story = inject(StoryService);

  // Core Game Signals
  public readonly activeMission = computed(() => this.campaign.activeMission());
  public readonly activeMap = signal<MapDefinition>(MAP_VERDANT_CROSSROADS);
  public readonly gold = signal<number>(420);
  public readonly crystals = signal<number>(20);
  public readonly maxCrystals = signal<number>(20);
  public readonly score = signal<number>(0);
  public readonly currentWaveIndex = signal<number>(0); // 0-based
  public readonly totalWaves = signal<number>(31);
  public readonly waveActive = signal<boolean>(false);
  public readonly gameSpeed = signal<GameSpeed>(1);
  public readonly isPaused = signal<boolean>(true);
  public readonly hasUserEngaged = signal<boolean>(false);
  public readonly isGameOver = signal<boolean>(false);
  public readonly isVictory = signal<boolean>(false);
  public readonly isCampaignModalOpen = signal<boolean>(false);
  public readonly isBestiaryModalOpen = signal<boolean>(false);

  public toggleCampaignModal(): void {
    this.isCampaignModalOpen.update((v) => !v);
    this.audio.playSelect();
  }

  public toggleBestiaryModal(): void {
    this.isBestiaryModalOpen.update((v) => !v);
    this.audio.playSelect();
  }

  // Wave Flow & Pacing Signals (Crystal Defenders Inter-wave Countdown & Rush)
  public readonly countdownDurationMs = 20000; // 20s preparation window
  public readonly countdownRemainingMs = signal<number>(20000);
  public readonly isCountdownActive = signal<boolean>(true);

  // Selection & Interactivity
  public readonly selectedClassId = signal<TowerClassId>('blade-warden');
  public readonly selectedTile = signal<Point | null>({ x: 0, y: 0 });
  public readonly unlockedJobIds = signal<Set<TowerClassId>>(new Set());

  public isClassUnlocked(classId: TowerClassId): boolean {
    if (!JOB_UNLOCK_RULES[classId]) {
      return true; // Base classes and barricade are always unlocked
    }
    return this.unlockedJobIds().has(classId);
  }

  public checkJobUnlocks(): void {
    const currentTowers = this.towers();
    const currentUnlocked = new Set(this.unlockedJobIds());
    let newlyUnlockedAny = false;

    for (const rule of Object.values(JOB_UNLOCK_RULES)) {
      const targetId = rule.targetClassId;
      if (currentUnlocked.has(targetId)) continue;

      const allMet = rule.prerequisites.every((req) =>
        currentTowers.some((t) => t.classId === req.classId && t.level >= req.minLevel),
      );

      if (allMet) {
        currentUnlocked.add(targetId);
        newlyUnlockedAny = true;
        this.audio.playVictory();
        this.addFloatingText(
          `★ JOB UNLOCKED: ${rule.name}!`,
          this.activeMap().width / 2,
          this.activeMap().height / 2,
          rule.color,
          'buff',
        );
        this.addParticle(
          this.activeMap().width / 2,
          this.activeMap().height / 2,
          rule.color,
          3.0,
          'aura',
        );
      }
    }

    if (newlyUnlockedAny) {
      this.unlockedJobIds.set(currentUnlocked);
    }
  }

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

  public readonly secondsRemaining = computed(() =>
    Math.max(0, Math.ceil(this.countdownRemainingMs() / 1000)),
  );

  public readonly earlyCallBonusGold = computed(() => {
    return this.rules.calculateEarlyCallBonus(
      this.secondsRemaining(),
      this.isCountdownActive(),
      this.waveActive(),
      this.currentWaveIndex(),
      this.totalWaves(),
    );
  });

  public readonly upcomingWaveDef = computed(() => {
    const map = this.activeMap();
    const idx = this.waveActive() ? this.currentWaveIndex() + 1 : this.currentWaveIndex();
    return map.waves[idx] ?? null;
  });

  public readonly canRushWave = signal(false);
  private lastWaveStartTimeMs = 0;
  private lastRushTimeMs = 0;
  private lastCallWaveRealTime = 0;

  public readonly waveCompositionSummary = computed(() => {
    const wave = this.upcomingWaveDef();
    if (!wave) return [];

    const summaryMap = new Map<
      MobTypeId,
      {
        count: number;
        mobType: MobTypeId;
        name: string;
        isFlying: boolean;
        armor: number;
        magicResist: number;
        icon: string;
        color: string;
      }
    >();

    for (const g of wave.groups) {
      const def = MOB_TYPES[g.mobType];
      const cur = summaryMap.get(g.mobType);
      if (cur) {
        cur.count += g.count;
      } else {
        summaryMap.set(g.mobType, {
          count: g.count,
          mobType: g.mobType,
          name: def.name,
          isFlying: def.isFlying,
          armor: def.armor,
          magicResist: def.magicResist,
          icon: def.icon,
          color: def.color,
        });
      }
    }
    return Array.from(summaryMap.values());
  });

  private frameId: number | null = null;
  private lastTime = 0;
  private gameTimeMs = 0;
  private spawnQueue: SpawnQueueItem[] = [];

  constructor() {
    this.loadMission(this.campaign.activeMission());
  }

  public loadMission(mission: CampaignMission): void {
    this.campaign.selectMission(mission.id);
    this.loadMap(mission.mapDefinition);
    let startGold = mission.mapDefinition.startingGold;
    for (const mod of mission.modifiers) {
      if (mod.startingGoldBonus) startGold += mod.startingGoldBonus;
    }
    this.gold.set(startGold);
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
    this.isPaused.set(true);
    this.hasUserEngaged.set(false);
    this.isGameOver.set(false);
    this.isVictory.set(false);
    this.selectedTile.set({ x: 0, y: 0 });
    this.towers.set([]);
    this.mobs.set([]);
    this.projectiles.set([]);
    this.floatingTexts.set([]);
    this.particles.set([]);
    this.barricades.set(new Set());
    this.unlockedJobIds.set(new Set());
    this.spawnQueue = [];
    this.countdownRemainingMs.set(this.countdownDurationMs);
    this.isCountdownActive.set(true);
    this.canRushWave.set(false);
    this.lastWaveStartTimeMs = 0;
    this.lastRushTimeMs = 0;
    this.lastCallWaveRealTime = 0;

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
    if (this.isGameOver() || this.isVictory()) return;
    if (this.waveActive()) return; // Never rush from startNextWave!

    const now = Date.now();
    if (now - this.lastCallWaveRealTime < 600) return; // Debounce rapid double-clicks
    this.lastCallWaveRealTime = now;

    if (!this.hasUserEngaged()) {
      this.hasUserEngaged.set(true);
    }
    this.isPaused.set(false);

    if (this.isCountdownActive()) {
      // Early dispatch before countdown finishes -> Gil bonus!
      const bonus = this.earlyCallBonusGold();
      this.isCountdownActive.set(false);
      this.countdownRemainingMs.set(0);

      if (bonus > 0) {
        this.gold.update((g) => g + bonus);
        this.score.update((s) => s + bonus * 15);
        this.audio.playEarlyCallHorn();
        this.addFloatingText(
          `Early Dispatch! +${bonus}G`,
          this.activeMap().width / 2,
          this.activeMap().height / 2,
          '#fbbf24',
          'gold',
        );
      } else {
        this.audio.playWaveStart();
      }

      this.launchWave(this.currentWaveIndex());
      return;
    }

    // Default call when not in countdown and wave not active
    this.audio.playWaveStart();
    this.launchWave(this.currentWaveIndex());
  }

  public rushWave(): void {
    if (this.isGameOver() || this.isVictory()) return;
    if (!this.waveActive()) return;
    if (!this.canRushWave()) return;

    const nextIdx = this.currentWaveIndex() + 1;
    if (nextIdx >= this.totalWaves()) return;

    this.lastRushTimeMs = this.gameTimeMs;
    this.canRushWave.set(false);

    const rushBonus = this.earlyCallBonusGold();
    this.gold.update((g) => g + rushBonus);
    this.score.update((s) => s + rushBonus * 20);
    this.audio.playEarlyCallHorn();
    this.addFloatingText(
      `WAVE RUSH! +${rushBonus}G`,
      this.activeMap().width / 2,
      this.activeMap().height / 2,
      '#f97316',
      'alert',
    );

    this.currentWaveIndex.set(nextIdx);
    this.enqueueWaveMobs(nextIdx);
  }

  private launchWave(waveIdx: number): void {
    const wave = this.activeMap().waves[waveIdx];
    if (!wave) return;

    this.waveActive.set(true);
    this.lastWaveStartTimeMs = this.gameTimeMs;
    this.lastRushTimeMs = this.gameTimeMs;
    this.canRushWave.set(false);
    this.spawnQueue = [];
    this.enqueueWaveMobs(waveIdx);

    const alertEvent = this.story.getWaveAlertEvent(waveIdx + 1);
    if (alertEvent) {
      this.story.startSequence(alertEvent);
    }
  }

  private enqueueWaveMobs(waveIdx: number): void {
    const wave = this.activeMap().waves[waveIdx];
    if (!wave) return;

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
    this.spawnQueue.sort((a, b) => a.spawnTimeMs - b.spawnTimeMs);
  }

  public togglePause(): void {
    if (!this.hasUserEngaged()) {
      this.hasUserEngaged.set(true);
    }
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
    if (!t || t.classId === 'barricade' || t.classId === 'oracle' || t.classId === 'rogue') return;
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

    if (!this.isClassUnlocked(classId)) {
      this.addFloatingText('Job Locked!', x, y, '#ef4444', 'alert');
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

    if (!this.hasUserEngaged()) {
      this.hasUserEngaged.set(true);
      this.isPaused.set(false);
      this.addFloatingText('Defenses Engaged!', x, y - 0.5, '#38bdf8', 'buff');
    }
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
    this.checkJobUnlocks();
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

    // 0. Inter-wave Countdown Management
    if (this.isCountdownActive()) {
      const prevSec = Math.ceil(this.countdownRemainingMs() / 1000);
      const nextMs = Math.max(0, this.countdownRemainingMs() - deltaMs);
      this.countdownRemainingMs.set(nextMs);
      const newSec = Math.ceil(nextMs / 1000);

      // Play tick sound on last 5 seconds transitions
      if (newSec !== prevSec && newSec <= 5 && newSec > 0) {
        this.audio.playCountdownTick();
      }

      if (nextMs <= 0) {
        this.isCountdownActive.set(false);
        this.audio.playWaveStart();
        this.launchWave(this.currentWaveIndex());
      }
    }

    // Check Rush readiness (minimum 1.5s after wave start or previous rush)
    const canRush =
      this.waveActive() &&
      this.currentWaveIndex() < this.totalWaves() - 1 &&
      this.gameTimeMs - this.lastWaveStartTimeMs >= 1500 &&
      this.gameTimeMs - this.lastRushTimeMs >= 1500;
    if (this.canRushWave() !== canRush) {
      this.canRushWave.set(canRush);
    }

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
    return this.rules.calculateOracleBuffs(this.towers());
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
      mob.statusEffects = mob.statusEffects
        .map((e) => ({ ...e, remainingMs: e.remainingMs - deltaSeconds * 1000 }))
        .filter((e) => e.remainingMs > 0);

      const moveResult = this.rules.resolveMobSpeed(
        mob,
        deltaSeconds,
        this.activeMission().modifiers,
      );
      mob.effectiveSpeed = moveResult.effectiveSpeed;

      if (moveResult.isStunned) {
        survivingMobs.push(mob);
        continue;
      }

      const path = mob.isFlying ? this.airPath() : this.groundPath();
      if (path.length === 0) continue;

      const stepDistance = moveResult.stepDistance;

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
          this.campaign.recordMissionResult(
            this.activeMission().id,
            this.currentWaveIndex(),
            this.score(),
            0,
            this.totalWaves(),
          );
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

      if (tower.classId === 'rogue') {
        // Rogue / Thief: Passive economy catalyst and periodic pickpocketing
        const def = TOWER_CLASSES.rogue;
        const lvl = def.levels[tower.level - 1];
        const buff = oracleBuffs.get(tower.id) ?? { speedMult: 1.0, damageMult: 1.0 };
        const effectiveCadence = lvl.cadence / buff.speedMult;

        if (this.gameTimeMs - tower.lastActionTime >= effectiveCadence * 1000) {
          // Find any passing ground creep in range to pickpocket
          const target = this.mobs().find(
            (m) =>
              !m.isDead &&
              !m.hasEscaped &&
              !m.isFlying &&
              Math.hypot(m.x - tower.x, m.y - tower.y) <= lvl.range,
          );
          if (target) {
            tower.lastActionTime = this.gameTimeMs;
            const stolen = lvl.pickpocketGold ?? 2;
            this.gold.update((g) => g + stolen);
            tower.goldGenerated += stolen;
            this.audio.playCoin();
            this.addFloatingText(`+${stolen}G`, target.x, target.y - 0.2, '#facc15', 'gold');
            this.addParticle(target.x, target.y, '#facc15', 0.6, 'aura');
          }
        }
        continue;
      }

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

      case 'red-mage': {
        // Dual-Cast Spellblade: Arcane flame burst damaging ground & air with AoE splash
        this.audio.playExplosion();
        this.spawnProjectile({
          sourceTowerId: tower.id,
          targetMobId: target.id,
          startX: tower.x,
          startY: tower.y,
          currentX: tower.x,
          currentY: tower.y,
          targetX: target.x,
          targetY: target.y,
          speed: 9.5,
          damage,
          damageType: 'magic',
          splashRadius: lvl.splashRadius ?? 1.2,
          visualType: 'fireball',
        });
        break;
      }

      case 'ninja': {
        // Dual-Throw Shinobi: Swift shurikens with lethal critical hit chance
        this.audio.playSlash();
        const isCrit = Math.random() < 0.25;
        const finalDamage = isCrit ? Math.round(damage * 1.75) : damage;
        if (isCrit) {
          this.addFloatingText('CRIT!', target.x, target.y - 0.2, '#06b6d4', 'crit');
        }
        this.spawnProjectile({
          sourceTowerId: tower.id,
          targetMobId: target.id,
          startX: tower.x,
          startY: tower.y,
          currentX: tower.x,
          currentY: tower.y,
          targetX: target.x,
          targetY: target.y,
          speed: 15.0,
          damage: finalDamage,
          damageType: 'physical',
          visualType: 'dagger',
        });
        break;
      }

      case 'samurai': {
        // Iaido Blade Master: 360-degree spirit katana slash sundering armor
        this.audio.playSlash();
        this.addParticle(tower.x, tower.y, '#f43f5e', lvl.range, 'slash');
        const inRange = this.mobs().filter(
          (m) => !m.isFlying && !m.isDead && Math.hypot(m.x - tower.x, m.y - tower.y) <= lvl.range,
        );
        for (const mob of inRange) {
          this.dealDamage(mob, damage, 'physical', tower);
        }
        break;
      }

      case 'paladin': {
        // Holy Stasis Sword: Celestial strike with high chance to lock in stasis
        this.audio.playSlash();
        this.addParticle(target.x, target.y, '#f59e0b', 1.4, 'slash');
        if (lvl.stunChance && Math.random() < lvl.stunChance) {
          target.statusEffects.push({
            type: 'stun',
            intensity: 1.0,
            durationMs: 1400,
            remainingMs: 1400,
          });
          this.addFloatingText('STASIS!', target.x, target.y, '#f59e0b', 'alert');
        }
        this.dealDamage(target, damage, 'physical', tower);
        break;
      }

      case 'astrologian': {
        // Cosmic Star Meteor: Gravitational comet crash causing massive AoE and gravitational slow
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
          speed: 8.0,
          damage,
          damageType: 'magic',
          splashRadius: lvl.splashRadius ?? 2.0,
          slowPercent: lvl.slowPercent ?? 0.35,
          slowDuration: lvl.slowDuration ?? 3.0,
          visualType: 'time-orb',
        });
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
        if (proj.slowPercent) {
          mob.statusEffects.push({
            type: 'slow',
            intensity: proj.slowPercent,
            durationMs: (proj.slowDuration ?? 3) * 1000,
            remainingMs: (proj.slowDuration ?? 3) * 1000,
          });
        }
        if (proj.stunChance && Math.random() < proj.stunChance) {
          mob.statusEffects.push({
            type: 'stun',
            intensity: 1.0,
            durationMs: 1200,
            remainingMs: 1200,
          });
        }
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
    const dmg = this.rules.calculateEffectiveDamage(
      rawDamage,
      damageType,
      mob,
      this.activeMission().modifiers,
    );
    const effectiveDamage = dmg.effectiveDamage;

    mob.hp -= effectiveDamage;
    if (tower) {
      tower.damageDealt += effectiveDamage;
    }

    this.addFloatingText(
      `-${effectiveDamage}`,
      mob.x + (Math.random() - 0.5) * 0.4,
      mob.y - 0.2,
      dmg.textColor,
      dmg.textType,
    );

    if (mob.hp <= 0 && !mob.isDead) {
      mob.isDead = true;
      this.onMobDefeated(mob, tower);
    }
  }

  private onMobDefeated(mob: MobInstance, tower: TowerInstance | null): void {
    const bounty = this.rules.calculateKillBounty(
      mob,
      this.towers(),
      this.activeMission().modifiers,
    );
    const earnedGold = bounty.earnedGold;
    const bonusGold = bounty.bonusGold;
    const plunderRogue = bounty.plunderRogue;
    const bestMultiplier = bounty.multiplier;

    this.gold.update((g) => g + earnedGold);
    this.score.update((s) => s + earnedGold * 10);
    this.audio.playCoin();

    if (tower) {
      tower.kills++;
    }

    if (plunderRogue && bonusGold > 0) {
      plunderRogue.goldGenerated += bonusGold;
      this.addFloatingText(
        `+${earnedGold}G (x${bestMultiplier} Plunder!)`,
        mob.x,
        mob.y,
        '#facc15',
        'gold',
      );
      this.addParticle(plunderRogue.x, plunderRogue.y, '#facc15', 1.2, 'aura');
    } else {
      this.addFloatingText(`+${mob.goldReward}G`, mob.x, mob.y, '#fbbf24', 'gold');
    }

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
        this.isCountdownActive.set(false);

        // FFCD Authentic Clear Bonus Calculation
        const crystalHonorBonus = this.crystals() * 1000;
        const goldHonorBonus = this.gold() * 10;
        const totalHonorScore = this.score() + crystalHonorBonus + goldHonorBonus;
        this.score.set(totalHonorScore);

        this.campaign.recordMissionResult(
          this.activeMission().id,
          31,
          totalHonorScore,
          this.crystals(),
          31,
        );
      } else {
        this.currentWaveIndex.set(nextIdx);
        this.isCountdownActive.set(true);
        this.countdownRemainingMs.set(this.countdownDurationMs);
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
