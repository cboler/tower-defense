import { DOCUMENT, Injectable, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import { AudioService } from './audio.service';
import {
  BATTLE_THEME,
  CompiledSong,
  MUSIC_PARTS,
  MusicNote,
  MusicPart,
  midiToHz,
} from './music-score';

/** What the battle needs from the music: nothing, the build phase, a wave, or a boss wave. */
export type MusicMood = 'silent' | 'calm' | 'battle' | 'boss';
export type MusicLevel = 'on' | 'soft' | 'off';

const STORAGE_KEY = 'crystal-td-music';
const LEVELS: readonly MusicLevel[] = ['on', 'soft', 'off'];
/** Master gain per level; kept well under the sound effects. */
const LEVEL_GAIN: Record<MusicLevel, number> = { on: 0.25, soft: 0.12, off: 0 };

/** How loud each part is in each mood; missing parts are silent (and not scheduled). */
export const MOOD_MIX: Record<Exclude<MusicMood, 'silent'>, Partial<Record<MusicPart, number>>> = {
  calm: { lead: 0.8, arp: 0.8, pad: 1.4, bass: 1, kick: 0.6, hat: 0.6 },
  battle: {
    lead: 1,
    brass: 1,
    arp: 1,
    pad: 0.7,
    bass: 1,
    guitar: 1,
    kick: 1,
    snare: 1,
    hat: 0.8,
    crash: 1,
  },
  boss: {
    lead: 1,
    horn: 1,
    brass: 1.15,
    arp: 1,
    pad: 0.7,
    bass: 1.05,
    guitar: 1.2,
    kick: 1.15,
    snare: 1.1,
    hat: 1,
    crash: 1.1,
    timpani: 1,
  },
};

/** Output of the guitar amp after its overdrive. */
const GUITAR_AMP = 0.14;

/** Base volume of a full-velocity note per part (for the guitar, how hard it drives the amp). */
const PART_VOLUME: Record<MusicPart, number> = {
  lead: 0.11,
  horn: 0.07,
  brass: 0.075,
  arp: 0.045,
  pad: 0.03,
  bass: 0.13,
  guitar: 0.045,
  kick: 0.38,
  snare: 0.3,
  hat: 0.05,
  crash: 0.07,
  timpani: 0.32,
};

const PART_PAN: Partial<Record<MusicPart, number>> = {
  lead: 0.05,
  horn: -0.2,
  brass: 0.2,
  arp: 0.3,
  guitar: -0.3,
  hat: 0.25,
  crash: -0.15,
};

const REVERB_SEND: Partial<Record<MusicPart, number>> = {
  lead: 0.3,
  horn: 0.25,
  brass: 0.3,
  arp: 0.25,
  pad: 0.5,
  snare: 0.18,
  crash: 0.2,
  timpani: 0.2,
};

/** Seconds of music scheduled ahead of the audio clock, and how often the scheduler wakes. */
const LOOKAHEAD_S = 0.2;
const TICK_MS = 50;
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

interface MusicGraph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly duck: GainNode;
  readonly muffle: BiquadFilterNode;
  readonly parts: Record<MusicPart, GainNode>;
  readonly guitarIn: GainNode;
  readonly noise: AudioBuffer;
  readonly organ: PeriodicWave;
  readonly soft: PeriodicWave;
  readonly reed: PeriodicWave;
}

/**
 * The battle music: "The Wardens' Stand" (see `music-score.ts`), synthesized live with the
 * Web Audio API and scheduled a little ahead of the audio clock so it never drifts or stutters.
 *
 * It has its own AudioContext, separate from the sound effects, so pausing is a plain
 * `suspend()` that freezes the music clock and picks up on the same 16th note. The battle
 * screen sets `mood` (layers fade in and out with it) and `ducked` (quieter and muffled while
 * the game is paused or a menu is up). It never starts before the first user gesture, follows
 * the global mute, and has its own On / Soft / Off level saved per browser.
 */
@Injectable({ providedIn: 'root' })
export class MusicService implements OnDestroy {
  private readonly audio = inject(AudioService);
  private readonly document = inject(DOCUMENT);

  public readonly level = signal<MusicLevel>('on');
  public readonly mood = signal<MusicMood>('silent');
  public readonly ducked = signal(false);

  private readonly unlocked = signal(false);
  private readonly hidden = signal(false);
  private readonly song: CompiledSong = BATTLE_THEME;
  private readonly stepSeconds = 60 / this.song.bpm / 4;

  private graph: MusicGraph | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private position = 0;
  private nextStepTime = 0;
  private restart = true;
  private readonly partTarget = new Map<MusicPart, number>();
  private readonly partFadeEnd = new Map<MusicPart, number>();

  constructor() {
    const saved = this.storage()?.getItem(STORAGE_KEY);
    if (saved && (LEVELS as readonly string[]).includes(saved)) this.level.set(saved as MusicLevel);

    const win = this.document.defaultView;
    if (win) {
      if (this.hasUserActivation()) this.unlocked.set(true);
      else
        for (const type of GESTURES)
          win.addEventListener(type, this.onGesture, { capture: true, passive: true });
      this.document.addEventListener('visibilitychange', this.onVisibility);
      this.hidden.set(this.document.visibilityState === 'hidden');
    }

    effect(() => {
      const mood = this.mood();
      const level = this.level();
      const ducked = this.ducked();
      const audible = this.unlocked() && !this.audio.muted() && level !== 'off' && !this.hidden();
      untracked(() => {
        if (audible && mood !== 'silent') this.play(mood, level, ducked);
        else this.halt(mood === 'silent');
      });
    });
  }

  /** The current step in the song, for tests and debugging. */
  public get playhead(): number {
    return this.position;
  }

  public get isRunning(): boolean {
    return this.timer !== null;
  }

  /** On → Soft → Off, remembered per browser. */
  public cycleLevel(): void {
    const next = LEVELS[(LEVELS.indexOf(this.level()) + 1) % LEVELS.length];
    this.level.set(next);
    this.storage()?.setItem(STORAGE_KEY, next);
  }

  /** Lets music start from inputs the gesture listeners can't see (a controller button). */
  public unlock(): void {
    if (!this.unlocked() && this.hasUserActivation()) this.unlocked.set(true);
  }

  ngOnDestroy(): void {
    this.stopTimer();
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    const win = this.document.defaultView;
    for (const type of GESTURES) win?.removeEventListener(type, this.onGesture, { capture: true });
    this.document.removeEventListener('visibilitychange', this.onVisibility);
    void this.graph?.ctx.close();
    this.graph = null;
  }

  private readonly onGesture = (): void => {
    this.unlocked.set(true);
    // Resume inside the gesture itself, which is what autoplay policies look for
    const ctx = this.graph?.ctx;
    if (ctx?.state === 'suspended' && this.timer) void ctx.resume();
    const win = this.document.defaultView;
    for (const type of GESTURES) win?.removeEventListener(type, this.onGesture, { capture: true });
  };

  private readonly onVisibility = (): void => {
    this.hidden.set(this.document.visibilityState === 'hidden');
  };

  private hasUserActivation(): boolean {
    const nav = this.document.defaultView?.navigator as
      (Navigator & { userActivation?: { hasBeenActive: boolean } }) | undefined;
    return !!nav?.userActivation?.hasBeenActive;
  }

  private storage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private play(mood: Exclude<MusicMood, 'silent'>, level: MusicLevel, ducked: boolean): void {
    const graph = this.ensureGraph();
    if (!graph) return;
    const { ctx } = graph;
    if (this.suspendTimer) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;

    if (this.restart) {
      this.restart = false;
      this.position = 0;
      this.nextStepTime = now + 0.08;
    }

    for (const part of MUSIC_PARTS) {
      const target = MOOD_MIX[mood][part] ?? 0;
      const previous = this.partTarget.get(part) ?? 0;
      if (target === previous) continue;
      this.partTarget.set(part, target);
      // Keep scheduling a part while it fades out
      if (target === 0) this.partFadeEnd.set(part, now + 2.5);
      ramp(graph.parts[part].gain, target, now, 0.5);
    }
    ramp(graph.master.gain, LEVEL_GAIN[level], now, 0.15);
    ramp(graph.duck.gain, ducked ? 0.4 : 1, now, 0.12);
    ramp(graph.muffle.frequency, ducked ? 900 : Math.min(20000, ctx.sampleRate / 2), now, 0.12);

    if (!this.timer) {
      this.timer = setInterval(this.tick, TICK_MS);
      this.tick();
    }
  }

  private halt(fromTheTop: boolean): void {
    if (fromTheTop) this.restart = true;
    this.stopTimer();
    const graph = this.graph;
    if (!graph || graph.ctx.state !== 'running' || this.suspendTimer) return;
    ramp(graph.master.gain, 0, graph.ctx.currentTime, 0.12);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (!this.timer) void graph.ctx.suspend();
    }, 600);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private readonly tick = (): void => {
    const graph = this.graph;
    if (!graph || graph.ctx.state !== 'running') return;
    const now = graph.ctx.currentTime;
    // Fell behind (a long frame, a resume): carry on from here rather than cram notes in
    if (this.nextStepTime < now) this.nextStepTime = now + 0.03;
    const horizon = now + LOOKAHEAD_S;
    while (this.nextStepTime < horizon) {
      this.playStep(graph, this.position, this.nextStepTime);
      this.position =
        this.position + 1 >= this.song.totalSteps ? this.song.introSteps : this.position + 1;
      this.nextStepTime += this.stepSeconds;
    }
  };

  private playStep(graph: MusicGraph, position: number, at: number): void {
    for (const note of this.song.steps[position]) {
      const part = note.part;
      if ((this.partTarget.get(part) ?? 0) <= 0 && at > (this.partFadeEnd.get(part) ?? 0)) continue;
      this.voice(graph, note, at);
    }
  }

  private ensureGraph(): MusicGraph | null {
    if (this.graph) return this.graph;
    const win = this.document.defaultView as
      (typeof globalThis & { webkitAudioContext?: typeof AudioContext }) | null;
    const AudioCtx = win?.AudioContext ?? win?.webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();

    const master = ctx.createGain();
    master.gain.value = 0;
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = Math.min(20000, ctx.sampleRate / 2);
    const duck = ctx.createGain();
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.2;
    glue.connect(duck);
    duck.connect(muffle);
    muffle.connect(master);
    master.connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = hallImpulse(ctx, 1.8);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.45;
    reverb.connect(reverbReturn);
    reverbReturn.connect(glue);

    const parts = {} as Record<MusicPart, GainNode>;
    for (const part of MUSIC_PARTS) {
      const bus = ctx.createGain();
      bus.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = PART_PAN[part] ?? 0;
      bus.connect(pan);
      pan.connect(glue);
      const send = REVERB_SEND[part];
      if (send) {
        const sendGain = ctx.createGain();
        sendGain.gain.value = send;
        bus.connect(sendGain);
        sendGain.connect(reverb);
      }
      parts[part] = bus;
    }

    // Guitar: notes sum into one overdriven amp, so power chords crunch together
    const guitarIn = ctx.createGain();
    const drive = ctx.createWaveShaper();
    drive.curve = overdriveCurve(28);
    drive.oversample = '2x';
    const cabinet = ctx.createBiquadFilter();
    cabinet.type = 'lowpass';
    cabinet.frequency.value = 2600;
    cabinet.Q.value = 0.8;
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = 90;
    // The overdrive flattens every note to full scale, so the amp sets the guitar's level
    const amp = ctx.createGain();
    amp.gain.value = GUITAR_AMP;
    guitarIn.connect(drive);
    drive.connect(cabinet);
    cabinet.connect(lowCut);
    lowCut.connect(amp);
    amp.connect(parts.guitar);

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.graph = {
      ctx,
      master,
      duck,
      muffle,
      parts,
      guitarIn,
      noise,
      // Drawbar organ, a softer pad organ and a hollow reed for arpeggios
      organ: harmonicWave(ctx, [1, 0.75, 0.5, 0.38, 0.18, 0.25, 0, 0.12]),
      soft: harmonicWave(ctx, [1, 0.4, 0.15, 0.08]),
      reed: harmonicWave(ctx, [1, 0.05, 0.4, 0.04, 0.22, 0.03, 0.12]),
    };
    this.partTarget.clear();
    this.partFadeEnd.clear();
    return this.graph;
  }

  private voice(graph: MusicGraph, note: MusicNote, at: number): void {
    const length = note.steps * this.stepSeconds;
    const volume = PART_VOLUME[note.part] * note.velocity;
    const out = graph.parts[note.part];
    switch (note.part) {
      case 'lead':
        return this.organ(graph, note.midi[0], at, length, volume, out);
      case 'horn':
      case 'brass':
        return this.brass(graph, note.midi, at, length, volume, out);
      case 'arp':
        return this.tone(graph.ctx, graph.reed, note.midi, at, length * 0.9, volume, out, 0.004);
      case 'pad':
        return this.tone(graph.ctx, graph.soft, note.midi, at, length, volume, out, 0.25);
      case 'bass':
        return this.bass(graph.ctx, note.midi, at, length, volume, out);
      case 'guitar':
        return this.guitar(graph, note.midi, at, length, volume);
      case 'kick':
        return this.kick(graph.ctx, at, volume, out);
      case 'snare':
        return this.snare(graph, at, volume, out);
      case 'hat':
        return this.noiseHit(graph, at, volume, out, 'highpass', 7000, 0.045);
      case 'crash':
        return this.noiseHit(graph, at, volume, out, 'highpass', 4200, 1.6);
      case 'timpani':
        return this.timpani(graph.ctx, note.midi[0], at, volume, out);
    }
  }

  /** Two detuned drawbar oscillators; long notes grow a vibrato. */
  private organ(
    graph: MusicGraph,
    midi: number,
    at: number,
    length: number,
    volume: number,
    out: AudioNode,
  ): void {
    const { ctx } = graph;
    const end = at + length;
    const gain = envelope(ctx, at, length, volume, 0.012, 0.8, 0.05);
    gain.connect(out);
    const oscs = [-5, 5].map((cents) => {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(graph.organ);
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = cents;
      osc.connect(gain);
      osc.start(at);
      osc.stop(end + 0.06);
      return osc;
    });
    if (length > 0.45) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.6;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(14, at + 0.35);
      lfo.connect(depth);
      for (const osc of oscs) depth.connect(osc.detune);
      lfo.start(at);
      lfo.stop(end + 0.06);
    }
  }

  /** Sawtooths through a lowpass that opens on the attack: the brass "blat". */
  private brass(
    graph: MusicGraph,
    midis: readonly number[],
    at: number,
    length: number,
    volume: number,
    out: AudioNode,
  ): void {
    const { ctx } = graph;
    const end = at + length;
    const top = midiToHz(Math.max(...midis));
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(top * 1.2, at);
    filter.frequency.exponentialRampToValueAtTime(Math.min(6000, top * 6), at + 0.05);
    filter.frequency.exponentialRampToValueAtTime(Math.min(4000, top * 3), at + 0.25);
    const gain = envelope(ctx, at, length, volume / Math.sqrt(midis.length), 0.025, 0.75, 0.08);
    filter.connect(gain);
    gain.connect(out);
    const detunes = midis.length === 1 ? [-7, 7] : [0];
    for (const midi of midis) {
      for (const cents of detunes) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToHz(midi);
        osc.detune.value = cents;
        osc.connect(filter);
        osc.start(at);
        osc.stop(end + 0.1);
      }
    }
  }

  private tone(
    ctx: AudioContext,
    wave: PeriodicWave,
    midis: readonly number[],
    at: number,
    length: number,
    volume: number,
    out: AudioNode,
    attack: number,
  ): void {
    const gain = envelope(ctx, at, length, volume, attack, attack > 0.1 ? 0.9 : 0.35, 0.1);
    gain.connect(out);
    for (const midi of midis) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.value = midiToHz(midi);
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + length + 0.12);
    }
  }

  /** A plucked sawtooth with a closing filter, each note of an octave pair its own pluck. */
  private bass(
    ctx: AudioContext,
    midis: readonly number[],
    at: number,
    length: number,
    volume: number,
    out: AudioNode,
  ): void {
    const gate = Math.max(0.06, length * 0.85);
    for (const midi of midis) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(midi);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 3;
      filter.frequency.setValueAtTime(2200, at);
      filter.frequency.exponentialRampToValueAtTime(420, at + 0.12);
      const gain = envelope(ctx, at, gate, volume / Math.sqrt(midis.length), 0.004, 0.7, 0.03);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(at);
      osc.stop(at + gate + 0.05);
    }
  }

  private guitar(
    graph: MusicGraph,
    midis: readonly number[],
    at: number,
    length: number,
    volume: number,
  ): void {
    const { ctx } = graph;
    // Short notes are palm-muted chugs; long ones ring
    const gate = length < 0.2 ? length * 0.8 : length * 0.95;
    const gain = envelope(ctx, at, gate, volume, 0.004, length < 0.2 ? 0.4 : 0.8, 0.04);
    gain.connect(graph.guitarIn);
    for (const midi of midis) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = (Math.random() - 0.5) * 10;
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + gate + 0.06);
    }
  }

  private kick(ctx: AudioContext, at: number, volume: number, out: AudioNode): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.11);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
    osc.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  private snare(graph: MusicGraph, at: number, volume: number, out: AudioNode): void {
    this.noiseHit(graph, at, volume, out, 'bandpass', 2400, 0.16);
    const { ctx } = graph;
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(220, at);
    body.frequency.exponentialRampToValueAtTime(170, at + 0.06);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.6, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
    body.connect(gain);
    gain.connect(out);
    body.start(at);
    body.stop(at + 0.1);
  }

  private noiseHit(
    graph: MusicGraph,
    at: number,
    volume: number,
    out: AudioNode,
    type: BiquadFilterType,
    cutoff: number,
    length: number,
  ): void {
    const { ctx } = graph;
    const source = ctx.createBufferSource();
    source.buffer = graph.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    if (type === 'bandpass') filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    // A random slice of the shared noise, so repeated hits don't sound identical
    source.start(at, Math.random() * 0.4, length + 0.02);
  }

  /** A tuned drum: the fundamental with a little drop and an inharmonic overtone. */
  private timpani(
    ctx: AudioContext,
    midi: number,
    at: number,
    volume: number,
    out: AudioNode,
  ): void {
    const freq = midiToHz(midi);
    for (const [ratio, share, decay] of [
      [1, 1, 1.1],
      [1.5, 0.35, 0.6],
      [1.98, 0.15, 0.4],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * ratio * 1.03, at);
      osc.frequency.exponentialRampToValueAtTime(freq * ratio, at + 0.06);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume * share, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + decay);
      osc.connect(gain);
      gain.connect(out);
      osc.start(at);
      osc.stop(at + decay + 0.02);
    }
  }
}

function ramp(param: AudioParam, value: number, at: number, timeConstant: number): void {
  param.cancelScheduledValues(at);
  param.setValueAtTime(param.value, at);
  param.setTargetAtTime(value, at, timeConstant);
}

/** Attack, decay to a sustain level, hold until the note ends, then release. */
function envelope(
  ctx: AudioContext,
  at: number,
  length: number,
  volume: number,
  attack: number,
  sustain: number,
  release: number,
): GainNode {
  const gain = ctx.createGain();
  const hold = Math.max(at + attack, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + attack);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0002, volume * sustain),
    Math.min(hold, at + attack + 0.12),
  );
  gain.gain.setValueAtTime(Math.max(0.0002, volume * sustain), hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, hold + release);
  return gain;
}

function harmonicWave(ctx: AudioContext, harmonics: readonly number[]): PeriodicWave {
  const imag = new Float32Array([0, ...harmonics]);
  return ctx.createPeriodicWave(new Float32Array(imag.length), imag);
}

/** Soft-clipping curve for the guitar amp. */
function overdriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

/** Decaying stereo noise: a small stone hall. */
function hallImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
  }
  return buffer;
}
