import {
  MapDefinition,
  MAP_VERDANT_CROSSROADS,
  MAP_SUNKEN_SANCTUM,
  MAP_MOLTEN_CALDERA,
} from './map.model';
import { TowerClassId } from './tower.model';

export interface StageModifier {
  id: string;
  name: string;
  description: string;
  icon: string;
  // Multipliers (1.0 = default)
  mobHpMultiplier?: number;
  mobSpeedMultiplier?: number;
  physicalDamageMultiplier?: number;
  magicDamageMultiplier?: number;
  goldMultiplier?: number;
  startingGoldBonus?: number;
}

export interface CampaignMission {
  id: string;
  actNumber: number;
  actTitle: string;
  stageNumber: number;
  title: string;
  location: string;
  subtitle: string;
  difficulty: 'Novice' | 'Tactician' | 'Master';
  mapDefinition: MapDefinition;
  recommendedClasses: TowerClassId[];
  prologueStory: {
    speaker: string;
    avatar: string;
    lines: string[];
  };
  victoryEpilogue: {
    speaker: string;
    avatar: string;
    lines: string[];
  };
  modifiers: StageModifier[];
  threeStarCrystalRequirement: number; // e.g. 20 (no crystal loss)
  twoStarCrystalRequirement: number; // e.g. 10+ crystals
}

export interface MissionProgressRecord {
  missionId: string;
  completed: boolean;
  highScore: number;
  highestWave: number;
  starsEarned: number; // 0 to 3
  bestRemainingCrystals: number;
  lastPlayedTimestamp: number;
}

export const CAMPAIGN_MISSIONS: CampaignMission[] = [
  {
    id: 'mission-1-verdant-crossroads',
    actNumber: 1,
    actTitle: 'Act I: The Emerald Veil',
    stageNumber: 1,
    title: 'Verdant Crossroads',
    location: 'Emerald Highland Vale',
    subtitle: 'Stage 1 • Bastion of the Highlands',
    difficulty: 'Novice',
    mapDefinition: MAP_VERDANT_CROSSROADS,
    recommendedClasses: ['blade-warden', 'ranger', 'rogue', 'barricade'],
    prologueStory: {
      speaker: 'Warden Marshal Cedric',
      avatar: 'assets/portraits/blade-warden.png',
      lines: [
        'Outpost sentries report strange fissures vibrating across the outer perimeter.',
        'Marauding Skulkers and Swiftbeaks march toward the Sacred Crystal Sanctuary!',
        'Recruit Blade Wardens along the high ground, deploy Rangers to intercept aerial scouts, and erect Aether Barricades in the choke slots.',
        'Not a single crystal must shatter under our watch!',
      ],
    },
    victoryEpilogue: {
      speaker: 'Warden Marshal Cedric',
      avatar: 'assets/portraits/blade-warden.png',
      lines: [
        'Victory is ours! The emerald trail is cleansed of fiends for now.',
        'Yet ancient glyphs on their vanguard point toward the Sunken Sanctum...',
        'Gather your champions; the deeper ruins are awakening.',
      ],
    },
    modifiers: [],
    threeStarCrystalRequirement: 20,
    twoStarCrystalRequirement: 12,
  },
  {
    id: 'mission-2-sunken-sanctum',
    actNumber: 2,
    actTitle: 'Act II: The Sunken Ruins',
    stageNumber: 2,
    title: 'Sunken Sanctum',
    location: 'Temple of Primordial Aether',
    subtitle: 'Stage 2 • Sunken Hall of Whispers',
    difficulty: 'Tactician',
    mapDefinition: MAP_SUNKEN_SANCTUM,
    recommendedClasses: ['elementalist', 'chronomancer', 'oracle', 'barricade'],
    prologueStory: {
      speaker: 'High Diviner Lyra',
      avatar: 'assets/portraits/oracle.png',
      lines: [
        'We stand before the drowned colonnades of the Primordial Temple.',
        'Fiends here are armored in hardened carapace and enchanted ooze.',
        'Soldiers blades will glance off their shell; you must rely on Elementalist fire to bypass physical defense, Chronomancer fields to arrest their advance, and Oracles to empower our ranks.',
        'Weave them through our barricade corridors into a deadly spiral!',
      ],
    },
    victoryEpilogue: {
      speaker: 'High Diviner Lyra',
      avatar: 'assets/portraits/oracle.png',
      lines: [
        'The sacred aether altar is cleansed! The elemental equilibrium holds.',
        'A tremor from the southern volcano shook the altar. The Caldera dragons are taking flight!',
        'March to the volcanic peaks before the apex wyrms consume the molten crystal core.',
      ],
    },
    modifiers: [
      {
        id: 'ancient-ward',
        name: 'Aether Resonance',
        description: 'Magic damage against heavy armor is amplified by +15%.',
        icon: '✨',
        magicDamageMultiplier: 1.15,
      },
    ],
    threeStarCrystalRequirement: 20,
    twoStarCrystalRequirement: 10,
  },
  {
    id: 'mission-3-molten-caldera',
    actNumber: 3,
    actTitle: 'Act III: The Dragonpeak Summit',
    stageNumber: 3,
    title: 'Molten Caldera',
    location: 'Dragonpeak Core',
    subtitle: 'Stage 3 • Crucible of the Sovereign',
    difficulty: 'Master',
    mapDefinition: MAP_MOLTEN_CALDERA,
    recommendedClasses: ['ranger', 'lancer', 'juggernaut', 'rogue'],
    prologueStory: {
      speaker: 'Dragoon Knight Valerius',
      avatar: 'assets/portraits/lancer.png',
      lines: [
        'The heat here melts ordinary steel. Magma chasms divide the caldera.',
        'Beware the skies! Flying horrors glide straight across the lava lakes directly toward our crystal font!',
        'Post Sharpshooters and Lancers along the northern ridge to spear flyers out of the air.',
        'This is the crucible. If the Caldera crystals fall, the realm falls with them!',
      ],
    },
    victoryEpilogue: {
      speaker: 'Dragoon Knight Valerius',
      avatar: 'assets/portraits/lancer.png',
      lines: [
        'By the light of the Crystals, the Sky Sovereign has crashed into the abyss!',
        'You have defended the realm through all 31 waves of terror.',
        'Your name is etched into the Crystal Wardens codex for eternity, Grand Tactician!',
      ],
    },
    modifiers: [
      {
        id: 'magma-draft',
        name: 'Magma Thermal Currents',
        description: 'Monsters move +5% faster, but defeat gold is boosted by +15%.',
        icon: '🌋',
        mobSpeedMultiplier: 1.05,
        goldMultiplier: 1.15,
      },
    ],
    threeStarCrystalRequirement: 20,
    twoStarCrystalRequirement: 8,
  },
];
