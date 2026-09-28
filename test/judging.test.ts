// REQ-judge-1 / REQ-judge-2：對錯判定（認音名／認位置）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { isCorrect } from "../src/lib/judging";
import type { Finger, NoteId, StringName } from "../src/lib/notes";

const NOTES_TABLE: Record<
  NoteId,
  { letter: string; placements: Array<[StringName, Finger]> }
> = {
  G3: { letter: "G", placements: [["G", 0]] },
  A3: { letter: "A", placements: [["G", 1]] },
  B3: { letter: "B", placements: [["G", 2]] },
  C4: { letter: "C", placements: [["G", 3]] },
  D4: {
    letter: "D",
    placements: [
      ["D", 0],
      ["G", 4],
    ],
  },
  E4: { letter: "E", placements: [["D", 1]] },
  F4: { letter: "F", placements: [["D", 2]] },
  G4: { letter: "G", placements: [["D", 3]] },
  A4: {
    letter: "A",
    placements: [
      ["A", 0],
      ["D", 4],
    ],
  },
  B4: { letter: "B", placements: [["A", 1]] },
  C5: { letter: "C", placements: [["A", 2]] },
  D5: { letter: "D", placements: [["A", 3]] },
  E5: {
    letter: "E",
    placements: [
      ["E", 0],
      ["A", 4],
    ],
  },
  F5: { letter: "F", placements: [["E", 1]] },
  G5: { letter: "G", placements: [["E", 2]] },
  A5: { letter: "A", placements: [["E", 3]] },
  B5: { letter: "B", placements: [["E", 4]] },
};

const ALL_NOTES = Object.keys(NOTES_TABLE) as NoteId[];
const ALL_CELLS: Array<[StringName, Finger]> = (
  ["G", "D", "A", "E"] as StringName[]
).flatMap((s) =>
  ([0, 1, 2, 3, 4] as Finger[]).map((f) => [s, f] as [StringName, Finger]),
);

test("LETTER_JUDGE: 正確字母接受、其餘（含小寫、空字串）拒絕；八度無關", () => {
  const candidates = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "a",
    "b",
    "",
    "X",
    "Z",
    "do",
  ];
  for (const note of ALL_NOTES) {
    for (const cand of candidates) {
      assert.equal(
        isCorrect(note, { kind: "letter", letter: cand }),
        cand === NOTES_TABLE[note].letter,
        `${note} vs ${JSON.stringify(cand)}`,
      );
    }
  }
  for (const n of ["A3", "A4", "A5"] as NoteId[]) {
    assert.equal(
      isCorrect(n, { kind: "letter", letter: "A" }),
      true,
      `${n} 之音名為 A`,
    );
  }
  fc.assert(
    fc.property(fc.constantFrom(...ALL_NOTES), fc.string(), (note, s) => {
      assert.equal(
        isCorrect(note, { kind: "letter", letter: s }),
        s === NOTES_TABLE[note].letter,
      );
    }),
    { numRuns: 200 },
  );
});

test("POSITION_JUDGE: ∈placementsOf 接受（D4/A4/E5 兩奏法都對）；20 格中其餘拒絕", () => {
  for (const note of ALL_NOTES) {
    for (const cell of ALL_CELLS) {
      const [s, f] = cell;
      const expected = NOTES_TABLE[note].placements.some(
        ([ps, pf]) => ps === s && pf === f,
      );
      assert.equal(
        isCorrect(note, { kind: "position", string: s, finger: f }),
        expected,
        `${note} vs ${s}弦${f}指`,
      );
    }
  }
  // 雙奏法明示
  assert.equal(
    isCorrect("D4", { kind: "position", string: "D", finger: 0 }),
    true,
  );
  assert.equal(
    isCorrect("D4", { kind: "position", string: "G", finger: 4 }),
    true,
  );
  assert.equal(
    isCorrect("A4", { kind: "position", string: "A", finger: 0 }),
    true,
  );
  assert.equal(
    isCorrect("A4", { kind: "position", string: "D", finger: 4 }),
    true,
  );
  assert.equal(
    isCorrect("E5", { kind: "position", string: "E", finger: 0 }),
    true,
  );
  assert.equal(
    isCorrect("E5", { kind: "position", string: "A", finger: 4 }),
    true,
  );
});
