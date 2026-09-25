import { DamageType } from './tower.model';

export type GameStatus = 'idle' | 'running' | 'paused' | 'game-over' | 'victory';

export type GameSpeed = 1 | 2 | 4;

export interface Projectile {
  id: string;
  sourceTowerId: string;
  targetMobId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  speed: number; // grid tiles per second
  damage: number;
  damageType: DamageType;
  splashRadius?: number;
  slowPercent?: number;
  slowDuration?: number;
  stunChance?: number;
  goldPerHit?: number;
  isAirBonus?: boolean;
  visualType: 'arrow' | 'fireball' | 'magic-spark' | 'time-orb' | 'spear' | 'dagger';
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  createdAt: number;
  durationMs: number;
  style: 'damage' | 'magic' | 'gold' | 'crit' | 'alert' | 'buff' | 'slow';
}

export interface ParticleFx {
  id: string;
  x: number;
  y: number;
  color: string;
  radius: number;
  maxRadius: number;
  durationMs: number;
  createdAt: number;
  type: 'slash' | 'explosion' | 'time-pulse' | 'aura' | 'tremor' | 'stun';
}
