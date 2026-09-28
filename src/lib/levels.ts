// 關卡定義與題池。
// 規格：.plan/28-09-2026/violin-note-game/PRD.md REQ-levels-1（D8 關卡）。
import { NOTES, type NoteId, type StringName } from "./notes";

export type Mode = "letter" | "position";
export type LevelId = "G" | "D" | "A" | "E" | "mixed" | "custom";

export interface PlayConfig {
  mode: Mode;
  level: LevelId;
  strings: readonly StringName[];
}

/** 固定弦序：題池、URL `strings` 一律以此排序（G→D→A→E）。 */
export const STRING_ORDER: readonly StringName[] = ["G", "D", "A", "E"];

/**
 * 單弦 0–4 指音高（空弦先行）＝由 notes.ts 題庫（NOTES）衍生，非獨立副本；
 * 單一真相＝notes.ts（REQ-model-1），改音高只須改該檔。
 */
function pitchesOfString(string: StringName): readonly NoteId[] {
  return NOTES.filter((item) => item.string === string)
    .sort((a, b) => a.finger - b.finger)
    .map((item) => item.noteId);
}

/** 各弦 0–4 指音高（空弦先行）＝notes.ts 衍生表（G: G3…D4｜D: D4…A4｜A: A4…E5｜E: E5…B5）。 */
export const STRING_NOTES: Record<StringName, readonly NoteId[]> = {
  G: pitchesOfString("G"),
  D: pitchesOfString("D"),
  A: pitchesOfString("A"),
  E: pitchesOfString("E"),
};

/** 開始頁之預設關卡掣（custom 由自選 checkbox 表達，不在此列）。 */
export const LEVEL_IDS: readonly LevelId[] = ["G", "D", "A", "E", "mixed"];

/** URL `level` 可接受之全部值。 */
export const VALID_LEVELS: readonly LevelId[] = [...LEVEL_IDS, "custom"];

/** 混合關＝四弦聯集，固定弦序、去重（17 音）。 */
export const MIXED_POOL: readonly NoteId[] = [
  ...new Set(STRING_ORDER.flatMap((s) => [...STRING_NOTES[s]])),
];

/** 輸入弦→題池：只保留合法弦、固定弦序、去重。 */
function notesOf(strings: readonly StringName[]): readonly NoteId[] {
  const picked = STRING_ORDER.filter((s) => strings.includes(s));
  return [...new Set(picked.flatMap((s) => [...STRING_NOTES[s]]))];
}

/** REQ-levels-1：單弦關＝該弦 5 音；mixed＝17 音；custom＝所選弦聯集（固定弦序、去重）。 */
export function poolFor(
  level: LevelId,
  strings: readonly StringName[] = [],
): readonly NoteId[] {
  if (level === "mixed") return MIXED_POOL;
  if (level === "custom") return notesOf(strings);
  return STRING_NOTES[level];
}
