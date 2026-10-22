import { Injectable, signal } from '@angular/core';
import { SUPER_BOSS_DEATH } from '../models/mob.model';

@Injectable({ providedIn: 'root' })
export class AudioService {
  private ctx: AudioContext | null = null;
  public readonly muted = signal(false);

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crystal-td-muted');
      if (saved !== null) {
        this.muted.set(saved === 'true');
      }
    }
  }

  public toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('crystal-td-muted', String(next));
    }
  }

  private initContext(): AudioContext | null {
    if (this.muted()) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public playSelect(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.05);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playSlash(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playArrow(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.1);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Plucked lyre string on a random pentatonic note, for the Bard's song arrows. */
  public playHarp(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 587.33, 659.25, 783.99, 880];
    const root = notes[Math.floor(Math.random() * notes.length)];
    [1, 2].forEach((harmonic, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(root * harmonic, now);

      gain.gain.setValueAtTime(i === 0 ? 0.08 : 0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    });
  }

  public playExplosion(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  public playSlowPulse(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.25);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** A short electric crackle: a buzzing square wave that stutters as it falls. */
  public playZap(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.16);
    gain.gain.setValueAtTime(0.05, now);
    for (let i = 1; i <= 4; i++) {
      gain.gain.setValueAtTime(i % 2 ? 0.015 : 0.05, now + i * 0.025);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  /** The Red Mage's Prism Impact: a bright, glassy chime of rising fifths that rings out. */
  public playPrism(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1318.5, 1760, 2637].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.035;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.detune.setValueAtTime(i % 2 ? 6 : -6, start);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.setValueAtTime(0.06 - i * 0.01, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(start + 0.5);
    });
  }

  public playBuff(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [440, 554, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + i * 0.05;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.07, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.18);
    });
  }

  public playLevelUp(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Bright rising major arpeggio with a shimmering octave on top
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + i * 0.06;
      const length = i === 4 ? 0.45 : 0.2;

      osc.type = i === 4 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.1, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + length);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + length);
    });
  }

  public playCoin(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.06); // E6

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playCrystalDamage(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(185, now);
    osc.frequency.setValueAtTime(140, now + 0.1);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  public playWaveStart(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [330, 440, 554, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + i * 0.07;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  }

  public playVictory(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
  }

  public playDefeat(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [440, 415, 392, 349];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.18;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  }

  public playCountdownTick(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.04);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /** A super boss's footfall: a sub-bass thud with a crunch of gravel. */
  public playStomp(weight = 1): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.thud(ctx, now, 0.26 * weight, 72, 0.42);
    this.noiseBurst(ctx, now, 0.07 * weight, 900, 0.18);
  }

  /** Armour giving way: a deep impact, ringing iron and the scrape of falling plates. */
  public playArmorBreak(stage: number): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.thud(ctx, now, 0.3, 90, 0.5);
    this.clang(ctx, now, 0.12, 310 - stage * 40);
    this.noiseBurst(ctx, now + 0.05, 0.12, 2400, 0.35);
    // The fall to the ground lands a beat later
    if (stage >= 3) this.thud(ctx, now + 0.9, 0.34, 60, 0.7);
  }

  /** The super boss's death: popping blasts, a last groan, the fall and a final explosion. */
  public playColossusDeath(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.clang(ctx, now, 0.16, 220);
    for (const [i, at] of SUPER_BOSS_DEATH.pops.entries()) {
      this.thud(ctx, now + at, 0.12 + i * 0.008, 140 - i * 4, 0.25);
      this.noiseBurst(ctx, now + at, 0.08, 1600, 0.22);
    }
    // A failing furnace groan as it reaches out one last time
    const groan = ctx.createOscillator();
    const groanGain = ctx.createGain();
    const start = now + SUPER_BOSS_DEATH.reach;
    groan.type = 'sawtooth';
    groan.frequency.setValueAtTime(95, start);
    groan.frequency.exponentialRampToValueAtTime(38, start + 0.75);
    groanGain.gain.setValueAtTime(0.0001, start);
    groanGain.gain.exponentialRampToValueAtTime(0.09, start + 0.15);
    groanGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
    groan.connect(groanGain);
    groanGain.connect(ctx.destination);
    groan.start(start);
    groan.stop(start + 0.8);
    this.thud(ctx, now + SUPER_BOSS_DEATH.slump, 0.32, 58, 0.6);
    this.thud(ctx, now + SUPER_BOSS_DEATH.blast, 0.4, 110, 1.2);
    this.noiseBurst(ctx, now + SUPER_BOSS_DEATH.blast, 0.2, 1200, 1.1);
  }

  /** A falling sine: the body of every impact. */
  private thud(ctx: AudioContext, at: number, volume: number, freq: number, length: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.35), at + length);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length);
  }

  /** Filtered white noise: grit, debris and blast. */
  private noiseBurst(
    ctx: AudioContext,
    at: number,
    volume: number,
    cutoff: number,
    length: number,
  ): void {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, at);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(at);
    source.stop(at + length);
  }

  /** Struck iron: inharmonic partials ringing down. */
  private clang(ctx: AudioContext, at: number, volume: number, freq: number): void {
    for (const [ratio, share] of [
      [1, 1],
      [2.76, 0.5],
      [5.4, 0.25],
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * ratio, at);
      gain.gain.setValueAtTime(volume * share, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.9 / ratio + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 1.2);
    }
  }

  public playEarlyCallHorn(): void {
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord = [392.0, 523.25, 659.25, 783.99];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.06;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.linearRampToValueAtTime(freq * 1.02, startTime + 0.28);

      gain.gain.setValueAtTime(0.14, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.32);
    });
  }
}
