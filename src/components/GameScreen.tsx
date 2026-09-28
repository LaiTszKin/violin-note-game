"use client";

// 遊戲頁：狀態機編排（session × judging × audio）。REQ-ui-1 之畫面與流程契約。
// 流程：抽題（session）→ 作答（judging）→ 播該音（audio）→ 回饋 → 答對自動前進（~900ms）
// ／答錯等「繼續」→ 全部答完（含錯題重出）→ 結算 → replay 開新局。
// 題序由 seed（server 每請求抽出）以純函數重建：SSR 與 hydration 得出同一題，毋須 effect 設 state。
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { Fingerboard } from "@/components/Fingerboard";
import { LetterPad } from "@/components/LetterPad";
import { ResultBanner } from "@/components/ResultBanner";
import { Staff } from "@/components/Staff";
import { createNotePlayer, type NotePlayer } from "@/lib/audio";
import { isCorrect, type Answer } from "@/lib/judging";
import { poolFor, type PlayConfig } from "@/lib/levels";
import { answerLine, letterOf, placementsOf, type NoteId } from "@/lib/notes";
import { createSession, ROUND_SIZE, type Session } from "@/lib/session";
import { rngFromSeed } from "@/lib/shuffle";

export interface GameScreenProps {
  config: PlayConfig;
  /** 由 /play（server）為每一請求抽出；配合 round 決定本局題序（純函數，SSR／hydration 一致）。 */
  seed: number;
}

/** 答對後自動前進之延遲（測試要捕捉得到回饋）。 */
const AUTO_ADVANCE_MS = 900;

/** 換局時種子嘅推進（黃金比例常數；相鄰 round 嘅題序唔會相關）。 */
const SESSION_SEED_STEP = 0x9e3779b9;

interface Feedback {
  state: "correct" | "wrong";
  /** 已作答之題目：回饋期間譜面維持顯示此音（下一題於同一 commit 才切換）。 */
  noteId: NoteId;
}

const PAGE: CSSProperties = {
  boxSizing: "border-box",
  minHeight: "100dvh",
  maxWidth: "100%",
  overflowX: "hidden",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: "14px clamp(12px, 3vw, 28px) 28px",
  background: "#fdf6ec",
  color: "#1f2937",
  fontFamily:
    'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
};

const HEADER: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
  minWidth: 48,
  padding: "8px 16px",
  boxSizing: "border-box",
  borderRadius: 999,
  border: "2px solid #e0cdb4",
  background: "#ffffff",
  color: "#1f2937",
  fontSize: 19,
  fontWeight: 700,
  lineHeight: 1.2,
  textDecoration: "none",
  fontVariantNumeric: "tabular-nums",
  cursor: "pointer",
  touchAction: "manipulation",
  userSelect: "none",
};

const BOARD: CSSProperties = {
  width: "100%",
  maxWidth: 620,
  margin: "0 auto",
  padding: "10px 12px",
  boxSizing: "border-box",
  borderRadius: 22,
  border: "3px solid #e0cdb4",
  background: "#ffffff",
};

/** (seed, round) → 本局種子；同一輸入必得同一題序。 */
function sessionSeedOf(seed: number, round: number): number {
  return (seed + Math.imul(round, SESSION_SEED_STEP)) >>> 0;
}

export function GameScreen({ config, seed }: GameScreenProps) {
  const { mode, level, strings } = config;
  const [round, setRound] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [muted, setMuted] = useState(false);
  const playerRef = useRef<NotePlayer | null>(null);

  // 題序＝(level, strings, seed, round) 嘅純函數：唔喺 render 期間掂非決定性來源。
  const session: Session = useMemo(
    () =>
      createSession(
        poolFor(level, strings),
        rngFromSeed(sessionSeedOf(seed, round)),
      ),
    [level, strings, seed, round],
  );

  // 播放器：第一次用先建立（唔喺 render 期間掂 browser API；mute 狀態由 player 記住）。
  const player = useCallback((): NotePlayer => {
    if (playerRef.current === null) {
      playerRef.current = createNotePlayer();
    }
    return playerRef.current;
  }, []);

  const newRound = useCallback(() => {
    setFeedback(null);
    setRound((r) => r + 1);
  }, []);

  // 作答：判定 → 記分 → 播該音 → 出回饋。（回饋未完前 submit 無效＝防重複作答。）
  const submit = useCallback(
    (answer: Answer) => {
      if (feedback !== null) return;
      const question = session.current();
      if (question === null) return;
      const correct = isCorrect(question.noteId, answer);
      session.answer(correct);
      try {
        player().play(question.noteId);
      } catch {
        // 環境無 WebAudio：音效失敗唔應中斷遊戲流程。
      }
      setFeedback({
        state: correct ? "correct" : "wrong",
        noteId: question.noteId,
      });
    },
    [session, feedback, player],
  );

  const advance = useCallback(() => setFeedback(null), []);

  // 答對：約 900ms 後自動前進；feedback 消失與下一題／結算同一 commit 切換。
  useEffect(() => {
    if (feedback === null || feedback.state !== "correct") return;
    const timer = setTimeout(advance, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [feedback, advance]);

  const question = session.current();
  const displayNote: NoteId | null =
    feedback !== null ? feedback.noteId : (question?.noteId ?? null);
  const { answeredFresh, totalFresh } = session.progress();
  const streak = session.streak();
  const answering = feedback !== null; // 已作答：控件鎖住至下一題
  const finished = feedback === null && session.finished();

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    player().setMuted(next);
  }, [muted, player]);

  return (
    <main data-testid="play-screen" style={PAGE}>
      <header style={HEADER}>
        <Link data-testid="back" href="/" style={CHIP}>
          ← 返回
        </Link>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span
            data-testid="progress"
            style={CHIP}
          >{`${answeredFresh}/${totalFresh}`}</span>
          <span data-testid="streak" style={CHIP}>{`連擊 ${streak}`}</span>
        </div>
        <button
          type="button"
          data-testid="mute-toggle"
          aria-pressed={muted}
          aria-label={muted ? "開啟音效" : "靜音"}
          onClick={toggleMute}
          style={CHIP}
        >
          {muted ? "🔇 靜音" : "🔊 音效"}
        </button>
      </header>

      {finished ? (
        <section
          data-testid="summary"
          style={{ ...BOARD, padding: "24px 20px", textAlign: "center" }}
        >
          <h2 style={{ margin: "0 0 6px", fontSize: 26 }}>今局結果</h2>
          <p
            data-testid="final-score"
            style={{
              margin: "6px 0",
              fontSize: "clamp(44px, 8vw, 64px)",
              fontWeight: 800,
            }}
          >
            {`${session.score()}/${ROUND_SIZE}`}
          </p>
          <p style={{ margin: "2px 0 18px", fontSize: 24, fontWeight: 700 }}>
            <span aria-hidden="true">★ </span>
            星星{" "}
            <span
              data-testid="final-stars"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {session.stars()}
            </span>
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              data-testid="replay"
              onClick={newRound}
              style={{
                ...CHIP,
                minHeight: 60,
                padding: "12px 28px",
                fontSize: 22,
                background: "#f59e0b",
                borderColor: "#b45309",
                color: "#ffffff",
              }}
            >
              再玩一次
            </button>
            <Link
              data-testid="back-home"
              href="/"
              style={{
                ...CHIP,
                minHeight: 60,
                padding: "12px 28px",
                fontSize: 22,
              }}
            >
              返回首頁
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section style={BOARD}>
            {displayNote === null ? (
              <p
                style={{ textAlign: "center", fontSize: 22, margin: "60px 0" }}
              >
                準備中…
              </p>
            ) : (
              <Staff noteId={displayNote} />
            )}
          </section>

          {feedback === null ? null : (
            <ResultBanner
              state={feedback.state}
              answerLine={answerLine(feedback.noteId)}
              onContinue={advance}
            />
          )}

          {mode === "letter" ? (
            <LetterPad
              disabled={answering}
              correctLetter={
                feedback?.state === "wrong" ? letterOf(feedback.noteId) : null
              }
              onPick={(letter) => submit({ kind: "letter", letter })}
            />
          ) : (
            <Fingerboard
              disabled={answering}
              correctCells={
                feedback?.state === "wrong"
                  ? placementsOf(feedback.noteId)
                  : null
              }
              onPick={(string, finger) =>
                submit({ kind: "position", string, finger })
              }
            />
          )}
        </>
      )}
    </main>
  );
}
