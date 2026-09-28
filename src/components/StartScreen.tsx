"use client";

// 開始頁：模式切換＋關卡選擇＋自選弦。
// 規格：.plan/28-09-2026/violin-note-game/PRD.md REQ-ui-1（D8 關卡、D9 介面）。
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LEVEL_IDS, STRING_ORDER, type LevelId, type Mode } from "@/lib/levels";
import type { StringName } from "@/lib/notes";

const MODE_OPTIONS: readonly { id: Mode; label: string; hint: string }[] = [
  { id: "letter", label: "認音名", hint: "睇譜揀字母 A–G" },
  { id: "position", label: "認位置", hint: "揀弦同手指位" },
];

const LEVEL_LABELS: Record<string, string> = {
  G: "G 弦",
  D: "D 弦",
  A: "A 弦",
  E: "E 弦",
  mixed: "混合關",
};

const LEVEL_HINTS: Record<string, string> = {
  mixed: "全部 17 個音",
  default: "5 個音",
};

export function StartScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("letter");
  const [picked, setPicked] = useState<readonly StringName[]>([]);

  // 固定弦序 G,D,A,E——與 URL strings 參數一致（非點選次序）。
  const customStrings = STRING_ORDER.filter((s) => picked.includes(s));

  function toggleString(s: StringName, checked: boolean) {
    setPicked((prev) => (checked ? [...prev, s] : prev.filter((x) => x !== s)));
  }

  function startLevel(level: LevelId) {
    router.push(`/play?mode=${mode}&level=${level}`);
  }

  function startCustom() {
    if (customStrings.length === 0) return;
    router.push(
      `/play?mode=${mode}&level=custom&strings=${customStrings.join(",")}`,
    );
  }

  return (
    <main className="start-screen" data-testid="start-screen">
      <header className="start-screen__header">
        <p className="start-screen__mascot" aria-hidden="true">
          🎻
        </p>
        <h1 className="start-screen__title">認譜小遊戲</h1>
        <p className="start-screen__subtitle">睇五線譜，揀出正確答案！</p>
      </header>

      <section className="panel" aria-labelledby="mode-heading">
        <h2 className="panel__title" id="mode-heading">
          1. 揀玩法
        </h2>
        <div className="panel__row">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="mode-btn"
              data-testid={`mode-${option.id}`}
              aria-pressed={mode === option.id}
              onClick={() => setMode(option.id)}
            >
              {option.label}
              <span className="mode-btn__hint">{option.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="level-heading">
        <h2 className="panel__title" id="level-heading">
          2. 揀關卡
        </h2>
        <div className="level-grid">
          {LEVEL_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="level-btn"
              data-testid={`level-${id}`}
              onClick={() => startLevel(id)}
            >
              <span>{LEVEL_LABELS[id]}</span>
              <span className="level-btn__hint">
                {LEVEL_HINTS[id] ?? LEVEL_HINTS.default}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="custom-heading">
        <h2 className="panel__title" id="custom-heading">
          3. 自選弦
        </h2>
        <div className="custom-row">
          {STRING_ORDER.map((s) => (
            <label className="custom-option" key={s}>
              <input
                type="checkbox"
                className="custom-option__box"
                data-testid={`custom-${s}`}
                checked={picked.includes(s)}
                onChange={(event) => toggleString(s, event.target.checked)}
              />
              <span className="custom-option__label">{s} 弦</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="start-custom-btn"
          data-testid="start-custom"
          disabled={customStrings.length === 0}
          onClick={startCustom}
        >
          開始自選關卡
        </button>
        <p className="custom-hint" aria-live="polite">
          {customStrings.length === 0
            ? "最少揀一條弦先開始得。"
            : `會練：${customStrings.join("、")} 弦`}
        </p>
      </section>
    </main>
  );
}
