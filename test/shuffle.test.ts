// REQ-round-1：袋抽（全洗牌、抽盡重洗、跨輪不相鄰重複）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { createBag, rngFromSeed } from "../src/lib/shuffle";

// 測試側自有 rng（mulberry32）——對「袋」而言係可控輸入，屬 oracle 一部分
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw<T>(items: readonly T[], seed: number, k: number): T[] {
  const bag = createBag(items, makeRng(seed));
  return Array.from({ length: k }, () => bag.next());
}

test("BAG_COVERS_POOL: 每輪＝題池全數一次；k 抽之覆蓋次數符合預期", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 2, max: 20 }),
      fc.integer({ min: 1, max: 60 }),
      (seed, n, k) => {
        const items = Array.from({ length: n }, (_, i) => i);
        const seq = draw(items, seed, k);
        assert.equal(seq.length, k);
        // 每連續 n 個＝一個全排列（完整的一輪）；最後不足一輪者不得重複
        for (let start = 0; start < k; start += n) {
          const pass = seq.slice(start, start + n);
          assert.equal(
            new Set(pass).size,
            pass.length,
            `輪內不得重複（第 ${start} 抽起）`,
          );
          if (pass.length === n) {
            assert.deepEqual(
              [...pass].sort((x, y) => x - y),
              items,
              "一輪＝全數一次",
            );
          }
        }
        // 覆蓋次數：每項 ∈ {floor(k/n), ceil(k/n)}
        const counts = new Map<number, number>();
        for (const x of seq) counts.set(x, (counts.get(x) ?? 0) + 1);
        for (const i of items) {
          const c = counts.get(i) ?? 0;
          assert.ok(
            c >= Math.floor(k / n) && c <= Math.ceil(k / n),
            `item ${i}: count ${c}（k=${k}, n=${n}）`,
          );
        }
      },
    ),
    { numRuns: 150 },
  );
});

test("NO_ADJACENT_REPEAT: 連續抽取不得相同（含跨輪邊界；pool>1）", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 2, max: 20 }),
      fc.integer({ min: 1, max: 80 }),
      (seed, n, k) => {
        const seq = draw(
          Array.from({ length: n }, (_, i) => i),
          seed,
          k,
        );
        for (let i = 1; i < seq.length; i++) {
          assert.notEqual(seq[i], seq[i - 1], `第 ${i} 抽與前一抽相同`);
        }
      },
    ),
    { numRuns: 150 },
  );
});

// RA-1（Review A）：袋序必須真由 rng 決定。「即使完全唔用 rng」（例：恆回題池原序）之實作，
// 仍滿足 BAG_COVERS_POOL／NO_ADJACENT_REPEAT（池本身已互異且無重複），故需要一條
// 只有 rng-驅動實作才滿足之鑑別用例：固定池（≥3 個互異元素）＋固定 seeds（src 之
// rngFromSeed），首輪排列集合必須 >1；seed 忽略／常數排列之突變必然死亡。
test("BAG_ORDER_FROM_RNG: 首輪排列由 seed 決定（固定池＋固定 seeds ⇒ ≥2 個唔同排列）", () => {
  const POOL = ["G3", "D4", "A4", "E5"]; // ≥3 個互異元素
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  const firstRoundOf = (seed: number): string[] => {
    const bag = createBag(POOL, rngFromSeed(seed));
    return Array.from({ length: POOL.length }, () => bag.next());
  };

  const rounds = SEEDS.map(firstRoundOf);
  const rendered = rounds.map((r) => r.join(">"));

  // 前提：首輪仍係題池之全排列（袋語意；唔係就唔係「袋」）
  for (const r of rounds) {
    assert.deepEqual([...r].sort(), [...POOL].sort(), "首輪須為題池之全排列");
  }
  // 核心鑑別：完全唔用 rng 之突變（恆回池原序或任何常數排列）⇒ 只剩 1 個排列，必死
  const distinct = new Set(rendered);
  assert.ok(
    distinct.size >= 2,
    `首輪排列須隨 seed 改變（rng-忽略之實作必死）；實測 ${JSON.stringify([...distinct])}`,
  );
  // 另殺「恆回輸入序」類突變（rng 有抽但結果同原序無關之退化）
  assert.ok(
    rendered.some((r) => r !== POOL.join(">")),
    `首輪不得全部等於題池原序；實測 ${JSON.stringify(rendered)}`,
  );
  // 可重播：同一 seed 兩次建袋 ⇒ 同首輪排列（rng 為唯一變因）
  assert.deepEqual(
    firstRoundOf(SEEDS[0] as number),
    rounds[0],
    "同一 seed 必須重播同一首輪排列",
  );
});
