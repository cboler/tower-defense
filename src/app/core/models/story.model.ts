export type StoryEmotion =
  'neutral' | 'urgent' | 'victorious' | 'mysterious' | 'warning' | 'contemplative';

export interface StoryDialogueStep {
  speaker: string;
  avatar: string;
  title?: string;
  side?: 'left' | 'right';
  emotion?: StoryEmotion;
  text: string;
}

export type StoryTriggerType =
  'on-mission-start' | 'on-wave-start' | 'on-crystal-breach' | 'on-victory' | 'on-defeat';

export interface StoryNarrativeEvent {
  id: string;
  title: string;
  trigger: StoryTriggerType;
  triggerWaveNumber?: number; // 0-based or 1-based matching waveIndex + 1
  steps: StoryDialogueStep[];
  autoPause?: boolean; // automatically pause battle while cutscene is displaying
}

export interface StoryObjective {
  id: string;
  title: string;
  description: string;
  isCompleted: boolean;
  isBonus?: boolean;
}

export interface CodexEntry {
  id: string;
  category: 'Lore' | 'Classes' | 'Bestiary' | 'Sanctuaries';
  title: string;
  subtitle: string;
  icon: string;
  summary: string;
  fullText: string;
  unlockedByDefault?: boolean;
}

export const WORLD_CODEX_ENTRIES: CodexEntry[] = [
  {
    id: 'codex-crystal-sanctuaries',
    category: 'Sanctuaries',
    title: 'The Sacred Crystal Fonts',
    subtitle: 'Heart of the Realm',
    icon: '💎',
    summary: 'Luminous reservoirs of primordial energy that anchor the realm equilibrium.',
    fullText:
      'Long before the kingdoms of men and beastkin rose, the World Crystals materialized at convergence points across the continents. These fonts radiate soothing aether that nourishes the forests, purifies subterranean springs, and tempers chaotic mana. Fiends are insatiably drawn to their brilliance, seeking to shatter and consume the crystalline matrices.',
    unlockedByDefault: true,
  },
  {
    id: 'codex-warden-order',
    category: 'Classes',
    title: 'The Order of Crystal Wardens',
    subtitle: 'Vanguard Defenders of the Fonts',
    icon: '🛡️',
    summary: 'A guild of elite tacticians, mages, and martial sentinels.',
    fullText:
      'Formed during the First Incursion, the Crystal Wardens unite diverse traditions—from the discipline of heavy Blade Wardens to the celestial insights of Oracles and the cunning subterfuge of Plunderer Rogues. Rather than waging open war, Wardens specialize in positional tactical defense, directing battlefield flow and funneling foes into lethal crossfires.',
    unlockedByDefault: true,
  },
  {
    id: 'codex-aether-barricades',
    category: 'Classes',
    title: 'Aether Mazing Barricades',
    subtitle: 'Geometric Fortifications',
    icon: '🧱',
    summary: 'Hardlight shields erected in designated focal slots to redirect fiend marches.',
    fullText:
      'Constructed using resonance coils tuned to the ley lines, Aether Barricades present impenetrable walls to ground fiends. The law of mazing dictates that defenders must always leave at least one viable avenue for the horde, lest excessive mana pressure shatter the surrounding earth.',
    unlockedByDefault: true,
  },
];
