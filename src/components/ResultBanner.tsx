// 作答回饋 banner：正解文字＋（答錯時）繼續掣。REQ-ui-1。
// 兩態都顯示 answer-line；答對由呼叫方約 900ms 後自動收起，答錯等用家撳「繼續」。
import type { CSSProperties } from "react";

export interface ResultBannerProps {
  state: "correct" | "wrong";
  answerLine: string;
  onContinue: () => void;
}

export function ResultBanner({
  state,
  answerLine,
  onContinue,
}: ResultBannerProps) {
  const correct = state === "correct";
  const card: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    width: "100%",
    maxWidth: 620,
    margin: "0 auto",
    padding: "14px 18px",
    boxSizing: "border-box",
    borderRadius: 20,
    border: correct ? "3px solid #15803d" : "3px solid #b45309",
    background: correct ? "#f0fdf4" : "#fffbeb",
  };

  return (
    <div
      data-testid="feedback"
      data-state={state}
      role="status"
      aria-live="polite"
      style={card}
    >
      <p
        style={{
          margin: 0,
          fontSize: "clamp(22px, 3.4vw, 30px)",
          fontWeight: 800,
          color: correct ? "#15803d" : "#b45309",
        }}
      >
        {correct ? "答對喇！" : "差少少，記住呢個音："}
      </p>
      <p
        data-testid="answer-line"
        style={{
          margin: 0,
          fontSize: "clamp(20px, 3vw, 26px)",
          fontWeight: 700,
          color: "#1f2937",
          textAlign: "center",
        }}
      >
        {answerLine}
      </p>
      {correct ? null : (
        <button
          type="button"
          data-testid="continue"
          onClick={onContinue}
          style={{
            minHeight: 56,
            minWidth: 160,
            padding: "10px 26px",
            borderRadius: 16,
            border: "none",
            background: "#b45309",
            color: "#ffffff",
            fontSize: 22,
            fontWeight: 800,
            cursor: "pointer",
            touchAction: "manipulation",
            userSelect: "none",
          }}
        >
          繼續
        </button>
      )}
    </div>
  );
}
