// A–G 七粒答案掣（認音名模式）。REQ-ui-1：letter-A…letter-G；≥48×48（D9 大按鈕）。
export interface LetterPadProps {
  disabled?: boolean;
  correctLetter?: string | null;
  onPick: (letter: string) => void;
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;

export function LetterPad({
  disabled = false,
  correctLetter = null,
  onPick,
}: LetterPadProps) {
  return (
    <div
      style={{
        display: "grid",
        // auto-fit：窄屏自動換行；每格最小 76px，恆 ≥48px。
        gridTemplateColumns: "repeat(auto-fit, minmax(76px, 1fr))",
        gap: 12,
        width: "100%",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      {LETTERS.map((letter) => {
        const isCorrect = correctLetter === letter;
        return (
          <button
            key={letter}
            type="button"
            data-testid={`letter-${letter}`}
            data-state={isCorrect ? "correct" : undefined}
            aria-label={`音名 ${letter}`}
            disabled={disabled}
            onClick={() => onPick(letter)}
            style={{
              minHeight: 76,
              minWidth: 48,
              borderRadius: 18,
              border: isCorrect ? "4px solid #15803d" : "3px solid #d9c3a5",
              background: isCorrect ? "#dcfce7" : "#ffffff",
              color: isCorrect ? "#15803d" : "#1f2937",
              fontSize: "clamp(30px, 5vw, 44px)",
              fontWeight: 800,
              lineHeight: 1,
              cursor: disabled ? "default" : "pointer",
              opacity: disabled && !isCorrect ? 0.6 : 1,
              boxShadow: "0 2px 0 rgba(0,0,0,0.08)",
              touchAction: "manipulation",
              userSelect: "none",
            }}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}
