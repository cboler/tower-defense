export type TowerClassId =
  | 'blade-warden'
  | 'ranger'
  | 'elementalist'
  | 'chronomancer'
  | 'oracle'
  | 'rogue'
  | 'lancer'
  | 'juggernaut'
  | 'barricade';

export type TargetPriority = 'first' | 'last' | 'strongest' | 'weakest' | 'closest' | 'flying';

export type DamageType = 'physical' | 'magic' | 'pure' | 'buff' | 'utility' | 'none';

export interface TowerLevelConfig {
  level: number;
  title: string;
  upgradeCost: number;
  damage: number;
  range: number; // in grid cells (tiles)
  cadence: number; // seconds between actions
  splashRadius?: number; // in grid cells
  slowPercent?: number; // 0 to 1
  slowDuration?: number; // in seconds
  buffSpeedPercent?: number;
  buffDamagePercent?: number;
  goldPerHit?: number;
  stunChance?: number;
  specialDescription: string;
}

export interface TowerClassDefinition {
  id: TowerClassId;
  name: string;
  fantasyRole: string;
  icon: string;
  badge: string;
  color: string;
  cost: number;
  damageType: DamageType;
  targetsAir: boolean;
  targetsGround: boolean;
  description: string;
  levels: TowerLevelConfig[];
}

export interface TowerInstance {
  id: string;
  classId: TowerClassId;
  x: number;
  y: number;
  level: number; // 1 to 5
  totalInvested: number;
  targetPriority: TargetPriority;
  lastActionTime: number; // game time in ms
  kills: number;
  damageDealt: number;
  goldGenerated: number;
  attackAngleRad?: number;
  isAttackingAnimation?: boolean;
}

export const TOWER_CLASSES: Record<TowerClassId, TowerClassDefinition> = {
  'blade-warden': {
    id: 'blade-warden',
    name: 'Blade Warden',
    fantasyRole: 'Frontline Melee Specialist',
    icon: '⚔️',
    badge: 'Warrior',
    color: '#38bdf8',
    cost: 100,
    damageType: 'physical',
    targetsAir: false,
    targetsGround: true,
    description:
      'Deploys rapid, lethal circular melee slashes. High physical DPS against ground swarms.',
    levels: [
      {
        level: 1,
        title: 'Apprentice Swordsman',
        upgradeCost: 0,
        damage: 32,
        range: 1.35,
        cadence: 0.65,
        specialDescription: 'Quick single-target physical slashes.',
      },
      {
        level: 2,
        title: 'Veteran Blade',
        upgradeCost: 120,
        damage: 58,
        range: 1.45,
        cadence: 0.58,
        specialDescription: '+80% Damage & faster swing speed.',
      },
      {
        level: 3,
        title: 'Knight Captain',
        upgradeCost: 240,
        damage: 105,
        range: 1.55,
        cadence: 0.52,
        specialDescription: 'Extended reach and swift cleaving.',
      },
      {
        level: 4,
        title: 'Swordmaster',
        upgradeCost: 420,
        damage: 185,
        range: 1.65,
        cadence: 0.46,
        specialDescription: 'Sundering strikes that shred enemy physical armor.',
      },
      {
        level: 5,
        title: 'Grand Paladin',
        upgradeCost: 700,
        damage: 340,
        range: 1.8,
        cadence: 0.4,
        specialDescription: 'Devastating blade mastery with massive single-target DPS.',
      },
    ],
  },

  ranger: {
    id: 'ranger',
    name: 'Ranger',
    fantasyRole: 'Long-Range Anti-Air Sharpshooter',
    icon: '🏹',
    badge: 'Archer',
    color: '#4ade80',
    cost: 120,
    damageType: 'physical',
    targetsAir: true,
    targetsGround: true,
    description: 'Long-range precision archer. Deals +50% bonus damage against Flying monsters.',
    levels: [
      {
        level: 1,
        title: 'Scout Bow',
        upgradeCost: 0,
        damage: 24,
        range: 3.2,
        cadence: 0.85,
        specialDescription: 'Rapid arrows; +50% damage vs Flying monsters.',
      },
      {
        level: 2,
        title: 'Marksman',
        upgradeCost: 140,
        damage: 48,
        range: 3.6,
        cadence: 0.78,
        specialDescription: 'Enhanced range and arrow velocity.',
      },
      {
        level: 3,
        title: 'Hawkeye',
        upgradeCost: 260,
        damage: 90,
        range: 4.0,
        cadence: 0.7,
        specialDescription: 'Exceptional sightlines covering multiple lane bends.',
      },
      {
        level: 4,
        title: 'Windrunner',
        upgradeCost: 460,
        damage: 165,
        range: 4.4,
        cadence: 0.62,
        specialDescription: 'Twin shot bursts and piercing air-defense.',
      },
      {
        level: 5,
        title: 'Sky Piercer',
        upgradeCost: 750,
        damage: 290,
        range: 5.0,
        cadence: 0.52,
        specialDescription: 'Battlefield-spanning range; instantly shreds flying targets.',
      },
    ],
  },

  elementalist: {
    id: 'elementalist',
    name: 'Elementalist',
    fantasyRole: 'Arcane Explosions & Armor Piercing',
    icon: '🔥',
    badge: 'Black Mage',
    color: '#f97316',
    cost: 160,
    damageType: 'magic',
    targetsAir: true,
    targetsGround: true,
    description:
      'Hurls fiery arcane spheres that explode on impact. Magic damage completely bypasses physical armor.',
    levels: [
      {
        level: 1,
        title: 'Flame Novice',
        upgradeCost: 0,
        damage: 45,
        range: 2.6,
        cadence: 1.45,
        splashRadius: 0.75,
        specialDescription: 'Small explosion; completely ignores physical armor.',
      },
      {
        level: 2,
        title: 'Pyromancer',
        upgradeCost: 180,
        damage: 85,
        range: 2.8,
        cadence: 1.35,
        splashRadius: 0.9,
        specialDescription: 'Wider blast radius and enhanced fire damage.',
      },
      {
        level: 3,
        title: 'Magus',
        upgradeCost: 320,
        damage: 155,
        range: 3.0,
        cadence: 1.25,
        splashRadius: 1.1,
        specialDescription: 'Heavy impact scorches clustered monster packs.',
      },
      {
        level: 4,
        title: 'Archmage',
        upgradeCost: 550,
        damage: 270,
        range: 3.3,
        cadence: 1.15,
        splashRadius: 1.3,
        specialDescription: 'Massive arcane cataclysm destroying armored hordes.',
      },
      {
        level: 5,
        title: 'Infernal Sage',
        upgradeCost: 900,
        damage: 480,
        range: 3.6,
        cadence: 1.0,
        splashRadius: 1.6,
        specialDescription: 'Huge apocalyptic detonations melting any obstacle.',
      },
    ],
  },

  chronomancer: {
    id: 'chronomancer',
    name: 'Chronomancer',
    fantasyRole: 'Temporal Slow & Crowd Control',
    icon: '⏳',
    badge: 'Time Mage',
    color: '#a855f7',
    cost: 150,
    damageType: 'magic',
    targetsAir: true,
    targetsGround: true,
    description:
      'Manipulates space-time gravity. Distorts enemy speed by 40-70% in a temporal field.',
    levels: [
      {
        level: 1,
        title: 'Time Seer',
        upgradeCost: 0,
        damage: 15,
        range: 2.4,
        cadence: 1.2,
        slowPercent: 0.4,
        slowDuration: 2.5,
        specialDescription: 'Reduces enemy speed by 40% for 2.5s.',
      },
      {
        level: 2,
        title: 'Chrono Warden',
        upgradeCost: 150,
        damage: 28,
        range: 2.7,
        cadence: 1.1,
        slowPercent: 0.48,
        slowDuration: 3.0,
        specialDescription: 'Slows enemies by 48% with expanded field.',
      },
      {
        level: 3,
        title: 'Temporal Lord',
        upgradeCost: 280,
        damage: 55,
        range: 3.0,
        cadence: 1.0,
        slowPercent: 0.56,
        slowDuration: 3.5,
        specialDescription: 'Slows enemies by 56% across key intersections.',
      },
      {
        level: 4,
        title: 'Warp Master',
        upgradeCost: 480,
        damage: 95,
        range: 3.3,
        cadence: 0.9,
        slowPercent: 0.64,
        slowDuration: 4.0,
        specialDescription: 'Crippling 64% speed reduction holds waves in killzones.',
      },
      {
        level: 5,
        title: 'Chronos Incarnate',
        upgradeCost: 800,
        damage: 170,
        range: 3.6,
        cadence: 0.8,
        slowPercent: 0.72,
        slowDuration: 4.5,
        specialDescription: 'Near-freezing temporal stasis over entire corridors.',
      },
    ],
  },

  oracle: {
    id: 'oracle',
    name: 'Oracle',
    fantasyRole: 'Tower Haste & Damage Aura Buffer',
    icon: '✨',
    badge: 'White Mage',
    color: '#e2e8f0',
    cost: 180,
    damageType: 'buff',
    targetsAir: false,
    targetsGround: false,
    description:
      'Channels divine auras. Passively grants nearby allied towers +25% to +50% attack speed and power.',
    levels: [
      {
        level: 1,
        title: 'Acolyte',
        upgradeCost: 0,
        damage: 0,
        range: 2.2,
        cadence: 1.0,
        buffSpeedPercent: 0.25,
        buffDamagePercent: 0.15,
        specialDescription: 'Adjacent allies gain +25% Speed & +15% Damage.',
      },
      {
        level: 2,
        title: 'High Priest',
        upgradeCost: 190,
        damage: 0,
        range: 2.5,
        cadence: 1.0,
        buffSpeedPercent: 0.32,
        buffDamagePercent: 0.2,
        specialDescription: 'Empowers more towers with +32% Speed / +20% Damage.',
      },
      {
        level: 3,
        title: 'Diviner',
        upgradeCost: 350,
        damage: 0,
        range: 2.8,
        cadence: 1.0,
        buffSpeedPercent: 0.4,
        buffDamagePercent: 0.25,
        specialDescription: 'Wide holy halo granting +40% Speed / +25% Damage.',
      },
      {
        level: 4,
        title: 'Arch-Hierophant',
        upgradeCost: 580,
        damage: 0,
        range: 3.1,
        cadence: 1.0,
        buffSpeedPercent: 0.48,
        buffDamagePercent: 0.3,
        specialDescription: 'Massive boost transforming towers into rapid batteries.',
      },
      {
        level: 5,
        title: 'Celestial Avatar',
        upgradeCost: 950,
        damage: 0,
        range: 3.5,
        cadence: 1.0,
        buffSpeedPercent: 0.6,
        buffDamagePercent: 0.4,
        specialDescription: '+60% Attack Speed & +40% Damage to all towers in radius.',
      },
    ],
  },

  rogue: {
    id: 'rogue',
    name: 'Rogue',
    fantasyRole: 'Economy Accelerator & Quick Dagger',
    icon: '💰',
    badge: 'Thief',
    color: '#facc15',
    cost: 90,
    damageType: 'physical',
    targetsAir: false,
    targetsGround: true,
    description:
      'Plunders Gold on every strike and awards bonus gold whenever monsters perish within its aura.',
    levels: [
      {
        level: 1,
        title: 'Cutpurse',
        upgradeCost: 0,
        damage: 18,
        range: 1.5,
        cadence: 0.6,
        goldPerHit: 2,
        specialDescription: 'Generates +2 Gold per strike.',
      },
      {
        level: 2,
        title: 'Trickster',
        upgradeCost: 110,
        damage: 34,
        range: 1.6,
        cadence: 0.54,
        goldPerHit: 3,
        specialDescription: '+3 Gold per strike; swifter dagger flurry.',
      },
      {
        level: 3,
        title: 'Shadow Bandit',
        upgradeCost: 220,
        damage: 65,
        range: 1.7,
        cadence: 0.48,
        goldPerHit: 5,
        specialDescription: '+5 Gold per strike; boosts wave income.',
      },
      {
        level: 4,
        title: 'Guildmaster',
        upgradeCost: 380,
        damage: 115,
        range: 1.8,
        cadence: 0.42,
        goldPerHit: 8,
        specialDescription: '+8 Gold per strike and poison damage over time.',
      },
      {
        level: 5,
        title: 'King of Shadows',
        upgradeCost: 650,
        damage: 210,
        range: 2.0,
        cadence: 0.36,
        goldPerHit: 14,
        specialDescription: '+14 Gold per strike, multiplying the war treasury.',
      },
    ],
  },

  lancer: {
    id: 'lancer',
    name: 'Lancer',
    fantasyRole: 'Aerial Jump Slam & Stunner',
    icon: '🔱',
    badge: 'Dragoon',
    color: '#06b6d4',
    cost: 220,
    damageType: 'physical',
    targetsAir: true,
    targetsGround: true,
    description:
      'Armed with a long war spear. Periodically leaps high into the sky and crashes down to stun enemies.',
    levels: [
      {
        level: 1,
        title: 'Spear Guard',
        upgradeCost: 0,
        damage: 65,
        range: 2.5,
        cadence: 1.3,
        stunChance: 0.25,
        specialDescription: 'Long reach; 25% chance on hit to stun target for 1.2s.',
      },
      {
        level: 2,
        title: 'Dragon Knight',
        upgradeCost: 200,
        damage: 120,
        range: 2.7,
        cadence: 1.2,
        stunChance: 0.35,
        specialDescription: '35% stun chance and heavy thrust damage.',
      },
      {
        level: 3,
        title: 'High Lancer',
        upgradeCost: 360,
        damage: 215,
        range: 3.0,
        cadence: 1.1,
        stunChance: 0.45,
        specialDescription: 'Fierce dragon leap stuns both air and ground targets.',
      },
      {
        level: 4,
        title: 'Wyrm Slayer',
        upgradeCost: 600,
        damage: 370,
        range: 3.2,
        cadence: 1.0,
        stunChance: 0.55,
        specialDescription: 'Devastating armor-piercing plunge against bosses.',
      },
      {
        level: 5,
        title: 'Dragoon Paragon',
        upgradeCost: 980,
        damage: 620,
        range: 3.5,
        cadence: 0.85,
        stunChance: 0.7,
        specialDescription: 'Catastrophic aerial impact halting bosses in their tracks.',
      },
    ],
  },

  juggernaut: {
    id: 'juggernaut',
    name: 'Juggernaut',
    fantasyRole: 'Earthshaking Ground Cleave',
    icon: '🔨',
    badge: 'Berserker',
    color: '#e11d48',
    cost: 200,
    damageType: 'physical',
    targetsAir: false,
    targetsGround: true,
    description:
      'Slams a colossal warhammer into the earth, sending shockwaves that damage and fracture all nearby ground enemies.',
    levels: [
      {
        level: 1,
        title: 'Brawler',
        upgradeCost: 0,
        damage: 55,
        range: 1.7,
        cadence: 1.35,
        splashRadius: 1.7,
        specialDescription: 'Tremor shockwave hits all ground enemies in range.',
      },
      {
        level: 2,
        title: 'Gladiator',
        upgradeCost: 190,
        damage: 105,
        range: 1.85,
        cadence: 1.25,
        splashRadius: 1.85,
        specialDescription: 'Heavier shockwaves and wider tremor circumference.',
      },
      {
        level: 3,
        title: 'Earthshaker',
        upgradeCost: 340,
        damage: 195,
        range: 2.0,
        cadence: 1.15,
        splashRadius: 2.0,
        specialDescription: 'Fractures armor on all ground units caught in radius.',
      },
      {
        level: 4,
        title: 'Warmaster',
        upgradeCost: 560,
        damage: 340,
        range: 2.2,
        cadence: 1.05,
        splashRadius: 2.2,
        specialDescription: 'Huge continuous ground tremors pulverizing waves.',
      },
      {
        level: 5,
        title: 'Titan of the Arena',
        upgradeCost: 920,
        damage: 580,
        range: 2.4,
        cadence: 0.95,
        splashRadius: 2.4,
        specialDescription: 'Cataclysmic quakes flattening any ground force.',
      },
    ],
  },

  barricade: {
    id: 'barricade',
    name: 'Aether Barricade',
    fantasyRole: 'Light Mazing Choke Point',
    icon: '🛡️',
    badge: 'Mazing',
    color: '#64748b',
    cost: 30,
    damageType: 'none',
    targetsAir: false,
    targetsGround: false,
    description:
      'Erects an immovable aetheric barrier on mazeable tiles. Forces ground creeps to detour through your defense lanes.',
    levels: [
      {
        level: 1,
        title: 'Stone Rampart',
        upgradeCost: 0,
        damage: 0,
        range: 0,
        cadence: 0,
        specialDescription: 'Reroutes ground monsters along alternate pathways.',
      },
    ],
  },
};
