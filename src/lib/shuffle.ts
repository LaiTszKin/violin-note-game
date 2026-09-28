// 袋抽（bag shuffle）：每輪＝題池全洗牌；抽盡先重洗；跨輪邊界不得連續相同。
export type Rng = () => number;

export interface Bag<T> {
  next(): T;
}

export function createBag<T>(items: readonly T[], rng: Rng): Bag<T> {
  if (items.length === 0) {
    throw new Error("createBag: 題池不得為空");
  }

  const pool = items.slice();

  // rng() ∈ [0,1) 為契約；夾緊只為防禦輸入越界（NaN／1.0），不影響正常路徑。
  const randIndex = (bound: number): number => {
    const r = rng();
    if (!(r >= 0) || r >= 1) return 0;
    const i = Math.floor(r * bound);
    return i >= bound ? bound - 1 : i;
  };

  // Fisher–Yates：均勻洗出本輪順序（由後向前，每步只與未定位置交換）。
  const shuffled = (): T[] => {
    const round = pool.slice();
    for (let i = round.length - 1; i > 0; i--) {
      const j = randIndex(i + 1);
      const tmp = round[i];
      round[i] = round[j];
      round[j] = tmp;
    }
    return round;
  };

  let round: T[] = [];
  let cursor = 0;
  let prev: T | undefined;
  let hasPrev = false;

  const startRound = (): void => {
    round = shuffled();
    cursor = 0;
    // 跨輪邊界：新一輪首項若等於上一抽，就與輪內另一位置對調。
    // 輪內元素互異（全排列）且 pool.length > 1 ⇒ 換入的首項必然不同。
    if (hasPrev && round.length > 1 && round[0] === prev) {
      const j = 1 + randIndex(round.length - 1);
      const tmp = round[0];
      round[0] = round[j];
      round[j] = tmp;
    }
  };

  return {
    next(): T {
      if (cursor >= round.length) {
        startRound();
      }
      const value = round[cursor];
      cursor += 1;
      prev = value;
      hasPrev = true;
      return value;
    },
  };
}
