// 五線譜（高音譜號）音符繪製元件。REQ-ui-1（staff[data-note]）＋REQ-staff-1 座標。
// 幾何：notes.staffStepOf（E4＝底線＝0；線＝偶數、間＝奇數；每級＝線距一半）；
// 音高超出五線（G3–D4、A5–B5）時依級數補加線。純 SVG，不倚賴音樂字型。
import { staffStepOf, type NoteId } from "@/lib/notes";

export interface StaffProps {
  noteId: NoteId;
}

// ── 譜面幾何（SVG 使用者座標；viewBox 460 × 260）────────────────────
const GAP = 26; // 相鄰線距
const STEP = GAP / 2; // 一級（半格）＝13
const TOP_LINE_Y = 68; // 最高線 F5（step 8）
const BOTTOM_LINE_Y = TOP_LINE_Y + 4 * GAP; // 最低線 E4（step 0）＝172
const LINE_X0 = 16;
const LINE_X1 = 444;
const NOTE_X = 288; // 符頭中心
const LEDGER_HALF = 36;
const HEAD_RX = 13; // 符頭半軸（大而清晰）
const HEAD_RY = 9.6;
const STEM_LEN = 46;
const INK = "#1f2937";

/** 級數 → y（級數升＝音高升＝y 細）。 */
function yOfStep(step: number): number {
  return BOTTOM_LINE_Y - step * STEP;
}

/** 加線位置（級數）：只畫五線範圍外、且由外向內去到音符所在級之偶數級。 */
function ledgerSteps(step: number): number[] {
  const steps: number[] = [];
  if (step < 0) {
    for (let k = -2; k >= step; k -= 2) steps.push(k);
  } else if (step > 8) {
    for (let k = 10; k <= step; k += 2) steps.push(k);
  }
  return steps;
}

export function Staff({ noteId }: StaffProps) {
  const step = staffStepOf(noteId);
  const y = yOfStep(step);
  const stemUp = step < 4; // 中間線（B4）以下符桿向上，其餘向下
  const stemX = stemUp ? NOTE_X + HEAD_RX - 2 : NOTE_X - HEAD_RX + 2;
  const stemEndY = stemUp ? y - STEM_LEN : y + STEM_LEN;

  return (
    <svg
      data-testid="staff"
      data-note={noteId}
      viewBox="0 0 460 260"
      role="img"
      aria-label={`五線譜音符 ${noteId}`}
      style={{
        display: "block",
        width: "100%",
        maxWidth: 560,
        height: "auto",
        margin: "0 auto",
      }}
    >
      {/* 五線 */}
      {[0, 1, 2, 3, 4].map((i) => {
        const lineY = TOP_LINE_Y + i * GAP;
        return (
          <line
            key={`line-${i}`}
            x1={LINE_X0}
            x2={LINE_X1}
            y1={lineY}
            y2={lineY}
            stroke={INK}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        );
      })}

      {/* 高音譜號（G 譜號）：主幹（上鉤→直落）＋繞 G4 線之眼＋五線下小球 */}
      <path
        d="M 96 62 C 96 98 94 132 94 194"
        fill="none"
        stroke={INK}
        strokeWidth={13}
        strokeLinecap="round"
      />
      <path
        d="M 96 62 C 94 34 64 26 52 46 C 42 62 50 80 68 86"
        fill="none"
        stroke={INK}
        strokeWidth={13}
        strokeLinecap="round"
      />
      {/* 眼：繞 G4 線（y=146）一圈，兩端穿過主幹右側 */}
      <path
        d="M 102 122 C 70 108 44 126 48 148 C 52 170 76 180 96 172 C 104 168 106 160 102 154"
        fill="none"
        stroke={INK}
        strokeWidth={14}
        strokeLinecap="round"
      />
      <circle cx={94} cy={205} r={8.5} fill={INK} />

      {/* 加線 */}
      {ledgerSteps(step).map((k) => {
        const ledgerY = yOfStep(k);
        return (
          <line
            key={`ledger-${k}`}
            x1={NOTE_X - LEDGER_HALF}
            x2={NOTE_X + LEDGER_HALF}
            y1={ledgerY}
            y2={ledgerY}
            stroke={INK}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        );
      })}

      {/* 符桿（先畫，符頭覆蓋接合位） */}
      <line
        x1={stemX}
        x2={stemX}
        y1={y}
        y2={stemEndY}
        stroke={INK}
        strokeWidth={3.4}
        strokeLinecap="round"
      />

      {/* 符頭（微斜之實心橢圓） */}
      <ellipse
        cx={NOTE_X}
        cy={y}
        rx={HEAD_RX}
        ry={HEAD_RY}
        fill={INK}
        transform={`rotate(-18 ${NOTE_X} ${y})`}
      />
    </svg>
  );
}
