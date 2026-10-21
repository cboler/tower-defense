import { Point } from './map.model';

export type MobTypeId =
  | 'skulker'
  | 'swiftbeak'
  | 'prismatic-ooze'
  | 'pyre-core'
  | 'dread-gaze'
  | 'bonewalker'
  | 'bramble-golem'
  | 'sky-sovereign'
  | 'iron-colossus';

export interface MobTypeDefinition {
  id: MobTypeId;
  name: string;
  icon: string;
  badge: string;
  color: string;
  baseHp: number;
  baseSpeed: number; // grid tiles per second
  armor: number; // 0 to 1, physical damage reduction %
  magicResist: number; // -1 to 1, magic damage reduction % (negative means vulnerability)
  isFlying: boolean;
  crystalLoss: number; // crystals stolen if reaching sanctuary
  goldReward: number;
  description: string;
  specialTrait: string;
  /** Immunity after a stun ends, in game milliseconds. Defaults to 1000 for regular enemies. */
  stunRecoveryMs?: number;
  /** Board scale of the miniature; rank and file stand at 0.95. */
  scale?: number;
  /**
   * Super bosses break apart as they are worn down: crossing each health fraction staggers them
   * in place, then they carry on at that stage's speed (at the last, a crawl).
   */
  damageStages?: DamageStage[];
}

export interface DamageStage {
  /** Health fraction at or below which this stage breaks. */
  at: number;
  /** Time spent reeling in place as the armour gives. */
  staggerMs: number;
  /** Speed from here on, as a fraction of base speed. */
  speed: number;
  /** Shouted over the board when the stage breaks. */
  callout: string;
}

export interface StatusEffect {
  type: 'slow' | 'burn' | 'stun' | 'plundered';
  intensity: number; // e.g. 0.4 for 40% slow
  durationMs: number;
  remainingMs: number;
}

export interface MobInstance {
  id: string;
  typeId: MobTypeId;
  name: string;
  icon: string;
  color: string;
  hp: number;
  maxHp: number;
  baseSpeed: number;
  effectiveSpeed: number;
  armor: number;
  magicResist: number;
  isFlying: boolean;
  crystalLoss: number;
  goldReward: number;
  x: number; // current float coordinates in grid units
  y: number;
  waypointIndex: number;
  /** Personal ground route, set when barricades reroute the road while this mob is marching. */
  route?: Point[];
  pathLengthWalked: number;
  statusEffects: StatusEffect[];
  isDead: boolean;
  hasEscaped: boolean;
  spawnTimeMs: number;
  /** Damage stages broken so far (super bosses only). */
  damageStage?: number;
  /** Time left reeling from the last broken stage. */
  staggerMs?: number;
  /** Game time through which another stun cannot be applied. */
  stunImmuneUntilMs?: number;
}

/** Real time a fallen super boss spends dying before its wave can end. */
export const SUPER_BOSS_DEATH_MS = 4200;

/**
 * Beats of a super boss's death, in seconds, shared by its animation and its sound: it
 * convulses as explosions pop across it ever faster, reaches once more for the crystal, slumps
 * face down and blows apart.
 */
export const SUPER_BOSS_DEATH = {
  pops: [0.12, 0.42, 0.68, 0.9, 1.1, 1.28, 1.44, 1.58, 1.7, 1.81, 1.9, 1.98, 2.05],
  reach: 2.15,
  slump: 2.85,
  blast: 3.25,
} as const;

/** How many of its damage stages a monster at this health has broken. */
export function damageStageAt(def: MobTypeDefinition, hp: number, maxHp: number): number {
  const ratio = hp / maxHp;
  return def.damageStages?.filter((stage) => ratio <= stage.at).length ?? 0;
}

/** Scale of a monster's miniature on the board. */
export function mobScale(id: MobTypeId): number {
  return MOB_TYPES[id].scale ?? 0.95;
}

export const MOB_TYPES: Record<MobTypeId, MobTypeDefinition> = {
  skulker: {
    id: 'skulker',
    name: 'Skulker',
    icon: '👺',
    badge: 'Infantry',
    color: '#10b981',
    baseHp: 90,
    baseSpeed: 1.15,
    armor: 0.1,
    magicResist: 0.0,
    isFlying: false,
    crystalLoss: 1,
    goldReward: 6,
    description: 'Basic frontline raider. Moderate speed and health.',
    specialTrait: 'Standard march; reliable baseline.',
  },

  swiftbeak: {
    id: 'swiftbeak',
    name: 'Swiftbeak',
    icon: '🦅',
    badge: 'Sprinter',
    color: '#0284c7',
    baseHp: 130,
    baseSpeed: 2.1,
    armor: 0.05,
    magicResist: 0.1,
    isFlying: false,
    crystalLoss: 1,
    goldReward: 9,
    description:
      'Razor-crested avian predator. Sprints with extreme velocity and cuts incoming slows in half.',
    specialTrait: 'Razor Gale: Sprints swiftly; cuts incoming slow effects in half.',
  },

  'prismatic-ooze': {
    id: 'prismatic-ooze',
    name: 'Prismatic Ooze',
    icon: '🧪',
    badge: 'Armored',
    color: '#3b82f6',
    baseHp: 260,
    baseSpeed: 0.8,
    armor: 0.8, // 80% physical reduction!
    magicResist: -0.3, // takes 30% bonus magic damage!
    isFlying: false,
    crystalLoss: 1,
    goldReward: 12,
    description: 'Gelatinous mass with dense crystalline sheen. Shrugs off swords and arrows.',
    specialTrait: '80% Physical Armor! Extremely vulnerable to Elementalist fire/arcane magic.',
  },

  'pyre-core': {
    id: 'pyre-core',
    name: 'Pyre Core',
    icon: '💥',
    badge: 'Elemental',
    color: '#ef4444',
    baseHp: 190,
    baseSpeed: 1.25,
    armor: -0.15, // takes 15% extra physical damage!
    magicResist: 0.8, // 80% magic resistance!
    isFlying: false,
    crystalLoss: 1,
    goldReward: 10,
    description: 'Volatile flame elemental. Immune to most magic, vulnerable to blade strikes.',
    specialTrait: '80% Magic Shield! Enrages and gains +50% speed when below 40% HP.',
  },

  'dread-gaze': {
    id: 'dread-gaze',
    name: 'Dread Gaze',
    icon: '👁️',
    badge: 'Aerial',
    color: '#8b5cf6',
    baseHp: 175,
    baseSpeed: 1.3,
    armor: 0.15,
    magicResist: 0.15,
    isFlying: true,
    crystalLoss: 1,
    goldReward: 11,
    description: 'Floating winged horror. Flies right above ground melee weapons and barricades.',
    specialTrait: 'Flying: completely immune to melee slashes. High priority for Rangers.',
  },

  bonewalker: {
    id: 'bonewalker',
    name: 'Bonewalker',
    icon: '💀',
    badge: 'Swarm',
    color: '#94a3b8',
    baseHp: 75,
    baseSpeed: 1.35,
    armor: 0.05,
    magicResist: 0.05,
    isFlying: false,
    crystalLoss: 1,
    goldReward: 4,
    description: 'Undead thrall marching in dense swarms to overwhelm single-target towers.',
    specialTrait: 'Spawns in rapid swarms; weak to Juggernaut tremors and Elementalist blasts.',
  },

  'bramble-golem': {
    id: 'bramble-golem',
    name: 'Bramble Golem',
    icon: '🪵',
    badge: 'Boss',
    color: '#84cc16',
    baseHp: 3276,
    baseSpeed: 1.1,
    armor: 0.35,
    magicResist: 0.35,
    isFlying: false,
    crystalLoss: 3,
    goldReward: 60,
    description:
      'Towering living monolith of ancient timber and stone. Consumes 3 crystals on breach.',
    specialTrait:
      'Boss: Colossal health pool. Immune to further stuns for 4s after each stun ends; Chronomancer slows still work.',
    stunRecoveryMs: 4000,
    scale: 1.35,
  },

  'sky-sovereign': {
    id: 'sky-sovereign',
    name: 'Sky Sovereign',
    icon: '🐉',
    badge: 'Apex Boss',
    color: '#ec4899',
    baseHp: 4056,
    baseSpeed: 1.5,
    armor: 0.25,
    magicResist: 0.25,
    isFlying: true,
    crystalLoss: 5,
    goldReward: 80,
    description: 'Legendary winged apex predator. Ignores terrain and steals 5 crystals on escape.',
    specialTrait:
      'Flying Apex Boss: Extreme health, bypasses barricades. Immune to further stuns for 4s after each stun ends.',
    stunRecoveryMs: 4000,
    scale: 1.35,
  },

  'iron-colossus': {
    id: 'iron-colossus',
    name: 'Iron Colossus',
    icon: '🗿',
    badge: 'Super Boss',
    color: '#c2410c',
    baseHp: 14040,
    baseSpeed: 0.84,
    armor: 0.45,
    magicResist: 0.3,
    isFlying: false,
    crystalLoss: 10,
    goldReward: 300,
    description:
      'A walking fortress of riveted iron around a furnace heart. The ground shakes with every step, and it shatters 10 crystals on breach.',
    specialTrait:
      'Super Boss: reels at 75%, 50% and 25% health, then crawls on. Immune to further stuns for 4s after each stun or armor-break stagger ends.',
    stunRecoveryMs: 4000,
    scale: 2.1,
    damageStages: [
      { at: 0.75, staggerMs: 1400, speed: 1, callout: 'Armor Cracked!' },
      { at: 0.5, staggerMs: 1600, speed: 0.9, callout: 'Arm Torn Away!' },
      { at: 0.25, staggerMs: 2600, speed: 0.75, callout: 'It Falls... and Crawls!' },
    ],
  },
};
