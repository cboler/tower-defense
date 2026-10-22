import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  afterEach(() => vi.restoreAllMocks());

  it.each([1, 2, 3, 4, 5])(
    'Samurai level %i delivers one heavy katana hit and cleaves other ground foes',
    (level) => {
      service.gold.set(10000);
      service.unlockedJobIds.set(new Set(['samurai']));
      service.placeTower(0, 0, 'samurai');
      const tower = service.towers()[0];
      tower.level = level;
      for (const type of ['skulker', 'bonewalker', 'dread-gaze', 'swiftbeak'] as const)
        service['spawnMob'](type, 1);
      service
        .mobs()
        .forEach((mob, i) =>
          Object.assign(mob, { x: i === 3 ? 5 : 0.2 * i, y: 1, hp: 10000, armor: 0.2 }),
        );
      const config = TOWER_CLASSES.samurai.levels[level - 1];
      service['executeTowerAttack'](tower, service.mobs()[0], config, config.damage, config.range);
      expect(service.mobs()[0].hp).toBe(10000 - Math.round(config.damage * 2 * 0.8));
      expect(service.mobs()[1].hp).toBe(10000 - Math.round(config.damage * 0.8));
      expect(service.mobs()[2].hp).toBe(10000);
      expect(service.mobs()[3].hp).toBe(10000);
    },
  );

  describe('Learned criticals and source-aware slows', () => {
    it.each(['ranger', 'ninja'] as const)(
      '%s learns criticals at level 3 and improves through level 5',
      (classId) => {
        service.gold.set(10000);
        service.unlockedJobIds.set(new Set(['ninja']));
        service.placeTower(0, 0, classId);
        const tower = service.towers()[0];
        service['spawnMob']('dread-gaze', 1);
        const target = service.mobs()[0];
        Object.assign(target, { hp: 100000, armor: 0 });
        const random = vi.spyOn(Math, 'random');
        const chances = classId === 'ranger' ? [0, 0, 0.15, 0.25, 0.35] : [0, 0, 0.25, 0.35, 0.45];
        for (let level = 1; level <= 5; level++) {
          tower.level = level;
          const config = TOWER_CLASSES[classId].levels[level - 1];
          for (const roll of [0, chances[level - 1]]) {
            random.mockReturnValue(roll);
            service.projectiles.set([]);
            service['executeTowerAttack'](tower, target, config, 100, config.range);
            const shot = service.projectiles()[0];
            const critical = roll < chances[level - 1];
            expect(shot.isCritical).toBe(critical);
            expect(shot.damage).toBe(critical ? 175 : 100);
            const hp = target.hp;
            service['updateProjectiles'](1);
            expect(hp - target.hp).toBe(
              Math.round((critical ? 175 : 100) * (classId === 'ranger' ? 1.5 : 1)),
            );
          }
        }
      },
    );

    it('quakes slow ground enemies once per class, combine with ice and chrono, and expire independently', () => {
      service.gold.set(10000);
      service.placeTower(0, 0, 'juggernaut');
      const tower = service.towers()[0];
      tower.level = 5;
      for (const type of ['skulker', 'dread-gaze', 'bonewalker'] as const)
        service['spawnMob'](type, 1);
      service.mobs().forEach((m, i) => Object.assign(m, { x: i === 2 ? 5 : 0, y: 1, hp: 100000 }));
      const [target, flyer, outside] = service.mobs();
      service['applySlow'](target, 0.4, 3000, 'chronomancer');
      service['applySlow'](target, 0.3, 2000, 'elementalist');
      const config = TOWER_CLASSES.juggernaut.levels[4];
      for (let i = 0; i < 5; i++)
        service['executeTowerAttack'](tower, target, config, 1, config.range);
      expect(target.statusEffects.filter((e) => e.type === 'unsteady')).toHaveLength(1);
      expect(service.rules.resolveMobSpeed(target, 0.1).effectiveSpeed).toBeCloseTo(
        target.baseSpeed * 0.6 * 0.7 * 0.8,
      );
      expect(flyer.statusEffects).toEqual([]);
      expect(outside.statusEffects).toEqual([]);
      service['updateMobs'](1.6);
      expect(target.effectiveSpeed).toBeCloseTo(target.baseSpeed * 0.6 * 0.7);
      service['updateMobs'](0.5);
      expect(target.effectiveSpeed).toBeCloseTo(target.baseSpeed * 0.6);
    });

    it('keeps a weaker follow-up without extending a stronger slow, and preserves sources after sale', () => {
      service['spawnMob']('skulker', 1);
      const target = service.mobs()[0];
      service['applySlow'](target, 0.7, 500, 'chronomancer');
      service['applySlow'](target, 0.4, 3000, 'chronomancer');
      expect(service.rules.resolveMobSpeed(target, 0.1).effectiveSpeed).toBeCloseTo(
        target.baseSpeed * 0.3,
      );
      service['updateMobs'](0.6);
      expect(target.effectiveSpeed).toBeCloseTo(target.baseSpeed * 0.6);
      service.placeTower(0, 0, 'elementalist');
      const tower = service.towers()[0];
      tower.level = 2;
      tower.spellIndex = 1;
      const config = TOWER_CLASSES.elementalist.levels[1];
      target.hp = 100000;
      service['executeTowerAttack'](tower, target, config, 1, config.range);
      service.sellTower(tower.id);
      service['updateProjectiles'](1);
      expect(target.statusEffects.some((e) => e.slowSource === 'elementalist')).toBe(true);
      expect(service.rules.resolveMobSpeed(target, 0.1).effectiveSpeed).toBeCloseTo(
        target.baseSpeed * 0.6 * 0.7,
      );
    });

    it('holds simulation in each menu and preserves the manual pause state', () => {
      vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);
      service.isPaused.set(false);
      const menus = [
        service.isOptionsMenuOpen,
        service.isCommandMenuOpen,
        service.isBestiaryModalOpen,
        service.isScoutOpen,
        service.isCampaignModalOpen,
        service.isAboutModalOpen,
      ];
      for (const menu of menus) {
        menu.set(true);
        const before = service.countdownRemainingMs();
        service['tick'](service['lastTime'] + 100);
        expect(service.countdownRemainingMs()).toBe(before);
        expect(service.isPaused()).toBe(false);
        menu.set(false);
      }
      service['tick'](service['lastTime'] + 100);
      expect(service.countdownRemainingMs()).toBeLessThan(service.countdownDurationMs);
      service.isPaused.set(true);
      service.isBestiaryModalOpen.set(true);
      service.isBestiaryModalOpen.set(false);
      expect(service.isPaused()).toBe(true);
    });
  });

  describe('Elementalist spell progression', () => {
    it.each([
      [1, ['fireball', 'fireball', 'fireball', 'fireball', 'fireball', 'fireball']],
      [2, ['fireball', 'ice-shard', 'fireball', 'ice-shard', 'fireball', 'ice-shard']],
      [3, ['fireball', 'ice-shard', 'lightning-bolt', 'fireball', 'ice-shard', 'lightning-bolt']],
      [4, ['fireball', 'ice-shard', 'lightning-bolt', 'fireball', 'ice-shard', 'lightning-bolt']],
      [5, ['fireball', 'ice-shard', 'lightning-bolt', 'fireball', 'ice-shard', 'lightning-bolt']],
    ] as const)('cycles only spells learned at level %i', (level, expected) => {
      service.placeTower(0, 0, 'elementalist');
      const caster = service.towers()[0];
      caster.level = level;
      service['spawnMob']('skulker', 1);
      const target = service.mobs()[0];
      const config = TOWER_CLASSES.elementalist.levels[level - 1];
      for (const type of expected) {
        service.projectiles.set([]);
        service['executeTowerAttack'](caster, target, config, config.damage, config.range);
        const shot = service.projectiles()[0];
        expect(shot.visualType).toBe(type);
        expect(shot.splashRadius).toBe(config.splashRadius);
        expect(shot.damageType).toBe('magic');
        expect(shot.damage).toBe(config.damage);
        expect(shot.stunDuration).toBe(type === 'lightning-bolt' ? 1 : undefined);
      }
    });

    it('learns ice and lightning through paid and experience promotions', () => {
      service.gold.set(5000);
      service.placeTower(0, 0, 'elementalist');
      service['spawnMob']('skulker', 1);
      const target = service.mobs()[0];
      const cast = () => {
        service.projectiles.set([]);
        const tower = service.towers()[0];
        const level = TOWER_CLASSES.elementalist.levels[tower.level - 1];
        service['executeTowerAttack'](tower, target, level, level.damage, level.range);
        return service.projectiles()[0].visualType;
      };
      expect(cast()).toBe('fireball');
      service.upgradeTower(service.towers()[0].id);
      expect(cast()).toBe('fireball');
      expect(cast()).toBe('ice-shard');
      const caster = service.towers()[0];
      service['grantXp'](caster, service.rules.xpToNextLevel(caster)!);
      service['flushTowerExperience']();
      expect(service.towers()[0].level).toBe(3);
      expect([cast(), cast(), cast()]).toEqual(['fireball', 'ice-shard', 'lightning-bolt']);
    });

    it('slows ground and flying targets in an ice explosion without harming targets outside it', () => {
      service.placeTower(0, 0, 'elementalist');
      const caster = service.towers()[0];
      caster.level = 2;
      caster.spellIndex = 1;
      for (const type of ['skulker', 'dread-gaze', 'bonewalker'] as const)
        service['spawnMob'](type, 1);
      service.mobs().forEach((mob, index) =>
        Object.assign(mob, {
          x: index === 2 ? 3 : index * 0.3,
          y: 1,
          hp: 1000,
          armor: 1,
          magicResist: 0,
        }),
      );
      const level = TOWER_CLASSES.elementalist.levels[1];
      service['executeTowerAttack'](caster, service.mobs()[0], level, level.damage, level.range);
      service['updateProjectiles'](1);
      for (const mob of service.mobs().slice(0, 2)) {
        expect(mob.hp).toBe(915);
        expect(mob.statusEffects).toContainEqual({
          type: 'slow',
          slowSource: 'elementalist',
          intensity: 0.3,
          durationMs: 2000,
          remainingMs: 2000,
        });
        expect(service.rules.resolveMobSpeed(mob, 0.1).effectiveSpeed).toBeCloseTo(
          mob.baseSpeed * 0.7,
        );
      }
      expect(service.mobs()[2].hp).toBe(1000);
      expect(service.mobs()[2].statusEffects).toEqual([]);
      expect(service.particles().some((effect) => effect.color === '#7dd3fc')).toBe(true);
    });

    it.each(Object.values(MOB_TYPES))(
      'lightning stuns $name for 1s and respects its recovery window',
      (def) => {
        service.placeTower(0, 0, 'elementalist');
        const caster = service.towers()[0];
        caster.level = 3;
        service['spawnMob'](def.id, 1);
        const target = service.mobs()[0];
        Object.assign(target, { hp: 100000, maxHp: 100000, magicResist: 0 });
        const level = TOWER_CLASSES.elementalist.levels[2];
        const cast = () => {
          caster.spellIndex = 2;
          service['executeTowerAttack'](caster, target, level, level.damage, level.range);
          service['updateProjectiles'](1);
        };
        service['gameTimeMs'] = 1000;
        cast();
        const deadline = 2000 + (def.stunRecoveryMs ?? 1000);
        expect(target.statusEffects).toContainEqual({
          type: 'stun',
          intensity: 1,
          durationMs: 1000,
          remainingMs: 1000,
        });
        expect(service.rules.resolveMobSpeed(target, 0.1).effectiveSpeed).toBe(0);
        expect(target.stunImmuneUntilMs).toBe(deadline);
        service['gameTimeMs'] = 2000;
        service['updateMobs'](1);
        service['gameTimeMs'] = deadline - 1;
        cast();
        expect(target.statusEffects).toEqual([]);
        expect(target.hp).toBe(100000 - level.damage * 2);
        expect(target.stunImmuneUntilMs).toBe(deadline);
        service['gameTimeMs'] = deadline;
        cast();
        expect(target.statusEffects.some((effect) => effect.type === 'stun')).toBe(true);
        expect(service.particles().some((effect) => effect.color === '#facc15')).toBe(true);
      },
    );
  });

  describe('Bard critical aura', () => {
    it.each([
      ['physical', 120],
      ['magic', 90],
      ['pure', 150],
    ] as const)('applies a 1.5x critical before %s mitigation', (type, expected) => {
      service.gold.set(5000);
      service.unlockedJobIds.set(new Set(['bard']));
      service.placeTower(0, 0, 'bard');
      service.placeTower(1, 0, 'blade-warden');
      service['spawnMob']('skulker', 1);
      const mob = service.mobs()[0];
      Object.assign(mob, { hp: 1000, armor: 0.2, magicResist: 0.4 });
      vi.spyOn(Math, 'random').mockReturnValue(0);
      service.dealDamage(mob, 100, type, service.towers()[1]);
      expect(mob.hp).toBe(1000 - expected);
      expect(
        service.floatingTexts().some((t) => t.style === 'crit' && t.text === `CRIT! -${expected}`),
      ).toBe(true);
    });

    it.each([
      ['ranger', 1, 36],
      ['juggernaut', 1, 83],
      ['rogue', 3, 18],
    ] as const)(
      'allows %s attacks to crit through their normal damage path',
      (classId, level, damage) => {
        service.gold.set(5000);
        service.unlockedJobIds.set(new Set(['bard']));
        service.placeTower(0, 0, 'bard');
        service.placeTower(1, 0, classId);
        const [bard, ally] = service.towers();
        ally.level = level;
        service['spawnMob']('skulker', 1);
        const mob = service.mobs()[0];
        Object.assign(mob, { x: 1, y: 1, hp: 1000, armor: 0 });
        service['gameTimeMs'] = bard.lastActionTime = 10000;
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const gold = service.gold();
        service['updateTowers'](service['calculateTowerBuffs']());
        service['updateProjectiles'](1);
        expect(mob.hp).toBe(1000 - damage);
        if (classId === 'rogue') expect(service.gold()).toBe(gold + 5);
      },
    );

    it('combines an Oracle damage buff with a Bard critical', () => {
      service.gold.set(5000);
      service.unlockedJobIds.set(new Set(['bard']));
      service.placeTower(0, 0, 'bard');
      service.placeTower(1, 0, 'blade-warden');
      service.placeTower(2, 0, 'oracle');
      const [bard, , oracle] = service.towers();
      service['spawnMob']('skulker', 1);
      const mob = service.mobs()[0];
      Object.assign(mob, { x: 1, y: 1, hp: 1000, armor: 0 });
      service['gameTimeMs'] = bard.lastActionTime = oracle.lastActionTime = 10000;
      vi.spyOn(Math, 'random').mockReturnValue(0);
      service['updateTowers'](service['calculateTowerBuffs']());
      expect(mob.hp).toBe(944); // round(round(32 * 1.15) * 1.5)
    });

    it.each([
      [0.149, 150],
      [0.15, 100],
    ])('respects the critical chance boundary at roll %s', (roll, damage) => {
      service.gold.set(5000);
      service.unlockedJobIds.set(new Set(['bard']));
      service.placeTower(0, 0, 'bard');
      service.placeTower(1, 0, 'blade-warden');
      service['spawnMob']('skulker', 1);
      const mob = service.mobs()[0];
      mob.hp = 1000;
      vi.spyOn(Math, 'random').mockReturnValue(roll);
      service.dealDamage(mob, 100, 'pure', service.towers()[1]);
      expect(mob.hp).toBe(1000 - damage);
    });

    it('preserves stronger Ninja criticals without multiplying critical bonuses', () => {
      service.gold.set(5000);
      service.unlockedJobIds.set(new Set(['bard', 'ninja']));
      service.placeTower(0, 0, 'bard');
      service.placeTower(1, 0, 'ninja');
      service['spawnMob']('skulker', 1);
      const mob = service.mobs()[0];
      Object.assign(mob, { hp: 1000, armor: 0 });
      const random = vi.spyOn(Math, 'random').mockReturnValue(0);
      const ninja = service.towers()[1];
      ninja.level = 3;
      const level = TOWER_CLASSES.ninja.levels[2];
      const attack = () => service['executeTowerAttack'](ninja, mob, level, 100, level.range);
      attack();
      service['updateProjectiles'](1);
      expect(mob.hp).toBe(825);
      random.mockReturnValue(0.1).mockReturnValueOnce(0.9);
      attack();
      service['updateProjectiles'](1);
      expect(mob.hp).toBe(675);
      random.mockReturnValue(0);
      attack();
      service.sellTower(ninja.id);
      service['updateProjectiles'](1);
      expect(mob.hp).toBe(500);
    });
  });

  describe('boss speed and stun recovery', () => {
    it.each([
      ['bramble-golem', 1.1],
      ['sky-sovereign', 1.5],
      ['iron-colossus', 0.84],
    ] as const)('moves %s at twice its previous speed', (type, speed) => {
      service['spawnMob'](type, 1);
      const boss = service.mobs()[0];
      service['updateMobs'](0.5);
      expect(boss.baseSpeed).toBe(speed);
      expect(boss.pathLengthWalked).toBeCloseTo(speed * 0.5);
    });

    it.each(['bramble-golem', 'sky-sovereign', 'iron-colossus'] as const)(
      'protects %s throughout its stun and for four seconds afterward',
      (type) => {
        service['spawnMob'](type, 1);
        const boss = service.mobs()[0];
        service['gameTimeMs'] = 1000;
        expect(service['applyStun'](boss, 300)).toBe(true);
        expect(boss.stunImmuneUntilMs).toBe(5300);
        service['gameTimeMs'] = 1100;
        expect(service['applyStun'](boss, 1400)).toBe(false);
        expect(boss.statusEffects).toHaveLength(1);
        expect(boss.stunImmuneUntilMs).toBe(5300);
        service['gameTimeMs'] = 1300;
        service['updateMobs'](0.3);
        expect(boss.statusEffects).toEqual([]);
        expect(service['applyStun'](boss, 1200)).toBe(false);
        service['gameTimeMs'] = 5299;
        expect(service['applyStun'](boss, 1200)).toBe(false);
        service['gameTimeMs'] = 5300;
        expect(service['applyStun'](boss, 1200)).toBe(true);
        expect(boss.stunImmuneUntilMs).toBe(10500);
      },
    );

    it.each([
      ['oracle', 300, false],
      ['lancer', 1200, false],
      ['paladin', 1400, false],
      ['oracle', 300, true],
    ] as const)(
      'blocks repeated %s stuns lasting %ims (splash: %s) without blocking damage',
      (classId, duration, splash) => {
        service.gold.set(5000);
        service.unlockedJobIds.set(new Set(['paladin']));
        service.placeTower(0, 0, classId);
        service['spawnMob']('bramble-golem', 1);
        const boss = service.mobs()[0];
        const tower = service.towers()[0];
        const level = TOWER_CLASSES[classId].levels[0];
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const attack = () => {
          service['executeTowerAttack'](tower, boss, level, 1, level.range);
          if (splash) {
            const projectile = service.projectiles()[0];
            projectile.splashRadius = 1;
            projectile.slowPercent = 0.4;
          }
          service['updateProjectiles'](1);
        };
        service['gameTimeMs'] = 1000;
        attack();
        expect(boss.stunImmuneUntilMs).toBe(1000 + duration + 4000);
        const hp = boss.hp;
        const alertCount = service
          .floatingTexts()
          .filter((t) => t.text === 'STUNNED!' || t.text === 'STASIS!').length;
        service['gameTimeMs'] += duration;
        service['updateMobs'](duration / 1000);
        attack();
        expect(boss.statusEffects.some((effect) => effect.type === 'stun')).toBe(false);
        expect(boss.hp).toBe(hp - 1);
        expect(
          service.floatingTexts().filter((t) => t.text === 'STUNNED!' || t.text === 'STASIS!'),
        ).toHaveLength(alertCount);
        if (splash) expect(boss.statusEffects.some((effect) => effect.type === 'slow')).toBe(true);
      },
    );

    it('lets the Colossus break armor during immunity and recover after its stagger', () => {
      service['spawnMob']('iron-colossus', 1);
      const boss = service.mobs()[0];
      service['gameTimeMs'] = 1000;
      service['applyStun'](boss, 300);
      service['gameTimeMs'] = 1100;
      service.dealDamage(boss, boss.maxHp * 0.3, 'pure', null);
      expect(boss.damageStage).toBe(1);
      expect(boss.staggerMs).toBe(1400);
      expect(boss.stunImmuneUntilMs).toBe(6500);
      service['gameTimeMs'] = 1200;
      service.dealDamage(boss, boss.maxHp * 0.25, 'pure', null);
      expect(boss.damageStage).toBe(2);
      expect(boss.staggerMs).toBe(1600);
      expect(boss.stunImmuneUntilMs).toBe(6800);
      expect(service['applyStun'](boss, 1200)).toBe(false);
      expect(service.rules.resolveMobSpeed(boss, 0.1).isStunned).toBe(true);
      service['gameTimeMs'] = 2800;
      service['updateMobs'](1.6);
      expect(boss.effectiveSpeed).toBeCloseTo(0.84 * 0.9);
      expect(service['applyStun'](boss, 1200)).toBe(false);
    });

    it.each(Object.values(MOB_TYPES).filter((def) => !def.stunRecoveryMs))(
      'protects $name throughout its stun and for one second afterward',
      (def) => {
        service['spawnMob'](def.id, 1);
        const mob = service.mobs()[0];
        service['gameTimeMs'] = 1000;
        expect(service['applyStun'](mob, 300)).toBe(true);
        expect(mob.stunImmuneUntilMs).toBe(2300);
        service['gameTimeMs'] = 1100;
        expect(service['applyStun'](mob, 1200)).toBe(false);
        expect(mob.statusEffects).toHaveLength(1);
        expect(mob.stunImmuneUntilMs).toBe(2300);
        service['gameTimeMs'] = 1300;
        service['updateMobs'](0.3);
        expect(mob.statusEffects).toEqual([]);
        expect(service['applyStun'](mob, 1200)).toBe(false);
        service['gameTimeMs'] = 2299;
        expect(service['applyStun'](mob, 1200)).toBe(false);
        service['gameTimeMs'] = 2300;
        expect(service['applyStun'](mob, 1200)).toBe(true);
        expect(mob.stunImmuneUntilMs).toBe(4500);
        expect(mob.baseSpeed).toBe(def.baseSpeed);
      },
    );
  });

  it('initializes with starting gold, crystals, and paths', () => {
    expect(service.gold()).toBe(MAP_VERDANT_CROSSROADS.startingGold);
    expect(service.crystals()).toBe(20);
    expect(service.groundPath().length).toBeGreaterThan(0);
    expect(service.airPath().length).toBeGreaterThan(0);
  });

  describe('linear wave health', () => {
    it.each([
      ['bramble-golem', 3276],
      ['sky-sovereign', 4056],
      ['iron-colossus', 14040],
    ] as const)('adds another 30%% to the previously boosted base HP of %s', (type, hp) => {
      service['spawnMob'](type, 1);
      expect(service.mobs()[0].hp).toBe(hp);
      expect(service.mobs()[0].maxHp).toBe(hp);
    });
    it.each(ALL_MAPS)('scales every group through the finale on $name', (map) => {
      service.loadMap(map);
      map.waves.forEach((wave, index) => {
        service['spawnQueue'] = [];
        service['enqueueWaveMobs'](index);
        for (const group of wave.groups) {
          const queued = service['spawnQueue'].filter((mob) => mob.mobType === group.mobType);
          expect(queued).toHaveLength(group.count);
          for (const mob of queued) {
            const lateMultiplier = index >= 9 ? 2 * (1 + (index - 9) * 0.15) : 1;
            expect(mob.hpMultiplier).toBeCloseTo(
              (group.hpMultiplier ?? 1) * (1 + index * 0.15) * lateMultiplier,
            );
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
        ...Array(5).fill(1.15),
      ]);
      for (const queued of skulkers) service['spawnMob'](queued.mobType, queued.hpMultiplier);
      expect(
        service
          .mobs()
          .map((mob) => mob.maxHp)
          .sort((a, b) => a - b),
      ).toEqual([...Array(8).fill(90), ...Array(5).fill(Math.round(90 * 1.15))]);
    });

    it.each([
      [0, 1],
      [8, 2.2],
      [9, 4.7],
      [10, 5.75],
      [19, 19.25],
      [30, 45.65],
      [31, 48.59],
    ])('uses the expected combined ramp at wave index %i', (index, multiplier) => {
      service['enqueueWaveMobs'](index);
      for (const group of service.activeMap().waves[index].groups) {
        const queued = service['spawnQueue'].filter((mob) => mob.mobType === group.mobType);
        for (const mob of queued) {
          expect(mob.hpMultiplier).toBeCloseTo((group.hpMultiplier ?? 1) * multiplier);
        }
      }
    });

    it('preserves wave 9 HP when wave 10 is queued alongside it', () => {
      service['enqueueWaveMobs'](8);
      const earlierWave = [...service['spawnQueue']];
      service['enqueueWaveMobs'](9);
      for (const queued of earlierWave) expect(queued.hpMultiplier).toBeCloseTo(2.2);
      const boss = service['spawnQueue'].find((mob) => mob.mobType === 'bramble-golem')!;
      expect(boss.hpMultiplier).toBeCloseTo(4.7);
      service['spawnMob'](boss.mobType, boss.hpMultiplier);
      expect(service.mobs()[0].hp).toBe(Math.round(3276 * 4.7));
    });

    it('applies both ramps to the final super boss and its escorts', () => {
      service['enqueueWaveMobs'](31);
      for (const queued of service['spawnQueue']) {
        service['spawnMob'](queued.mobType, queued.hpMultiplier);
      }
      const boss = service.mobs().find((mob) => mob.typeId === 'iron-colossus')!;
      expect(boss.hp).toBe(Math.round(MOB_TYPES['iron-colossus'].baseHp * 1.5 * 48.59));
      for (const mob of service.mobs()) {
        expect(mob.hp).toBe(mob.maxHp);
        expect(mob.baseSpeed).toBe(MOB_TYPES[mob.typeId].baseSpeed);
        expect(mob.goldReward).toBe(MOB_TYPES[mob.typeId].goldReward);
      }
    });
  });

  it.each(['ranger', 'juggernaut', 'samurai', 'rogue'] as const)(
    'extends %s attacks with Bard and removes the range bonus when Bard is sold',
    (classId) => {
      service.gold.set(5000);
      service.unlockedJobIds.set(new Set(['bard', 'samurai']));
      service.placeTower(0, 0, 'bard');
      service.placeTower(1, 0, classId);
      const [bard, ally] = service.towers();
      const baseRange = TOWER_CLASSES[classId].levels[0].range;
      service['spawnMob']('skulker', 1);
      const mob = service.mobs()[0];
      Object.assign(mob, { x: 1 + baseRange * 1.2, y: 0, hp: 1000, armor: 0 });
      service['gameTimeMs'] = bard.lastActionTime = 10000;
      const gold = service.gold();
      expect(service.towerRange(ally)).toBeCloseTo(baseRange * 1.25);
      service['updateTowers'](service['calculateTowerBuffs']());
      service['updateProjectiles'](1);
      if (classId === 'rogue') expect(service.gold()).toBe(gold + 2);
      else expect(mob.hp).toBeLessThan(1000);

      service.sellTower(bard.id);
      expect(service.towerRange(ally)).toBe(baseRange);
      const hpAfterHit = mob.hp;
      const goldAfterSale = service.gold();
      service['gameTimeMs'] = 20000;
      service['updateTowers'](service['calculateTowerBuffs']());
      service['updateProjectiles'](1);
      expect(mob.hp).toBe(hpAfterHit);
      expect(service.gold()).toBe(goldAfterSale);
    },
  );

  it('shares hero experience through an Oracle halo extended by Bard', () => {
    service.gold.set(5000);
    service.unlockedJobIds.set(new Set(['bard']));
    service.placeTower(0, 0, 'bard');
    service.placeTower(2, 0, 'oracle');
    service.placeTower(5, 0, 'blade-warden');
    const [, oracle, hero] = service.towers();
    hero.x = 4.75;
    service['spawnMob']('skulker', 1);
    const mob = service.mobs()[0];
    mob.hp = 1000;
    expect(service.towerRange(oracle, true)).toBe(2.75);
    service.dealDamage(mob, 100, 'pure', hero);
    expect(oracle.xp).toBe(100 * ORACLE_XP_SHARE);
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
    expect(service.gold()).toBe(gold + 25);
    expect(ninja.goldGenerated).toBe(5);
    expect(ninja.xp).toBe(50);
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

  describe('placement mode', () => {
    it('carries a hero over the board and spends nothing until it is set down', () => {
      service.selectTile(2, 1); // a path tile
      service.beginPlacement('ranger');
      expect(service.placingClassId()).toBe('ranger');
      // The hero starts on the nearest free build tile instead of the path
      expect(service.selectedTile()).toEqual({ x: 2, y: 0 });
      expect(service.gold()).toBe(MAP_VERDANT_CROSSROADS.startingGold);

      service.moveCursor(0, 1); // onto the path: it can't stand there and stays in hand
      expect(service.placementPreview()?.problem?.text).toBe('Only Build Tiles!');
      expect(service.confirmPlacement()).toBe(false);
      expect(service.placingClassId()).toBe('ranger');

      service.moveCursor(0, -1);
      expect(service.placementPreview()?.problem).toBeNull();
      expect(service.confirmPlacement()).toBe(true);
      expect(service.placingClassId()).toBeNull();
      expect(service.towers()).toMatchObject([{ classId: 'ranger', x: 2, y: 0 }]);
      expect(service.gold()).toBe(MAP_VERDANT_CROSSROADS.startingGold - TOWER_CLASSES.ranger.cost);
    });

    it('cycles only unlocked heroes and sends barricades to the nearest maze slot', () => {
      service.selectTile(8, 2);
      service.cyclePlacement('next'); // first press picks up the selected hero
      expect(service.placingClassId()).toBe('blade-warden');
      service.cyclePlacement('prev'); // wraps past the locked advanced jobs to the barricade
      expect(service.placingClassId()).toBe('barricade');
      expect(service.selectedTile()).toEqual({ x: 9, y: 2 });
      service.cyclePlacement('next');
      expect(service.placingClassId()).toBe('blade-warden');
    });

    it('sets the hero down on a clicked tile, and can be put back', () => {
      service.beginPlacement('blade-warden');
      service.activateTile(5, 4);
      expect(service.towers()).toMatchObject([{ classId: 'blade-warden', x: 5, y: 4 }]);
      expect(service.isCommandMenuOpen()).toBe(false);

      service.beginPlacement('ranger');
      service.cancelPlacement();
      expect(service.placingClassId()).toBeNull();
      expect(service.towers().length).toBe(1);
    });

    it('marks taken tiles and unaffordable heroes as blocked', () => {
      service.placeTower(0, 0, 'blade-warden');
      service.beginPlacement('ranger');
      service.selectTile(0, 0);
      expect(service.placementPreview()?.problem?.text).toBe('Tile Taken!');
      service.selectTile(1, 0);
      service.gold.set(0);
      expect(service.placementPreview()?.problem?.text).toBe('Need More Gold!');
    });
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

  it('initializes with 32 waves, active countdown, and starts out paused until user engages', () => {
    expect(service.totalWaves()).toBe(32);
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

    // Lv 1 rogue grants half the old bonus: 20 * 1.25 = 25G.
    expect(service.gold()).toBe(initialGold + 25);
    expect(rogue.goldGenerated).toBe(5);
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
