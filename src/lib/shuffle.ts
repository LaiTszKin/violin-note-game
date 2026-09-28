// 袋抽（bag shuffle）：每輪＝題池全洗牌；抽盡先重洗；跨輪邊界不得連續相同。
// ⚠️ STUB（紅線基準）：實作未開始——由所屬 shard 實作後移除本標記。
export type Rng = () => number;

export interface Bag<T> {
  next(): T;
}

export function createBag<T>(items: readonly T[], rng: Rng): Bag<T> {
  void rng;
  return {
    next: () => items[0] as T,
  };
}
