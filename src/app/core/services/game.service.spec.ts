import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameService } from './game.service';
import { ALL_MAPS, MAP_VERDANT_CROSSROADS } from '../models/map.model';
import { MOB_TYPES, MobInstance } from '../models/mob.model';
import { ORACLE_XP_SHARE, TOWER_CLASSES, XP_PER_KILL_GOLD } from '../models/tower.model';

describe('GameService', () => {
  let service: GameService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GameService);
    service.loadMap(MAP_VERDANT_CROSSROADS);
  });

  it('initializes with starting gold, crystals, and paths', () => {
    expect(service.gold()).toBe(MAP_VERDANT_CROSSROADS.startingGold);
    expect(service.crystals()).toBe(20);
    expect(service.groundPath().length).toBeGreaterThan(0);
    expect(service.airPath().length).toBeGreaterThan(0);
  });

  describe('linear wave health', () => {
    it.each(ALL_MAPS)('scales every group through the finale on $name', (map) => {
      service.loadMap(map);
      map.waves.forEach((wave, index) => {
        service['spawnQueue'] = [];
        service['enqueueWaveMobs'](index);
        for (const group of wave.groups) {
          const queued = service['spawnQueue'].filter((mob) => mob.mobType === group.mobType);
          expect(queued).toHaveLength(group.count);
          for (const mob of queued) {
            expect(mob.hpMultiplier).toBeCloseTo((group.hpMultiplier ?? 1) * (1 + index * 0.05));
          }
        }
      });
    });

    it("keeps each queued wave's health when waves overlap", () => {
      service['enqueueWaveMobs'](0);
      service['enqueueWaveMobs'](1);
      service.currentWaveIndex.set(2);
      const skulkers = service['spawnQueue'].filter((mob) => mob.mobType === 'skulker');
      expect(skulkers.map((mob) => mob.hpMultiplier).sort()).toEqual([
        ...Array(8).fill(1),
        ...Array(5).fill(1.05),
      ]);
      for (const queued of skulkers) service['spawnMob'](queued.mobType, queued.hpMultiplier);
      expect(
        service
          .mobs()
          .map((mob) => mob.maxHp)
          .sort((a, b) => a - b),
      ).toEqual([...Array(8).fill(90), ...Array(5).fill(95)]);
    });

    it('applies the full 150% increase to the final super boss and its escorts', () => {
      service['enqueueWaveMobs'](30);
      for (const queued of service['spawnQueue']) {
        service['spawnMob'](queued.mobType, queued.hpMultiplier);
      }
      const boss = service.mobs().find((mob) => mob.typeId === 'iron-colossus')!;
      expect(boss.hp).toBe(Math.round(MOB_TYPES['iron-colossus'].baseHp * 1.5 * 2.5));
      for (const mob of service.mobs()) {
        expect(mob.hp).toBe(mob.maxHp);
        expect(mob.baseSpeed).toBe(MOB_TYPES[mob.typeId].baseSpeed);
        expect(mob.goldReward).toBe(MOB_TYPES[mob.typeId].goldReward);
      }
    });
  });

  describe('Oracle holy bolt', () => {
    it.each([1, 2, 3, 4, 5])('attacks ground and air at level %i while buffing allies', (level) => {
      service.gold.set(5000);
      service.placeTower(0, 0, 'oracle');
      service.placeTower(1, 0, 'blade-warden');
      const [oracle, ally] = service.towers();
      oracle.level = level;
      const config = TOWER_CLASSES.oracle.levels[level - 1];
      const buffs = service['calculateTowerBuffs']();
      expect(buffs.get(ally.id)?.speedMult).toBeCloseTo(1 + config.buffSpeedPercent!);
      expect(buffs.get(ally.id)?.damageMult).toBeCloseTo(1 + config.buffDamagePercent!);

      for (const type of ['skulker', 'dread-gaze'] as const) {
        service.mobs.set([]);
        service['spawnMob'](type, 1);
        const mob = service.mobs()[0];
        Object.assign(mob, { x: 0, y: 1 });
        service['gameTimeMs'] += 1000;
        service['updateTowers'](buffs);
        const bolt = service.projectiles().find((proj) => proj.sourceTowerId === oracle.id)!;
        expect(bolt.targetMobId).toBe(mob.id);
        expect(mob.statusEffects).toEqual([]); // The halt starts on impact, not on cast.
        const hp = mob.hp;
        service['updateProjectiles'](1);
        const damage = Math.max(1, Math.round(config.damage * (1 - mob.magicResist)));
        expect(hp - mob.hp).toBe(damage);
        expect(mob.statusEffects).toContainEqual({
          type: 'stun',
          intensity: 1,
          durationMs: 300,
          remainingMs: 300,
        });
        // No second bolt before the one-second cadence has elapsed.
        service['updateTowers'](buffs);
        expect(service.projectiles().some((proj) => proj.sourceTowerId === oracle.id)).toBe(false);
      }
    });

    it.each(['skulker', 'swiftbeak', 'dread-gaze', 'iron-colossus'] as const)(
      'briefly stops %s, then lets it resume moving',
      (type) => {
        service.placeTower(0, 0, 'oracle');
        service['spawnMob'](type, 1);
        const mob = service.mobs()[0];
        const position = { x: mob.x, y: mob.y, walked: mob.pathLengthWalked };
        service['gameTimeMs'] = 1000;
        service['updateTowers'](new Map());
        service['updateProjectiles'](1);
        service['updateMobs'](0.1);
        expect({ x: mob.x, y: mob.y, walked: mob.pathLengthWalked }).toEqual(position);
        expect(mob.effectiveSpeed).toBe(0);
        service['updateMobs'](0.21);
        expect(mob.statusEffects).toEqual([]);
        expect(mob.pathLengthWalked).toBeGreaterThan(position.walked);
      },
    );

    it('allows Oracle target priorities to be cycled', () => {
      service.placeTower(0, 0, 'oracle');
      const oracle = service.towers()[0];
      service.cycleTargetPriorityForTower(oracle.id);
      expect(service.towers()[0].targetPriority).toBe('strongest');
    });
  });

  it('keeps Samurai locked with the old Warrior and Berserker pairing', () => {
    service.gold.set(5000);
    service.placeTower(0, 0, 'blade-warden');
    service.placeTower(1, 0, 'juggernaut');
    for (const tower of service.towers()) service.upgradeTower(tower.id);
    expect(service.isClassUnlocked('samurai')).toBe(false);
  });

  it.each([
    [2, 0, 3],
    [3, 6, 5],
    [4, 10, 8],
    [5, 16, 14],
  ])(
    'Rogue level %i mugs for %i damage through 50%% armor while stealing %i gold',
    (level, damage, stolen) => {
      service.placeTower(0, 0, 'rogue');
      const rogue = service.towers()[0];
      rogue.level = level;
      service['spawnMob']('skulker', 1);
      const mob = service.mobs()[0];
      Object.assign(mob, { x: 0, y: 1, hp: 1000, maxHp: 1000, armor: 0.5 });
      const gold = service.gold();
      service['gameTimeMs'] = 10000;
      service['updateTowers'](new Map());
      expect(mob.hp).toBe(1000 - damage);
      expect(rogue.damageDealt).toBe(damage);
      expect(service.gold()).toBe(gold + stolen);
      expect(rogue.goldGenerated).toBe(stolen);
      service['updateTowers'](new Map());
      expect(mob.hp).toBe(1000 - damage);
      expect(service.gold()).toBe(gold + stolen);
    },
  );

  it('does not Mug dead, escaped, flying, or out-of-range monsters', () => {
    service.placeTower(0, 0, 'rogue');
    service.towers()[0].level = 5;
    for (let i = 0; i < 4; i++) service['spawnMob']('skulker', 1);
    service.mobs().forEach((mob, i) =>
      Object.assign(mob, {
        x: i === 3 ? 10 : 0,
        y: 1,
        isDead: i === 0,
        hasEscaped: i === 1,
        isFlying: i === 2,
      }),
    );
    const gold = service.gold();
    const health = service.mobs().map((mob) => mob.hp);
    service['gameTimeMs'] = 10000;
    service['updateTowers'](new Map());
    expect(service.gold()).toBe(gold);
    expect(service.mobs().map((mob) => mob.hp)).toEqual(health);
  });

  it('credits Ninja with loot-aura gold and support experience when an ally kills', () => {
    service.gold.set(5000);
    service.unlockedJobIds.set(new Set(['ninja']));
    service.placeTower(0, 0, 'ninja');
    service.placeTower(1, 0, 'blade-warden');
    const [ninja, ally] = service.towers();
    service['spawnMob']('skulker', 1);
    const mob = service.mobs()[0];
    Object.assign(mob, { x: 0, y: 1, hp: 1, goldReward: 20 });
    const gold = service.gold();
    service.dealDamage(mob, 100, 'pure', ally);
    expect(service.gold()).toBe(gold + 30);
    expect(ninja.goldGenerated).toBe(10);
    expect(ninja.xp).toBe(100);
  });

  it('lets a Bard loose song arrows at flyers while its hymn hastens nearby allies', () => {
    service.gold.set(5000);
    service.unlockedJobIds.set(new Set(['bard']));
    service.placeTower(0, 0, 'bard');
    service.placeTower(1, 0, 'blade-warden');
    const [bard, ally] = service.towers();
    const buffs = service['calculateTowerBuffs']();
    expect(buffs.get(ally.id)?.speedMult).toBeCloseTo(1.15);
    service['spawnMob']('dread-gaze', 1);
    const mob = service.mobs()[0];
    Object.assign(mob, { x: 0, y: 1 });
    service['gameTimeMs'] = 10000;
    service['updateTowers'](buffs);
    expect(service.projectiles()).toContainEqual(
      expect.objectContaining({
        sourceTowerId: bard.id,
        targetMobId: mob.id,
        visualType: 'song-arrow',
      }),
    );
  });

  it('places a Blade Warden on a build tile when sufficient gold is available', () => {
    // Coordinate (0, 0) is 'B' (Build)
    const success = service.placeTower(0, 0, 'blade-warden');
    expect(success).toBe(true);
    expect(service.towers().length).toBe(1);
    expect(service.gold()).toBe(MAP_VERDANT_CROSSROADS.startingGold - 100);
  });

  it('rejects tower placement on path tiles', () => {
    // Coordinate (1, 1) is 'P' (Path)
    const success = service.placeTower(1, 1, 'blade-warden');
    expect(success).toBe(false);
    expect(service.towers().length).toBe(0);
  });

  it('upgrades a placed tower and deducts gold', () => {
    service.placeTower(0, 0, 'blade-warden');
    const tower = service.towers()[0];

    const upgradeSuccess = service.upgradeTower(tower.id);
    expect(upgradeSuccess).toBe(true);

    const upgradedTower = service.towers()[0];
    expect(upgradedTower.level).toBe(2);
    expect(upgradedTower.totalInvested).toBe(220); // 100 + 120
  });

  it('sells a tower with 70% refund', () => {
    service.placeTower(0, 0, 'blade-warden');
    const goldBeforeSell = service.gold();
    const tower = service.towers()[0];

    service.sellTower(tower.id);
    expect(service.towers().length).toBe(0);
    expect(service.gold()).toBe(goldBeforeSell + 70); // 70% of 100
  });

  it('places an Aether Barricade on a maze slot and recalculates paths', () => {
    // Maze slot at (9, 2) on Verdant Crossroads
    const openLength = service.groundPath().length;
    const success = service.placeTower(9, 2, 'barricade');
    expect(success).toBe(true);
    expect(service.barricades().has('9,2')).toBe(true);
    expect(service.groundPath().length).toBeGreaterThan(openLength);
  });

  it('reroutes marching monsters from where they stand when a barricade goes up', () => {
    const mob: MobInstance = {
      id: 'marcher',
      typeId: 'skulker',
      name: 'Skulker',
      icon: '👺',
      color: '#10b981',
      hp: 1000,
      maxHp: 1000,
      baseSpeed: 1,
      effectiveSpeed: 1,
      armor: 0,
      magicResist: 0,
      isFlying: false,
      crystalLoss: 1,
      goldReward: 0,
      // Halfway between waypoints (7, 1) and (8, 1) on the open road
      x: 7.5,
      y: 1,
      waypointIndex: 7,
      pathLengthWalked: 7.5,
      statusEffects: [],
      isDead: false,
      hasEscaped: false,
      spawnTimeMs: 0,
    };
    service.mobs.set([mob]);

    service.placeTower(9, 2, 'barricade');

    const route = mob.route!;
    expect(route[0]).toEqual({ x: 7.5, y: 1 });
    expect(route[route.length - 1]).toEqual({ x: 11, y: 7 });
    expect(route.some((p) => p.x === 9 && p.y === 2)).toBe(false);

    // March it home: every step stays on walkable ground, never phasing through walls
    const walkable = new Set(['P', 'S', 'C', 'M']);
    for (let i = 0; i < 400 && !mob.hasEscaped; i++) {
      service['updateMobs'](0.1);
      const tile = MAP_VERDANT_CROSSROADS.tiles[Math.round(mob.y)][Math.round(mob.x)];
      expect(walkable.has(tile)).toBe(true);
      expect(`${Math.round(mob.x)},${Math.round(mob.y)}`).not.toBe('9,2');
    }
    expect(mob.hasEscaped).toBe(true);
  });

  it('cycles game speed between 1x, 2x, and 4x', () => {
    expect(service.gameSpeed()).toBe(1);
    service.cycleSpeed();
    expect(service.gameSpeed()).toBe(2);
    service.cycleSpeed();
    expect(service.gameSpeed()).toBe(4);
    service.cycleSpeed();
    expect(service.gameSpeed()).toBe(1);
  });

  it('initializes with 31 waves, active countdown, and starts out paused until user engages', () => {
    expect(service.totalWaves()).toBe(31);
    expect(service.isCountdownActive()).toBe(true);
    expect(service.countdownRemainingMs()).toBe(20000);
    expect(service.secondsRemaining()).toBe(20);
    expect(service.isPaused()).toBe(true);
    expect(service.hasUserEngaged()).toBe(false);
  });

  it('automatically unpauses and marks engaged when first tower is placed', () => {
    expect(service.isPaused()).toBe(true);
    expect(service.hasUserEngaged()).toBe(false);

    // Place a blade warden at (0, 0)
    const placed = service.placeTower(0, 0, 'blade-warden');
    expect(placed).toBe(true);
    expect(service.hasUserEngaged()).toBe(true);
    expect(service.isPaused()).toBe(false);
  });

  it('unpauses and marks engaged when play button (togglePause) is pressed', () => {
    expect(service.isPaused()).toBe(true);
    expect(service.hasUserEngaged()).toBe(false);

    service.togglePause();
    expect(service.hasUserEngaged()).toBe(true);
    expect(service.isPaused()).toBe(false);
  });

  it('awards early dispatch gold bonus when calling wave during countdown', () => {
    const initialGold = service.gold();
    const expectedBonus = service.earlyCallBonusGold();
    expect(expectedBonus).toBeGreaterThan(0);

    service.startNextWave();

    expect(service.gold()).toBe(initialGold + expectedBonus);
    expect(service.isCountdownActive()).toBe(false);
    expect(service.waveActive()).toBe(true);
  });

  it('calling startNextWave during an active wave does not rush or double-call waves', () => {
    service.startNextWave();
    expect(service.waveActive()).toBe(true);
    const waveIndex = service.currentWaveIndex();

    // Secondary call while wave is active
    service.startNextWave();

    // Wave index must remain unchanged and not rushed
    expect(service.currentWaveIndex()).toBe(waveIndex);
  });

  it('rushWave requires canRushWave to be active before dispatching', () => {
    service.startNextWave();
    expect(service.canRushWave()).toBe(false);

    const initialIdx = service.currentWaveIndex();
    // Immediate rush attempt is blocked by safety lockout
    service.rushWave();
    expect(service.currentWaveIndex()).toBe(initialIdx);

    // When ready
    service.canRushWave.set(true);
    service.rushWave();
    expect(service.currentWaveIndex()).toBe(initialIdx + 1);
  });

  it('generates rich monster composition summary for tactical scouting', () => {
    const summary = service.waveCompositionSummary();
    expect(summary.length).toBeGreaterThan(0);
    expect(summary[0].name).toBeDefined();
    expect(summary[0].count).toBeGreaterThan(0);
  });

  it('multiplies kill gold when monster defeated within Rogue plunder aura', () => {
    // Coordinate (0, 0) is 'B' (Build)
    service.placeTower(0, 0, 'rogue');
    const rogue = service.towers()[0];
    expect(rogue.classId).toBe('rogue');

    // Cycle priority should not affect rogue (it's passive utility)
    service.cycleTargetPriorityForTower(rogue.id);
    expect(rogue.targetPriority).toBe('first');

    const testMob: MobInstance = {
      id: 'test-mob-1',
      typeId: 'skulker',
      name: 'Skulker',
      icon: '👾',
      color: '#a3e635',
      hp: 10,
      maxHp: 10,
      baseSpeed: 1,
      effectiveSpeed: 1,
      armor: 0,
      magicResist: 0,
      isFlying: false,
      crystalLoss: 1,
      goldReward: 20,
      x: 1,
      y: 0, // Distance to (0, 0) is 1.0, within range 2.2
      waypointIndex: 0,
      pathLengthWalked: 0,
      statusEffects: [],
      isDead: false,
      hasEscaped: false,
      spawnTimeMs: 0,
    };
    service.mobs.set([testMob]);

    const initialGold = service.gold();
    // Deal lethal damage
    service.dealDamage(testMob, 20, 'physical', null);

    // Lv 1 rogue has killGoldMultiplier = 1.5 => 20 * 1.5 = 30G
    expect(service.gold()).toBe(initialGold + 30);
    // rogue.goldGenerated tracks bonus (30 - 20 = 10)
    expect(rogue.goldGenerated).toBe(10);
  });

  it('does not multiply kill gold when monster defeated outside Rogue plunder aura', () => {
    service.placeTower(0, 0, 'rogue');
    const rogue = service.towers()[0];

    const testMob: MobInstance = {
      id: 'test-mob-2',
      typeId: 'skulker',
      name: 'Skulker',
      icon: '👾',
      color: '#a3e635',
      hp: 10,
      maxHp: 10,
      baseSpeed: 1,
      effectiveSpeed: 1,
      armor: 0,
      magicResist: 0,
      isFlying: false,
      crystalLoss: 1,
      goldReward: 20,
      x: 8,
      y: 5, // Far outside range 2.2
      waypointIndex: 0,
      pathLengthWalked: 0,
      statusEffects: [],
      isDead: false,
      hasEscaped: false,
      spawnTimeMs: 0,
    };
    service.mobs.set([testMob]);

    const initialGold = service.gold();
    service.dealDamage(testMob, 20, 'physical', null);

    expect(service.gold()).toBe(initialGold + 20);
    expect(rogue.goldGenerated).toBe(0);
  });

  it('enforces FFT job unlock progression: Red Mage unlocks when Elementalist and Oracle reach Lv 2', () => {
    // Red Mage starts locked
    expect(service.isClassUnlocked('red-mage')).toBe(false);

    // Give enough gold for testing
    service.gold.set(5000);

    // Try placing Red Mage on build tile (0, 0)
    const placedEarly = service.placeTower(0, 0, 'red-mage');
    expect(placedEarly).toBe(false);
    expect(service.towers().length).toBe(0);

    // Place Elementalist at (0, 0) and Oracle at (0, 2)
    service.placeTower(0, 0, 'elementalist');
    service.placeTower(0, 2, 'oracle');

    const elem = service.towers().find((t) => t.classId === 'elementalist')!;
    const oracle = service.towers().find((t) => t.classId === 'oracle')!;

    // Upgrade Elementalist to Lv 2
    service.upgradeTower(elem.id);
    expect(service.isClassUnlocked('red-mage')).toBe(false);

    // Upgrade Oracle to Lv 2 -> Red Mage unlocks!
    service.upgradeTower(oracle.id);
    expect(service.isClassUnlocked('red-mage')).toBe(true);

    // Now Red Mage can be placed on build tile (0, 3)
    const placedRedMage = service.placeTower(0, 3, 'red-mage');
    expect(placedRedMage).toBe(true);
    expect(service.towers().some((t) => t.classId === 'red-mage')).toBe(true);
  });

  it('enforces FFT job unlock progression: Bard unlocks when Ranger and Oracle reach Lv 2', () => {
    expect(service.isClassUnlocked('bard')).toBe(false);
    service.gold.set(5000);
    expect(service.placeTower(0, 0, 'bard')).toBe(false);

    service.placeTower(0, 0, 'ranger');
    service.placeTower(0, 2, 'oracle');
    const ranger = service.towers().find((t) => t.classId === 'ranger')!;
    const oracle = service.towers().find((t) => t.classId === 'oracle')!;

    service.upgradeTower(ranger.id);
    expect(service.isClassUnlocked('bard')).toBe(false);

    service.upgradeTower(oracle.id);
    expect(service.isClassUnlocked('bard')).toBe(true);
    expect(service.placeTower(0, 3, 'bard')).toBe(true);
  });

  it('enforces FFT job unlock progression: Ninja unlocks when Ranger and Rogue reach Lv 2', () => {
    expect(service.isClassUnlocked('ninja')).toBe(false);
    service.gold.set(5000);

    service.placeTower(0, 0, 'ranger');
    service.placeTower(0, 2, 'rogue');

    const ranger = service.towers().find((t) => t.classId === 'ranger')!;
    const rogue = service.towers().find((t) => t.classId === 'rogue')!;

    service.upgradeTower(ranger.id);
    service.upgradeTower(rogue.id);

    expect(service.isClassUnlocked('ninja')).toBe(true);
  });

  it('enforces FFT job unlock progression: Samurai unlocks when Lancer and Juggernaut reach Lv 2', () => {
    expect(service.isClassUnlocked('samurai')).toBe(false);
    service.gold.set(5000);

    service.placeTower(0, 0, 'lancer');
    service.placeTower(0, 2, 'juggernaut');

    const lancer = service.towers().find((t) => t.classId === 'lancer')!;
    const jugg = service.towers().find((t) => t.classId === 'juggernaut')!;

    service.upgradeTower(lancer.id);
    service.upgradeTower(jugg.id);

    expect(service.isClassUnlocked('samurai')).toBe(true);
  });

  describe('hero experience', () => {
    const makeMob = (hp: number, goldReward = 6): MobInstance => ({
      id: 'mob-xp',
      typeId: 'skulker',
      name: 'Skulker',
      icon: '👺',
      color: '#10b981',
      hp,
      maxHp: hp,
      baseSpeed: 1,
      effectiveSpeed: 1,
      armor: 0,
      magicResist: 0,
      isFlying: false,
      crystalLoss: 1,
      goldReward,
      x: 1,
      y: 1,
      waypointIndex: 0,
      pathLengthWalked: 0,
      statusEffects: [],
      isDead: false,
      hasEscaped: false,
      spawnTimeMs: 0,
    });
    const flush = () =>
      (service as unknown as { flushTowerExperience(): void }).flushTowerExperience();

    it('banks XP from damage and kills', () => {
      service.placeTower(0, 0, 'blade-warden');
      const warden = service.towers()[0];

      service.dealDamage(makeMob(100), 40, 'pure', warden);
      expect(warden.xp).toBe(40);

      // Killing blow: only the 10 HP actually removed counts, plus the kill bounty XP
      service.dealDamage(makeMob(10, 6), 40, 'pure', warden);
      expect(warden.xp).toBe(40 + 10 + 6 * XP_PER_KILL_GOLD);
    });

    it('promotes a hero for free once its XP bar fills', () => {
      service.placeTower(0, 0, 'blade-warden');
      const goldAfterPlacing = service.gold();
      const warden = service.towers()[0];
      const needed = service.rules.xpToNextLevel(warden)!;

      warden.xp = needed - 5;
      service.dealDamage(makeMob(100), 25, 'pure', warden);
      flush();

      const promoted = service.towers()[0];
      expect(promoted.level).toBe(2);
      expect(promoted.xp).toBe(20);
      expect(promoted.totalInvested).toBe(100); // free promotion doesn't inflate refunds
      expect(service.gold()).toBe(goldAfterPlacing);
      expect(service.floatingTexts().some((t) => t.style === 'levelup')).toBe(true);
    });

    it('free promotions count toward job unlocks', () => {
      service.gold.set(5000);
      service.placeTower(0, 0, 'lancer');
      service.placeTower(0, 2, 'juggernaut');
      const lancer = service.towers().find((t) => t.classId === 'lancer')!;
      const jugg = service.towers().find((t) => t.classId === 'juggernaut')!;

      lancer.xp = service.rules.xpToNextLevel(lancer)! - 1;
      jugg.xp = service.rules.xpToNextLevel(jugg)! - 1;
      service.dealDamage(makeMob(100), 1, 'pure', lancer);
      service.dealDamage(makeMob(100), 1, 'pure', jugg);
      flush();

      expect(service.isClassUnlocked('samurai')).toBe(true);
    });

    it('shares a cut of earned XP with Oracles whose halo covers the hero', () => {
      service.gold.set(5000);
      service.placeTower(0, 0, 'blade-warden');
      service.placeTower(1, 0, 'oracle');
      const warden = service.towers().find((t) => t.classId === 'blade-warden')!;
      const oracle = service.towers().find((t) => t.classId === 'oracle')!;

      service.dealDamage(makeMob(1000), 100, 'pure', warden);
      expect(oracle.xp).toBe(100 * ORACLE_XP_SHARE);
    });

    it('stops accruing XP at max level', () => {
      service.placeTower(0, 0, 'blade-warden');
      const warden = service.towers()[0];
      warden.level = 5;

      service.dealDamage(makeMob(100), 50, 'pure', warden);
      expect(warden.xp).toBe(0);
    });
  });
});
