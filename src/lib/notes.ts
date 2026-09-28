// 題庫：C 大調一把位，G/D/A/E 四弦 × 空弦(0)–4 指 ＝ 20 個按弦項目、17 個不同音高。
// ⚠️ STUB（紅線基準）：簽名為真、資料為空——由所屬 shard 實作後移除本標記。
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

export const NOTES: readonly NoteItem[] = [];

export const PITCH_IDS: readonly NoteId[] = [];

export function letterOf(noteId: NoteId): string {
  void noteId;
  return "";
}

export function staffStepOf(noteId: NoteId): number {
  void noteId;
  return Number.NaN;
}

export function midiOf(noteId: NoteId): number {
  void noteId;
  return Number.NaN;
}

export function placementsOf(noteId: NoteId): readonly Placement[] {
  void noteId;
  return [];
}

export function formatPlacement(placement: Placement): string {
  void placement;
  return "";
}

export function answerLine(noteId: NoteId): string {
  void noteId;
  return "";
}
