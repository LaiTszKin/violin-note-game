// 三層 property tests（REVIEW B）：intra-module／interaction／integration。
// 標準來源：.plan/28-09-2026/violin-note-game/PRD.md（D1–D10／REQ-*）＋ ACCEPTANCE.md。
// 本檔唔改 src／現有測試；只示範三層不變式，並以 fc.check 逐條統計實際 runs。
//
// 執行：npx tsx --test test/review-props.test.ts
//
// 分層：
//   L1 intra-module：每個模組之公開操作、內部狀態演化、init→use→teardown→restart、純度／擁有權。
//   L2 interaction ：模組兩兩對接（session×shuffle、judging×notes、params×levels、audio×notes…），
//                    對手方以 mock（敵意 rng 腳本、假 AudioContext、惡意 query）按契約注入。
//   L3 integration ：audio 播放器生命周期（注入 fake context）、mute、多次播放、失敗點安全出路。
import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { IAsyncProperty, IProperty, RunDetails } from "fast-check";

import {
  createNotePlayer,
  frequencyOf,
  type AudioContextLike,
  type GainLike,
  type NotePlayer,
  type OscillatorLike,
} from "../src/lib/audio";
import { isCorrect } from "../src/lib/judging";
import {
  MIXED_POOL,
  STRING_NOTES,
  STRING_ORDER,
  VALID_LEVELS,
  poolFor,
  type LevelId,
} from "../src/lib/levels";
import {
  NOTES,
  PITCH_IDS,
  answerLine,
  formatPlacement,
  letterOf,
  midiOf,
  placementsOf,
  staffStepOf,
  type Finger,
  type NoteId,
  type Placement,
  type StringName,
} from "../src/lib/notes";
import { parsePlayQuery, type RawQuery } from "../src/lib/params";
import {
  ROUND_SIZE,
  createSession,
  type Question,
  type Session,
} from "../src/lib/session";
import { createBag, rngFromSeed, type Rng } from "../src/lib/shuffle";

// ─────────────────────────────────────────────────────────────────────────────
// 執行器：fc.check ＋ 全域 runs 統計（最後一條 test 攞總輸出）
// ─────────────────────────────────────────────────────────────────────────────
const runsTable: Array<{ label: string; runs: number }> = [];
let totalRuns = 0;

function takeRuns<Ts>(label: string, details: RunDetails<Ts>): void {
  runsTable.push({ label, runs: details.numRuns });
  totalRuns += details.numRuns;
  if (!details.failed) return;
  const inner = details.errorInstance;
  const message = inner instanceof Error ? inner.message : String(inner);
  throw new Error(
    `${label}\n  counterexample = ${JSON.stringify(details.counterexample)}\n` +
      `  seed = ${details.seed}, shrinks = ${details.numShrinks}\n  ${message}`,
  );
}

/** 同步 property（fc.check：跑完攞實際 runs，失敗做縮小）。 */
function prop<Ts>(
  label: string,
  numRuns: number,
  property: IProperty<Ts>,
): void {
  takeRuns(label, fc.check(property, { numRuns }));
}

/** 非同步 property（unhandled rejection 等要跨 tick 觀測）。 */
async function asyncProp<Ts>(
  label: string,
  numRuns: number,
  property: IAsyncProperty<Ts>,
): Promise<void> {
  takeRuns(label, await fc.check(property, { numRuns }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 獨立 oracle：由第一原理（標準調弦 A4=440／C 大調音階／一把位一指一級）推導
// PRD 之對照表，唔引用 src 任何常數。
//   degree(midi) = 7×⌊midi/12⌋ + (pc 於 C D E F G A B 之序)
//   staffStep(id) = degree(midiOf(id)) − degree(E4=64)   // E4 底線＝0
//   每指＝上一個 C 大調級（1 或 2 半音）
// ─────────────────────────────────────────────────────────────────────────────
const C_MAJOR_PC: readonly number[] = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const LETTERS: readonly string[] = ["C", "D", "E", "F", "G", "A", "B"];
const OPEN_MIDI: Record<StringName, number> = { G: 55, D: 62, A: 69, E: 76 }; // G3/D4/A4/E5

const pcIndex = (midi: number): number => C_MAJOR_PC.indexOf(midi % 12);
const degreeOf = (midi: number): number =>
  7 * Math.floor(midi / 12) + pcIndex(midi);
const midiOfDegree = (degree: number): number =>
  12 * Math.floor(degree / 7) + (C_MAJOR_PC[degree % 7] as number);
const idOfMidi = (midi: number): NoteId =>
  `${LETTERS[pcIndex(midi)]}${Math.floor(midi / 12) - 1}` as NoteId;
const specNoteAt = (s: StringName, f: Finger): NoteId =>
  idOfMidi(midiOfDegree(degreeOf(OPEN_MIDI[s]) + f));
const E4_DEGREE = degreeOf(64);

const specMidiOf = (id: NoteId): number => {
  const octave = Number(id.slice(1));
  return (
    12 * (octave + 1) + (C_MAJOR_PC[LETTERS.indexOf(id[0] as string)] as number)
  );
};
const specStaffStepOf = (id: NoteId): number =>
  degreeOf(specMidiOf(id)) - E4_DEGREE;

const ALL_CELLS: Array<[StringName, Finger]> = STRING_ORDER.flatMap((s) =>
  ([0, 1, 2, 3, 4] as Finger[]).map((f) => [s, f] as [StringName, Finger]),
);
const specPlacementsOf = (id: NoteId): Array<[StringName, Finger]> =>
  ALL_CELLS.filter(([s, f]) => specNoteAt(s, f) === id).sort(
    (a, b) => a[1] - b[1], // 顯示次序＝空弦先行（finger 升序）
  );
const specPlacementText = ([s, f]: [StringName, Finger]): string =>
  f === 0 ? `${s}空弦` : `${s}弦${f}指`;
const SPEC_PITCHES: readonly NoteId[] = ALL_CELLS.map(([s, f]) =>
  specNoteAt(s, f),
).filter((id, i, all) => all.indexOf(id) === i);

// ─────────────────────────────────────────────────────────────────────────────
// 共用 generator
// ─────────────────────────────────────────────────────────────────────────────
const arbNote = fc.constantFrom<NoteId>(...PITCH_IDS);
const arbStringName = fc.constantFrom<StringName>(...STRING_ORDER);
const arbFinger = fc.constantFrom<Finger>(0, 1, 2, 3, 4);
const arbCell = fc.tuple(arbStringName, arbFinger);
const arbLevel = fc.constantFrom<LevelId>(...VALID_LEVELS);
const arbStrings = fc.array(arbStringName, { maxLength: 6 });
const arbSeed = fc.integer({ min: 0, max: 0xffff_ffff });
/** 敵意 rng 腳本：包含 NaN／±Inf／負值／≥1（超越 rng∈[0,1) 契約之輸入）。 */
const arbRngScript = fc.array(fc.double(), { minLength: 1, maxLength: 8 });
const arbPoolSize = fc.integer({ min: 1, max: 17 });
const arbDecisions = fc.array(fc.boolean(), { minLength: 24, maxLength: 40 });
const arbQueryValue = fc.oneof(
  fc.string(),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
);
const arbRawQuery = fc.dictionary(
  fc.constantFrom("mode", "level", "strings", "MODE", "", "x"),
  arbQueryValue,
  { maxKeys: 4 },
) as unknown as fc.Arbitrary<RawQuery>;

/** 全部 15 個非空弦子集（固定弦序）——custom 關之可玩設定。 */
const CUSTOM_SUBSETS: ReadonlyArray<readonly StringName[]> = Array.from(
  { length: 15 },
  (_, i) => STRING_ORDER.filter((_, bit) => ((i + 1) & (1 << bit)) !== 0),
);

/** 由固定腳本驅動之 rng（cyclic）——可控、可重播、可敵意。 */
function scripted(values: readonly number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

/** 題池（假 id；session／shuffle 對 NoteId 無語意依賴，只當不透明標籤）。 */
function fakePool(n: number): readonly NoteId[] {
  return Array.from({ length: n }, (_, i) => `P${i}` as NoteId);
}

interface Entry {
  noteId: NoteId;
  replay: boolean;
  correct: boolean;
}

/** 逐步驅動一局：每步斷言「未完成 ⇒ current() 非 null」；結束後斷言完成。 */
function drain(
  session: Session,
  decide: (index: number, q: Question) => boolean,
  observe?: (step: {
    index: number;
    q: Question;
    correct: boolean;
    entries: Entry[];
  }) => void,
  maxSteps = 200,
): Entry[] {
  const entries: Entry[] = [];
  let guard = 0;
  while (!session.finished()) {
    assert.ok(guard++ < maxSteps, "一局應於 maxSteps 內完成");
    const q = session.current();
    assert.ok(q, "未完成時 current() 必須非 null");
    const again = session.current();
    assert.ok(again);
    assert.equal(
      again.noteId,
      q.noteId,
      "未作答前 current() 必須穩定（同一題）",
    );
    assert.equal(
      again.replay,
      q.replay,
      "未作答前 current() 必須穩定（同一階段）",
    );
    const correct = decide(entries.length, q);
    session.answer(correct);
    entries.push({ noteId: q.noteId, replay: q.replay, correct });
    observe?.({ index: entries.length - 1, q, correct, entries });
  }
  assert.equal(session.finished(), true, "完成後 finished() 應為 true");
  assert.equal(session.current(), null, "完成後 current() 應為 null");
  return entries;
}

/** REQ-round-1 之袋契約，套用於新題序列（session 之「袋抽」外部可觀察面）。 */
function assertFreshBagContract(
  fresh: readonly NoteId[],
  pool: readonly NoteId[],
): void {
  const n = pool.length;
  assert.ok(n >= 1);
  for (let start = 0; start + n <= fresh.length; start += n) {
    const round = fresh.slice(start, start + n);
    assert.deepEqual(
      [...round].sort(),
      [...pool].sort(),
      `第 ${start} 抽起之一輪應＝題池全數一次`,
    );
  }
  for (let start = 0; start < fresh.length; start += n) {
    const part = fresh.slice(start, start + n);
    assert.equal(
      new Set(part).size,
      part.length,
      `輪內不得重複（第 ${start} 抽起）`,
    );
  }
  if (n >= 2) {
    for (let i = 1; i < fresh.length; i++) {
      assert.notEqual(fresh[i], fresh[i - 1], `新題不得相鄰重複（第 ${i} 條）`);
    }
  }
  for (const id of fresh) assert.ok(pool.includes(id), `新題須來自題池：${id}`);
}

/** REQ-round-2 之整局不變式（新題 10、重出 FIFO 一次、計分定義）。 */
function assertRoundInvariants(
  entries: readonly Entry[],
  pool: readonly NoteId[],
): void {
  const fresh = entries.filter((e) => !e.replay);
  const replays = entries.filter((e) => e.replay);
  assert.equal(fresh.length, ROUND_SIZE, "新題恰 10 條");
  assert.ok(
    entries.slice(0, ROUND_SIZE).every((e) => !e.replay),
    "重出不得混入新題段",
  );
  assert.ok(
    entries.slice(ROUND_SIZE).every((e) => e.replay),
    "新題段之後先係重出",
  );
  assertFreshBagContract(
    fresh.map((e) => e.noteId),
    pool,
  );
  const wrongFresh = fresh.filter((e) => !e.correct).map((e) => e.noteId);
  assert.equal(replays.length, wrongFresh.length, "重出數＝首答錯數");
  replays.forEach((r, i) =>
    assert.equal(r.noteId, wrongFresh[i], `重出須按答錯次序 FIFO（#${i}）`),
  );
  assert.deepEqual(
    [...replays.map((r) => r.noteId)].sort(),
    [...wrongFresh].sort(),
    "重出多重集＝首答錯多重集（錯題各重出恰一次）",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// L1 intra-module
// ─────────────────────────────────────────────────────────────────────────────

test("L1 · notes：題庫／譜面座標／音名與獨立 oracle（C 大調推導）一致", () => {
  prop(
    "L1.notes.catalog",
    200,
    fc.property(arbCell, ([s, f]) => {
      const row = NOTES.find((n) => n.string === s && n.finger === f);
      assert.ok(row, `題庫應有 ${s}弦${f}指`);
      assert.equal(row.noteId, specNoteAt(s, f), `${s}弦${f}指 音高`);
      assert.equal(midiOf(row.noteId), specMidiOf(specNoteAt(s, f)), "midi");
    }),
  );
  prop(
    "L1.notes.staff",
    300,
    fc.property(arbNote, (note) => {
      assert.equal(midiOf(note), specMidiOf(note), `${note} MIDI`);
      assert.equal(
        staffStepOf(note),
        specStaffStepOf(note),
        `${note} 譜面級數`,
      );
      assert.equal(
        staffStepOf(note) % 2 === 0,
        specStaffStepOf(note) % 2 === 0,
      );
    }),
  );
  prop(
    "L1.notes.letter",
    300,
    fc.property(arbNote, (note) => {
      assert.equal(
        letterOf(note),
        LETTERS[pcIndex(specMidiOf(note))],
        `${note} 音名`,
      );
      assert.equal(letterOf(note), note[0], "音名＝id 首字母");
      assert.equal(
        Number(note.slice(1)),
        Math.floor(specMidiOf(note) / 12) - 1,
      );
    }),
  );
});

test("L1 · notes：PITCH_IDS 恰 17、去重升序；NOTES 20 項覆蓋 4×5 全格", () => {
  prop(
    "L1.notes.pitchids",
    100,
    fc.property(fc.integer({ min: 0, max: 16 }), (i) => {
      assert.equal(PITCH_IDS.length, 17);
      assert.equal(PITCH_IDS.length, new Set(PITCH_IDS).size, "去重");
      for (let k = 1; k < PITCH_IDS.length; k++) {
        assert.ok(midiOf(PITCH_IDS[k]) > midiOf(PITCH_IDS[k - 1]), "升序");
      }
      const note = PITCH_IDS[i] as NoteId;
      assert.ok(
        NOTES.some((n) => n.noteId === note),
        `${note} 應出現於題庫`,
      );
      assert.ok(
        ALL_CELLS.some(([s, f]) => specNoteAt(s, f) === note),
        `${note} 應屬 4×5 格`,
      );
      assert.equal(NOTES.length, 20);
      assert.equal(
        new Set(NOTES.map((n) => `${n.string}${n.finger}`)).size,
        20,
        "20 格互異",
      );
      for (const row of NOTES) {
        assert.ok(STRING_ORDER.includes(row.string), `弦名合法：${row.string}`);
        assert.ok(
          row.finger >= 0 && row.finger <= 4,
          `指序合法：${row.finger}`,
        );
        assert.ok(
          PITCH_IDS.includes(row.noteId),
          `音高屬 17 音：${row.noteId}`,
        );
      }
    }),
  );
});

test("L1 · notes：placementsOf 完備（等於題庫反函數）、雙奏法空弦先行、範圍合法", () => {
  prop(
    "L1.notes.placements",
    400,
    fc.property(arbNote, (note) => {
      const got = placementsOf(note);
      const want = specPlacementsOf(note);
      assert.deepEqual(
        got.map((p) => [p.string, p.finger]),
        want,
        `${note} 奏法（空弦先行）`,
      );
      assert.ok(got.length >= 1, `${note} 至少一個奏法`);
      const dual = note === "D4" || note === "A4" || note === "E5";
      assert.equal(got.length, dual ? 2 : 1, `${note} 奏法數`);
      if (dual) assert.equal(got[0].finger, 0, "空弦先行");
      for (const p of got) {
        assert.ok(STRING_ORDER.includes(p.string), `弦合法：${p.string}`);
        assert.ok(p.finger >= 0 && p.finger <= 4, `指合法：${p.finger}`);
        assert.equal(
          specNoteAt(p.string, p.finger),
          note,
          `奏法必須對應同一音：${p.string}${p.finger}`,
        );
      }
      assert.equal(
        new Set(got.map((p) => `${p.string}${p.finger}`)).size,
        got.length,
      );
    }),
  );
});

test("L1 · notes：純度與擁有權（重複呼叫同結果、回傳值非內部狀態、共享表不被污染）", () => {
  const catalogBefore = JSON.stringify(NOTES);
  const pitchesBefore = JSON.stringify(PITCH_IDS);
  prop(
    "L1.notes.purity",
    300,
    fc.property(arbNote, (note) => {
      const first = JSON.stringify(placementsOf(note));
      // 改動回傳值（陣列＋元素）不得影響下一次查詢
      const arr = placementsOf(note).map((p) => ({ ...p }));
      arr.reverse();
      if (arr.length > 0)
        (arr[0] as Placement).finger = arr[0].finger === 0 ? 1 : 0;
      assert.equal(
        JSON.stringify(placementsOf(note)),
        first,
        "回傳值不得 alias 內部狀態",
      );
      assert.equal(
        JSON.stringify(placementsOf(note)),
        first,
        "重複呼叫須同結果",
      );
      assert.equal(answerLine(note), answerLine(note), "answerLine 冪等");
      assert.equal(letterOf(note), letterOf(note), "letterOf 冪等");
    }),
  );
  assert.equal(
    JSON.stringify(NOTES),
    catalogBefore,
    "NOTES 不應被任何操作改動",
  );
  assert.equal(
    JSON.stringify(PITCH_IDS),
    pitchesBefore,
    "PITCH_IDS 不應被改動",
  );
});

test("L1 · notes：formatPlacement／answerLine 格式與 20 格文本單射", () => {
  prop(
    "L1.notes.format",
    400,
    fc.property(arbNote, (note) => {
      const line = answerLine(note);
      const [head, ...rest] = line.split(" ＝ ");
      assert.equal(rest.length, 1, "答案行恰一個「＝」");
      assert.equal(head, letterOf(note), "左邊＝音名字母");
      assert.equal(
        rest[0],
        specPlacementsOf(note).map(specPlacementText).join(" 或 "),
        "右邊＝奏法以「或」連結",
      );
      assert.equal(
        line.includes(" 或 "),
        specPlacementsOf(note).length > 1,
        "雙奏法先有「或」",
      );
      for (const p of placementsOf(note)) {
        assert.equal(
          formatPlacement(p),
          specPlacementText([p.string, p.finger]),
        );
      }
    }),
  );
  prop(
    "L1.notes.format.injective",
    300,
    fc.property(arbCell, ([s, f]) => {
      const text = formatPlacement({ string: s, finger: f });
      const sameText = ALL_CELLS.filter(
        ([s2, f2]) => formatPlacement({ string: s2, finger: f2 }) === text,
      );
      assert.deepEqual(sameText, [[s, f]], "20 格文本互異（可作答案鍵）");
    }),
  );
});

test("L1 · levels：poolFor 去重／弦序／升序／⊆17 音；非 custom 忽略 strings", () => {
  prop(
    "L1.levels.pool",
    600,
    fc.property(arbLevel, arbStrings, (level, strings) => {
      const pool = poolFor(level, strings);
      assert.equal(new Set(pool).size, pool.length, "去重");
      for (const id of pool) assert.ok(PITCH_IDS.includes(id), `⊆17 音：${id}`);
      for (let i = 1; i < pool.length; i++) {
        assert.ok(midiOf(pool[i]) > midiOf(pool[i - 1]), "弦序＝升序");
      }
      if (level === "mixed") {
        assert.equal(pool.length, 17);
        assert.deepEqual([...pool], [...MIXED_POOL]);
      } else if (level === "custom") {
        const want = STRING_ORDER.filter((s) => strings.includes(s)).flatMap(
          (s) => [...STRING_NOTES[s]],
        );
        assert.deepEqual(
          [...pool],
          [...new Set(want)],
          "custom＝所選弦聯集（弦序）",
        );
      } else {
        assert.deepEqual(
          [...pool],
          [...STRING_NOTES[level]],
          "單弦關＝該弦 5 音",
        );
        assert.deepEqual(
          [...poolFor(level, strings)],
          [...poolFor(level, [])],
          "忽略 strings",
        );
      }
    }),
  );
});

test("L1 · levels：STRING_NOTES／MIXED_POOL 與 notes 題庫跨表一致", () => {
  prop(
    "L1.levels.tables",
    300,
    fc.property(arbCell, ([s, f]) => {
      assert.equal(STRING_NOTES[s][f], specNoteAt(s, f), `${s}弦${f}指`);
      const row = NOTES.find((n) => n.string === s && n.finger === f);
      assert.equal(STRING_NOTES[s][f], row?.noteId, "levels 表＝notes 題庫");
      assert.equal(MIXED_POOL.length, 17, "混合關＝17 音");
      assert.deepEqual(
        [...MIXED_POOL],
        [...PITCH_IDS],
        "混合關＝PITCH_IDS（同序）",
      );
      assert.deepEqual(
        [...SPEC_PITCHES],
        [...PITCH_IDS],
        "PITCH_IDS＝規格 17 音",
      );
      assert.deepEqual([...STRING_ORDER], ["G", "D", "A", "E"], "固定弦序");
      assert.deepEqual(
        [...VALID_LEVELS],
        ["G", "D", "A", "E", "mixed", "custom"],
      );
    }),
  );
});

test("L1 · params：總函數——任意敵意 query 唔會拋、輸出結構恆合法", () => {
  prop(
    "L1.params.total",
    600,
    fc.property(arbRawQuery, (raw) => {
      const cfg = parsePlayQuery(raw);
      assert.ok(cfg.mode === "letter" || cfg.mode === "position", "mode 合法");
      assert.ok(VALID_LEVELS.includes(cfg.level), `level 合法：${cfg.level}`);
      assert.ok(Array.isArray(cfg.strings), "strings 係陣列");
      assert.deepEqual(
        [...cfg.strings],
        STRING_ORDER.filter((s) => cfg.strings.includes(s)),
        "strings 固定弦序＋去重",
      );
      if (cfg.level === "custom")
        assert.ok(cfg.strings.length >= 1, "custom 必有弦");
      else assert.equal(cfg.strings.length, 0, "非 custom 無 strings");
    }),
  );
});

test("L1 · params：fallback 規則（合法採用、缺／非法→letter／mixed、custom 無弦→mixed）", () => {
  const validModes = ["letter", "position"];
  const validLevels = ["G", "D", "A", "E", "mixed", "custom"];
  prop(
    "L1.params.fallback",
    400,
    fc.property(fc.string(), fc.string(), (modeRaw, levelRaw) => {
      const cfg = parsePlayQuery({ mode: modeRaw, level: levelRaw });
      assert.equal(
        cfg.mode,
        validModes.includes(modeRaw) ? modeRaw : "letter",
        `mode=${JSON.stringify(modeRaw)}`,
      );
      const expectedLevel = validLevels.includes(levelRaw)
        ? levelRaw === "custom"
          ? "mixed" // 無 strings：custom 退混合
          : levelRaw
        : "mixed";
      assert.equal(
        cfg.level,
        expectedLevel,
        `level=${JSON.stringify(levelRaw)}`,
      );
    }),
  );
  // 表格用例（確定性；唔經 fc 生成器，故唔計入 runs 統計）
  assert.deepEqual(parsePlayQuery({}), {
    mode: "letter",
    level: "mixed",
    strings: [],
  });
  assert.deepEqual(parsePlayQuery({ mode: "position" }), {
    mode: "position",
    level: "mixed",
    strings: [],
  });
  assert.deepEqual(parsePlayQuery({ level: "A" }), {
    mode: "letter",
    level: "A",
    strings: [],
  });
  assert.deepEqual(parsePlayQuery({ mode: "position", level: "G" }), {
    mode: "position",
    level: "G",
    strings: [],
  });
  assert.deepEqual(parsePlayQuery({ level: "custom" }), {
    mode: "letter",
    level: "mixed",
    strings: [],
  });
  assert.deepEqual(parsePlayQuery({ level: "custom", strings: "X,Y" }), {
    mode: "letter",
    level: "mixed",
    strings: [],
  });
  assert.deepEqual(
    parsePlayQuery({ mode: "position", level: "custom", strings: " D ,D,A " }),
    { mode: "position", level: "custom", strings: ["D", "A"] },
  );
  assert.deepEqual(
    parsePlayQuery({ mode: "LETTER", level: "Mixed", strings: "G" }),
    {
      mode: "letter",
      level: "mixed",
      strings: [],
    },
  );
});

test("L1 · params：strings 過濾／trim／去重／定序（獨立 oracle 重寫）", () => {
  prop(
    "L1.params.strings",
    400,
    fc.property(
      fc.oneof(
        fc.string(),
        fc.array(fc.string(), { maxLength: 4 }),
        fc.constant(undefined),
      ),
      (raw) => {
        const cfg = parsePlayQuery({ level: "custom", strings: raw as never });
        const tokens =
          typeof raw === "string"
            ? raw.split(",")
            : Array.isArray(raw)
              ? raw.flatMap((v) => (typeof v === "string" ? v.split(",") : []))
              : [];
        const accepted = new Set(
          tokens
            .map((t) => t.trim())
            .filter((t) => STRING_ORDER.includes(t as StringName)),
        );
        const want = STRING_ORDER.filter((s) => accepted.has(s));
        assert.deepEqual(
          [...cfg.strings],
          [...want],
          `strings=${JSON.stringify(raw)}`,
        );
        assert.equal(cfg.level, want.length > 0 ? "custom" : "mixed");
      },
    ),
  );
});

test("L1 · params：純函數——同輸入同輸出、唔改輸入（凍結後仍可解析）", () => {
  prop(
    "L1.params.pure",
    300,
    fc.property(arbRawQuery, (raw) => {
      const before = JSON.stringify(raw);
      const a = parsePlayQuery(raw);
      const b = parsePlayQuery(raw);
      assert.deepEqual(a, b, "同輸入必同輸出");
      assert.equal(JSON.stringify(raw), before, "不得改動輸入物件");
    }),
  );
  prop(
    "L1.params.frozen",
    200,
    fc.property(arbRawQuery, (raw) => {
      const frozen = Object.freeze({ ...raw }) as RawQuery;
      for (const v of Object.values(frozen)) {
        if (Array.isArray(v)) Object.freeze(v);
      }
      assert.doesNotThrow(() => parsePlayQuery(frozen), "凍結輸入不得引發寫入");
    }),
  );
});

test("L1 · shuffle：每輪＝全排列、輪內無重複、跨輪界不連續相同（互異池、敵意 rng 腳本）", () => {
  prop(
    "L1.shuffle.rounds",
    900,
    fc.property(
      fc.integer({ min: 2, max: 20 }),
      fc.integer({ min: 1, max: 60 }),
      arbRngScript,
      (n, k, script) => {
        const pool = fakePool(n);
        const bag = createBag(pool, scripted(script));
        const seq = Array.from({ length: k }, () => bag.next());
        assert.equal(seq.length, k);
        for (let start = 0; start + n <= k; start += n) {
          assert.deepEqual(
            [...seq.slice(start, start + n)].sort(),
            [...pool].sort(),
            `第 ${start} 抽起＝完整一輪`,
          );
        }
        for (let start = 0; start < k; start += n) {
          const part = seq.slice(start, start + n);
          assert.equal(
            new Set(part).size,
            part.length,
            `輪內無重複（第 ${start} 抽起）`,
          );
        }
        for (let i = 1; i < k; i++) {
          assert.notEqual(
            seq[i],
            seq[i - 1],
            `相鄰不得相同（含跨輪界）第 ${i} 抽`,
          );
        }
        assert.equal(new Set(seq).size <= n, true);
      },
    ),
  );
});

test("L1 · shuffle／rng：init→use→teardown→restart：空池拋錯、單項池、輸入無被改、同腳本可重播", () => {
  // 空池＝明確拒絕（契約：題池不得為空）
  assert.throws(() => createBag([], () => 0.5), /題池/);
  prop(
    "L1.shuffle.edges",
    300,
    fc.property(
      fc.integer({ min: 2, max: 12 }),
      fc.integer({ min: 1, max: 30 }),
      arbRngScript,
      arbSeed,
      (n, k, script, seed) => {
        const pool = fakePool(n);
        const snapshot = [...pool];
        const bagA = createBag(pool, scripted(script));
        const seqA = Array.from({ length: k }, () => bagA.next());
        assert.deepEqual([...pool], snapshot, "createBag 不得改動輸入");
        // restart（同腳本、新 bag）⇒ 同序列
        const bagB = createBag(pool, scripted(script));
        assert.deepEqual(
          Array.from({ length: k }, () => bagB.next()),
          seqA,
          "同 rng 腳本⇒同序列",
        );
        // 交錯：由同一池建立嘅另一個 bag 唔會影響本 bag
        const bagC = createBag(pool, rngFromSeed(seed));
        const noise = Array.from({ length: 5 }, () => bagC.next());
        assert.ok(noise.length === 5);
        const bagD = createBag(pool, scripted(script));
        assert.deepEqual(
          Array.from({ length: k }, () => bagD.next()),
          seqA,
          "其他 bag 之抽取不得影響",
        );
        // 單項池：恆回同一項
        const single = createBag(["only" as NoteId], scripted([0]));
        assert.deepEqual(
          Array.from({ length: 5 }, () => single.next()),
          Array(5).fill("only"),
        );
      },
    ),
  );
});

test("L1 · rng：rngFromSeed 確定性、值域 [0,1)、instance 互不干擾", () => {
  prop(
    "L1.rng.determinism",
    300,
    fc.property(arbSeed, arbSeed, (s1, s2) => {
      const a = rngFromSeed(s1);
      const b = rngFromSeed(s1);
      const xa = Array.from({ length: 6 }, () => a());
      const xb = Array.from({ length: 6 }, () => b());
      assert.deepEqual(xa, xb, "同 seed ⇒ 同序列");
      for (const v of xa) {
        assert.ok(v >= 0 && v < 1, `值域 [0,1)：${v}`);
        assert.ok(Number.isFinite(v));
      }
      // 交錯兩個 instance ⇒ 各自等於單獨跑
      const c = rngFromSeed(s1);
      const d = rngFromSeed(s2);
      const soloC = Array.from({ length: 6 }, () => c());
      const soloD = Array.from({ length: 6 }, () => d());
      const c2 = rngFromSeed(s1);
      const d2 = rngFromSeed(s2);
      const mixC: number[] = [];
      const mixD: number[] = [];
      for (let i = 0; i < 6; i++) {
        mixC.push(c2());
        mixD.push(d2());
      }
      assert.deepEqual(mixC, soloC, "instance 狀態互不干擾（C）");
      assert.deepEqual(mixD, soloD, "instance 狀態互不干擾（D）");
    }),
  );
});

test("L1 · session：整局不變式——每步斷言 progress／score／stars／streak／finished 與當前題", () => {
  prop(
    "L1.session.round",
    800,
    fc.property(
      fc.integer({ min: 2, max: 17 }),
      arbSeed,
      arbDecisions,
      (n, seed, decisions) => {
        const pool = fakePool(n);
        const session = createSession(pool, rngFromSeed(seed));
        assert.equal(session.progress().answeredFresh, 0);
        assert.equal(session.progress().totalFresh, ROUND_SIZE);
        assert.equal(session.finished(), false, "未開始不得 finished");
        assert.equal(session.score(), 0);
        assert.equal(session.stars(), 0);
        assert.equal(session.streak(), 0);
        let freshSeen = 0;
        let expectedStars = 0;
        let expectedStreak = 0;
        const entries = drain(
          session,
          (i) => decisions[i % decisions.length] as boolean,
          ({ q, correct, entries: seen }) => {
            const p = session.progress();
            assert.equal(
              p.answeredFresh,
              freshSeen + (q.replay ? 0 : 1),
              "progress 每答一條新題 +1",
            );
            assert.ok(p.answeredFresh >= 0 && p.answeredFresh <= ROUND_SIZE);
            if (q.replay)
              assert.equal(p.answeredFresh, ROUND_SIZE, "重出階段新題已問完");
            else freshSeen += 1;
            expectedStreak = correct ? expectedStreak + 1 : 0;
            expectedStars += correct ? 1 : 0;
            assert.equal(session.streak(), expectedStreak, "streak 錯→0");
            assert.equal(session.stars(), expectedStars, "stars＝答對總數");
            assert.equal(
              session.score(),
              seen.filter((e) => !e.replay && e.correct).length,
              "score＝首答答對數",
            );
          },
        );
        assertRoundInvariants(entries, pool);
        assert.equal(
          session.score(),
          entries.filter((e) => !e.replay && e.correct).length,
        );
        assert.equal(session.stars(), entries.filter((e) => e.correct).length);
      },
    ),
  );
});

test("L1 · session：完成後 current()＝null、finished 恆 true、再答無效（唔會復活）", () => {
  prop(
    "L1.session.terminal",
    300,
    fc.property(arbPoolSize, arbSeed, arbDecisions, (n, seed, decisions) => {
      const pool = fakePool(n);
      const session = createSession(pool, rngFromSeed(seed));
      const entries = drain(
        session,
        (i) => decisions[i % decisions.length] as boolean,
      );
      const snapshot = {
        score: session.score(),
        stars: session.stars(),
        streak: session.streak(),
        progress: session.progress(),
      };
      for (let i = 0; i < 3; i++) {
        assert.equal(session.current(), null, "完成後 current 恆 null");
        assert.equal(session.finished(), true);
      }
      session.answer(true);
      session.answer(false);
      assert.deepEqual(
        {
          score: session.score(),
          stars: session.stars(),
          streak: session.streak(),
          progress: session.progress(),
        },
        snapshot,
        "完成後作答不得改動狀態",
      );
      assert.equal(session.finished(), true);
      assert.ok(entries.length >= ROUND_SIZE);
    }),
  );
});

test("L1 · session：隔離與重播——同 rng 流＋同決定⇒同 transcript；兩局交錯互不干擾", () => {
  prop(
    "L1.session.isolation",
    300,
    fc.property(
      fc.integer({ min: 2, max: 10 }),
      arbSeed,
      arbSeed,
      arbDecisions,
      arbDecisions,
      (n, seedA, seedB, decA, decB) => {
        const pool = fakePool(n);
        const decisionOf = (decisions: readonly boolean[], i: number) =>
          decisions[i % decisions.length] as boolean;

        // (1) 同 rng 流可重播：錄下 A 用過嘅 rng 值，B 以重播 rng 重建 ⇒ 同 transcript
        const base = rngFromSeed(seedA);
        const recorded: number[] = [];
        const sessionA = createSession(pool, () => {
          const v = base();
          recorded.push(v);
          return v;
        });
        const transcriptA = drain(sessionA, (i) => decisionOf(decA, i));
        const sessionB = createSession(pool, scripted(recorded));
        const transcriptB = drain(sessionB, (i) => decisionOf(decA, i));
        assert.deepEqual(
          transcriptB,
          transcriptA,
          "同 rng 流＋同決定 ⇒ 同 transcript",
        );
        assert.ok(recorded.length > 0, "應有消費 rng");

        // (2) 兩局交錯：各自完成後 transcript 同單獨跑一致
        const soloA = createSession(pool, rngFromSeed(seedA));
        const soloAT = drain(soloA, (i) => decisionOf(decA, i));
        const soloB = createSession(pool, rngFromSeed(seedB));
        const soloBT = drain(soloB, (i) => decisionOf(decB, i));

        const a = createSession(pool, rngFromSeed(seedA));
        const b = createSession(pool, rngFromSeed(seedB));
        const aT: Entry[] = [];
        const bT: Entry[] = [];
        const step = (s: Session, out: Entry[], dec: readonly boolean[]) => {
          if (s.finished()) return;
          const q = s.current();
          assert.ok(q);
          const correct = decisionOf(dec, out.length);
          s.answer(correct);
          out.push({ noteId: q.noteId, replay: q.replay, correct });
        };
        let guard = 0;
        while ((!a.finished() || !b.finished()) && guard++ < 200) {
          step(a, aT, decA);
          step(b, bT, decB);
        }
        assert.deepEqual(aT, soloAT, "交錯唔影響 A");
        assert.deepEqual(bT, soloBT, "交錯唔影響 B");
        assertRoundInvariants(aT, pool);
        assertRoundInvariants(bT, pool);
      },
    ),
  );
});

test("L1 · session：邊界——單項池、全對、全錯（FIFO 重出一次）、空池優雅降級", () => {
  prop(
    "L1.session.boundary",
    200,
    fc.property(arbSeed, (seed) => {
      // 全對：不重出
      const allRight = createSession(fakePool(5), rngFromSeed(seed));
      const rightEntries = drain(allRight, () => true);
      assert.equal(rightEntries.length, ROUND_SIZE);
      assert.ok(rightEntries.every((e) => !e.replay));
      assert.equal(allRight.score(), ROUND_SIZE);
      assert.equal(allRight.stars(), ROUND_SIZE);
      assert.equal(allRight.streak(), ROUND_SIZE);

      // 全錯：10 新題 + 10 重出（FIFO 各一次）
      const allWrong = createSession(fakePool(5), rngFromSeed(seed));
      const wrongEntries = drain(allWrong, () => false);
      assert.equal(wrongEntries.length, ROUND_SIZE * 2);
      assert.equal(allWrong.score(), 0);
      assert.equal(allWrong.stars(), 0);
      assert.equal(allWrong.streak(), 0);
      assertRoundInvariants(wrongEntries, fakePool(5));

      // 單項池：新題全同項（n＝1 無「不相鄰」保證）
      const singlePool = fakePool(1);
      const single = createSession(singlePool, rngFromSeed(seed));
      const singleEntries = drain(single, (i) => i % 3 === 0);
      assert.ok(singleEntries.every((e) => String(e.noteId) === "P0"));
      assertRoundInvariants(singleEntries, singlePool);

      // 空池：冇新題可問 ⇒ 立即完成、唔拋錯、狀態穩定
      const empty = createSession([], rngFromSeed(seed));
      assert.equal(empty.finished(), true);
      assert.equal(empty.current(), null);
      assert.equal(empty.score(), 0);
      assert.equal(empty.stars(), 0);
      assert.equal(empty.progress().answeredFresh, 0);
      empty.answer(true);
      assert.equal(empty.finished(), true);
    }),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 共用：錄音式假 AudioContext（注入 createNotePlayer 之 contextFactory）
//   —— 對手方（瀏覽器 WebAudio）按其契約以 mock 注入；可注入 suspended／reject／拋錯。
// ─────────────────────────────────────────────────────────────────────────────
interface OscRecord {
  created: number;
  type: string;
  freqAtStart: number;
  gainValueAtStart: number;
  wiredToDestination: boolean;
  startWhen: number;
  stopWhen: number;
  started: number;
  stopped: number;
  startOp: number;
  stopOp: number;
}

interface AudioLog {
  factoryCalls: number;
  contexts: number;
  destination: { tag: string };
  resumeCalls: number;
  creates: { oscillator: number; gain: number };
  ops: string[];
  oscs: OscRecord[];
}

function makeAudioLog(): AudioLog {
  return {
    factoryCalls: 0,
    contexts: 0,
    destination: { tag: "destination" },
    resumeCalls: 0,
    creates: { oscillator: 0, gain: 0 },
    ops: [],
    oscs: [],
  };
}

interface FakeContextOptions {
  currentTime?: number;
  state?: string;
  resume?: () => Promise<void>;
  failOscillatorAt?: number;
  throwCreateOscillatorTimes?: number;
}

function makeFakeAudioContext(
  log: AudioLog,
  opts: FakeContextOptions = {},
): AudioContextLike {
  const currentTime = opts.currentTime ?? 3.5;
  let oscCount = 0;
  let gainCount = 0;
  let lastGain: (GainLike & { connected?: unknown }) | null = null;
  const dest = log.destination;
  log.contexts += 1;
  return {
    currentTime,
    destination: dest,
    state: opts.state ?? "running",
    resume: () => {
      log.resumeCalls += 1;
      return opts.resume === undefined ? Promise.resolve() : opts.resume();
    },
    createOscillator(): OscillatorLike {
      oscCount += 1;
      if (
        opts.throwCreateOscillatorTimes !== undefined &&
        oscCount <= opts.throwCreateOscillatorTimes
      ) {
        throw new Error("mock: createOscillator 失敗");
      }
      log.creates.oscillator += 1;
      log.ops.push(`createOscillator#${oscCount}`);
      const rec: OscRecord = {
        created: oscCount,
        type: "",
        freqAtStart: Number.NaN,
        gainValueAtStart: Number.NaN,
        wiredToDestination: false,
        startWhen: Number.NaN,
        stopWhen: Number.NaN,
        started: 0,
        stopped: 0,
        startOp: -1,
        stopOp: -1,
      };
      log.oscs.push(rec);
      let target: unknown = undefined;
      const osc: OscillatorLike & { connected?: unknown } = {
        type: "",
        frequency: { value: 0 },
        connect: (d: unknown) => {
          target = d;
          return d;
        },
        start: (when?: number) => {
          rec.started += 1;
          rec.type = osc.type;
          rec.freqAtStart = osc.frequency.value;
          rec.startWhen = when ?? Number.NaN;
          rec.startOp = log.ops.length;
          log.ops.push(`osc#${oscCount}.start`);
          if (lastGain !== null && target === lastGain) {
            rec.gainValueAtStart = lastGain.gain.value;
            rec.wiredToDestination = lastGain.connected === dest;
          }
        },
        stop: (when?: number) => {
          rec.stopped += 1;
          rec.stopWhen = when ?? Number.NaN;
          rec.stopOp = log.ops.length;
          log.ops.push(`osc#${oscCount}.stop`);
        },
      };
      return osc;
    },
    createGain(): GainLike {
      gainCount += 1;
      log.creates.gain += 1;
      log.ops.push(`createGain#${gainCount}`);
      const g: GainLike & { connected?: unknown } = {
        gain: { value: 0 },
        connect: (d: unknown) => {
          g.connected = d;
          return d;
        },
      };
      lastGain = g;
      return g;
    },
  };
}

/** 每粒音之完整不變式：起振頻率、唯一 start／stop、路徑達 destination、時序。 */
function assertPlayRecord(
  rec: OscRecord,
  expectedFreq: number,
  volume: number,
  duration: number,
  currentTime: number,
): void {
  assert.equal(rec.started, 1, `osc#${rec.created} 恰起振一次`);
  assert.equal(rec.stopped, 1, `osc#${rec.created} 恰止振一次（無洩漏）`);
  assert.equal(rec.freqAtStart, expectedFreq, `osc#${rec.created} 起振頻率`);
  assert.ok(
    rec.wiredToDestination,
    `osc#${rec.created} 訊號路徑須達 destination`,
  );
  assert.equal(rec.gainValueAtStart, volume, `osc#${rec.created} 起振音量`);
  assert.equal(rec.startWhen, currentTime, `osc#${rec.created} 起振時刻`);
  assert.equal(
    rec.stopWhen,
    currentTime + duration,
    `osc#${rec.created} 止振＝起振＋音長`,
  );
  assert.ok(rec.startOp < rec.stopOp, `osc#${rec.created} start 先於 stop`);
}

const arbMode = fc.constantFrom<"letter" | "position">("letter", "position");

test("L1 · notes（標準矛盾，非實作 bug）：answerLine 之兩個讀法不可同時成立", () => {
  // 讀法 A（格式句「<字母> ＝ …」＋同一句之 `D ＝ D空弦 或 G弦4指`）：左邊＝音名字母
  assert.equal(answerLine("A3"), "A ＝ G弦1指");
  assert.equal(answerLine("G3"), "G ＝ G空弦");
  assert.equal(answerLine("D4"), "D ＝ D空弦 或 G弦4指");
  // 讀法 B（同句另兩例逐字照收）：左邊跟音名連八度
  assert.notEqual(
    answerLine("A3"),
    "A3 ＝ G弦1指",
    "兩讀法對 A3 唔同 ⇒ 標準自相矛盾",
  );
  assert.notEqual(
    answerLine("G3"),
    "G3 ＝ G空弦",
    "兩讀法對 G3 唔同 ⇒ 標準自相矛盾",
  );
  console.log(
    "（標準矛盾）PRD REQ-model-2 同一句並存「<字母> ＝ …」/`D ＝ D空弦 或 G弦4指`（字母形）" +
      "與 `A3 ＝ G弦1指`／`G3 ＝ G空弦`（音名形）；實作一律字母形（notes.ts:148-150），" +
      "且 ACCEPTANCE 之 ANSWER_LINE_FORMAT 亦用字母形。",
  );
});

test("L1 · shuffle（標準缺口，域外）：重複項池——NO_ADJACENT_REPEAT 不可滿足", () => {
  // 極簡反例：items = ["A","A"]，rng 全零 ⇒ 抽取序列 A,A,…（必然相鄰重複）
  const dupBag = createBag<string>(["A", "A"], () => 0);
  const dupSeq = Array.from({ length: 4 }, () => dupBag.next());
  assert.deepEqual(dupSeq, ["A", "A", "A", "A"]);
  assert.equal(
    dupSeq.some((v, i) => i > 0 && v === dupSeq[i - 1]),
    true,
    "重複項池：相鄰相同（任何實作皆不可避）",
  );
  // 混合重複池：跨輪界之 swap 可能換入同值項 ⇒ 邊界亦失守（可滿足部分＝每輪 multiset 全數一次）
  const mixed = ["A", "A", "B"];
  const bag = createBag(mixed, () => 0);
  const seq = Array.from({ length: 8 }, () => bag.next());
  const firstAdjacent = seq.findIndex((v, i) => i > 0 && v === seq[i - 1]);
  for (let s = 0; s + mixed.length <= seq.length; s += mixed.length) {
    assert.deepEqual(
      [...seq.slice(s, s + mixed.length)].sort(),
      [...mixed].sort(),
      "每輪＝multiset 全數一次（可滿足部分）",
    );
  }
  assert.ok(firstAdjacent >= 1, "混合重複池同樣出現相鄰重複");
  console.log(
    `（域外）items=["A","A","B"]、rng 全零之抽取序列 = ${seq.join(",")}；` +
      `首個相鄰重複在第 ${firstAdjacent} 抽；標準只寫（items>1），未要求 items 互異 ⇒ 無法同時成立。`,
  );
});

test("L1 · session（觀察，非斷言）：未經 current() 之連續作答會靜默消費下一題", () => {
  const session = createSession(fakePool(4), rngFromSeed(7));
  const q = session.current();
  assert.ok(q);
  session.answer(true);
  const afterFirst = session.progress().answeredFresh;
  session.answer(true); // 未再 current()：照樣消費下一條
  const afterSecond = session.progress().answeredFresh;
  console.log(
    `（觀察）連續 answer() 兩次：answeredFresh ${afterFirst} → ${afterSecond}；` +
      "標準（REQ-round-2）未定義重複作答語義；UI 以 feedback 鎖保護（GameScreen submit 早退）⇒ 不可由 app 觸發。",
  );
});

test("L1 · rng（統計觀察，非標準要求）：rngFromSeed 首值非單射", () => {
  const first = new Map<number, number>();
  let collisions = 0;
  for (let s = 0; s < 20_000; s++) {
    const v = rngFromSeed(s)();
    if (first.has(v)) collisions += 1;
    else first.set(v, s);
  }
  console.log(
    `（觀察）seed 0..19999 之中，首值與更早 seed 相同者 = ${collisions}（mulberry32 首步混合作用非單射）；` +
      "標準只要求「同一 seed ⇒ 同一序列」，冇要求不同 seed 之序列互異；碰撞後序列即分岔。",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// L2 interaction
// ─────────────────────────────────────────────────────────────────────────────

test("L2 · judging×notes：認音名——恰接受該音字母、大小寫敏感、與八度無關", () => {
  prop(
    "L2.judge.letter",
    400,
    fc.property(arbNote, fc.string(), (note, candidate) => {
      const specLetter = LETTERS[pcIndex(specMidiOf(note))] as string;
      assert.equal(
        isCorrect(note, { kind: "letter", letter: candidate }),
        candidate === specLetter,
        `${note} vs ${JSON.stringify(candidate)}`,
      );
    }),
  );
  prop(
    "L2.judge.letter.letters",
    300,
    fc.property(arbNote, fc.constantFrom(..."ABCDEFG"), (note, letter) => {
      const specLetter = LETTERS[pcIndex(specMidiOf(note))] as string;
      assert.equal(
        isCorrect(note, { kind: "letter", letter }),
        letter === specLetter,
      );
      assert.equal(
        isCorrect(note, { kind: "letter", letter: letter.toLowerCase() }),
        false,
        "小寫一律拒絕（UI 一律大寫）",
      );
    }),
  );
  prop(
    "L2.judge.octave-agnostic",
    200,
    fc.property(fc.constantFrom(...LETTERS), (letter) => {
      const sameLetter = PITCH_IDS.filter(
        (id) => (LETTERS[pcIndex(specMidiOf(id))] as string) === letter,
      );
      assert.ok(sameLetter.length >= 1, `${letter} 至少一個八度`);
      const verdicts = sameLetter.map((id) =>
        isCorrect(id, { kind: "letter", letter }),
      );
      assert.deepEqual(
        verdicts,
        sameLetter.map(() => true),
        "同字母跨八度一致接受",
      );
      const other = PITCH_IDS.find(
        (id) => (LETTERS[pcIndex(specMidiOf(id))] as string) !== letter,
      );
      assert.ok(other);
      assert.equal(isCorrect(other, { kind: "letter", letter }), false);
    }),
  );
});

test("L2 · judging×notes：認位置——接受 ⟺ 格屬該音奏法；20 格中其餘全拒（獨立規格全掃）", () => {
  prop(
    "L2.judge.position",
    700,
    fc.property(arbNote, arbCell, (note, [s, f]) => {
      const expected = specPlacementsOf(note).some(
        ([s2, f2]) => s2 === s && f2 === f,
      );
      assert.equal(
        isCorrect(note, { kind: "position", string: s, finger: f }),
        expected,
        `${note} vs ${s}弦${f}指`,
      );
    }),
  );
  prop(
    "L2.judge.position.grid",
    200,
    fc.property(fc.integer({ min: 0, max: 19 }), (i) => {
      const cell = ALL_CELLS[i] as [StringName, Finger];
      const accepted = PITCH_IDS.filter((id) =>
        isCorrect(id, { kind: "position", string: cell[0], finger: cell[1] }),
      );
      assert.equal(accepted.length, 1, `${cell[0]}弦${cell[1]}指 恰一個音接受`);
      assert.equal(accepted[0], specNoteAt(cell[0], cell[1]));
    }),
  );
});

test("L2 · judging：錯誤通道——對域外輸入唔拋錯、必回 boolean", () => {
  prop(
    "L2.judge.total",
    300,
    fc.property(
      arbNote,
      fc.oneof(fc.constantFrom(..."GD AEgX"), fc.string()),
      fc.integer({ min: -2, max: 9 }),
      (note, str, finger) => {
        const byLetter = isCorrect(note, { kind: "letter", letter: str });
        assert.equal(typeof byLetter, "boolean", "letter 判定必為 boolean");
        const byPosition = isCorrect(note, {
          kind: "position",
          string: str as StringName,
          finger: finger as Finger,
        });
        assert.equal(typeof byPosition, "boolean", "position 判定必為 boolean");
        assert.equal(
          byPosition,
          placementsOf(note).some(
            (p) => p.string === str && p.finger === finger,
          ),
          "域外格一律 false（唔可誤接受）",
        );
      },
    ),
  );
  const unknownKind = isCorrect(
    PITCH_IDS[0] as NoteId,
    {
      kind: "bogus",
    } as never,
  ) as unknown;
  console.log(
    `（觀察，非斷言）isCorrect 未知 kind → typeof = ${typeof unknownKind}（域外；見 unmodeled）`,
  );
});

test("L2 · judging×notes：任何音喺兩種模式皆有正確答案（遊戲必然可贏）", () => {
  prop(
    "L2.judge.winnable",
    200,
    fc.property(arbNote, (note) => {
      assert.equal(
        isCorrect(note, { kind: "letter", letter: letterOf(note) }),
        true,
        "認音名有正解",
      );
      const places = placementsOf(note);
      assert.ok(places.length >= 1);
      for (const p of places) {
        assert.equal(
          isCorrect(note, {
            kind: "position",
            string: p.string,
            finger: p.finger,
          }),
          true,
          "認位置每個奏法皆為正解",
        );
      }
      assert.ok(
        places.every(
          (p) =>
            STRING_ORDER.includes(p.string) && p.finger >= 0 && p.finger <= 4,
        ),
        "正解格必在 20 格內（UI 一定出得切）",
      );
    }),
  );
});

test("L2 · params×levels⇒notes⇒judging⇒session：任一 query 解析出嘅題池恆可玩、可完成", () => {
  prop(
    "L2.chain.playable",
    400,
    fc.property(arbRawQuery, (raw) => {
      const cfg = parsePlayQuery(raw);
      const pool = poolFor(cfg.level, cfg.strings);
      assert.ok(pool.length >= 5, `題池非空（${cfg.level}）`);
      assert.equal(new Set(pool).size, pool.length, "去重");
      for (const id of pool) {
        assert.ok(PITCH_IDS.includes(id), "⊆17 音");
        assert.equal(midiOf(id) > 0, true);
        // 兩種模式皆有正解 ⇒ 唔會出無解之題
        assert.equal(
          isCorrect(id, { kind: "letter", letter: letterOf(id) }),
          true,
        );
        const p = placementsOf(id)[0];
        assert.ok(p);
        assert.equal(
          isCorrect(id, {
            kind: "position",
            string: p.string,
            finger: p.finger,
          }),
          true,
        );
      }
      // 全對 ⇒ 一局完成、10/10、無重出
      const session = createSession(
        pool,
        rngFromSeed(pool.length * 31 + cfg.strings.length),
      );
      const entries = drain(session, () => true);
      assert.equal(entries.length, ROUND_SIZE);
      assert.ok(entries.every((e) => !e.replay));
      assert.equal(session.score(), ROUND_SIZE);
      assert.equal(session.stars(), ROUND_SIZE);
      assert.equal(session.streak(), ROUND_SIZE);
      assertRoundInvariants(entries, pool);
    }),
  );
});

test("L2 · session×shuffle：新題序＝袋契約（敵意 rng 亦然）；重出段唔再抽袋（擁有權）", () => {
  prop(
    "L2.session.bag",
    600,
    fc.property(
      fc.integer({ min: 2, max: 17 }),
      arbRngScript,
      arbDecisions,
      (n, script, decisions) => {
        const pool = fakePool(n);
        const session = createSession(pool, scripted(script));
        const entries = drain(
          session,
          (i) => decisions[i % decisions.length] as boolean,
        );
        assertRoundInvariants(entries, pool);
        const wrongIds = new Set(
          entries.filter((e) => !e.replay && !e.correct).map((e) => e.noteId),
        );
        for (const e of entries.filter((x) => x.replay)) {
          assert.ok(wrongIds.has(e.noteId), "重出只含首答錯之題");
        }
      },
    ),
  );
  prop(
    "L2.session.bag.ownership",
    300,
    fc.property(arbPoolSize, arbSeed, arbDecisions, (n, seed, decisions) => {
      const pool = fakePool(n);
      const base = rngFromSeed(seed);
      let calls = 0;
      const session = createSession(pool, () => {
        calls += 1;
        return base();
      });
      let callsAtFreshEnd = -1;
      drain(
        session,
        (i) => decisions[i % decisions.length] as boolean,
        ({ q }) => {
          if (!q.replay && session.progress().answeredFresh === ROUND_SIZE) {
            callsAtFreshEnd = calls;
          }
        },
      );
      assert.ok(callsAtFreshEnd >= 0, "應觀察到新題段結束");
      assert.equal(
        calls,
        callsAtFreshEnd,
        "重出段不得再由袋抽題（rng 呼叫數不變）",
      );
    }),
  );
});

test("L2 · audio×notes：frequencyOf 與 notes.midiOf／獨立規格表跨模組一致", () => {
  prop(
    "L2.audio.frequency",
    400,
    fc.property(arbNote, (note) => {
      const f = frequencyOf(note);
      assert.ok(Number.isFinite(f), `${note} 頻率須有限`);
      assert.equal(
        f,
        440 * 2 ** ((midiOf(note) - 69) / 12),
        "＝12 平均律（以 notes.midiOf 為準）",
      );
      assert.equal(
        f,
        440 * 2 ** ((specMidiOf(note) - 69) / 12),
        "＝獨立規格表（C 大調推導）",
      );
      assert.ok(f > 0);
    }),
  );
  // 錨點（確定性表格；唔經 fc 生成器，故唔計入 runs 統計）
  assert.equal(frequencyOf("A4"), 440, "A4＝440Hz 錨點");
  assert.equal(frequencyOf("C4"), 440 * 2 ** ((60 - 69) / 12));
  assert.ok(Math.abs(frequencyOf("G3") - 196) <= 0.01, "G3≈196.00");
  assert.ok(Math.abs(frequencyOf("D4") - 293.66) <= 0.01, "D4≈293.66");
  assert.ok(Math.abs(frequencyOf("E5") - 659.26) <= 0.01, "E5≈659.26");
  assert.ok(Math.abs(frequencyOf("B5") - 987.77) <= 0.01, "B5≈987.77");
  const ordered = [...PITCH_IDS].sort((a, b) => midiOf(a) - midiOf(b));
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(
      frequencyOf(ordered[i] as NoteId) > frequencyOf(ordered[i - 1] as NoteId),
      "升序單調",
    );
  }
  prop(
    "L2.audio.monotone",
    200,
    fc.property(arbNote, arbNote, (a, b) => {
      assert.equal(
        frequencyOf(a) < frequencyOf(b),
        midiOf(a) < midiOf(b),
        `頻率序須同 MIDI 序（${a} vs ${b}）`,
      );
    }),
  );
});

test("L2 · session×judging×audio：整局遊戲——播嘅音＝派題嘅音、每答一響一粒 osc", () => {
  // 可玩設定：非 custom，或 custom 揀咗至少一條弦（＝parsePlayQuery 恆會產生之形狀）
  const arbPlayableConfig = fc.oneof(
    fc.record({
      level: fc.constantFrom<LevelId>("G", "D", "A", "E", "mixed"),
      strings: fc.constant<readonly StringName[]>([]),
    }),
    fc.record({
      level: fc.constant<LevelId>("custom"),
      strings: fc.constantFrom<readonly StringName[]>(...CUSTOM_SUBSETS),
    }),
  );
  const arbDecisionPair = fc.tuple(
    arbDecisions,
    fc.array(fc.boolean(), { minLength: 26, maxLength: 40 }),
  );

  /** 一場完整遊戲：session×judging×audio（mute 切換）＋逐粒音不變式。 */
  const runGameFlow = (
    mode: "letter" | "position",
    level: LevelId,
    strings: readonly StringName[],
    seed: number,
    correctPattern: readonly boolean[],
    mutedPattern: readonly boolean[],
  ): void => {
    const pool = poolFor(level, strings);
    assert.ok(pool.length >= 5, "可玩設定之題池必非空");
    const session = createSession(pool, rngFromSeed(seed));
    const log = makeAudioLog();
    const player: NotePlayer = createNotePlayer({
      contextFactory: () => {
        log.factoryCalls += 1;
        return makeFakeAudioContext(log, { currentTime: 12.25 });
      },
      volume: 0.25,
      duration: 0.5,
    });
    const playedNotes: NoteId[] = [];
    const entries = drain(session, (i, q) => {
      const wantCorrect = correctPattern[i % correctPattern.length] as boolean;
      // 以 judging 為唯一判定：先構造意圖答案，再驗證判定結果
      let answer:
        | { kind: "letter"; letter: string }
        | { kind: "position"; string: StringName; finger: Finger };
      if (mode === "letter") {
        answer = wantCorrect
          ? { kind: "letter", letter: letterOf(q.noteId) }
          : {
              kind: "letter",
              letter: LETTERS.find((l) => l !== letterOf(q.noteId)) as string,
            };
      } else {
        const places = placementsOf(q.noteId);
        const wrongCell = ALL_CELLS.find(
          ([s, f]) => !places.some((p) => p.string === s && p.finger === f),
        );
        assert.ok(wrongCell, "20 格中必有錯格");
        const chosen = wantCorrect
          ? ([
              places[0]?.string as StringName,
              places[0]?.finger as Finger,
            ] as const)
          : wrongCell;
        answer = { kind: "position", string: chosen[0], finger: chosen[1] };
      }
      const correct = isCorrect(q.noteId, answer);
      assert.equal(
        correct,
        wantCorrect,
        "judging 判定＝意圖（正解存在、錯解被拒）",
      );
      const wantMute = mutedPattern[i % mutedPattern.length] as boolean;
      player.setMuted(wantMute);
      assert.equal(player.isMuted(), wantMute, "isMuted 反映狀態");
      if (!wantMute) {
        player.play(q.noteId);
        playedNotes.push(q.noteId);
      }
      return correct;
    });
    assertRoundInvariants(entries, pool);
    // 音效：每粒未 mute 之應答＝一粒新 osc，頻率＝該題之音高
    assert.equal(
      log.creates.oscillator,
      playedNotes.length,
      "osc 數＝未 mute 應答數",
    );
    assert.equal(
      log.creates.gain,
      playedNotes.length,
      "gain 數＝未 mute 應答數",
    );
    assert.equal(
      log.factoryCalls,
      playedNotes.length > 0 ? 1 : 0,
      "lazy context：首次播放才建立、全程一個",
    );
    log.oscs.forEach((rec, k) => {
      const note = playedNotes[k] as NoteId;
      assertPlayRecord(rec, frequencyOf(note), 0.25, 0.5, 12.25);
      assert.equal(
        rec.freqAtStart,
        440 * 2 ** ((specMidiOf(note) - 69) / 12),
        "起振頻率＝規格表",
      );
    });
  };

  prop(
    "L2.game.flow",
    700,
    fc.property(
      arbMode,
      arbPlayableConfig,
      arbSeed,
      arbDecisionPair,
      (mode, cfg, seed, [correctPattern, mutedPattern]) => {
        runGameFlow(
          mode,
          cfg.level,
          cfg.strings,
          seed,
          correctPattern,
          mutedPattern,
        );
      },
    ),
  );
  prop(
    "L2.game.flow.via-params",
    400,
    fc.property(
      arbMode,
      arbRawQuery,
      arbSeed,
      arbDecisionPair,
      (mode, raw, seed, [c, m]) => {
        const cfg = parsePlayQuery(raw);
        runGameFlow(mode, cfg.level, cfg.strings, seed, c, m);
      },
    ),
  );
});

test("L2 · 共享狀態：一整局（含重出／音效／mute 切換）之後，題庫／常數表／題池快照不變", () => {
  const snapshot = () =>
    JSON.stringify({
      notes: NOTES,
      pitches: PITCH_IDS,
      mixed: MIXED_POOL,
      strings: STRING_NOTES,
      order: STRING_ORDER,
      levels: VALID_LEVELS,
      custom: poolFor("custom", ["G", "A"]),
      single: poolFor("D", []),
    });
  prop(
    "L2.shared-state",
    200,
    fc.property(
      arbLevel,
      arbStrings,
      arbSeed,
      arbDecisions,
      arbMode,
      (level, strings, seed, decisions, mode) => {
        const before = snapshot();
        const pool = poolFor(level, strings);
        const session = createSession(pool, rngFromSeed(seed));
        const log = makeAudioLog();
        const player = createNotePlayer({
          contextFactory: () => makeFakeAudioContext(log),
        });
        drain(session, (i, q) => {
          player.setMuted(i % 3 === 0);
          if (!player.isMuted()) player.play(q.noteId);
          const places = placementsOf(q.noteId);
          void places;
          void answerLine(q.noteId);
          void letterOf(q.noteId);
          void staffStepOf(q.noteId);
          const correct =
            mode === "letter"
              ? isCorrect(q.noteId, {
                  kind: "letter",
                  letter: letterOf(q.noteId),
                })
              : isCorrect(q.noteId, {
                  kind: "position",
                  string: places[0]?.string as StringName,
                  finger: places[0]?.finger as Finger,
                });
          return (decisions[i % decisions.length] as boolean) && correct;
        });
        assert.equal(snapshot(), before, "共享表／題池不得被局操作改動");
      },
    ),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// L3 integration：audio 播放器（注入 fake AudioContext）
// ─────────────────────────────────────────────────────────────────────────────

test("L3 · audio：生命周期＋多次播放——lazy context、每響恰一 osc／gain、頻率／音量／時長、無洩漏", () => {
  prop(
    "L3.player.play",
    700,
    fc.property(
      fc.array(fc.record({ note: arbNote, turnMuted: fc.boolean() }), {
        maxLength: 8,
      }),
      fc.double({ min: 0.0001, max: 1, noNaN: true }),
      fc.double({ min: 0.01, max: 2, noNaN: true }),
      fc.double({ min: 0, max: 100, noNaN: true }),
      fc.boolean(),
      (ops, volume, duration, currentTime, suspended) => {
        const log = makeAudioLog();
        const player = createNotePlayer({
          contextFactory: () => {
            log.factoryCalls += 1;
            return makeFakeAudioContext(log, {
              currentTime,
              state: suspended ? "suspended" : "running",
            });
          },
          volume,
          duration,
        });
        assert.equal(player.isMuted(), false, "預設唔 mute");
        assert.equal(log.factoryCalls, 0, "建構時唔應建立 context（lazy）");
        const expected: NoteId[] = [];
        for (const op of ops) {
          player.setMuted(op.turnMuted);
          assert.equal(player.isMuted(), op.turnMuted, "isMuted 反映 setMuted");
          player.play(op.note);
          if (!op.turnMuted) expected.push(op.note);
        }
        assert.equal(
          log.creates.oscillator,
          expected.length,
          "unmuted play 恰一 osc",
        );
        assert.equal(
          log.creates.gain,
          expected.length,
          "unmuted play 恰一 gain",
        );
        assert.equal(
          log.factoryCalls,
          expected.length > 0 ? 1 : 0,
          "context 只建一次（跨多次播放重用）",
        );
        assert.equal(log.contexts, expected.length > 0 ? 1 : 0);
        assert.equal(
          log.resumeCalls,
          suspended ? expected.length : 0,
          "只有 suspended 狀態才 resume（每次播放一次）",
        );
        log.oscs.forEach((rec, k) => {
          assertPlayRecord(
            rec,
            frequencyOf(expected[k] as NoteId),
            volume,
            duration,
            currentTime,
          );
        });
      },
    ),
  );
});

test("L3 · audio：mute＝零副作用（唔建 context／唔 createOscillator／唔 resume）＋開關往返", () => {
  prop(
    "L3.player.mute",
    300,
    fc.property(
      fc.array(arbNote, { minLength: 1, maxLength: 6 }),
      arbNote,
      fc.double({ min: 0, max: 60, noNaN: true }),
      (mutedNotes, liveNote, currentTime) => {
        const log = makeAudioLog();
        const player = createNotePlayer({
          contextFactory: () => {
            log.factoryCalls += 1;
            return makeFakeAudioContext(log, { currentTime });
          },
        });
        player.setMuted(true);
        for (const n of mutedNotes) player.play(n);
        assert.equal(log.factoryCalls, 0, "mute 期間唔應建立 context");
        assert.equal(log.contexts, 0);
        assert.equal(
          log.creates.oscillator,
          0,
          "mute 期間唔得 createOscillator",
        );
        assert.equal(log.creates.gain, 0);
        assert.equal(log.resumeCalls, 0, "mute 期間唔應 resume");
        assert.equal(log.ops.length, 0, "mute 期間不得對 context 做任何操作");

        player.setMuted(false);
        player.play(liveNote);
        assert.equal(log.creates.oscillator, 1, "解除 mute 後可再起振");
        // 註：0.2／0.6 為 audio.ts 自帶之預設值（PRD 未規定）；此處只作安全範圍之 pin，
        // 重點係音量須為 (0,1] 之有限值、音長須為有限正值，且與 stop 時刻一致。
        assertPlayRecord(
          log.oscs[0] as OscRecord,
          frequencyOf(liveNote),
          0.2,
          0.6,
          currentTime,
        );

        player.setMuted(true);
        player.play(liveNote);
        assert.equal(log.creates.oscillator, 1, "再 mute 後不得起振");

        for (const v of [true, false, false, true, true, false]) {
          player.setMuted(v);
          assert.equal(player.isMuted(), v, "往返切換須一致");
        }
        assert.equal(log.resumeCalls, 0, "running context 唔需要 resume");
      },
    ),
  );
});

test("L3 · audio：失敗點安全出路——工廠拋錯／createOscillator 拋錯／mute 短路，之後仍可播", () => {
  prop(
    "L3.player.fail.factory",
    250,
    fc.property(
      fc.integer({ min: 1, max: 3 }),
      arbNote,
      fc.array(fc.record({ note: arbNote, muted: fc.boolean() }), {
        maxLength: 3,
      }),
      (failTimes, note, tail) => {
        const log = makeAudioLog();
        let calls = 0;
        const player = createNotePlayer({
          contextFactory: () => {
            calls += 1;
            if (calls <= failTimes) throw new Error("mock: 此環境冇 WebAudio");
            return makeFakeAudioContext(log, { currentTime: 5 });
          },
        });
        for (let i = 0; i < failTimes; i++) {
          assert.throws(
            () => player.play(note),
            (err: unknown) =>
              err instanceof Error && /WebAudio/.test(err.message),
            "context 建立失敗須拋出（不可靜默）",
          );
        }
        assert.equal(calls, failTimes, "每次失敗播放各試一次建立");
        assert.equal(log.contexts, 0, "失敗時冇 context");
        assert.equal(log.creates.oscillator, 0, "失敗時冇起振");
        // 環境回復 ⇒ 同一 player 仍可播（唔會卡死）
        player.play(note);
        assert.equal(calls, failTimes + 1, "下一次播放重試建立");
        assert.equal(log.contexts, 1);
        const expected = [note];
        for (const op of tail) {
          player.setMuted(op.muted);
          player.play(op.note);
          if (!op.muted) expected.push(op.note);
        }
        assert.equal(log.creates.oscillator, expected.length);
        log.oscs.forEach((rec, k) => {
          assertPlayRecord(
            rec,
            frequencyOf(expected[k] as NoteId),
            0.2,
            0.6,
            5,
          );
        });
      },
    ),
  );
  prop(
    "L3.player.fail.oscillator",
    200,
    fc.property(
      fc.integer({ min: 1, max: 2 }),
      arbNote,
      fc.double({ min: 0, max: 60, noNaN: true }),
      (failTimes, note, currentTime) => {
        const log = makeAudioLog();
        const player = createNotePlayer({
          contextFactory: () =>
            makeFakeAudioContext(log, {
              currentTime,
              throwCreateOscillatorTimes: failTimes,
            }),
        });
        for (let i = 0; i < failTimes; i++) {
          assert.throws(() => player.play(note), /createOscillator/);
        }
        assert.equal(log.creates.oscillator, 0, "失敗播放不得留下半完成 osc");
        assert.equal(log.creates.gain, 0, "失敗播放不得留下 gain");
        player.play(note);
        assert.equal(log.creates.oscillator, 1, "之後仍可播（唔會卡死）");
        assertPlayRecord(
          log.oscs[0] as OscRecord,
          frequencyOf(note),
          0.2,
          0.6,
          currentTime,
        );
      },
    ),
  );
  prop(
    "L3.player.fail.muted",
    200,
    fc.property(fc.array(arbNote, { minLength: 1, maxLength: 5 }), (notes) => {
      let calls = 0;
      const player = createNotePlayer({
        contextFactory: () => {
          calls += 1;
          throw new Error("mock: 此環境冇 WebAudio");
        },
      });
      player.setMuted(true);
      for (const n of notes) {
        assert.doesNotThrow(
          () => player.play(n),
          "mute 期間即使環境壞掉亦不得拋錯",
        );
      }
      assert.equal(calls, 0, "mute 短路：完全唔掂 contextFactory");
    }),
  );
});

test("L3 · audio：suspended＋resume 拒絕——仍起振、唔拋錯、零 unhandled rejection", async () => {
  const rejections: unknown[] = [];
  const onRejection = (r: unknown) => rejections.push(r);
  process.on("unhandledRejection", onRejection);
  try {
    await asyncProp(
      "L3.player.fail.resume",
      250,
      fc.asyncProperty(
        arbNote,
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.integer({ min: 1, max: 3 }),
        async (note, currentTime, plays) => {
          const log = makeAudioLog();
          const player = createNotePlayer({
            contextFactory: () =>
              makeFakeAudioContext(log, {
                currentTime,
                state: "suspended",
                resume: () => Promise.reject(new Error("mock: resume 拒絕")),
              }),
          });
          const before = rejections.length;
          for (let i = 0; i < plays; i++) {
            assert.doesNotThrow(
              () => player.play(note),
              "resume 拒絕唔應中斷播放",
            );
          }
          await new Promise((r) => setImmediate(r));
          await new Promise((r) => setImmediate(r));
          assert.equal(log.resumeCalls, plays, "每次播放各嘗試 resume 一次");
          assert.equal(
            log.creates.oscillator,
            plays,
            "即使 resume 拒絕仍要起振",
          );
          log.oscs.forEach((rec) => {
            assertPlayRecord(rec, frequencyOf(note), 0.2, 0.6, currentTime);
          });
          assert.equal(
            rejections.length - before,
            0,
            "resume 之拒絕必須被吸收（唔可變成 unhandled rejection）",
          );
        },
      ),
    );
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

test("L3 · audio：多播放器擁有權——各自 context、互不干擾、唔重用 osc、每次播放各一粒", () => {
  prop(
    "L3.player.ownership",
    300,
    fc.property(
      fc.array(arbNote, { maxLength: 5 }),
      fc.array(arbNote, { maxLength: 5 }),
      fc.boolean(),
      (notesA, notesB, muteA) => {
        const logA = makeAudioLog();
        const logB = makeAudioLog();
        const playerA = createNotePlayer({
          contextFactory: () => {
            logA.factoryCalls += 1;
            return makeFakeAudioContext(logA, { currentTime: 1 });
          },
        });
        const playerB = createNotePlayer({
          contextFactory: () => {
            logB.factoryCalls += 1;
            return makeFakeAudioContext(logB, { currentTime: 2 });
          },
        });
        playerA.setMuted(muteA);
        assert.equal(playerB.isMuted(), false, "新播放器預設唔 mute");
        const expectedA: NoteId[] = [];
        const expectedB: NoteId[] = [];
        const rounds = Math.max(notesA.length, notesB.length);
        for (let i = 0; i < rounds; i++) {
          if (i < notesA.length) {
            const n = notesA[i] as NoteId;
            playerA.play(n);
            if (!muteA) expectedA.push(n);
          }
          if (i < notesB.length) {
            const n = notesB[i] as NoteId;
            playerB.play(n);
            expectedB.push(n);
          }
        }
        assert.equal(logA.creates.oscillator, expectedA.length, "A 之 osc 數");
        assert.equal(logB.creates.oscillator, expectedB.length, "B 之 osc 數");
        assert.equal(
          logA.factoryCalls,
          expectedA.length > 0 ? 1 : 0,
          "A 一個 context",
        );
        assert.equal(
          logB.factoryCalls,
          expectedB.length > 0 ? 1 : 0,
          "B 一個 context",
        );
        assert.equal(playerA.isMuted(), muteA, "B 之操作不得改動 A 之 mute");
        assert.equal(playerB.isMuted(), false);
        logA.oscs.forEach((rec, k) => {
          assertPlayRecord(
            rec,
            frequencyOf(expectedA[k] as NoteId),
            0.2,
            0.6,
            1,
          );
        });
        logB.oscs.forEach((rec, k) => {
          assertPlayRecord(
            rec,
            frequencyOf(expectedB[k] as NoteId),
            0.2,
            0.6,
            2,
          );
        });
      },
    ),
  );
});

test("L3 · audio：真實預設路徑（無 WebAudio 之 Node 環境）——明確錯誤、唔靜默、可重複", () => {
  const scope = globalThis as {
    AudioContext?: unknown;
    webkitAudioContext?: unknown;
  };
  const player = createNotePlayer(); // 默認 contextFactory
  if (
    scope.AudioContext === undefined &&
    scope.webkitAudioContext === undefined
  ) {
    for (let i = 0; i < 3; i++) {
      assert.throws(
        () => player.play("A4"),
        (err: unknown) => err instanceof Error && /WebAudio/.test(err.message),
        "無 WebAudio 時須拋出可辨識錯誤（唔可靜默、唔可 NaN）",
      );
    }
    assert.equal(player.isMuted(), false, "失敗唔應改動 mute 狀態");
  } else {
    console.log("（略過）此環境有 AudioContext，唔適用 Node 無 WebAudio 路徑");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 總輸出：所有 property 之實際 runs（fc.check 回報之 numRuns）
// ─────────────────────────────────────────────────────────────────────────────

test("PBT 總輸出：三層 property 之 runs 統計（需 > 10,000）", () => {
  const lines = runsTable.map(
    ({ label, runs }) => `  ${String(runs).padStart(5)}  ${label}`,
  );
  console.log(
    [
      "",
      "══ PBT runs 統計（fc.check 實際執行次數）══",
      ...lines,
      `  合計 runs = ${totalRuns}，property 條數 = ${runsTable.length}`,
      "",
    ].join("\n"),
  );
  assert.ok(
    totalRuns > 10_000,
    `三層 property 總 runs 需 > 10,000（實際 ${totalRuns}）`,
  );
  assert.ok(
    runsTable.length >= 30,
    `property 條數應 ≥30（實際 ${runsTable.length}）`,
  );
});
