import { describe, it, expect, beforeEach } from 'vitest';
import { GameRulesService } from './game-rules.service';
import { MobInstance } from '../models/mob.model';
import { TowerInstance } from '../models/tower.model';
import { StageModifier } from '../models/campaign.model';

describe('GameRulesService', () => {
  let service: GameRulesService;

  beforeEach(() => {
    service = new GameRulesService();
  });

  const createDummyMob = (overrides: Partial<MobInstance> = {}): MobInstance => ({
    id: 'mob-1',
    typeId: 'skulker',
    name: 'Skulker',
    icon: '👺',
    color: '#10b981',
    hp: 100,
    maxHp: 100,
    baseSpeed: 1.0,
    effectiveSpeed: 1.0,
    armor: 0.2, // 20% physical defense
    magicResist: 0.1, // 10% magic defense
    isFlying: false,
    crystalLoss: 1,
    goldReward: 10,
    x: 0,
    y: 0,
    waypointIndex: 0,
    pathLengthWalked: 0,
    statusEffects: [],
    isDead: false,
    hasEscaped: false,
    spawnTimeMs: 0,
    ...overrides,
  });

  describe('calculateEffectiveDamage', () => {
    it('should reduce physical damage according to armor', () => {
      const mob = createDummyMob({ armor: 0.5 }); // 50% armor
      const result = service.calculateEffectiveDamage(100, 'physical', mob);
      expect(result.effectiveDamage).toBe(50);
      expect(result.textColor).toBe('#f87171');
    });

    it('should ignore physical armor for magic damage and apply magic resistance', () => {
      const mob = createDummyMob({ armor: 0.8, magicResist: 0.2 }); // 80% armor, 20% magic resist
      const result = service.calculateEffectiveDamage(100, 'magic', mob);
      expect(result.effectiveDamage).toBe(80);
      expect(result.textColor).toBe('#c084fc');
    });

    it('should grant 50% damage bonus against airborne targets with isAirBonus', () => {
      const flyingMob = createDummyMob({ isFlying: true, armor: 0.0 });
      const result = service.calculateEffectiveDamage(100, 'physical', flyingMob, [], true);
      expect(result.effectiveDamage).toBe(150);
    });

    it('should apply stage damage multipliers', () => {
      const mob = createDummyMob({ armor: 0.0 });
      const mods: StageModifier[] = [
        {
          id: 'test-mod',
          name: 'Empowered Steel',
          description: '',
          icon: '',
          physicalDamageMultiplier: 1.5,
        },
      ];
      const result = service.calculateEffectiveDamage(100, 'physical', mob, mods);
      expect(result.effectiveDamage).toBe(150);
    });
  });

  describe('resolveMobSpeed', () => {
    it('should reduce speed when slowed', () => {
      const mob = createDummyMob({
        baseSpeed: 2.0,
        statusEffects: [
          {
            type: 'slow',
            intensity: 0.4,
            durationMs: 2000,
            remainingMs: 2000,
          },
        ],
      });
      const result = service.resolveMobSpeed(mob, 0.1);
      expect(result.isStunned).toBe(false);
      expect(result.effectiveSpeed).toBeCloseTo(1.2);
    });

    it('should halve slow intensity for Swiftbeak celerity', () => {
      const mob = createDummyMob({
        typeId: 'swiftbeak',
        baseSpeed: 2.0,
        statusEffects: [
          {
            type: 'slow',
            intensity: 0.5, // 50% slow reduced to 25%
            durationMs: 2000,
            remainingMs: 2000,
          },
        ],
      });
      const result = service.resolveMobSpeed(mob, 0.1);
      expect(result.effectiveSpeed).toBeCloseTo(1.5);
    });

    it('should enrage Pyre Core speed by 50% below 40% HP', () => {
      const mob = createDummyMob({
        typeId: 'pyre-core',
        baseSpeed: 1.0,
        hp: 35,
        maxHp: 100,
      });
      const result = service.resolveMobSpeed(mob, 0.1);
      expect(result.effectiveSpeed).toBeCloseTo(1.5);
    });

    it('should halt movement when stunned', () => {
      const mob = createDummyMob({
        statusEffects: [
          {
            type: 'stun',
            intensity: 1.0,
            durationMs: 1000,
            remainingMs: 1000,
          },
        ],
      });
      const result = service.resolveMobSpeed(mob, 0.1);
      expect(result.isStunned).toBe(true);
      expect(result.effectiveSpeed).toBe(0);
      expect(result.stepDistance).toBe(0);
    });
  });

  describe('calculateKillBounty', () => {
    it('should return base gold reward when no Rogue is in range', () => {
      const mob = createDummyMob({ goldReward: 20 });
      const result = service.calculateKillBounty(mob, []);
      expect(result.earnedGold).toBe(20);
      expect(result.bonusGold).toBe(0);
      expect(result.plunderRogue).toBeNull();
    });

    it('should apply Rogue Plunder Aura when mob is in range', () => {
      const mob = createDummyMob({ x: 2, y: 2, goldReward: 20 });
      const rogue: TowerInstance = {
        id: 'rogue-1',
        classId: 'rogue',
        x: 2,
        y: 2,
        level: 1, // 1.5x multiplier, range 1.8
        totalInvested: 25,
        targetPriority: 'first',
        lastActionTime: 0,
        kills: 0,
        damageDealt: 0,
        goldGenerated: 0,
      };
      const result = service.calculateKillBounty(mob, [rogue]);
      expect(result.earnedGold).toBe(30);
      expect(result.bonusGold).toBe(10);
      expect(result.plunderRogue?.id).toBe('rogue-1');
    });
  });

  describe('calculateClearScoreBonus', () => {
    it('should calculate 1000 points per crystal and 10 points per gold', () => {
      const bonus = service.calculateClearScoreBonus(15, 120);
      expect(bonus).toBe(15 * 1000 + 120 * 10);
    });
  });
});
