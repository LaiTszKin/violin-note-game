// 音高頻率（12 平均律、A4=440Hz）＋ WebAudio 播放器（contextFactory 可注入以便測試）。
// ⚠️ STUB（紅線基準）：實作未開始——由所屬 shard 實作後移除本標記。
import type { NoteId } from "./notes";

export function frequencyOf(noteId: NoteId): number {
  void noteId;
  return Number.NaN;
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
}

export function createNotePlayer(options: NotePlayerOptions = {}): NotePlayer {
  void options;
  return {
    play: (noteId: NoteId) => {
      void noteId;
    },
    setMuted: (muted: boolean) => {
      void muted;
    },
    isMuted: () => false,
  };
}
