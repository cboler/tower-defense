export type TowerClassId =
  | 'blade-warden'
  | 'ranger'
  | 'elementalist'
  | 'chronomancer'
  | 'oracle'
  | 'rogue'
  | 'lancer'
  | 'juggernaut'
  | 'barricade'
  | 'red-mage'
  | 'ninja'
  | 'samurai'
  | 'paladin'
  | 'astrologian';

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
  killGoldMultiplier?: number;
  pickpocketGold?: number;
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
  xp: number; // experience banked toward the next level
  attackAngleRad?: number;
  isAttackingAnimation?: boolean;
}

/**
 * Experience tuning. A hero needs `nextLevel.upgradeCost * XP_PER_UPGRADE_GOLD` XP to earn
 * a free promotion, so XP thresholds scale with the gold price of the same upgrade.
 */
export const XP_PER_UPGRADE_GOLD = 8;
/** XP awarded on the killing blow, per gold of the monster's bounty. */
export const XP_PER_KILL_GOLD = 5;
/** XP awarded to support heroes (Rogue) per gold they generate. */
export const XP_PER_SUPPORT_GOLD = 10;
/** Share of an ally's earned XP that flows to each Oracle whose halo covers it. */
export const ORACLE_XP_SHARE = 0.25;

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
    fantasyRole: 'Passive Plunder Aura & Economy Catalyst',
    icon: '💰',
    badge: 'Thief',
    color: '#facc15',
    cost: 110,
    damageType: 'utility',
    targetsAir: false,
    targetsGround: false,
    description:
      'Does not attack directly. Projects an economic plunder aura that multiplies all Gold dropped by enemies slain in its radius, and passively pickpockets passing monsters.',
    levels: [
      {
        level: 1,
        title: 'Cutpurse',
        upgradeCost: 0,
        damage: 0,
        range: 2.2,
        cadence: 1.8,
        killGoldMultiplier: 1.5,
        pickpocketGold: 2,
        specialDescription:
          '+50% Gold for any monster slain in aura. Siphons +2G from passing creeps.',
      },
      {
        level: 2,
        title: 'Trickster',
        upgradeCost: 130,
        damage: 0,
        range: 2.5,
        cadence: 1.6,
        killGoldMultiplier: 1.75,
        pickpocketGold: 3,
        specialDescription: '+75% Gold for kills in aura (1.75x). Siphons +3G from passing creeps.',
      },
      {
        level: 3,
        title: 'Shadow Bandit',
        upgradeCost: 260,
        damage: 0,
        range: 2.8,
        cadence: 1.4,
        killGoldMultiplier: 2.0,
        pickpocketGold: 5,
        specialDescription:
          'DOUBLES all Gold earned in aura (2.0x!). Siphons +5G from passing creeps.',
      },
      {
        level: 4,
        title: 'Guildmaster',
        upgradeCost: 440,
        damage: 0,
        range: 3.2,
        cadence: 1.2,
        killGoldMultiplier: 2.5,
        pickpocketGold: 8,
        specialDescription: '+150% Gold earned in aura (2.5x!). Siphons +8G from passing creeps.',
      },
      {
        level: 5,
        title: 'King of Shadows',
        upgradeCost: 750,
        damage: 0,
        range: 3.6,
        cadence: 1.0,
        killGoldMultiplier: 3.0,
        pickpocketGold: 14,
        specialDescription:
          'TRIPLES all Gold earned in aura (3.0x!). Rapid +14G pickpocket flurry.',
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

  'red-mage': {
    id: 'red-mage',
    name: 'Red Mage',
    fantasyRole: 'Dual-Cast Crimson Spellblade',
    icon: '🧙‍♂️',
    badge: 'Dual-Cast',
    color: '#ef4444',
    cost: 260,
    damageType: 'magic',
    targetsAir: true,
    targetsGround: true,
    description:
      'Master of both arcane destruction and divine healing arts. Rapidly dual-casts piercing flame and holy spells.',
    levels: [
      {
        level: 1,
        title: 'Crimson Initiate',
        upgradeCost: 200,
        damage: 55,
        range: 2.8,
        cadence: 0.85,
        splashRadius: 1.2,
        specialDescription: 'Dual-cast: fires rapid flame spell followed by holy burst.',
      },
      {
        level: 2,
        title: 'Spellblade Adept',
        upgradeCost: 340,
        damage: 95,
        range: 3.0,
        cadence: 0.8,
        splashRadius: 1.3,
        specialDescription: 'Increased spell velocity and amplified dual-cast thermal damage.',
      },
      {
        level: 3,
        title: 'Arcane Dualist',
        upgradeCost: 540,
        damage: 155,
        range: 3.2,
        cadence: 0.75,
        splashRadius: 1.4,
        specialDescription: 'Dual-cast holy waves pierce 25% of magic resistance.',
      },
      {
        level: 4,
        title: 'Crimson Fencer',
        upgradeCost: 820,
        damage: 245,
        range: 3.4,
        cadence: 0.7,
        splashRadius: 1.5,
        specialDescription: 'High-frequency dual burst vaporizing grouped ground and air creeps.',
      },
      {
        level: 5,
        title: 'Grand Red Archon',
        upgradeCost: 1250,
        damage: 390,
        range: 3.6,
        cadence: 0.65,
        splashRadius: 1.6,
        specialDescription: 'Legendary twin-cast cataclysms melting all resistances.',
      },
    ],
  },

  ninja: {
    id: 'ninja',
    name: 'Ninja',
    fantasyRole: 'Dual-Wield Shinobi Assassin',
    icon: '🥷',
    badge: 'Dual-Throw',
    color: '#06b6d4',
    cost: 250,
    damageType: 'physical',
    targetsAir: true,
    targetsGround: true,
    description:
      'Lethal shadow operative. Hurls dual razor shurikens simultaneously with blazing cadence and critical chance.',
    levels: [
      {
        level: 1,
        title: 'Shadow Genin',
        upgradeCost: 190,
        damage: 38,
        range: 2.6,
        cadence: 0.48,
        specialDescription: 'Dual-Throw: flings two shurikens per volley with 20% crit chance.',
      },
      {
        level: 2,
        title: 'Silent Chunin',
        upgradeCost: 320,
        damage: 64,
        range: 2.8,
        cadence: 0.44,
        specialDescription: 'Swifter throws with 25% critical strike multiplier.',
      },
      {
        level: 3,
        title: 'Mist Jonin',
        upgradeCost: 510,
        damage: 106,
        range: 3.0,
        cadence: 0.4,
        specialDescription: 'Dual heavy shadow stars with 30% critical strike chance.',
      },
      {
        level: 4,
        title: 'Shadow Assassin',
        upgradeCost: 780,
        damage: 172,
        range: 3.2,
        cadence: 0.36,
        specialDescription: 'Hyper-speed shuriken barrage tearing through fast targets.',
      },
      {
        level: 5,
        title: 'Kage Master',
        upgradeCost: 1180,
        damage: 275,
        range: 3.4,
        cadence: 0.32,
        specialDescription: 'Supreme assassination arts; unrivaled single-target physical DPS.',
      },
    ],
  },

  samurai: {
    id: 'samurai',
    name: 'Samurai',
    fantasyRole: 'Iaido Spirit Blade Master',
    icon: '⚔️',
    badge: 'Iaido AoE',
    color: '#f43f5e',
    cost: 280,
    damageType: 'physical',
    targetsAir: false,
    targetsGround: true,
    description:
      'Draws out spiritual energy from ancestral katanas. Unleashes circular Iaido spirit waves sundering enemy armor.',
    levels: [
      {
        level: 1,
        title: 'Ronin Swordsman',
        upgradeCost: 220,
        damage: 90,
        range: 1.8,
        cadence: 1.25,
        splashRadius: 1.8,
        specialDescription:
          'Iaido Spirit Wave: strikes all nearby ground foes, sundering 20% armor.',
      },
      {
        level: 2,
        title: 'Bushi Veteran',
        upgradeCost: 370,
        damage: 155,
        range: 1.9,
        cadence: 1.2,
        splashRadius: 1.9,
        specialDescription: 'Expands spirit blade radius with 25% armor sunder.',
      },
      {
        level: 3,
        title: 'Kensei Master',
        upgradeCost: 590,
        damage: 250,
        range: 2.0,
        cadence: 1.15,
        splashRadius: 2.0,
        specialDescription: 'Kiku-ichimonji spirit slash sundering 30% armor.',
      },
      {
        level: 4,
        title: 'Shogun Sentinel',
        upgradeCost: 900,
        damage: 395,
        range: 2.1,
        cadence: 1.1,
        splashRadius: 2.1,
        specialDescription: 'Devastating 360-degree blade tempest shredding armored waves.',
      },
      {
        level: 5,
        title: 'Masamune Saint',
        upgradeCost: 1380,
        damage: 620,
        range: 2.3,
        cadence: 1.0,
        splashRadius: 2.3,
        specialDescription: 'Transcendent spirit blade cleavage that obliterates armor completely.',
      },
    ],
  },

  paladin: {
    id: 'paladin',
    name: 'Paladin',
    fantasyRole: 'Radiant Holy Knight',
    icon: '🛡️',
    badge: 'Stasis Sword',
    color: '#f59e0b',
    cost: 290,
    damageType: 'physical',
    targetsAir: false,
    targetsGround: true,
    description:
      'Holy vanguard sentinel wielding the Stasis Sword. Deals righteous physical damage and inflicts holy stuns.',
    levels: [
      {
        level: 1,
        title: 'Crusader Squire',
        upgradeCost: 230,
        damage: 110,
        range: 1.6,
        cadence: 1.15,
        stunChance: 0.35,
        specialDescription: 'Stasis Sword: heavy radiant slash with 35% chance to stun for 1.4s.',
      },
      {
        level: 2,
        title: 'Temple Knight',
        upgradeCost: 380,
        damage: 185,
        range: 1.7,
        cadence: 1.1,
        stunChance: 0.4,
        specialDescription: 'Increased holy impact with 40% stun chance.',
      },
      {
        level: 3,
        title: 'Justicar Champion',
        upgradeCost: 610,
        damage: 300,
        range: 1.8,
        cadence: 1.05,
        stunChance: 0.45,
        specialDescription: 'Judgment Blade: celestial shockwave with 45% stun chance.',
      },
      {
        level: 4,
        title: 'Holy Knight Lord',
        upgradeCost: 930,
        damage: 480,
        range: 1.9,
        cadence: 1.0,
        stunChance: 0.5,
        specialDescription: 'Cleansing smite locking tough enemies in stasis.',
      },
      {
        level: 5,
        title: 'Saint of the Font',
        upgradeCost: 1420,
        damage: 750,
        range: 2.0,
        cadence: 0.95,
        stunChance: 0.6,
        specialDescription: 'Divine stasis judgment; immovable fortress against boss waves.',
      },
    ],
  },

  astrologian: {
    id: 'astrologian',
    name: 'Astrologian',
    fantasyRole: 'Cosmic Star Caller',
    icon: '🌌',
    badge: 'Cosmic Meteor',
    color: '#8b5cf6',
    cost: 320,
    damageType: 'magic',
    targetsAir: true,
    targetsGround: true,
    description:
      'Harnesses the celestial sphere to summon gravitational wells and catastrophic star meteorites.',
    levels: [
      {
        level: 1,
        title: 'Star Observer',
        upgradeCost: 250,
        damage: 160,
        range: 3.2,
        cadence: 2.1,
        splashRadius: 2.0,
        slowPercent: 0.3,
        slowDuration: 2.5,
        specialDescription:
          'Stellar Meteor: calls down a comet causing 2-tile magic AoE and 30% slow.',
      },
      {
        level: 2,
        title: 'Celestial Diviner',
        upgradeCost: 410,
        damage: 270,
        range: 3.4,
        cadence: 2.0,
        splashRadius: 2.1,
        slowPercent: 0.35,
        slowDuration: 2.8,
        specialDescription: 'Amplified meteorite explosion with 35% gravitational slow.',
      },
      {
        level: 3,
        title: 'Planetary Astromancer',
        upgradeCost: 660,
        damage: 430,
        range: 3.6,
        cadence: 1.9,
        splashRadius: 2.2,
        slowPercent: 0.4,
        slowDuration: 3.0,
        specialDescription: 'Supernova detonation with 40% gravitational slow.',
      },
      {
        level: 4,
        title: 'Galaxy Sovereign',
        upgradeCost: 1020,
        damage: 680,
        range: 3.8,
        cadence: 1.8,
        splashRadius: 2.3,
        slowPercent: 0.45,
        slowDuration: 3.2,
        specialDescription: 'Black hole implosion crushing entire clusters of fiends.',
      },
      {
        level: 5,
        title: 'Cosmic Arch-Astronomer',
        upgradeCost: 1550,
        damage: 1050,
        range: 4.0,
        cadence: 1.7,
        splashRadius: 2.5,
        slowPercent: 0.5,
        slowDuration: 3.5,
        specialDescription:
          'Catastrophic starfall annihilating everything caught in its gravitational field.',
      },
    ],
  },
};

export interface JobUnlockRule {
  targetClassId: TowerClassId;
  name: string;
  badge: string;
  color: string;
  icon: string;
  prerequisites: { classId: TowerClassId; minLevel: number }[];
  hint: string;
  lore: string;
}

export const JOB_UNLOCK_RULES: Record<string, JobUnlockRule> = {
  'red-mage': {
    targetClassId: 'red-mage',
    name: 'Red Mage',
    badge: 'Dual-Cast Spellblade',
    color: '#ef4444',
    icon: '🧙‍♂️',
    prerequisites: [
      { classId: 'elementalist', minLevel: 2 },
      { classId: 'oracle', minLevel: 2 },
    ],
    hint: 'Upgrade an Elementalist (Black Mage) to Lv. 2 and an Oracle (White Mage) to Lv. 2',
    lore: 'Master of both arcane destruction and radiant restoration. Weaves fire and holy spells with equal finesse.',
  },
  ninja: {
    targetClassId: 'ninja',
    name: 'Ninja',
    badge: 'Dual-Wield Shinobi',
    color: '#06b6d4',
    icon: '🥷',
    prerequisites: [
      { classId: 'ranger', minLevel: 2 },
      { classId: 'rogue', minLevel: 2 },
    ],
    hint: 'Upgrade a Ranger (Archer) to Lv. 2 and a Rogue (Thief) to Lv. 2',
    lore: 'Shadow warrior trained in hidden arts. Hurls dual shurikens with lethal critical precision.',
  },
  samurai: {
    targetClassId: 'samurai',
    name: 'Samurai',
    badge: 'Iaido Blade Master',
    color: '#f43f5e',
    icon: '⚔️',
    prerequisites: [
      { classId: 'blade-warden', minLevel: 2 },
      { classId: 'juggernaut', minLevel: 2 },
    ],
    hint: 'Upgrade a Blade Warden (Warrior) to Lv. 2 and a Juggernaut (Berserker) to Lv. 2',
    lore: 'Wields ancestral katanas through Iaido draw-out spirit arts, sundering enemy defenses in a flashing circle.',
  },
  paladin: {
    targetClassId: 'paladin',
    name: 'Paladin',
    badge: 'Holy Sword Knight',
    color: '#f59e0b',
    icon: '🛡️',
    prerequisites: [
      { classId: 'blade-warden', minLevel: 2 },
      { classId: 'oracle', minLevel: 2 },
    ],
    hint: 'Upgrade a Blade Warden (Warrior) to Lv. 2 and an Oracle (White Mage) to Lv. 2',
    lore: 'Sacred knight wielding the Stasis Sword. Enforces celestial judgment with stunning holy strikes.',
  },
  astrologian: {
    targetClassId: 'astrologian',
    name: 'Astrologian',
    badge: 'Cosmic Star Caller',
    color: '#8b5cf6',
    icon: '🌌',
    prerequisites: [
      { classId: 'elementalist', minLevel: 2 },
      { classId: 'chronomancer', minLevel: 2 },
    ],
    hint: 'Upgrade an Elementalist (Black Mage) to Lv. 2 and a Chronomancer (Time Mage) to Lv. 2',
    lore: 'Channels the celestial sphere to summon gravitational wells and catastrophic star meteors.',
  },
};

export const BASE_TOWER_CLASSES: TowerClassDefinition[] = [
  TOWER_CLASSES['blade-warden'],
  TOWER_CLASSES.ranger,
  TOWER_CLASSES.elementalist,
  TOWER_CLASSES.chronomancer,
  TOWER_CLASSES.oracle,
  TOWER_CLASSES.rogue,
  TOWER_CLASSES.lancer,
  TOWER_CLASSES.juggernaut,
  TOWER_CLASSES.barricade,
];

export const ADVANCED_TOWER_CLASSES: TowerClassDefinition[] = [
  TOWER_CLASSES['red-mage'],
  TOWER_CLASSES.ninja,
  TOWER_CLASSES.samurai,
  TOWER_CLASSES.paladin,
  TOWER_CLASSES.astrologian,
];
