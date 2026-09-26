import { MobTypeId } from './mob.model';

export interface WaveGroup {
  mobType: MobTypeId;
  count: number;
  intervalMs: number; // delay between spawns in this group
  spawnDelayMs: number; // initial delay before this group starts spawning
  hpMultiplier?: number;
  speedMultiplier?: number;
}

export interface WaveDefinition {
  waveNumber: number;
  name: string;
  intel: string;
  bonusGold: number;
  recommendedClass: string;
  threatBadge:
    | 'Infantry'
    | 'Sprinters'
    | 'Swarm'
    | 'Armored'
    | 'Aerial'
    | 'Magic-Immune'
    | 'Mixed'
    | 'Boss'
    | 'Apex Boss';
  groups: WaveGroup[];
}

export function generateStandardWaves(count = 31, difficultyMultiplier = 1.0): WaveDefinition[] {
  const waves: WaveDefinition[] = [
    // --- TIER 1: NOVICE SKIRMISHES (WAVES 1 - 5) ---
    {
      waveNumber: 1,
      name: 'Skulker Patrol',
      intel: 'Light scouting pack. Place a Blade Warden or Ranger to establish your frontline.',
      bonusGold: 40,
      recommendedClass: 'Blade Warden / Ranger',
      threatBadge: 'Infantry',
      groups: [{ mobType: 'skulker', count: 8, intervalMs: 1400, spawnDelayMs: 0 }],
    },
    {
      waveNumber: 2,
      name: 'Swiftbeak Gallop',
      intel: 'Fast sprinters! They cut slows in half. Dense placement or rapid arrows required.',
      bonusGold: 50,
      recommendedClass: 'Ranger / Blade Warden',
      threatBadge: 'Sprinters',
      groups: [
        { mobType: 'skulker', count: 5, intervalMs: 1200, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 6, intervalMs: 900, spawnDelayMs: 2500 },
      ],
    },
    {
      waveNumber: 3,
      name: 'Bonewalker Horde',
      intel:
        'Fragile swarmers marching in tight formations. Splash from Elementalist or Juggernaut dominates.',
      bonusGold: 60,
      recommendedClass: 'Elementalist / Juggernaut',
      threatBadge: 'Swarm',
      groups: [{ mobType: 'bonewalker', count: 18, intervalMs: 650, spawnDelayMs: 0 }],
    },
    {
      waveNumber: 4,
      name: 'Prismatic Shield',
      intel:
        '80% Physical Armor! Swords & arrows will barely scratch them. Deploy an Elementalist immediately!',
      bonusGold: 70,
      recommendedClass: 'Elementalist',
      threatBadge: 'Armored',
      groups: [
        { mobType: 'prismatic-ooze', count: 8, intervalMs: 1600, spawnDelayMs: 0 },
        { mobType: 'skulker', count: 6, intervalMs: 1000, spawnDelayMs: 3000 },
      ],
    },
    {
      waveNumber: 5,
      name: 'Shadows in the Sky',
      intel:
        'Flying Dread Gazes! Ground melee cannot reach them. Ensure Rangers and Elementalists are ready.',
      bonusGold: 80,
      recommendedClass: 'Ranger',
      threatBadge: 'Aerial',
      groups: [{ mobType: 'dread-gaze', count: 10, intervalMs: 1300, spawnDelayMs: 0 }],
    },

    // --- TIER 2: TACTICAL SPECIALIZATION (WAVES 6 - 10) ---
    {
      waveNumber: 6,
      name: 'Pyre Cores Awakening',
      intel:
        '80% Magic Shield! Switch back to Blade Wardens, Lancers, and Rangers to crack their shell.',
      bonusGold: 90,
      recommendedClass: 'Blade Warden / Lancer',
      threatBadge: 'Magic-Immune',
      groups: [
        { mobType: 'pyre-core', count: 8, intervalMs: 1400, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 6, intervalMs: 800, spawnDelayMs: 3500 },
      ],
    },
    {
      waveNumber: 7,
      name: 'Combined Vanguard',
      intel:
        'Alternating waves of armored Oozes and magic-immune Pyre Cores. Balance physical and arcane.',
      bonusGold: 100,
      recommendedClass: 'Balanced Duo',
      threatBadge: 'Mixed',
      groups: [
        { mobType: 'prismatic-ooze', count: 8, intervalMs: 1300, spawnDelayMs: 0 },
        { mobType: 'pyre-core', count: 8, intervalMs: 1300, spawnDelayMs: 1500 },
      ],
    },
    {
      waveNumber: 8,
      name: 'Sky Swarm & Sprinters',
      intel:
        'Airborne Dread Gazes screening high-speed Swiftbeaks below. Dual-layer defense required.',
      bonusGold: 110,
      recommendedClass: 'Ranger + Chronomancer',
      threatBadge: 'Mixed',
      groups: [
        { mobType: 'dread-gaze', count: 12, intervalMs: 1100, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 10, intervalMs: 750, spawnDelayMs: 2000 },
      ],
    },
    {
      waveNumber: 9,
      name: 'March of the Undead',
      intel:
        'Massive wave of 28 Bonewalkers flanked by elite Pyre Cores. Shockwaves and fireballs needed.',
      bonusGold: 120,
      recommendedClass: 'Juggernaut + Elementalist',
      threatBadge: 'Swarm',
      groups: [
        { mobType: 'bonewalker', count: 28, intervalMs: 500, spawnDelayMs: 0 },
        { mobType: 'pyre-core', count: 8, intervalMs: 1200, spawnDelayMs: 3000 },
      ],
    },
    {
      waveNumber: 10,
      name: 'BOSS: Bramble Golem',
      intel:
        'Colossal health titan! Stun with Lancer, slow with Chronomancer, buff towers with Oracle.',
      bonusGold: 200,
      recommendedClass: 'Lancer + Chronomancer',
      threatBadge: 'Boss',
      groups: [
        { mobType: 'bramble-golem', count: 1, intervalMs: 1000, spawnDelayMs: 0 },
        { mobType: 'skulker', count: 12, intervalMs: 800, spawnDelayMs: 2000 },
      ],
    },

    // --- TIER 3: ESCALATION & RESISTANCE (WAVES 11 - 15) ---
    {
      waveNumber: 11,
      name: 'Ironclad Stampede',
      intel: 'Fast Swiftbeaks escorted by hardened armored Ooze vanguards.',
      bonusGold: 140,
      recommendedClass: 'Elementalist + Ranger',
      threatBadge: 'Mixed',
      groups: [
        { mobType: 'prismatic-ooze', count: 12, intervalMs: 1100, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 12, intervalMs: 700, spawnDelayMs: 2500 },
      ],
    },
    {
      waveNumber: 12,
      name: 'Aerial Eclipse',
      intel:
        'Continuous stream of Flying Dread Gazes at accelerated speeds. Rangers on high alert!',
      bonusGold: 160,
      recommendedClass: 'Ranger (Level 3+)',
      threatBadge: 'Aerial',
      groups: [{ mobType: 'dread-gaze', count: 20, intervalMs: 900, spawnDelayMs: 0 }],
    },
    {
      waveNumber: 13,
      name: 'Volatile Surge',
      intel: 'High-speed Pyre Cores and armored juggernauts testing your complete defense lineup.',
      bonusGold: 180,
      recommendedClass: 'Blade Warden + Elementalist',
      threatBadge: 'Mixed',
      groups: [
        { mobType: 'pyre-core', count: 14, intervalMs: 950, spawnDelayMs: 0 },
        { mobType: 'prismatic-ooze', count: 12, intervalMs: 1100, spawnDelayMs: 1500 },
      ],
    },
    {
      waveNumber: 14,
      name: 'Cataclysm Vanguard',
      intel:
        'Dual Bramble Golems advancing under a canopy of flying horrors! Heavy single-target DPS needed.',
      bonusGold: 220,
      recommendedClass: 'Lancer + Ranger',
      threatBadge: 'Boss',
      groups: [
        { mobType: 'bramble-golem', count: 2, intervalMs: 6000, spawnDelayMs: 0 },
        { mobType: 'dread-gaze', count: 14, intervalMs: 1000, spawnDelayMs: 1000 },
      ],
    },
    {
      waveNumber: 15,
      name: 'MID-BOSS: Sky Sovereign',
      intel:
        'The legendary winged apex titan! Steals 5 crystals on escape. Unleash all anti-air powers!',
      bonusGold: 300,
      recommendedClass: 'Ranger + Lancer',
      threatBadge: 'Apex Boss',
      groups: [
        { mobType: 'sky-sovereign', count: 1, intervalMs: 1000, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 14, intervalMs: 600, spawnDelayMs: 3000 },
        { mobType: 'bramble-golem', count: 1, intervalMs: 1000, spawnDelayMs: 8000 },
      ],
    },

    // --- TIER 4: VETERAN CRUCIBLE (WAVES 16 - 20) ---
    {
      waveNumber: 16,
      name: 'Shadow Infiltration',
      intel:
        'Rapid Skulkers sprint behind Swiftbeak outriders. Upgrade Blade Wardens for swift cleaving.',
      bonusGold: 200,
      recommendedClass: 'Blade Warden + Chronomancer',
      threatBadge: 'Sprinters',
      groups: [
        { mobType: 'skulker', count: 16, intervalMs: 800, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 14, intervalMs: 650, spawnDelayMs: 2000 },
      ],
    },
    {
      waveNumber: 17,
      name: 'Crystalline Phalanx',
      intel: 'Dense phalanx of Prismatic Oozes. High-level Elementalist Archmages are critical!',
      bonusGold: 220,
      recommendedClass: 'Elementalist',
      threatBadge: 'Armored',
      groups: [
        { mobType: 'prismatic-ooze', count: 18, intervalMs: 950, spawnDelayMs: 0 },
        { mobType: 'skulker', count: 12, intervalMs: 800, spawnDelayMs: 3000 },
      ],
    },
    {
      waveNumber: 18,
      name: 'Infernal Conflagration',
      intel:
        '80% Magic Shield elementals marching with high HP. Pure physical steel must cut them down.',
      bonusGold: 240,
      recommendedClass: 'Blade Warden + Lancer',
      threatBadge: 'Magic-Immune',
      groups: [
        { mobType: 'pyre-core', count: 18, intervalMs: 900, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 12, intervalMs: 650, spawnDelayMs: 2500 },
      ],
    },
    {
      waveNumber: 19,
      name: 'Death From Above',
      intel:
        'Massive armada of 26 Dread Gazes blotting out the sun. Maximum Ranger sightlines required.',
      bonusGold: 260,
      recommendedClass: 'Ranger (Level 4+)',
      threatBadge: 'Aerial',
      groups: [{ mobType: 'dread-gaze', count: 26, intervalMs: 750, spawnDelayMs: 0 }],
    },
    {
      waveNumber: 20,
      name: 'BOSS: Elder Golem Titan',
      intel: 'Colossal fortified Elder Golem with reinforced armor and a screen of Bonewalkers!',
      bonusGold: 350,
      recommendedClass: 'Lancer + Juggernaut',
      threatBadge: 'Boss',
      groups: [
        {
          mobType: 'bramble-golem',
          count: 1,
          intervalMs: 1000,
          spawnDelayMs: 0,
          hpMultiplier: 1.5,
        },
        { mobType: 'bonewalker', count: 24, intervalMs: 400, spawnDelayMs: 1500 },
        { mobType: 'swiftbeak', count: 10, intervalMs: 700, spawnDelayMs: 4000 },
      ],
    },

    // --- TIER 5: EXPERT GAUNTLET (WAVES 21 - 25) ---
    {
      waveNumber: 21,
      name: 'Dual Bulwark',
      intel: 'Tightly paired Oozes and Pyre Cores. Alternating physical and magical damage checks.',
      bonusGold: 280,
      recommendedClass: 'Balanced Lineup',
      threatBadge: 'Mixed',
      groups: [
        { mobType: 'prismatic-ooze', count: 16, intervalMs: 900, spawnDelayMs: 0 },
        { mobType: 'pyre-core', count: 16, intervalMs: 900, spawnDelayMs: 1200 },
      ],
    },
    {
      waveNumber: 22,
      name: 'Necropolis Uprising',
      intel:
        'Overwhelming horde of 40 Bonewalkers! Continuous Juggernaut quakes and Archmage fire required.',
      bonusGold: 300,
      recommendedClass: 'Juggernaut + Elementalist',
      threatBadge: 'Swarm',
      groups: [
        { mobType: 'bonewalker', count: 40, intervalMs: 380, spawnDelayMs: 0 },
        { mobType: 'pyre-core', count: 10, intervalMs: 1000, spawnDelayMs: 3500 },
      ],
    },
    {
      waveNumber: 23,
      name: 'Cloudburst Blitz',
      intel: 'Fast flying Dread Gazes coupled with sprinting Swiftbeaks. Extreme lane velocity!',
      bonusGold: 320,
      recommendedClass: 'Ranger + Chronomancer',
      threatBadge: 'Mixed',
      groups: [
        { mobType: 'dread-gaze', count: 22, intervalMs: 750, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 18, intervalMs: 550, spawnDelayMs: 2000 },
      ],
    },
    {
      waveNumber: 24,
      name: 'Ancient Siege',
      intel: 'Dual Bramble Golems advancing with heavily armored Ooze vanguards.',
      bonusGold: 360,
      recommendedClass: 'Lancer + Elementalist',
      threatBadge: 'Boss',
      groups: [
        {
          mobType: 'bramble-golem',
          count: 2,
          intervalMs: 5000,
          spawnDelayMs: 0,
          hpMultiplier: 1.25,
        },
        { mobType: 'prismatic-ooze', count: 16, intervalMs: 850, spawnDelayMs: 1500 },
      ],
    },
    {
      waveNumber: 25,
      name: 'BOSS: Twin Sovereigns',
      intel:
        'Two Apex Sky Sovereigns flying in tandem! Stun and burst them down before they cross.',
      bonusGold: 450,
      recommendedClass: 'High-Tier Rangers + Lancers',
      threatBadge: 'Apex Boss',
      groups: [
        { mobType: 'sky-sovereign', count: 2, intervalMs: 4000, spawnDelayMs: 0 },
        { mobType: 'dread-gaze', count: 16, intervalMs: 800, spawnDelayMs: 2000 },
      ],
    },

    // --- TIER 6: ENDURANCE & APEX GAUNTLET (WAVES 26 - 31) ---
    {
      waveNumber: 26,
      name: 'Iron Core Stampede',
      intel:
        'Armored Oozes paired with max-speed Swiftbeaks. High temporal slows and arcane power needed.',
      bonusGold: 380,
      recommendedClass: 'Chronomancer + Elementalist',
      threatBadge: 'Armored',
      groups: [
        { mobType: 'prismatic-ooze', count: 22, intervalMs: 800, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 18, intervalMs: 500, spawnDelayMs: 2500 },
      ],
    },
    {
      waveNumber: 27,
      name: 'Blazing Sky Tempest',
      intel:
        'Magic-shielded Pyre Cores under air cover from Dread Gazes. Steel and arrows must hold.',
      bonusGold: 400,
      recommendedClass: 'Blade Warden + Ranger',
      threatBadge: 'Mixed',
      groups: [
        { mobType: 'pyre-core', count: 20, intervalMs: 800, spawnDelayMs: 0 },
        { mobType: 'dread-gaze', count: 20, intervalMs: 750, spawnDelayMs: 1500 },
      ],
    },
    {
      waveNumber: 28,
      name: 'The Speed Trial',
      intel:
        'Ultra-fast Swiftbeaks and sprinting Skulkers in relentless succession. Chokepoints will be tested.',
      bonusGold: 420,
      recommendedClass: 'Chronomancer + Juggernaut',
      threatBadge: 'Sprinters',
      groups: [
        { mobType: 'swiftbeak', count: 26, intervalMs: 450, spawnDelayMs: 0 },
        { mobType: 'skulker', count: 20, intervalMs: 650, spawnDelayMs: 2000 },
      ],
    },
    {
      waveNumber: 29,
      name: 'Titan Triad',
      intel: 'Three Bramble Golems marching together with elemental shock troops!',
      bonusGold: 500,
      recommendedClass: 'Lancer + Oracle + Elementalist',
      threatBadge: 'Boss',
      groups: [
        {
          mobType: 'bramble-golem',
          count: 3,
          intervalMs: 4500,
          spawnDelayMs: 0,
          hpMultiplier: 1.3,
        },
        { mobType: 'pyre-core', count: 16, intervalMs: 800, spawnDelayMs: 2000 },
      ],
    },
    {
      waveNumber: 30,
      name: 'Apex Convergence',
      intel:
        'Sky Sovereign leading dual Golems and elite guards. The sanctuary is under dire threat!',
      bonusGold: 600,
      recommendedClass: 'Grand Paladin + Sky Piercer + Paragon',
      threatBadge: 'Apex Boss',
      groups: [
        {
          mobType: 'sky-sovereign',
          count: 1,
          intervalMs: 1000,
          spawnDelayMs: 0,
          hpMultiplier: 1.3,
        },
        {
          mobType: 'bramble-golem',
          count: 2,
          intervalMs: 4000,
          spawnDelayMs: 2000,
          hpMultiplier: 1.3,
        },
        { mobType: 'prismatic-ooze', count: 18, intervalMs: 750, spawnDelayMs: 4000 },
      ],
    },
    {
      waveNumber: 31,
      name: 'FINAL APEX GAUNTLET',
      intel:
        'The ultimate battle! Ancient Sky Sovereign, Elder Titan, and endless hordes. Save the Crystals!',
      bonusGold: 1000,
      recommendedClass: 'Max Level Defenders Roster',
      threatBadge: 'Apex Boss',
      groups: [
        {
          mobType: 'sky-sovereign',
          count: 2,
          intervalMs: 5000,
          spawnDelayMs: 0,
          hpMultiplier: 1.5,
        },
        {
          mobType: 'bramble-golem',
          count: 2,
          intervalMs: 4000,
          spawnDelayMs: 3000,
          hpMultiplier: 1.5,
        },
        { mobType: 'dread-gaze', count: 24, intervalMs: 600, spawnDelayMs: 5000 },
        { mobType: 'swiftbeak', count: 24, intervalMs: 450, spawnDelayMs: 7000 },
      ],
    },
  ];

  // Slice to requested count and apply difficulty multipliers
  return waves.slice(0, count).map((wave) => ({
    ...wave,
    groups: wave.groups.map((group) => ({
      ...group,
      hpMultiplier: (group.hpMultiplier ?? 1.0) * difficultyMultiplier,
    })),
  }));
}
