import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameService } from './game.service';
import { MAP_VERDANT_CROSSROADS } from '../models/map.model';
import { MobInstance } from '../models/mob.model';

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
    // Maze slot at (5, 3) on Verdant Crossroads
    const success = service.placeTower(5, 3, 'barricade');
    expect(success).toBe(true);
    expect(service.barricades().has('5,3')).toBe(true);
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

  it('initializes with 31 waves and an active inter-wave preparation countdown', () => {
    expect(service.totalWaves()).toBe(31);
    expect(service.isCountdownActive()).toBe(true);
    expect(service.countdownRemainingMs()).toBe(20000);
    expect(service.secondsRemaining()).toBe(20);
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
});
