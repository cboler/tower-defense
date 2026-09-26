import { Injectable } from '@angular/core';
import { DamageType, TowerInstance, TOWER_CLASSES } from '../models/tower.model';
import { MobInstance } from '../models/mob.model';
import { StageModifier } from '../models/campaign.model';

export interface DamageCalculationResult {
  effectiveDamage: number;
  textColor: string;
  textType: 'damage' | 'magic' | 'crit' | 'alert';
}

export interface MobMovementResult {
  isStunned: boolean;
  effectiveSpeed: number;
  stepDistance: number;
}

export interface KillBountyResult {
  earnedGold: number;
  bonusGold: number;
  plunderRogue: TowerInstance | null;
  multiplier: number;
}

export interface OracleBuff {
  speedMult: number;
  damageMult: number;
}

@Injectable({
  providedIn: 'root',
})
export class GameRulesService {
  /**
   * Calculates effective damage after applying stage modifiers, elemental resist, armor, and air bonuses.
   */
  public calculateEffectiveDamage(
    rawDamage: number,
    damageType: DamageType,
    mob: MobInstance,
    modifiers: StageModifier[] = [],
    isAirBonus = false,
  ): DamageCalculationResult {
    let stageDamageMod = 1.0;
    for (const mod of modifiers) {
      if (damageType === 'physical' && mod.physicalDamageMultiplier) {
        stageDamageMod *= mod.physicalDamageMultiplier;
      }
      if (damageType === 'magic' && mod.magicDamageMultiplier) {
        stageDamageMod *= mod.magicDamageMultiplier;
      }
    }

    let calculated = Math.round(rawDamage * stageDamageMod);

    // Airborne precision bonus (Ranger Sky Piercer)
    if (isAirBonus && mob.isFlying) {
      calculated = Math.round(calculated * 1.5);
    }

    if (damageType === 'physical') {
      // Physical damage mitigated by physical armor rating (0.0 to 1.0)
      calculated = Math.max(1, Math.round(calculated * (1 - mob.armor)));
    } else if (damageType === 'magic') {
      // Magic damage completely ignores physical armor; mitigated only by magic resistance
      calculated = Math.max(1, Math.round(calculated * (1 - mob.magicResist)));
    } else if (damageType === 'pure') {
      calculated = Math.max(1, calculated);
    }

    const textColor = damageType === 'magic' ? '#c084fc' : '#f87171';
    const textType = damageType === 'magic' ? 'magic' : 'damage';

    return {
      effectiveDamage: calculated,
      textColor,
      textType,
    };
  }

  /**
   * Resolves mob speed, accounting for status effects, traits (Celerity, Enrage), and stage modifiers.
   */
  public resolveMobSpeed(
    mob: MobInstance,
    deltaSeconds: number,
    modifiers: StageModifier[] = [],
  ): MobMovementResult {
    let speedFactor = 1.0;
    let isStunned = false;

    for (const effect of mob.statusEffects) {
      if (effect.remainingMs > 0) {
        if (effect.type === 'slow') {
          // Swiftbeak Celerity cuts slow intensity in half
          const reduction = mob.typeId === 'swiftbeak' ? effect.intensity * 0.5 : effect.intensity;
          speedFactor *= 1 - reduction;
        } else if (effect.type === 'stun') {
          isStunned = true;
        }
      }
    }

    // Pyre Core enrage sprint below 40% health
    if (mob.typeId === 'pyre-core' && mob.hp < mob.maxHp * 0.4) {
      speedFactor *= 1.5;
    }

    if (isStunned) {
      return {
        isStunned: true,
        effectiveSpeed: 0,
        stepDistance: 0,
      };
    }

    let stageSpeedMod = 1.0;
    for (const mod of modifiers) {
      if (mod.mobSpeedMultiplier) {
        stageSpeedMod *= mod.mobSpeedMultiplier;
      }
    }

    const effectiveSpeed = mob.baseSpeed * Math.max(0.2, speedFactor) * stageSpeedMod;
    const stepDistance = effectiveSpeed * deltaSeconds;

    return {
      isStunned: false,
      effectiveSpeed,
      stepDistance,
    };
  }

  /**
   * Calculates aura haste and damage empowerments from Oracle towers.
   */
  public calculateOracleBuffs(towers: TowerInstance[]): Map<string, OracleBuff> {
    const buffs = new Map<string, OracleBuff>();

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

  /**
   * Calculates kill bounty and Rogue Plunder Aura bonuses.
   */
  public calculateKillBounty(
    mob: MobInstance,
    allTowers: TowerInstance[],
    modifiers: StageModifier[] = [],
  ): KillBountyResult {
    let bestMultiplier = 1.0;
    let plunderRogue: TowerInstance | null = null;

    for (const rogue of allTowers) {
      if (rogue.classId !== 'rogue') continue;
      const def = TOWER_CLASSES.rogue;
      const lvl = def.levels[rogue.level - 1];
      const dist = Math.hypot(mob.x - rogue.x, mob.y - rogue.y);
      if (dist <= lvl.range) {
        const mult = lvl.killGoldMultiplier ?? 1.5;
        if (mult > bestMultiplier) {
          bestMultiplier = mult;
          plunderRogue = rogue;
        }
      }
    }

    let stageGoldMod = 1.0;
    for (const mod of modifiers) {
      if (mod.goldMultiplier) {
        stageGoldMod *= mod.goldMultiplier;
      }
    }

    const earnedGold = Math.round(mob.goldReward * bestMultiplier * stageGoldMod);
    const bonusGold = earnedGold - mob.goldReward;

    return {
      earnedGold,
      bonusGold,
      plunderRogue,
      multiplier: bestMultiplier,
    };
  }

  /**
   * Crystal Defenders authentic early call bonus gold calculation.
   */
  public calculateEarlyCallBonus(
    secondsRemaining: number,
    isCountdownActive: boolean,
    waveActive: boolean,
    currentWaveIndex: number,
    totalWaves: number,
  ): number {
    if (isCountdownActive) {
      return Math.max(5, Math.ceil(secondsRemaining * (1.5 + currentWaveIndex * 0.25)));
    }
    if (waveActive && currentWaveIndex < totalWaves - 1) {
      return 30 + (currentWaveIndex + 1) * 8;
    }
    return 0;
  }

  /**
   * Crystal Defenders authentic end-of-stage victory clear honor points.
   */
  public calculateClearScoreBonus(remainingCrystals: number, treasuryGold: number): number {
    const crystalHonor = remainingCrystals * 1000;
    const goldHonor = treasuryGold * 10;
    return crystalHonor + goldHonor;
  }
}
