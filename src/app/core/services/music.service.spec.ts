import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioService } from './audio.service';
import { MusicPart, MusicNote, BATTLE_THEME } from './music-score';
import { MusicService } from './music.service';

/** Just enough of the Web Audio API to build the graph and count what gets scheduled. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  public currentTime = 0;
  public state: AudioContextState = 'running';
  public readonly sampleRate = 8000;
  public readonly destination = fakeNode();
  public started = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  resume = vi.fn(async () => {
    this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });

  createGain = () => fakeNode();
  createBiquadFilter = () => fakeNode();
  createDynamicsCompressor = () => fakeNode();
  createConvolver = () => fakeNode();
  createStereoPanner = () => fakeNode();
  createWaveShaper = () => fakeNode();
  createPeriodicWave = () => ({});
  createOscillator = () => this.source();
  createBufferSource = () => this.source();
  createBuffer = (channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
    numberOfChannels: channels,
  });

  private source() {
    const node = fakeNode();
    node.start = vi.fn(() => this.started++);
    return node;
  }
}

function fakeParam() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function fakeNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    setPeriodicWave: vi.fn(),
    gain: fakeParam(),
    frequency: fakeParam(),
    detune: fakeParam(),
    Q: fakeParam(),
    pan: fakeParam(),
    threshold: fakeParam(),
    ratio: fakeParam(),
    attack: fakeParam(),
    release: fakeParam(),
  } as Record<string, unknown> & { start: (...args: unknown[]) => void };
}

describe('MusicService', () => {
  let music: MusicService;
  let audio: AudioService;
  let voices: MusicPart[];

  function create(): void {
    music = TestBed.inject(MusicService);
    audio = TestBed.inject(AudioService);
    voices = [];
    const internals = music as unknown as {
      voice: (graph: unknown, note: MusicNote, at: number) => void;
    };
    const original = internals.voice.bind(music);
    vi.spyOn(internals, 'voice').mockImplementation((graph, note, at) => {
      voices.push(note.part);
      original(graph, note, at);
    });
  }

  function gesture(): void {
    window.dispatchEvent(new Event('pointerdown'));
    TestBed.tick();
  }

  /** Lets the scheduler run for a while of audio time. */
  function advance(seconds: number): void {
    const ctx = FakeAudioContext.instances.at(-1);
    for (let t = 0; t < seconds; t += 0.1) {
      if (ctx) ctx.currentTime += 0.1;
      vi.advanceTimersByTime(50);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    FakeAudioContext.instances = [];
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('waits for the first user gesture before making any sound', () => {
    create();
    music.mood.set('battle');
    TestBed.tick();
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(music.isRunning).toBe(false);

    gesture();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(music.isRunning).toBe(true);
    advance(1);
    expect(FakeAudioContext.instances[0].started).toBeGreaterThan(10);
  });

  it('stays quiet away from the battle screen', () => {
    create();
    gesture();
    advance(1);
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(music.isRunning).toBe(false);
  });

  it('thins out to a calm groove while building and adds layers for waves and bosses', () => {
    create();
    gesture();
    music.mood.set('calm');
    TestBed.tick();
    advance(8);
    expect(voices).toContain('bass');
    expect(voices).not.toContain('guitar');
    expect(voices).not.toContain('snare');

    music.mood.set('battle');
    TestBed.tick();
    voices.length = 0;
    advance(6);
    expect(voices).toContain('guitar');
    expect(voices).toContain('snare');
    expect(voices).not.toContain('timpani');

    music.mood.set('boss');
    TestBed.tick();
    voices.length = 0;
    advance(6);
    expect(voices).toContain('timpani');
    expect(voices).toContain('horn');
  });

  it('loops back to the top of the main section, skipping the intro', () => {
    create();
    gesture();
    music.mood.set('battle');
    TestBed.tick();
    const seconds = (BATTLE_THEME.totalSteps * 60) / BATTLE_THEME.bpm / 4;
    advance(seconds + 3);
    expect(music.playhead).toBeGreaterThanOrEqual(BATTLE_THEME.introSteps);
    expect(music.playhead).toBeLessThan(BATTLE_THEME.introSteps + 100);
  });

  it('stops with the global mute and picks up again when unmuted', () => {
    create();
    gesture();
    music.mood.set('battle');
    TestBed.tick();
    advance(2);
    const ctx = FakeAudioContext.instances[0];

    audio.toggleMute();
    TestBed.tick();
    expect(music.isRunning).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(ctx.suspend).toHaveBeenCalled();
    const playhead = music.playhead;

    audio.toggleMute();
    TestBed.tick();
    expect(music.isRunning).toBe(true);
    expect(ctx.resume).toHaveBeenCalled();
    // Carries on where it left off rather than restarting the intro
    expect(music.playhead).toBeGreaterThanOrEqual(playhead);
  });

  it('pauses while the tab is hidden', () => {
    create();
    gesture();
    music.mood.set('calm');
    TestBed.tick();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    TestBed.tick();
    expect(music.isRunning).toBe(false);

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    TestBed.tick();
    expect(music.isRunning).toBe(true);
  });

  it('cycles On, Soft and Off, and remembers the choice', () => {
    create();
    gesture();
    music.mood.set('battle');
    TestBed.tick();
    expect(music.level()).toBe('on');
    music.cycleLevel();
    expect(music.level()).toBe('soft');
    music.cycleLevel();
    TestBed.tick();
    expect(music.level()).toBe('off');
    expect(music.isRunning).toBe(false);
    expect(localStorage.getItem('crystal-td-music')).toBe('off');

    TestBed.resetTestingModule();
    expect(TestBed.inject(MusicService).level()).toBe('off');
  });

  it('starts from the intro again after a defeat or victory', () => {
    create();
    gesture();
    music.mood.set('battle');
    TestBed.tick();
    advance(5);
    expect(music.playhead).toBeGreaterThan(BATTLE_THEME.introSteps);

    music.mood.set('silent');
    TestBed.tick();
    music.mood.set('calm');
    TestBed.tick();
    expect(music.playhead).toBeLessThan(5);
  });
});
