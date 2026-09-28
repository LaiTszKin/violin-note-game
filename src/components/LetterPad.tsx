// A–G 七粒答案掣（認音名模式）。
// ⚠️ STUB（紅線基準）：只有簽名——由所屬 shard 實作後移除本標記。
export interface LetterPadProps {
  disabled?: boolean;
  correctLetter?: string | null;
  onPick: (letter: string) => void;
}

export function LetterPad(props: LetterPadProps) {
  void props;
  return <div />;
}
