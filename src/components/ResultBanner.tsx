// 作答回饋 banner：正解文字＋（答錯時）繼續掣。
// ⚠️ STUB（紅線基準）：只有簽名——由所屬 shard 實作後移除本標記。
export interface ResultBannerProps {
  state: "correct" | "wrong";
  answerLine: string;
  onContinue: () => void;
}

export function ResultBanner(props: ResultBannerProps) {
  void props;
  return <div />;
}
