// 虛擬指板：4 弦 × 空弦–4 指 ＝ 20 格（認位置模式）。
// 契約（e2e/position-mode.spec.ts）：格＝`cell-<弦>-<指>`（空弦＝0）；答錯時正解格標示
// data-state="correct"（disabled 期間仍見）；作答後至下一題前 disabled。
// 版面：每格 ≥48×48、容器不超闊（REQ-ui-2 無水平滾動）；弦序行＝G/D/A/E（REQ-levels-1）。
// 屬於 GameScreen（"use client"）之客戶端模組圖，故本身毋須再標 "use client"。
import { Fragment } from "react";
import type { CSSProperties } from "react";

import { STRING_ORDER } from "@/lib/levels";
import type { Finger, Placement, StringName } from "@/lib/notes";

export interface FingerboardProps {
  disabled?: boolean;
  correctCells?: readonly Placement[] | null;
  onPick: (string: StringName, finger: Finger) => void;
}

/** 指欄（空弦＋1–4 指）；字面與 formatPlacement／answerLine 用語一致。 */
const FINGERS: readonly Finger[] = [0, 1, 2, 3, 4];

function labelOf(finger: Finger): string {
  return finger === 0 ? "空弦" : `${finger}指`;
}

const BOARD: CSSProperties = {
  display: "grid",
  // 每行＝弦名標籤＋五格；格最小 48px，其餘平分剩餘闊度。
  gridTemplateColumns: "auto repeat(5, minmax(48px, 1fr))",
  gap: "10px 8px",
  width: "100%",
  maxWidth: 720,
  margin: "0 auto",
  padding: "12px 10px",
  boxSizing: "border-box",
  borderRadius: 22,
  border: "3px solid #e0cdb4",
  background: "#ffffff",
};

const STRING_LABEL: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 40,
  fontSize: "clamp(16px, 2.6vw, 22px)",
  fontWeight: 800,
  color: "#7c5e3c",
  userSelect: "none",
};

function cellStyle(isCorrect: boolean, disabled: boolean): CSSProperties {
  return {
    minWidth: 48,
    minHeight: 64,
    padding: "6px 4px",
    boxSizing: "border-box",
    borderRadius: 14,
    border: isCorrect ? "4px solid #15803d" : "3px solid #d9c3a5",
    background: isCorrect ? "#dcfce7" : "#ffffff",
    color: isCorrect ? "#15803d" : "#1f2937",
    fontSize: "clamp(17px, 3vw, 26px)",
    fontWeight: 800,
    lineHeight: 1.1,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled && !isCorrect ? 0.6 : 1,
    boxShadow: "0 2px 0 rgba(0,0,0,0.08)",
    touchAction: "manipulation",
    userSelect: "none",
  };
}

export function Fingerboard({
  disabled = false,
  correctCells = null,
  onPick,
}: FingerboardProps) {
  return (
    <div role="group" aria-label="指板：揀出呢個音喺邊度按" style={BOARD}>
      {STRING_ORDER.map((stringName) => (
        <Fragment key={stringName}>
          <div style={STRING_LABEL}>{`${stringName}弦`}</div>
          {FINGERS.map((finger) => {
            const isCorrect =
              correctCells?.some(
                (cell) => cell.string === stringName && cell.finger === finger,
              ) ?? false;
            return (
              <button
                key={`${stringName}-${finger}`}
                type="button"
                data-testid={`cell-${stringName}-${finger}`}
                data-state={isCorrect ? "correct" : undefined}
                aria-label={`${stringName}弦 ${labelOf(finger)}`}
                disabled={disabled}
                onClick={() => onPick(stringName, finger)}
                style={cellStyle(isCorrect, disabled)}
              >
                {labelOf(finger)}
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
