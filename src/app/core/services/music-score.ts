/**
 * "The Wardens' Stand", the battle theme: an original piece in the style of a 16-bit RPG boss
 * battle. Fast minor-key rock: an organ lead over octave-jumping bass, crunchy palm-muted
 * guitar, brass stabs, a snare-driven kit and, for bosses, timpani and a horn doubling the tune.
 *
 * The score is plain data compiled into 16th-note steps; `MusicService` plays it with synths.
 * Form: a two-bar intro once, then A, A', B (lyrical lift) and C (tension build) on a loop.
 */

export type MusicPart =
  | 'lead'
  | 'horn'
  | 'brass'
  | 'arp'
  | 'pad'
  | 'bass'
  | 'guitar'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'crash'
  | 'timpani';

export const MUSIC_PARTS: readonly MusicPart[] = [
  'lead',
  'horn',
  'brass',
  'arp',
  'pad',
  'bass',
  'guitar',
  'kick',
  'snare',
  'hat',
  'crash',
  'timpani',
];

/** One note (or chord) starting on a step. Drums ignore `midi` beyond picking a voice. */
export interface MusicNote {
  readonly part: MusicPart;
  readonly midi: readonly number[];
  /** Length in 16th-note steps. */
  readonly steps: number;
  /** 0..1 */
  readonly velocity: number;
}

export interface CompiledSong {
  readonly bpm: number;
  readonly stepsPerBar: number;
  /** Steps played once before the loop; the loop jumps back here. */
  readonly introSteps: number;
  readonly totalSteps: number;
  /** Notes starting on each step. */
  readonly steps: readonly (readonly MusicNote[])[];
}

interface Chord {
  /** Bass-register root (MIDI). */
  readonly root: number;
  /** Chord tones in semitones above the root. */
  readonly tones: readonly number[];
  /** A different bass note under the chord (pedal tones, inversions). */
  readonly bass?: number;
}

type BassStyle = 'octave' | 'gallop' | 'pedal' | 'hits' | 'run';
type DrumStyle = 'drive' | 'gallop' | 'build' | 'fill' | 'intro';
type GuitarStyle = 'chug' | 'ring' | 'push' | 'hits';

interface BarSpec {
  readonly chord: Chord;
  readonly bass: BassStyle;
  readonly drums: DrumStyle;
  readonly guitar: GuitarStyle;
  /** Organ melody for the bar, in `Note:steps` tokens ("r" rests); must fill 16 steps. */
  readonly lead?: string;
  /** Brass melody, same notation. */
  readonly brass?: string;
  /** Brass doubles the lead an octave down. */
  readonly brassDouble?: boolean;
  /** Brass chord stabs on these steps. */
  readonly stabs?: readonly number[];
  readonly arp?: boolean;
  readonly pad?: boolean;
  readonly crash?: boolean;
  /** Notes for the bass 'run' style on steps 8..15. */
  readonly run?: readonly number[];
}

const STEPS_PER_BAR = 16;

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" → 73, "Bb4" → 70. */
export function noteToMidi(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!match) throw new Error(`Bad note name: ${name}`);
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return 12 * (Number(match[3]) + 1) + NOTE_INDEX[match[1]] + accidental;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Parses "A4:6 r:2 D5:8" into notes with their starting step. */
export function parseLine(line: string): { step: number; midi: number | null; steps: number }[] {
  const notes: { step: number; midi: number | null; steps: number }[] = [];
  let step = 0;
  for (const token of line.trim().split(/\s+/)) {
    const [name, length] = token.split(':');
    const steps = Number(length);
    if (!Number.isInteger(steps) || steps <= 0) throw new Error(`Bad length in ${token}`);
    notes.push({ step, midi: name === 'r' ? null : noteToMidi(name), steps });
    step += steps;
  }
  return notes;
}

// Chords (D minor)
const Dm: Chord = { root: 38, tones: [0, 3, 7] };
const Bb: Chord = { root: 34, tones: [0, 4, 7] };
const C: Chord = { root: 36, tones: [0, 4, 7] };
const Gm: Chord = { root: 43, tones: [0, 3, 7] };
const A: Chord = { root: 33, tones: [0, 4, 7] };
const Am: Chord = { root: 33, tones: [0, 3, 7] };
const F: Chord = { root: 41, tones: [0, 4, 7] };
const EbOverD: Chord = { root: 39, tones: [0, 4, 7], bass: 38 };
const CsDim: Chord = { root: 37, tones: [0, 3, 6, 9] };

const INTRO: readonly BarSpec[] = [
  { chord: Dm, bass: 'hits', drums: 'intro', guitar: 'hits', stabs: [0, 3, 6], crash: true },
  {
    chord: A,
    bass: 'run',
    drums: 'intro',
    guitar: 'hits',
    stabs: [0, 3, 6],
    run: [45, 46, 49, 50, 52, 53, 55, 57],
    lead: 'r:8 A4:1 Bb4:1 C#5:1 D5:1 E5:1 F5:1 G5:1 A5:1',
  },
];

const SECTION_A: readonly BarSpec[] = [
  { chord: Dm, lead: 'A4:6 D5:2 F5:4 E5:2 D5:2', crash: true },
  { chord: Dm, lead: 'C5:2 D5:2 A4:12' },
  { chord: Bb, lead: 'Bb4:6 D5:2 F5:4 G5:2 F5:2' },
  { chord: C, lead: 'E5:4 C5:4 G5:8', stabs: [8, 11, 14] },
  { chord: Dm, lead: 'A5:6 G5:2 F5:4 E5:2 F5:2' },
  { chord: Dm, lead: 'D5:4 E5:2 F5:2 A5:8' },
  { chord: Gm, lead: 'Bb5:6 A5:2 G5:4 F5:2 G5:2' },
  { chord: A, lead: 'A5:4 E5:4 C#5:4 E5:4', stabs: [12, 14] },
].map((bar) => ({ bass: 'octave', drums: 'drive', guitar: 'chug', pad: true, ...bar }) as BarSpec);

const SECTION_A2: readonly BarSpec[] = SECTION_A.map((bar, i) => {
  if (i === 1) return { ...bar, lead: 'C5:2 D5:2 E5:2 F5:2 E5:4 D5:4' };
  if (i === 6) return { ...bar, lead: 'G5:4 Bb5:4 D6:6 C6:2', brassDouble: true };
  if (i === 7)
    return { ...bar, lead: 'C#6:8 A5:4 E5:4', brassDouble: true, stabs: [], drums: 'fill' };
  return bar;
});

const SECTION_B: readonly BarSpec[] = [
  { chord: Bb, lead: 'D5:8 F5:4 Bb5:4', crash: true },
  { chord: C, lead: 'A5:8 G5:4 E5:4' },
  { chord: Am, lead: 'C5:4 E5:4 A5:8' },
  { chord: Dm, lead: 'F5:12 E5:2 D5:2' },
  { chord: Gm, lead: 'D5:8 G5:4 Bb5:4' },
  { chord: C, lead: 'C6:8 Bb5:4 G5:4' },
  { chord: F, lead: 'A5:8 F5:4 C5:4' },
  { chord: A, lead: 'C#5:8 E5:4 A5:4', drums: 'fill', guitar: 'chug' },
].map(
  (bar) =>
    ({
      bass: 'gallop',
      drums: 'gallop',
      guitar: 'ring',
      pad: true,
      brassDouble: true,
      ...bar,
    }) as BarSpec,
);

const SECTION_C: readonly BarSpec[] = [
  { chord: Dm, brass: 'A5:16', crash: true },
  { chord: EbOverD, brass: 'Bb5:16' },
  { chord: Dm, brass: 'A5:8 D6:8' },
  { chord: EbOverD, brass: 'G5:8 Bb5:8' },
  { chord: Bb, brass: 'F5:16', crash: true },
  { chord: C, brass: 'G5:8 E5:8' },
  { chord: CsDim, brass: 'E5:4 G5:4 Bb5:8', bass: 'octave' },
  { chord: A, brass: 'A5:4 C#6:4 E6:8', bass: 'octave', drums: 'fill', guitar: 'chug' },
].map((bar) => ({ bass: 'pedal', drums: 'build', guitar: 'push', arp: true, ...bar }) as BarSpec);

const LOOP: readonly BarSpec[] = [...SECTION_A, ...SECTION_A2, ...SECTION_B, ...SECTION_C];

/** Moves a note into [low, low + 12). */
function into(midi: number, low: number): number {
  return low + ((((midi - low) % 12) + 12) % 12);
}

function voicing(chord: Chord, low: number): number[] {
  return chord.tones.map((t) => into(chord.root + t, low)).sort((a, b) => a - b);
}

function compileBar(bar: BarSpec, add: (step: number, note: MusicNote) => void): void {
  const { chord } = bar;
  const bassRoot = chord.bass ?? chord.root;
  const note = (part: MusicPart, midi: number[], steps: number, velocity: number): MusicNote => ({
    part,
    midi,
    steps,
    velocity,
  });
  const stabs = bar.stabs ?? [];

  // Bass
  switch (bar.bass) {
    case 'octave':
      for (let i = 0; i < 8; i++)
        add(i * 2, note('bass', [bassRoot + (i % 2 ? 12 : 0)], 2, i % 4 === 0 ? 1 : 0.8));
      break;
    case 'gallop':
      for (let beat = 0; beat < 4; beat++) {
        add(beat * 4, note('bass', [bassRoot], 2, 1));
        add(beat * 4 + 2, note('bass', [bassRoot + 12], 1, 0.75));
        add(beat * 4 + 3, note('bass', [bassRoot], 1, 0.75));
      }
      break;
    case 'pedal':
      for (let s = 0; s < STEPS_PER_BAR; s++)
        add(s, note('bass', [bassRoot + (s % 8 === 6 ? 12 : 0)], 1, s % 4 === 0 ? 1 : 0.65));
      break;
    case 'hits':
      for (const s of stabs) add(s, note('bass', [bassRoot, bassRoot + 12], 2, 1));
      break;
    case 'run':
      for (const s of stabs) add(s, note('bass', [bassRoot, bassRoot + 12], 2, 1));
      (bar.run ?? []).forEach((midi, i) => add(8 + i, note('bass', [midi], 1, 0.7 + i * 0.04)));
      break;
  }

  // Guitar power chords: root, the chord's fifth (diminished ones stay diminished) and octave
  const fifth = chord.tones.find((t) => t === 6 || t === 7) ?? 7;
  const power = [chord.root + 12, chord.root + 12 + fifth, chord.root + 24];
  switch (bar.guitar) {
    case 'chug':
      for (let i = 0; i < 8; i++)
        add(i * 2, note('guitar', power, 1, [0, 3, 5].includes(i) ? 1 : 0.6));
      break;
    case 'ring':
      add(0, note('guitar', power, 6, 0.9));
      add(6, note('guitar', power, 2, 0.7));
      add(8, note('guitar', power, 8, 0.85));
      break;
    case 'push':
      for (const s of [0, 3, 6, 8, 11, 14]) add(s, note('guitar', power, 2, s % 8 === 0 ? 1 : 0.8));
      break;
    case 'hits':
      for (const s of stabs) add(s, note('guitar', power, 2, 1));
      break;
  }

  // Drums
  const hit = (part: MusicPart, s: number, velocity: number): void =>
    add(s, note(part, [], 1, velocity));
  const timpani = (s: number, velocity: number): void =>
    add(s, note('timpani', [into(bassRoot, 36)], 4, velocity));
  switch (bar.drums) {
    case 'drive':
      [0, 8, 10].forEach((s) => hit('kick', s, s === 10 ? 0.75 : 1));
      [4, 12].forEach((s) => hit('snare', s, 1));
      for (let s = 0; s < 16; s += 2) hit('hat', s, s % 4 === 0 ? 0.8 : 0.5);
      [0, 8].forEach((s) => timpani(s, s === 0 ? 1 : 0.7));
      break;
    case 'gallop':
      [0, 3, 8, 11].forEach((s) => hit('kick', s, s % 8 === 0 ? 1 : 0.7));
      [4, 12].forEach((s) => hit('snare', s, 1));
      for (let s = 0; s < 16; s += 2) hit('hat', s, s % 4 === 0 ? 0.8 : 0.5);
      [0, 8].forEach((s) => timpani(s, 0.8));
      break;
    case 'build':
      [0, 4, 8, 12].forEach((s) => hit('kick', s, 1));
      [4, 12].forEach((s) => hit('snare', s, 1));
      [14, 15].forEach((s) => hit('snare', s, 0.35));
      for (let s = 0; s < 16; s++) hit('hat', s, s % 2 === 0 ? 0.55 : 0.3);
      [0, 4, 8, 12].forEach((s) => timpani(s, s === 0 ? 1 : 0.6));
      break;
    case 'fill':
      [0, 8].forEach((s) => hit('kick', s, 1));
      hit('snare', 4, 1);
      for (let s = 8; s < 16; s++) hit('snare', s, 0.45 + (s - 8) * 0.075);
      for (let s = 0; s < 8; s += 2) hit('hat', s, 0.6);
      for (let s = 8; s < 16; s += 2) timpani(s, 0.5 + (s - 8) * 0.06);
      break;
    case 'intro':
      for (const s of stabs) {
        hit('kick', s, 1);
        hit('snare', s, 0.9);
        timpani(s, 1);
      }
      for (let s = 8; s < 16; s++) hit('snare', s, 0.3 + (s - 8) * 0.08);
      break;
  }
  if (bar.crash) hit('crash', 0, 1);

  // Harmony
  const chordTones = voicing(chord, 57);
  if (bar.pad) add(0, note('pad', chordTones, 16, 0.8));
  for (const s of stabs) add(s, note('brass', chordTones, 2, 1));
  if (bar.arp) {
    const tones = voicing(chord, 62);
    const ladder = [...tones, tones[0] + 12, tones[1] + 12];
    const order = [0, 1, 2, 3, 4, 3, 2, 1];
    for (let s = 0; s < 16; s++)
      add(s, note('arp', [ladder[order[s % order.length]]], 1, s % 4 === 0 ? 1 : 0.7));
  }

  // Melodies
  if (bar.lead) {
    for (const n of parseLine(bar.lead)) {
      if (n.midi === null) continue;
      add(n.step, note('lead', [n.midi], n.steps, 1));
      add(n.step, note('horn', [n.midi - 12], n.steps, 0.9));
      if (bar.brassDouble) add(n.step, note('brass', [n.midi - 12], n.steps, 0.85));
    }
  }
  if (bar.brass) {
    for (const n of parseLine(bar.brass)) {
      if (n.midi !== null) add(n.step, note('brass', [n.midi], n.steps, 1));
    }
  }
}

export function compileSong(intro: readonly BarSpec[], loop: readonly BarSpec[], bpm: number) {
  const bars = [...intro, ...loop];
  const steps: MusicNote[][] = Array.from({ length: bars.length * STEPS_PER_BAR }, () => []);
  bars.forEach((bar, b) =>
    compileBar(bar, (step, n) => {
      if (step < 0 || step >= STEPS_PER_BAR) throw new Error(`Step ${step} outside bar ${b}`);
      steps[b * STEPS_PER_BAR + step].push(n);
    }),
  );
  return {
    bpm,
    stepsPerBar: STEPS_PER_BAR,
    introSteps: intro.length * STEPS_PER_BAR,
    totalSteps: steps.length,
    steps,
  } satisfies CompiledSong;
}

/** Every bar's melody lines, for checking that each fills its bar. */
export const BATTLE_THEME_LINES: readonly string[] = [...INTRO, ...LOOP].flatMap((bar) =>
  [bar.lead, bar.brass].filter((line): line is string => !!line),
);

export const BATTLE_THEME: CompiledSong = compileSong(INTRO, LOOP, 152);
