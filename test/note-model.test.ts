// REQ-model-1 / REQ-staff-1 / REQ-model-2：題庫、譜面座標、奏法對照、顯示格式。
// 對照表＝規格（.plan/28-09-2026/violin-note-game/PRD.md）；本檔以獨立硬編表作 oracle。
import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { NoteId, StringName } from "../src/lib/notes";
import {
  NOTES,
  PITCH_IDS,
  answerLine,
  formatPlacement,
  letterOf,
  midiOf,
  placementsOf,
  staffStepOf,
} from "../src/lib/notes";

interface Row {
  string: StringName;
  finger: 0 | 1 | 2 | 3 | 4;
  note: NoteId;
  step: number;
  midi: number;
}

// G: G3 A3 B3 C4 D4｜D: D4 E4 F4 G4 A4｜A: A4 B4 C5 D5 E5｜E: E5 F5 G5 A5 B5
const TABLE: readonly Row[] = [
  { string: "G", finger: 0, note: "G3", step: -5, midi: 55 },
  { string: "G", finger: 1, note: "A3", step: -4, midi: 57 },
  { string: "G", finger: 2, note: "B3", step: -3, midi: 59 },
  { string: "G", finger: 3, note: "C4", step: -2, midi: 60 },
  { string: "G", finger: 4, note: "D4", step: -1, midi: 62 },
  { string: "D", finger: 0, note: "D4", step: -1, midi: 62 },
  { string: "D", finger: 1, note: "E4", step: 0, midi: 64 },
  { string: "D", finger: 2, note: "F4", step: 1, midi: 65 },
  { string: "D", finger: 3, note: "G4", step: 2, midi: 67 },
  { string: "D", finger: 4, note: "A4", step: 3, midi: 69 },
  { string: "A", finger: 0, note: "A4", step: 3, midi: 69 },
  { string: "A", finger: 1, note: "B4", step: 4, midi: 71 },
  { string: "A", finger: 2, note: "C5", step: 5, midi: 72 },
  { string: "A", finger: 3, note: "D5", step: 6, midi: 74 },
  { string: "A", finger: 4, note: "E5", step: 7, midi: 76 },
  { string: "E", finger: 0, note: "E5", step: 7, midi: 76 },
  { string: "E", finger: 1, note: "F5", step: 8, midi: 77 },
  { string: "E", finger: 2, note: "G5", step: 9, midi: 79 },
  { string: "E", finger: 3, note: "A5", step: 10, midi: 81 },
  { string: "E", finger: 4, note: "B5", step: 11, midi: 83 },
];

const UNIQUE_PITCHES: readonly NoteId[] = [
  ...new Set(TABLE.map((r) => r.note)),
];

// 奏法表（空弦先行；D4/A4/E5 各有兩奏法）
const PLACEMENTS_EXPECTED: Record<NoteId, Array<[StringName, number]>> = {
  G3: [["G", 0]],
  A3: [["G", 1]],
  B3: [["G", 2]],
  C4: [["G", 3]],
  D4: [
    ["D", 0],
    ["G", 4],
  ],
  E4: [["D", 1]],
  F4: [["D", 2]],
  G4: [["D", 3]],
  A4: [
    ["A", 0],
    ["D", 4],
  ],
  B4: [["A", 1]],
  C5: [["A", 2]],
  D5: [["A", 3]],
  E5: [
    ["E", 0],
    ["A", 4],
  ],
  F5: [["E", 1]],
  G5: [["E", 2]],
  A5: [["E", 3]],
  B5: [["E", 4]],
};

const placementText = ([s, f]: [StringName, number]) =>
  f === 0 ? `${s}空弦` : `${s}弦${f}指`;

test("NOTE_CATALOG_EXACT: NOTES 恰 20 項、PITCH_IDS 恰 17 個，音高對照與規格一致", () => {
  assert.equal(NOTES.length, 20);
  for (const row of TABLE) {
    const found = NOTES.find(
      (n) => n.string === row.string && n.finger === row.finger,
    );
    assert.ok(found, `${row.string}弦${row.finger}指 必須存在`);
    assert.equal(found.noteId, row.note, `${row.string}弦${row.finger}指 音高`);
  }
  assert.equal(
    new Set(NOTES.map((n) => `${n.string}-${n.finger}`)).size,
    20,
    "20 項無重複格",
  );
  assert.equal(PITCH_IDS.length, 17);
  assert.deepEqual(
    [...PITCH_IDS],
    [...UNIQUE_PITCHES],
    "PITCH_IDS＝17 個不同音高（升序）",
  );
});

test("STAFF_COORDINATE_EXACT: 每個音之 staffStepOf／midiOf 與規格表一致", () => {
  for (const row of TABLE) {
    assert.equal(staffStepOf(row.note), row.step, `${row.note} 譜面 step`);
    assert.equal(midiOf(row.note), row.midi, `${row.note} MIDI`);
  }
});

test("LETTER_NAMING_AGNOSTIC: 音名字母唯一且跨八度相同（A3/A4/A5 → A）", () => {
  for (const row of TABLE) {
    assert.equal(letterOf(row.note), row.note[0], row.note);
  }
  for (const group of [
    ["A3", "A4", "A5"],
    ["E4", "E5"],
    ["G3", "G4", "G5"],
    ["B3", "B4", "B5"],
  ]) {
    const letters = new Set(group.map((n) => letterOf(n as NoteId)));
    assert.equal(letters.size, 1, group.join(","));
  }
});

test("PLACEMENTS_EXACT: 每音 ≥1 個合法奏法；D4/A4/E5 恰 2（空弦先行），其餘恰 1", () => {
  for (const [note, places] of Object.entries(PLACEMENTS_EXPECTED) as Array<
    [NoteId, Array<[StringName, number]>]
  >) {
    const got = placementsOf(note).map(
      (p) => [p.string, p.finger] as [StringName, number],
    );
    assert.deepEqual(got, places, note);
  }
  fc.assert(
    fc.property(fc.constantFrom(...UNIQUE_PITCHES), (note) => {
      const places = placementsOf(note);
      assert.ok(places.length >= 1, note);
      for (const p of places) {
        assert.ok(
          ["G", "D", "A", "E"].includes(p.string),
          `${note} ${p.string}`,
        );
        assert.ok(p.finger >= 0 && p.finger <= 4, `${note} finger ${p.finger}`);
      }
      const dual = note === "D4" || note === "A4" || note === "E5";
      assert.equal(places.length, dual ? 2 : 1, note);
      if (dual) assert.equal(places[0].finger, 0, `${note} 空弦先行`);
    }),
    { numRuns: 60 },
  );
});

test("ANSWER_LINE_FORMAT: answerLine＝「<字母> ＝ <奏法 或 …>」；formatPlacement(0指)＝「<弦>空弦」", () => {
  for (const [note, places] of Object.entries(PLACEMENTS_EXPECTED) as Array<
    [NoteId, Array<[StringName, number]>]
  >) {
    const expected = `${note[0]} ＝ ${places.map(placementText).join(" 或 ")}`;
    assert.equal(answerLine(note), expected, note);
  }
  assert.equal(formatPlacement({ string: "D", finger: 0 }), "D空弦");
  assert.equal(formatPlacement({ string: "G", finger: 4 }), "G弦4指");
});
