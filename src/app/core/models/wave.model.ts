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
  groups: WaveGroup[];
}

export function generateStandardWaves(count = 15, difficultyMultiplier = 1.0): WaveDefinition[] {
  const waves: WaveDefinition[] = [
    {
      waveNumber: 1,
      name: 'Skulker Patrol',
      intel: 'Light scouting pack. Place a Blade Warden or Ranger to repel them.',
      bonusGold: 40,
      groups: [{ mobType: 'skulker', count: 8, intervalMs: 1400, spawnDelayMs: 0 }],
    },
    {
      waveNumber: 2,
      name: 'Swiftbeak Gallop',
      intel: 'Fast sprinters! They cut slows in half. Dense placement needed.',
      bonusGold: 50,
      groups: [
        { mobType: 'skulker', count: 5, intervalMs: 1200, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 6, intervalMs: 900, spawnDelayMs: 2500 },
      ],
    },
    {
      waveNumber: 3,
      name: 'Bonewalker Horde',
      intel: 'Fragile swarmers. Splash attacks from Elementalist or Juggernaut shine here.',
      bonusGold: 60,
      groups: [{ mobType: 'bonewalker', count: 18, intervalMs: 650, spawnDelayMs: 0 }],
    },
    {
      waveNumber: 4,
      name: 'Prismatic Shield',
      intel:
        '80% Physical Armor! Swords & arrows will barely scratch them. Deploy an Elementalist!',
      bonusGold: 70,
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
      groups: [{ mobType: 'dread-gaze', count: 10, intervalMs: 1300, spawnDelayMs: 0 }],
    },
    {
      waveNumber: 6,
      name: 'Pyre Cores Awakening',
      intel:
        '80% Magic Shield! Switch back to Blade Wardens, Lancers, and Rangers to crack their shell.',
      bonusGold: 90,
      groups: [
        { mobType: 'pyre-core', count: 8, intervalMs: 1400, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 6, intervalMs: 800, spawnDelayMs: 3500 },
      ],
    },
    {
      waveNumber: 7,
      name: 'Combined Vanguard',
      intel: 'Alternating waves of armored Oozes and magic-immune Pyre Cores.',
      bonusGold: 100,
      groups: [
        { mobType: 'prismatic-ooze', count: 8, intervalMs: 1300, spawnDelayMs: 0 },
        { mobType: 'pyre-core', count: 8, intervalMs: 1300, spawnDelayMs: 1500 },
      ],
    },
    {
      waveNumber: 8,
      name: 'Sky Swarm & Sprinters',
      intel: 'Airborne Dread Gazes screening high-speed Swiftbeaks below.',
      bonusGold: 110,
      groups: [
        { mobType: 'dread-gaze', count: 12, intervalMs: 1100, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 10, intervalMs: 750, spawnDelayMs: 2000 },
      ],
    },
    {
      waveNumber: 9,
      name: 'March of the Undead',
      intel: 'Massive wave of 28 Bonewalkers flanked by elite Pyre Cores.',
      bonusGold: 120,
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
      groups: [
        { mobType: 'bramble-golem', count: 1, intervalMs: 1000, spawnDelayMs: 0 },
        { mobType: 'skulker', count: 12, intervalMs: 800, spawnDelayMs: 2000 },
      ],
    },
    {
      waveNumber: 11,
      name: 'Ironclad Stampede',
      intel: 'Fast Swiftbeaks with hardened armored Ooze vanguards.',
      bonusGold: 140,
      groups: [
        { mobType: 'prismatic-ooze', count: 12, intervalMs: 1100, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 12, intervalMs: 700, spawnDelayMs: 2500 },
      ],
    },
    {
      waveNumber: 12,
      name: 'Aerial Eclipse',
      intel: 'Continuous stream of Flying Dread Gazes at accelerated speeds.',
      bonusGold: 160,
      groups: [{ mobType: 'dread-gaze', count: 20, intervalMs: 900, spawnDelayMs: 0 }],
    },
    {
      waveNumber: 13,
      name: 'Volatile Surge',
      intel: 'High-speed Pyre Cores and armored juggernauts testing your complete defense lineup.',
      bonusGold: 180,
      groups: [
        { mobType: 'pyre-core', count: 14, intervalMs: 950, spawnDelayMs: 0 },
        { mobType: 'prismatic-ooze', count: 12, intervalMs: 1100, spawnDelayMs: 1500 },
      ],
    },
    {
      waveNumber: 14,
      name: 'Cataclysm Vanguard',
      intel: 'Dual Bramble Golems advancing under a canopy of flying horrors!',
      bonusGold: 220,
      groups: [
        { mobType: 'bramble-golem', count: 2, intervalMs: 6000, spawnDelayMs: 0 },
        { mobType: 'dread-gaze', count: 14, intervalMs: 1000, spawnDelayMs: 1000 },
      ],
    },
    {
      waveNumber: 15,
      name: 'FINAL BOSS: Sky Sovereign',
      intel: 'The legendary winged apex titan! Steals 5 crystals on escape. Unleash everything!',
      bonusGold: 350,
      groups: [
        { mobType: 'sky-sovereign', count: 1, intervalMs: 1000, spawnDelayMs: 0 },
        { mobType: 'swiftbeak', count: 14, intervalMs: 600, spawnDelayMs: 3000 },
        { mobType: 'bramble-golem', count: 1, intervalMs: 1000, spawnDelayMs: 8000 },
      ],
    },
  ];

  // Apply difficulty multipliers if needed
  return waves.slice(0, count).map((wave) => ({
    ...wave,
    groups: wave.groups.map((group) => ({
      ...group,
      hpMultiplier: difficultyMultiplier,
    })),
  }));
}
