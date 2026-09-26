export type MobTraitId =
  | 'standard'
  | 'celerity' // Swiftbeak: cuts slow duration/intensity by 50%
  | 'enrage-low-hp' // Pyre Core: +50% speed sprint below 40% HP
  | 'aerial-flight' // Dread Gaze / Sky Sovereign: ignores barricades, targets only by ranged
  | 'heavy-armor' // Bonewalker / Bramble Golem: heavy physical mitigation
  | 'magic-refraction' // Prismatic Ooze: 50% magic resistance
  | 'crystal-glutton'; // Sky Sovereign: steals 5 crystals on breach

export interface MobTraitDefinition {
  id: MobTraitId;
  name: string;
  badge: string;
  description: string;
  tacticalTip: string;
}

export const MOB_TRAITS: Record<MobTraitId, MobTraitDefinition> = {
  standard: {
    id: 'standard',
    name: 'Standard Movement',
    badge: 'Baseline',
    description: 'Moves along the designated path at normal velocity.',
    tacticalTip: 'Standard defense protocols are fully effective.',
  },
  celerity: {
    id: 'celerity',
    name: 'Celerity Equilibrium',
    badge: 'Slow Resistant',
    description: 'Reduces the potency and duration of all temporal and frost slows by 50%.',
    tacticalTip: 'Group physical defenders to burst down quickly rather than relying on slows.',
  },
  'enrage-low-hp': {
    id: 'enrage-low-hp',
    name: 'Core Volatility Enrage',
    badge: 'Enrages at 40% HP',
    description: 'Gains a +50% speed sprint surge when health falls below 40%.',
    tacticalTip:
      'Concentrate fire to eliminate the core immediately before it crosses the threshold.',
  },
  'aerial-flight': {
    id: 'aerial-flight',
    name: 'Aerial Levitating Flight',
    badge: 'Airborne',
    description: 'Glides over ground barricades and terrain hazards. Immune to ground melee.',
    tacticalTip: 'Deploy Rangers (anti-air bonus) and Lancers along its aerial trajectory.',
  },
  'heavy-armor': {
    id: 'heavy-armor',
    name: 'Hardened Bone Plating',
    badge: 'High Physical Armor',
    description: 'Deflects 50% to 75% of incoming physical damage.',
    tacticalTip: 'Deploy Elementalists; magic explosions bypass physical armor completely.',
  },
  'magic-refraction': {
    id: 'magic-refraction',
    name: 'Prismatic Dispersion',
    badge: '50% Magic Resist',
    description: 'Refracts spellcraft and magic damage by 50%.',
    tacticalTip: 'Use cold steel from Blade Wardens and Rangers rather than fireballs.',
  },
  'crystal-glutton': {
    id: 'crystal-glutton',
    name: 'Crystal Glutton',
    badge: 'Crucial Boss',
    description: 'Devours 5 Sacred Crystals upon reaching the sanctuary.',
    tacticalTip: 'All defensive lines must focus fire to prevent catastrophic crystal loss.',
  },
};

export type TowerTraitId =
  | 'rapid-melee'
  | 'sky-piercer'
  | 'arcane-cataclysm'
  | 'temporal-stasis'
  | 'haste-halo'
  | 'plunder-aura'
  | 'piercing-lunge'
  | 'earth-tremor'
  | 'maze-barrier';

export interface TowerTraitDefinition {
  id: TowerTraitId;
  name: string;
  role: string;
  description: string;
}

export const TOWER_TRAITS: Record<TowerTraitId, TowerTraitDefinition> = {
  'rapid-melee': {
    id: 'rapid-melee',
    name: 'Rapid Melee Cadence',
    role: 'Physical Frontline',
    description: 'Rapid physical slashes against adjacent ground enemies.',
  },
  'sky-piercer': {
    id: 'sky-piercer',
    name: 'Sky Piercer Precision',
    role: 'Anti-Air Sniper',
    description: 'Rapid ranged arrows with +50% bonus damage against airborne targets.',
  },
  'arcane-cataclysm': {
    id: 'arcane-cataclysm',
    name: 'Arcane Thermal Blast',
    role: 'Magic AoE',
    description: 'AoE explosion that bypasses physical armor completely.',
  },
  'temporal-stasis': {
    id: 'temporal-stasis',
    name: 'Temporal Stasis Wave',
    role: 'Crowd Control',
    description: 'Inflicts movement speed reduction on targeted fiends.',
  },
  'haste-halo': {
    id: 'haste-halo',
    name: 'Sanctified Haste Halo',
    role: 'Aura Buffer',
    description: 'Empowers adjacent allies with increased attack cadence and damage.',
  },
  'plunder-aura': {
    id: 'plunder-aura',
    name: 'Thief Plunder Aura',
    role: 'Economy Catalyst',
    description: 'Multiplies gold bounties of enemies defeated in range and pickpockets gold.',
  },
  'piercing-lunge': {
    id: 'piercing-lunge',
    name: 'Piercing Lunge',
    role: 'Armor Piercer',
    description: 'Heavy physical thrust with chance to stun.',
  },
  'earth-tremor': {
    id: 'earth-tremor',
    name: 'Earth Tremor Slam',
    role: 'Ground AoE',
    description: 'Shockwave striking all ground enemies within range.',
  },
  'maze-barrier': {
    id: 'maze-barrier',
    name: 'Aether Mazing Barrier',
    role: 'Path Director',
    description: 'Reroutes ground fiends along elongated paths.',
  },
};
