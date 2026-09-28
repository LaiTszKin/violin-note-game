// 對錯判定（認音名／認位置）。
// 命題：LETTER_JUDGE（REQ-judge-1）、POSITION_JUDGE（REQ-judge-2）。
// 判定以 notes.ts 為單一真相：音名比 letterOf、位置比 placementsOf。
import { letterOf, placementsOf } from "./notes";
import type { Finger, NoteId, StringName } from "./notes";

export type Answer =
  | { kind: "letter"; letter: string }
  | { kind: "position"; string: StringName; finger: Finger };

export function isCorrect(noteId: NoteId, answer: Answer): boolean {
  switch (answer.kind) {
    case "letter":
      // 只接受單一字母、大小寫敏感；與八度無關（A3／A4／A5 均答 "A"）。
      return answer.letter === letterOf(noteId);
    case "position":
      // D4／A4／E5 之兩個奏法皆 ∈ placementsOf，故兩者一律接受。
      return placementsOf(noteId).some(
        (p) => p.string === answer.string && p.finger === answer.finger,
      );
  }
}
