// 局流程：每局 10 條新題（袋抽）＋錯題 FIFO 重出一次。
// REQ-round-2：新題恰 10（袋式：每輪＝題池全數一次、無相鄰重複）；首答錯之新題於全部
// 新題問完後按答錯次序（FIFO）各重出恰一次；重出答錯唔再排。
// 答對／答錯由調用方判定後以 boolean 傳入。
import type { NoteId } from "./notes";
import { createBag, type Bag, type Rng } from "./shuffle";

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
  const items: readonly NoteId[] = [...pool];
  // 空題池＝無新題可問；正常情況（題池非空）一局恆為 ROUND_SIZE 條新題。
  const freshTarget = items.length === 0 ? 0 : ROUND_SIZE;
  // 袋抽＝單一來源（shuffle.ts）：每輪全洗牌、抽盡重洗、跨輪不相鄰重複。
  const bag: Bag<NoteId> | null =
    items.length > 0 ? createBag(items, rng) : null;

  let answeredFresh = 0;
  const replayQueue: NoteId[] = []; // 首答錯之新題，FIFO
  let active: Question | null = null; // current() 已派、未作答之題（保持穩定）
  let freshCorrect = 0; // 首答答對數 → score()
  let totalCorrect = 0; // 答對總數（含重出）→ stars()
  let currentStreak = 0; // 連續答對，錯→0

  // 下一條題目：先問完 10 條新題，再按 FIFO 重出錯題。
  function nextQuestion(): Question | null {
    if (answeredFresh < freshTarget && bag !== null) {
      return { noteId: bag.next(), replay: false };
    }
    if (replayQueue.length > 0) {
      return { noteId: replayQueue[0]!, replay: true };
    }
    return null;
  }

  // 當前派發中嘅題目；無題＝未完成時必為 null（完成）。
  function pending(): Question | null {
    if (active === null) active = nextQuestion();
    return active;
  }

  return {
    current: () => pending(),
    answer: (correct: boolean) => {
      const q = active; // 只接受已派發（經 current()）之題目；未派發＝無操作
      if (q === null) return;
      active = null;
      if (q.replay) {
        replayQueue.shift(); // 重出只此一次：答完即離隊，答錯亦不再排
      } else {
        answeredFresh += 1;
        if (correct) freshCorrect += 1;
        else replayQueue.push(q.noteId);
      }
      if (correct) {
        totalCorrect += 1;
        currentStreak += 1;
      } else {
        currentStreak = 0;
      }
    },
    progress: () => ({ answeredFresh, totalFresh: ROUND_SIZE }),
    score: () => freshCorrect,
    stars: () => totalCorrect,
    streak: () => currentStreak,
    // 完成＝新題問完＋重出全部答完（且無派發中題目）。
    finished: () =>
      active === null &&
      answeredFresh >= freshTarget &&
      replayQueue.length === 0,
  };
}
