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
    [
      { level: "custom", strings: "a, D ,D,B,X" },
      { mode: "letter", level: "custom", strings: ["D", "B"] },
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
  ];
  for (const [raw, expected] of cases) {
    assert.deepEqual(parsePlayQuery(raw), expected, JSON.stringify(raw));
  }
  fc.assert(
    fc.property(
      fc.dictionary(
        fc.string(),
        fc.oneof(fc.string(), fc.array(fc.string(), { maxLength: 4 })),
        {
          maxKeys: 6,
        },
      ),
      (raw) => {
        const cfg = parsePlayQuery(raw as RawQuery);
        assert.ok(cfg.mode === "letter" || cfg.mode === "position");
        assert.ok(["G", "D", "A", "E", "mixed", "custom"].includes(cfg.level));
        for (const s of cfg.strings)
          assert.ok((ORDER as readonly string[]).includes(s));
        assert.deepEqual(
          [...cfg.strings],
          ORDER.filter((s) => cfg.strings.includes(s)),
          "弦序＋無重複",
        );
        if (cfg.level === "custom")
          assert.ok(cfg.strings.length >= 1, "custom 必有有效弦");
      },
    ),
    { numRuns: 200 },
  );
});
