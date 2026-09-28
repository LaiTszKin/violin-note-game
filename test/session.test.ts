// REQ-round-2：局流程（10 條新題＋錯題 FIFO 重出一次）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { ROUND_SIZE, createSession } from "../src/lib/session";
import type { NoteId } from "../src/lib/notes";

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

interface Entry {
  noteId: string;
  replay: boolean;
  correct: boolean;
}

test("ROUND_TEN_FRESH: 新題恰 10、袋式（無相鄰重複）；progress 0→10；完成前未 finished", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 2, max: 20 }),
      (seed, n) => {
        const pool = Array.from({ length: n }, (_, i) => `P${i}`);
        const session = createSession(pool as NoteId[], makeRng(seed));
        assert.equal(session.progress().answeredFresh, 0);
        assert.equal(session.progress().totalFresh, ROUND_SIZE);
        assert.equal(session.finished(), false, "未開始不得 finished");
        const fresh: string[] = [];
        let guard = 0;
        while (!session.finished() && guard < 120) {
          const q = session.current();
          assert.ok(q, "未完成時 current() 必須非 null");
          assert.equal(
            session.finished(),
            false,
            "未完成前 finished 必須 false",
          );
          session.answer(true); // 全對：不應出現重出
          if (q.replay) assert.fail("全對之下不得有重出");
          fresh.push(q.noteId);
          assert.equal(session.progress().answeredFresh, fresh.length);
          guard++;
        }
        assert.ok(guard <= 12, `全對之下應恰 10 題（實際 ${guard}）`);
        assert.equal(session.finished(), true);
        assert.equal(session.current(), null);
        assert.equal(fresh.length, ROUND_SIZE);
        assert.equal(session.score(), ROUND_SIZE);
        assert.equal(session.stars(), ROUND_SIZE);
        assert.equal(session.streak(), ROUND_SIZE);
        // 袋式：無相鄰重複＋首輪全數一次＋覆蓋∈{floor,ceil}
        for (let i = 1; i < fresh.length; i++)
          assert.notEqual(fresh[i], fresh[i - 1]);
        if (n <= ROUND_SIZE) {
          assert.deepEqual(
            [...fresh.slice(0, n)].sort(),
            [...pool].sort(),
            "首輪＝全數一次",
          );
        }
        const counts = new Map<string, number>();
        fresh.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
        for (const p of pool) {
          const c = counts.get(p) ?? 0;
          assert.ok(
            c >= Math.floor(ROUND_SIZE / n) && c <= Math.ceil(ROUND_SIZE / n),
            `${p}: ${c}`,
          );
        }
      },
    ),
    { numRuns: 80 },
  );
});

test("REQUEUE_RULES: 錯題 FIFO 各重出恰一次（全在新題之後）；重出不再排；score/stars 定義", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 2, max: 10 }),
      fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
      fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
      (seed, n, freshPattern, replayPattern) => {
        const pool = Array.from({ length: n }, (_, i) => `P${i}`);
        const session = createSession(pool as NoteId[], makeRng(seed));
        const entries: Entry[] = [];
        let expectedStreak = 0;
        let expectedStars = 0;
        let guard = 0;
        while (!session.finished() && guard < 120) {
          const q = session.current();
          assert.ok(q, "未完成時 current() 必須非 null");
          const freshSeen = entries.filter((e) => !e.replay).length;
          const replaySeen = entries.filter((e) => e.replay).length;
          const correct = q.replay
            ? replayPattern[replaySeen]
            : freshPattern[freshSeen];
          session.answer(correct);
          entries.push({ noteId: q.noteId, replay: q.replay, correct });
          expectedStreak = correct ? expectedStreak + 1 : 0;
          expectedStars += correct ? 1 : 0;
          assert.equal(
            session.streak(),
            expectedStreak,
            `streak after #${entries.length}`,
          );
          assert.equal(
            session.stars(),
            expectedStars,
            `stars after #${entries.length}`,
          );
          guard++;
        }
        assert.equal(session.finished(), true);
        assert.equal(session.current(), null);
        const fresh = entries.filter((e) => !e.replay);
        const replays = entries.filter((e) => e.replay);
        assert.equal(fresh.length, ROUND_SIZE, "新題恰 10");
        assert.ok(
          entries.slice(0, ROUND_SIZE).every((e) => !e.replay),
          "重出不得混入新題段",
        );
        assert.ok(
          entries.slice(ROUND_SIZE).every((e) => e.replay),
          "新題段之後先係重出",
        );
        const wrongFresh = fresh.filter((e) => !e.correct).map((e) => e.noteId);
        assert.equal(replays.length, wrongFresh.length, "重出數＝首答錯數");
        replays.forEach((r, i) =>
          assert.equal(r.noteId, wrongFresh[i], `FIFO #${i}`),
        );
        assert.equal(session.score(), fresh.filter((e) => e.correct).length);
        assert.equal(session.stars(), entries.filter((e) => e.correct).length);
      },
    ),
    { numRuns: 80 },
  );
});

// B-f1（Review B follow-up；src 守衛已落）：answer() 只接受經 current() 派發之題目。
// 未派題之 answer() 必須係無操作——唔消耗題目、唔改任何計分。若 revert 守衛
// （src/lib/session.ts 之 `const q = active` 改回 `const q = pending()`），本用例必 FAIL：
// answer()×2 會靜默偷走前兩條新題 ⇒ progress 變 2、current() 已非第 1 條。
test("ANSWER_BEFORE_DISPATCH: 未經 current() 之 answer() 為無操作（不消耗題目、不改計分）", () => {
  const pool = Array.from({ length: 6 }, (_, i) => `P${i}`) as NoteId[];
  const seed = 20_260_928;

  const session = createSession(pool, makeRng(seed));
  assert.equal(session.progress().answeredFresh, 0);

  // 未派題：answer(true)×2 —— 必須完全無操作
  session.answer(true);
  session.answer(false);
  assert.equal(
    session.progress().answeredFresh,
    0,
    "未經 current() 不得消耗新題",
  );
  assert.equal(session.score(), 0, "未派題之應答不得計分");
  assert.equal(session.stars(), 0);
  assert.equal(session.streak(), 0);
  assert.equal(session.finished(), false);

  // 第 1 條＝從未呼叫過 answer() 之對照組之首題（袋未被偷抽）
  const first = session.current();
  assert.ok(first, "未完成時 current() 必須非 null");
  assert.equal(first.replay, false);
  const control = createSession(pool, makeRng(seed));
  const controlFirst = control.current();
  assert.ok(controlFirst);
  assert.equal(
    first.noteId,
    controlFirst.noteId,
    "首題須＝對照組首題（袋狀態未被消耗）",
  );

  // 派題後之應答照常運作
  session.answer(true);
  control.answer(true);
  assert.equal(session.progress().answeredFresh, 1);
  assert.equal(session.score(), 1);
  assert.equal(session.stars(), 1);
  assert.equal(session.streak(), 1);

  // 中段未再派題之 answer() 亦為無操作（唔准偷走第 2 條）
  session.answer(false);
  session.answer(true);
  assert.equal(
    session.progress().answeredFresh,
    1,
    "中段未派題之 answer() 不得消耗下一題",
  );
  assert.equal(session.score(), 1);
  assert.equal(session.stars(), 1);
  assert.equal(session.streak(), 1, "無操作不得改 streak");

  const second = session.current();
  assert.ok(second);
  const controlSecond = control.current();
  assert.ok(controlSecond);
  assert.equal(second.noteId, controlSecond.noteId, "第 2 條仍＝對照組第 2 條");
  assert.equal(second.replay, false);
});

// B-f1（PBT 版）：對任意 seed／題池大小，未派題之 answer() 皆不得改變任何可觀察狀態。
test("ANSWER_BEFORE_DISPATCH_PROP: 任意 seed 下未派題 answer() 不改變 progress／score／stars／streak", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 2, max: 17 }),
      (seed, n) => {
        const pool = Array.from({ length: n }, (_, i) => `P${i}`) as NoteId[];
        const session = createSession(pool, makeRng(seed));
        const observe = () => ({
          progress: session.progress(),
          score: session.score(),
          stars: session.stars(),
          streak: session.streak(),
          finished: session.finished(),
        });
        const before = observe();
        for (let i = 0; i < 3; i++) session.answer(i % 2 === 0);
        assert.deepEqual(
          observe(),
          before,
          `seed=${seed}, n=${n}：未派題 answer()×3 不得改變狀態`,
        );
        // 首題＝對照組首題（袋不得被偷抽）
        const control = createSession(pool, makeRng(seed));
        assert.equal(
          session.current()?.noteId,
          control.current()?.noteId,
          `seed=${seed}, n=${n}：未派題 answer() 不得消耗題目`,
        );
      },
    ),
    { numRuns: 60 },
  );
});
