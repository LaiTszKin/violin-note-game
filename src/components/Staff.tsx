// 五線譜（高音譜號）音符繪製元件。
// ⚠️ STUB（紅線基準）：只有簽名——由所屬 shard 實作後移除本標記。
import type { NoteId } from "@/lib/notes";

export interface StaffProps {
  noteId: NoteId;
}

export function Staff({ noteId }: StaffProps) {
  void noteId;
  return <svg data-testid="staff" />;
}
