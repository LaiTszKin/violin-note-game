// 局流程：每局 10 條新題（袋抽）＋錯題 FIFO 重出一次。
// ⚠️ STUB（紅線基準）：實作未開始——由所屬 shard 實作後移除本標記。
import type { NoteId } from "./notes";
import type { Rng } from "./shuffle";

export const ROUND_SIZE = 10;

export interface Question {
  noteId: NoteId;
  replay: boolean;
}

export interface Progress {
  answeredFresh: number;
  totalFresh: number;
}

export interface Session {
  current(): Question | null;
  answer(correct: boolean): void;
  progress(): Progress;
  score(): number;
  stars(): number;
  streak(): number;
  finished(): boolean;
}

export function createSession(pool: readonly NoteId[], rng: Rng): Session {
  void pool;
  void rng;
  return {
    current: () => null,
    answer: (correct: boolean) => {
      void correct;
    },
    progress: () => ({ answeredFresh: 0, totalFresh: ROUND_SIZE }),
    score: () => 0,
    stars: () => 0,
    streak: () => 0,
    finished: () => false,
  };
}
