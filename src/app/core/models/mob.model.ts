export type MobTypeId =
  | 'skulker'
  | 'swiftbeak'
  | 'prismatic-ooze'
  | 'pyre-core'
  | 'dread-gaze'
  | 'bonewalker'
  | 'bramble-golem'
  | 'sky-sovereign';

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
  pathLengthWalked: number;
  statusEffects: StatusEffect[];
  isDead: boolean;
  hasEscaped: boolean;
  spawnTimeMs: number;
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
    icon: '🦤',
    badge: 'Sprinter',
    color: '#eab308',
    baseHp: 130,
    baseSpeed: 2.1,
    armor: 0.05,
    magicResist: 0.1,
    isFlying: false,
    crystalLoss: 1,
    goldReward: 9,
    description: 'Ultra-fast avian galloper. Dashes past defense towers with high tenacity.',
    specialTrait: 'Sprints swiftly; cuts incoming slow effects in half.',
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
    baseHp: 2100,
    baseSpeed: 0.55,
    armor: 0.35,
    magicResist: 0.35,
    isFlying: false,
    crystalLoss: 3,
    goldReward: 60,
    description:
      'Towering living monolith of ancient timber and stone. Consumes 3 crystals on breach.',
    specialTrait: 'Boss: Colossal health pool. Stun and Chronomancer slows are essential.',
  },

  'sky-sovereign': {
    id: 'sky-sovereign',
    name: 'Sky Sovereign',
    icon: '🐉',
    badge: 'Apex Boss',
    color: '#ec4899',
    baseHp: 2600,
    baseSpeed: 0.75,
    armor: 0.25,
    magicResist: 0.25,
    isFlying: true,
    crystalLoss: 5,
    goldReward: 80,
    description: 'Legendary winged apex predator. Ignores terrain and steals 5 crystals on escape.',
    specialTrait: 'Flying Apex Boss: Extreme health, bypasses barricades, tests your air defense.',
  },
};
