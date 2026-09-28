// 關卡定義與題池。
// ⚠️ STUB（紅線基準）：實作為空——由所屬 shard 實作後移除本標記。
import type { NoteId, StringName } from "./notes";

export type Mode = "letter" | "position";
export type LevelId = "G" | "D" | "A" | "E" | "mixed" | "custom";

export interface PlayConfig {
  mode: Mode;
  level: LevelId;
  strings: readonly StringName[];
}

export const LEVEL_IDS: readonly LevelId[] = ["G", "D", "A", "E", "mixed"];

export function poolFor(
  level: LevelId,
  strings: readonly StringName[] = [],
): readonly NoteId[] {
  void level;
  void strings;
  return [];
}
