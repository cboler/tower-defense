import { describe, expect, it } from 'vitest';
import { BATTLE_THEME, BATTLE_THEME_LINES, midiToHz, noteToMidi, parseLine } from './music-score';

describe('music score', () => {
  it('reads note names', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('Bb4')).toBe(70);
    expect(noteToMidi('C#5')).toBe(73);
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(() => noteToMidi('H2')).toThrow();
  });

  it('parses a melody line into timed notes', () => {
    expect(parseLine('A4:6 r:2 D5:8')).toEqual([
      { step: 0, midi: 69, steps: 6 },
      { step: 6, midi: null, steps: 2 },
      { step: 8, midi: 74, steps: 8 },
    ]);
  });

  it('fills every bar of every melody exactly', () => {
    expect(BATTLE_THEME_LINES.length).toBeGreaterThan(30);
    for (const line of BATTLE_THEME_LINES) {
      const total = parseLine(line).reduce((sum, n) => sum + n.steps, 0);
      expect(total, line).toBe(16);
    }
  });

  it('plays a two-bar intro once, then loops 32 bars of about fifty seconds', () => {
    const song = BATTLE_THEME;
    expect(song.introSteps).toBe(2 * 16);
    expect(song.totalSteps - song.introSteps).toBe(32 * 16);
    const loopSeconds = ((song.totalSteps - song.introSteps) * 60) / song.bpm / 4;
    expect(loopSeconds).toBeGreaterThan(45);
    expect(loopSeconds).toBeLessThan(60);
    // The loop lands back on the downbeat of section A with a crash
    expect(song.steps[song.introSteps].some((n) => n.part === 'crash')).toBe(true);
  });

  it('stays in D minor (with its raised seventh and the Neapolitan-flavoured E flat)', () => {
    const allowed = new Set(['D', 'E', 'F', 'G', 'A', 'Bb', 'C', 'C#', 'Eb'].map(pitchClass));
    for (const step of BATTLE_THEME.steps) {
      for (const note of step) {
        for (const midi of note.midi)
          expect(allowed.has(midi % 12), `${note.part} ${midi}`).toBe(true);
      }
    }
  });

  it('keeps each part in its register', () => {
    const ranges: Record<string, [number, number]> = {
      bass: [28, 60],
      guitar: [40, 70],
      lead: [60, 90],
      pad: [55, 72],
      timpani: [36, 48],
    };
    for (const step of BATTLE_THEME.steps) {
      for (const note of step) {
        const range = ranges[note.part];
        if (!range) continue;
        for (const midi of note.midi) {
          expect(midi, note.part).toBeGreaterThanOrEqual(range[0]);
          expect(midi, note.part).toBeLessThan(range[1]);
        }
      }
    }
  });
});

function pitchClass(name: string): number {
  return noteToMidi(`${name}4`) % 12;
}
