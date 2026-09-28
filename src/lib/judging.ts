// 對錯判定（認音名／認位置）。
// ⚠️ STUB（紅線基準）：實作未開始——由所屬 shard 實作後移除本標記。
import type { Finger, NoteId, StringName } from "./notes";

export type Answer =
  | { kind: "letter"; letter: string }
  | { kind: "position"; string: StringName; finger: Finger };

export function isCorrect(noteId: NoteId, answer: Answer): boolean {
  void noteId;
  void answer;
  return false;
}
