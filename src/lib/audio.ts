// 音高頻率（12 平均律、A4=440Hz）＋ WebAudio 播放器（contextFactory 可注入以便測試）。
import type { NoteId } from "./notes";

// C4=60、A4=69（MIDI 編號）；用 Record<NoteId, …> 令漏音於型別層被擋。
const MIDI_OF: Record<NoteId, number> = {
  G3: 55,
  A3: 57,
  B3: 59,
  C4: 60,
  D4: 62,
  E4: 64,
  F4: 65,
  G4: 67,
  A4: 69,
  B4: 71,
  C5: 72,
  D5: 74,
  E5: 76,
  F5: 77,
  G5: 79,
  A5: 81,
  B5: 83,
};

const A4_MIDI = 69;
const A4_HZ = 440;
const SEMITONES_PER_OCTAVE = 12;

/** 12 平均律頻率（Hz）：f = 440 × 2^((midi − 69) / 12)。 */
export function frequencyOf(noteId: NoteId): number {
  return A4_HZ * 2 ** ((MIDI_OF[noteId] - A4_MIDI) / SEMITONES_PER_OCTAVE);
}

export interface OscillatorLike {
  type: string;
  frequency: { value: number };
  connect(destination: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainLike {
  gain: { value: number };
  connect(destination: unknown): unknown;
}

export interface AudioContextLike {
  currentTime: number;
  destination: unknown;
  state: string;
  resume(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

export interface NotePlayer {
  play(noteId: NoteId): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

export interface NotePlayerOptions {
  contextFactory?: () => AudioContextLike;
  /** 起振音量（0–1），預設 0.2。 */
  volume?: number;
  /** 每粒音長（秒），預設 0.6。 */
  duration?: number;
}

type AudioContextCtor = new () => AudioContextLike;

// 真實路徑：第一次 play 才惰性建立（SSR 安全——import 時唔會掂 window）。
function defaultContextFactory(): AudioContextLike {
  const scope = globalThis as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (Ctor === undefined) {
    throw new Error("此環境不支援 WebAudio（無 AudioContext）");
  }
  return new Ctor();
}

export function createNotePlayer(options: NotePlayerOptions = {}): NotePlayer {
  const volume = options.volume ?? 0.2;
  const duration = options.duration ?? 0.6;
  const newContext = options.contextFactory ?? defaultContextFactory;

  let muted = false;
  let context: AudioContextLike | null = null;

  const ensureContext = (): AudioContextLike => {
    if (context === null) {
      context = newContext();
    }
    return context;
  };

  return {
    play(noteId: NoteId): void {
      if (muted) {
        return; // mute：完全唔起振（亦唔建立 context）
      }
      const ctx = ensureContext();
      if (ctx.state === "suspended") {
        // 瀏覽器需使用者手勢後先可出聲；resume 失敗唔應中斷播放。
        void Promise.resolve(ctx.resume()).catch(() => undefined);
      }
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequencyOf(noteId);
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    },
    setMuted(next: boolean): void {
      muted = next;
    },
    isMuted(): boolean {
      return muted;
    },
  };
}
