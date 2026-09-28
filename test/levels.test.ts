// REQ-levels-1 / REQ-params-1：題池與 URL 參數解析。
import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { poolFor } from "../src/lib/levels";
import { parsePlayQuery, type RawQuery } from "../src/lib/params";
import type { StringName } from "../src/lib/notes";

const ORDER: readonly StringName[] = ["G", "D", "A", "E"];
const STRING_NOTES: Record<StringName, readonly string[]> = {
  G: ["G3", "A3", "B3", "C4", "D4"],
  D: ["D4", "E4", "F4", "G4", "A4"],
  A: ["A4", "B4", "C5", "D5", "E5"],
  E: ["E5", "F5", "G5", "A5", "B5"],
};
const MIXED = [...new Set(ORDER.flatMap((s) => [...STRING_NOTES[s]]))];

test("POOL_FOR_LEVEL_EXACT: 單弦關＝該弦 5 音；mixed＝17 音；custom＝所選弦聯集（弦序、去重）", () => {
  for (const s of ORDER)
    assert.deepEqual([...poolFor(s)], [...STRING_NOTES[s]], `${s} 關`);
  assert.deepEqual([...poolFor("mixed")], MIXED, "mixed 關");
  assert.equal(MIXED.length, 17);
  for (let mask = 0; mask < 16; mask++) {
    const strings = ORDER.filter((_, i) => mask & (1 << i));
    const expected = [...new Set(strings.flatMap((s) => [...STRING_NOTES[s]]))];
    assert.deepEqual(
      [...poolFor("custom", strings)],
      expected,
      `custom [${strings.join("+")}]`,
    );
  }
  assert.deepEqual(
    [...poolFor("custom", ["D", "D", "A"])],
    [...new Set([...STRING_NOTES.D, ...STRING_NOTES.A])],
    "重複輸入去重",
  );
  fc.assert(
    fc.property(fc.subarray([...ORDER], { minLength: 1 }), (arr) => {
      const expected = [...new Set(arr.flatMap((s) => [...STRING_NOTES[s]]))];
      assert.deepEqual([...poolFor("custom", arr)], expected);
    }),
    { numRuns: 60 },
  );
});

// RA-2（Review A）：「固定弦序 G,D,A,E」唔可反駁——唯一重複用例已順序、fc.subarray 生成器
// 保序，兩者皆無法否證「照輸入次序」之實作。補反序／亂序／重複之確定性用例＋
// 任意次序生成器（期望值按 STRING_ORDER 正規化）。
test("POOL_FOR_INPUT_ORDER_INDEPENDENT: 反序／亂序／重複輸入 ⇒ 題池一律按 STRING_ORDER 排", () => {
  const canonicalNotes = (strings: readonly StringName[]): string[] => [
    ...new Set(
      ORDER.filter((s) => strings.includes(s)).flatMap((s) => [
        ...STRING_NOTES[s],
      ]),
    ),
  ];

  // 反序：[E,D] ⇒ 弦序 D→E（唔准跟輸入次序 E→D）
  assert.deepEqual(
    [...poolFor("custom", ["E", "D"])],
    canonicalNotes(["E", "D"]),
  );
  assert.deepEqual(
    [...poolFor("custom", ["E", "D"])],
    [...STRING_NOTES.D, ...STRING_NOTES.E],
    "[E,D] ⇒ D 弦 5 音行先",
  );
  // 亂序（三弦）：[E,G,D]
  assert.deepEqual(
    [...poolFor("custom", ["E", "G", "D"])],
    canonicalNotes(["E", "G", "D"]),
  );
  assert.deepEqual(
    [...poolFor("custom", ["E", "G", "D"])],
    // 弦序 G→D→E、去重（D4 同屬 G 與 D，只出一次）
    [...STRING_NOTES.G, ...STRING_NOTES.D.slice(1), ...STRING_NOTES.E],
    "[E,G,D] ⇒ G→D→E、重疊音去重",
  );
  // 全反序 ⇒ 同 mixed 17 音同序
  assert.deepEqual([...poolFor("custom", ["E", "A", "D", "G"])], [...MIXED]);
  // 重複＋反序：[E,D,E,D]
  assert.deepEqual(
    [...poolFor("custom", ["E", "D", "E", "D"])],
    canonicalNotes(["E", "D", "E", "D"]),
  );
  // 重疊音（A∪E 共享 E5）：次序仍須 A 在 E 前
  assert.deepEqual(
    [...poolFor("custom", ["E", "A"])],
    canonicalNotes(["E", "A"]),
  );
  assert.deepEqual(
    [...poolFor("custom", ["E", "A"])].slice(0, STRING_NOTES.A.length),
    [...STRING_NOTES.A],
    "[E,A] ⇒ A 弦 5 音行先",
  );
  // 任意次序＋重複之 PBT（fc.subarray 保序，冇此鑑別力）
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...ORDER), { maxLength: 6 }),
      (arr) => {
        assert.deepEqual(
          [...poolFor("custom", arr)],
          canonicalNotes(arr),
          `輸入 [${arr.join(",")}]`,
        );
      },
    ),
    { numRuns: 150 },
  );
});

test("QUERY_PARSE_RULES: 合法值採用；缺/非法 fallback；strings 過濾/去重/定序", () => {
  const cases: Array<
    [RawQuery, { mode: string; level: string; strings: string[] }]
  > = [
    [{}, { mode: "letter", level: "mixed", strings: [] }],
    [
      { mode: "position", level: "G" },
      { mode: "position", level: "G", strings: [] },
    ],
    [
      { mode: "junk", level: "junk" },
      { mode: "letter", level: "mixed", strings: [] },
    ],
    [{ mode: "position" }, { mode: "position", level: "mixed", strings: [] }],
    [
      { level: "custom", strings: "D,A" },
      { mode: "letter", level: "custom", strings: ["D", "A"] },
    ],
    // 修正紀錄（main agent, 2026-09-28）：原輸入 "B" 唔係琴弦（弦只得 G/D/A/E），
    // 與同檔 PBT 不變式（strings ⊆ G/D/A/E）自相矛盾；改 "E" 保留過濾＋去重＋弦序之意圖。
    [
      { level: "custom", strings: "a, D ,D,E,X" },
      { mode: "letter", level: "custom", strings: ["D", "E"] },
    ],
    [
      { level: "custom", strings: "X,Y" },
      { mode: "letter", level: "mixed", strings: [] },
    ],
    [
      { level: "custom", strings: "" },
      { mode: "letter", level: "mixed", strings: [] },
    ],
    [{ level: "custom" }, { mode: "letter", level: "mixed", strings: [] }],
    [
      { level: "G", strings: "D,A" },
      { mode: "letter", level: "G", strings: [] },
    ],
    [
      { mode: ["position", "letter"], level: ["A"] },
      { mode: "position", level: "A", strings: [] },
    ],
    [
      { level: "custom", strings: ["D", "A"] },
      { mode: "letter", level: "custom", strings: ["D", "A"] },
    ],
    // RA-2：strings 之輸入次序不得影響輸出——反序／亂序／重複一律回 STRING_ORDER 次序。
    [
      { level: "custom", strings: "E,D,G" },
      { mode: "letter", level: "custom", strings: ["G", "D", "E"] },
    ],
    [
      { level: "custom", strings: "E,D,E" },
      { mode: "letter", level: "custom", strings: ["D", "E"] },
    ],
    [
      { level: "custom", strings: ["E", "D"] },
      { mode: "letter", level: "custom", strings: ["D", "E"] },
    ],
  ];
  for (const [raw, expected] of cases) {
    assert.deepEqual(parsePlayQuery(raw), expected, JSON.stringify(raw));
  }

  // RA-3：敵意／邊界 query——真實參數名＋垃圾值、陣列、__proto__／constructor、缺 key、
  // 非字串型（數字／boolean／null）。確定性用例，保證 fallback 分支真正行到。
  const protoKeyQuery = Object.defineProperty({}, "__proto__", {
    value: "position",
    enumerable: true,
  }) as RawQuery;
  const hostile: Array<
    [unknown, { mode: string; level: string; strings: string[] }]
  > = [
    [
      {
        mode: "__proto__",
        level: "constructor",
        strings: "__proto__,constructor",
      },
      { mode: "letter", level: "mixed", strings: [] },
    ],
    [
      { level: "custom", strings: ["__proto__", "constructor"] },
      { mode: "letter", level: "mixed", strings: [] },
    ],
    [
      {
        mode: ["position", "letter"],
        level: ["custom"],
        strings: ["E", "D", "X"],
      },
      { mode: "position", level: "custom", strings: ["D", "E"] },
    ],
    [
      { mode: [], level: [], strings: [] },
      { mode: "letter", level: "mixed", strings: [] },
    ],
    [
      { mode: 42, level: true, strings: null },
      { mode: "letter", level: "mixed", strings: [] },
    ],
    [{ strings: "E,D" }, { mode: "letter", level: "mixed", strings: [] }],
    [
      { mode: "LETTER", level: "Mixed", strings: "G" },
      { mode: "letter", level: "mixed", strings: [] },
    ],
    [
      { level: "custom", strings: ["", " ", ",", "E5", "g"] },
      { mode: "letter", level: "mixed", strings: [] },
    ],
    [protoKeyQuery, { mode: "letter", level: "mixed", strings: [] }],
  ];
  for (const [raw, expected] of hostile) {
    assert.deepEqual(
      parsePlayQuery(raw as RawQuery),
      expected,
      `敵意 query ${JSON.stringify(raw)}`,
    );
  }

  // RA-3：生成器必須真正產生真實參數名（mode／level／strings）＋敵意值。舊版
  // fc.dictionary(fc.string(), …) 於量度中 20,000 次 mode／level／strings 鍵命中皆為 0
  // （sawModeKey=sawLevelKey=sawStringsKey=0），分支根本冇行過；此處以固定鍵全集生成，
  // 並統計實際命中，令生成器效力本身可被驗證。
  const refSingle = (v: unknown): string | undefined => {
    if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
    return typeof v === "string" ? v : undefined;
  };
  const refAcceptedStrings = (v: unknown): string[] => {
    const tokens =
      typeof v === "string"
        ? v.split(",")
        : Array.isArray(v)
          ? v.flatMap((x) => (typeof x === "string" ? x.split(",") : []))
          : [];
    const accepted = new Set(
      tokens
        .map((t) => t.trim())
        .filter((t) => (ORDER as readonly string[]).includes(t)),
    );
    return ORDER.filter((s) => accepted.has(s));
  };
  const HOSTILE_VALUES = [
    "",
    " ",
    ",",
    "E,,D",
    "E, D",
    "G,D",
    "D,A,E",
    "B",
    "g",
    "0",
    "__proto__",
    "constructor",
    "letter",
    "position",
    "LETTER",
    "custom",
    "mixed",
    "junk",
  ];
  const arbQueryValue = fc.oneof(
    fc.constantFrom(...HOSTILE_VALUES),
    fc.string(),
    fc.array(fc.string(), { maxLength: 4 }),
    fc.integer({ min: -2, max: 3 }),
    fc.constant(null),
    fc.constant(undefined),
  );
  const arbRawQuery = fc.dictionary(
    fc.constantFrom(
      "mode",
      "level",
      "strings",
      "__proto__",
      "constructor",
      "junk",
      "MODE",
    ),
    arbQueryValue,
    { minKeys: 1, maxKeys: 4 },
  ) as unknown as fc.Arbitrary<RawQuery>;

  let sawModeKey = 0;
  let sawLevelKey = 0;
  let sawStringsKey = 0;
  fc.assert(
    fc.property(arbRawQuery, (raw) => {
      if (Object.prototype.hasOwnProperty.call(raw, "mode")) sawModeKey += 1;
      if (Object.prototype.hasOwnProperty.call(raw, "level")) sawLevelKey += 1;
      if (Object.prototype.hasOwnProperty.call(raw, "strings"))
        sawStringsKey += 1;

      const cfg = parsePlayQuery(raw);
      // 不變式（域）：任意 query 下輸出必屬合法域
      assert.ok(
        cfg.mode === "letter" || cfg.mode === "position",
        `mode 合法：${cfg.mode}`,
      );
      assert.ok(
        ["G", "D", "A", "E", "mixed", "custom"].includes(cfg.level),
        `level 合法：${cfg.level}`,
      );
      for (const s of cfg.strings)
        assert.ok(
          (ORDER as readonly string[]).includes(s),
          `strings ⊆ G/D/A/E：${s}`,
        );
      assert.deepEqual(
        [...cfg.strings],
        ORDER.filter((s) => cfg.strings.includes(s)),
        "弦序＋無重複",
      );
      if (cfg.level === "custom")
        assert.ok(
          cfg.strings.length >= 1,
          "custom 必有有效弦（無有效弦 ⇒ mixed）",
        );
      else assert.equal(cfg.strings.length, 0, "非 custom 無 strings");

      // 忠實性（按規格重寫之 oracle）：合法值必被採用、其餘必 fallback；
      // strings 過濾／trim／去重／定序；custom 無有效弦 ⇒ mixed。
      const modeRaw = refSingle(raw.mode);
      assert.equal(
        cfg.mode,
        modeRaw === "letter" || modeRaw === "position" ? modeRaw : "letter",
        `mode=${JSON.stringify(raw.mode)}`,
      );
      const levelRaw = refSingle(raw.level);
      const wanted = refAcceptedStrings(raw.strings);
      const levelValid =
        levelRaw !== undefined &&
        ["G", "D", "A", "E", "mixed", "custom"].includes(levelRaw);
      const expectedLevel = levelValid
        ? levelRaw === "custom" && wanted.length === 0
          ? "mixed"
          : levelRaw
        : "mixed";
      assert.equal(
        cfg.level,
        expectedLevel,
        `level=${JSON.stringify(raw.level)}`,
      );
      assert.deepEqual(
        [...cfg.strings],
        cfg.level === "custom" ? wanted : [],
        `strings=${JSON.stringify(raw.strings)}`,
      );
    }),
    { numRuns: 300 },
  );
  // 生成器效力自證：三條真實鍵皆必須被生成（否證舊版之 0 命中）
  assert.ok(
    sawModeKey > 0 && sawLevelKey > 0 && sawStringsKey > 0,
    `生成器必須命中真實參數名（mode=${sawModeKey}, level=${sawLevelKey}, strings=${sawStringsKey}）`,
  );
});
