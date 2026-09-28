// 虛擬指板：4 弦 × 空弦–4 指 ＝ 20 格（認位置模式）。
// ⚠️ STUB（紅線基準）：只有簽名——由所屬 shard 實作後移除本標記。
import type { Finger, Placement, StringName } from "@/lib/notes";

export interface FingerboardProps {
  disabled?: boolean;
  correctCells?: readonly Placement[] | null;
  onPick: (string: StringName, finger: Finger) => void;
}

export function Fingerboard(props: FingerboardProps) {
  void props;
  return <div />;
}
