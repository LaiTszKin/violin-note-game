// 題庫：C 大調一把位，G/D/A/E 四弦 × 空弦(0)–4 指 ＝ 20 個按弦項目、17 個不同音高。
// 本檔同時是 REQ-model-1（題庫對照）、REQ-staff-1（五線譜座標／MIDI）、
// REQ-model-2（奏法與顯示格式）之資料來源；下方三張表即 PRD 規格表。
export type StringName = "G" | "D" | "A" | "E";
export type Finger = 0 | 1 | 2 | 3 | 4;
export type NoteId =
  | "G3"
  | "A3"
  | "B3"
  | "C4"
  | "D4"
  | "E4"
  | "F4"
  | "G4"
  | "A4"
  | "B4"
  | "C5"
  | "D5"
  | "E5"
  | "F5"
  | "G5"
  | "A5"
  | "B5";

export interface Placement {
  string: StringName;
  finger: Finger;
}

export interface NoteItem {
  string: StringName;
  finger: Finger;
  noteId: NoteId;
}

/** 弦序（低音至最高音）：G、D、A、E。 */
const STRING_ORDER: readonly StringName[] = ["G", "D", "A", "E"];

/** 每弦空弦(0)–4 指之音高；REQ-model-1 對照表。 */
const PITCHES_BY_STRING: Record<StringName, readonly NoteId[]> = {
  G: ["G3", "A3", "B3", "C4", "D4"],
  D: ["D4", "E4", "F4", "G4", "A4"],
  A: ["A4", "B4", "C5", "D5", "E5"],
  E: ["E5", "F5", "G5", "A5", "B5"],
};

/** 譜面座標：E4（底線）＝0，每高一級 +1（線＝偶數、間＝奇數）；對照＝REQ-staff-1。 */
const STAFF_STEP: Record<NoteId, number> = {
  G3: -5,
  A3: -4,
  B3: -3,
  C4: -2,
  D4: -1,
  E4: 0,
  F4: 1,
  G4: 2,
  A4: 3,
  B4: 4,
  C5: 5,
  D5: 6,
  E5: 7,
  F5: 8,
  G5: 9,
  A5: 10,
  B5: 11,
};

/** 標準 MIDI 音號（C4＝60、A4＝69）；對照＝REQ-staff-1。 */
const MIDI: Record<NoteId, number> = {
  G3: 55,
  A3: 57,
  B3: 59,
  C4: 60,
  D4: 62,
  E4: 64,
  F4: 65,
  G4: 67,
  A4: 69,
  B4: 71,
  C5: 72,
  D5: 74,
  E5: 76,
  F5: 77,
  G5: 79,
  A5: 81,
  B5: 83,
};

function buildCatalog(): NoteItem[] {
  const items: NoteItem[] = [];
  for (const string of STRING_ORDER) {
    PITCHES_BY_STRING[string].forEach((noteId, finger) => {
      items.push({ string, finger: finger as Finger, noteId });
    });
  }
  return items;
}

/** 20 個按弦項目：弦序（G→D→A→E）× 指序（0→4）。 */
export const NOTES: readonly NoteItem[] = buildCatalog();

function distinctPitchesAscending(): NoteId[] {
  const seen = new Set<NoteId>();
  const ids: NoteId[] = [];
  for (const item of NOTES) {
    if (seen.has(item.noteId)) continue;
    seen.add(item.noteId);
    ids.push(item.noteId);
  }
  return ids.sort((a, b) => MIDI[a] - MIDI[b]);
}

/** 17 個不同音高，去重、升序（G3…B5）。 */
export const PITCH_IDS: readonly NoteId[] = distinctPitchesAscending();

/** 音名＝字母、不分八度（A3/A4/A5 → "A"）；REQ-model-1。 */
export function letterOf(noteId: NoteId): string {
  return noteId.slice(0, 1);
}

/** 譜面座標（E4＝0，級距 ±1）；REQ-staff-1。 */
export function staffStepOf(noteId: NoteId): number {
  return STAFF_STEP[noteId];
}

/** 標準 MIDI 音號；REQ-staff-1。 */
export function midiOf(noteId: NoteId): number {
  return MIDI[noteId];
}

/**
 * 該音全部奏法；≥1 個，D4／A4／E5 恰 2 個（空弦先行＝finger 升序）；REQ-model-2。
 */
export function placementsOf(noteId: NoteId): readonly Placement[] {
  return NOTES.filter((item) => item.noteId === noteId)
    .map((item) => ({ string: item.string, finger: item.finger }))
    .sort((a, b) => a.finger - b.finger);
}

/** 奏法顯示：finger 0 →「<弦>空弦」，否則「<弦>弦<n>指」；REQ-model-2。 */
export function formatPlacement(placement: Placement): string {
  return placement.finger === 0
    ? `${placement.string}空弦`
    : `${placement.string}弦${placement.finger}指`;
}

/** 答案行＝「<字母> ＝ <奏法 或 …>」，如 `D ＝ D空弦 或 G弦4指`；REQ-model-2。 */
export function answerLine(noteId: NoteId): string {
  const places = placementsOf(noteId).map(formatPlacement).join(" 或 ");
  return `${letterOf(noteId)} ＝ ${places}`;
}
