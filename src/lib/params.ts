// /play URL 參數解析（含 fallback 規則）。
// 規格：.plan/28-09-2026/violin-note-game/PRD.md REQ-params-1。
// mode∈{letter,position}，缺/非法→letter；level∈{G,D,A,E,mixed,custom}，缺/非法→mixed；
// level=custom 而 strings 無有效值→mixed；strings＝逗號分隔，只接受 G/D/A/E、去重、固定弦序。
import type { LevelId, Mode, PlayConfig } from "./levels";
import { STRING_ORDER, VALID_LEVELS } from "./levels";
import type { StringName } from "./notes";

export type RawQuery = Record<string, string | string[] | undefined>;

/** Next.js 重複參數＝陣列：取第一項（空陣列→缺值）。 */
function single(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

/** 多值參數：展開陣列＋逐項以逗號切分，回傳未 trim 之原始片段。 */
function list(value: unknown): string[] {
  if (typeof value === "string") return value.split(",");
  if (Array.isArray(value))
    return value.flatMap((v) => (typeof v === "string" ? v.split(",") : []));
  return [];
}

const isMode = (v: string | undefined): v is Mode =>
  v !== undefined && (["letter", "position"] as readonly string[]).includes(v);

const isLevel = (v: string | undefined): v is LevelId =>
  v !== undefined && (VALID_LEVELS as readonly string[]).includes(v);

const isStringName = (v: string): v is StringName =>
  (STRING_ORDER as readonly string[]).includes(v);

/** REQ-params-1：合法值採用，其餘 fallback；strings 過濾／去重／固定弦序。 */
export function parsePlayQuery(raw: RawQuery): PlayConfig {
  const modeRaw = single(raw?.mode);
  const mode: Mode = isMode(modeRaw) ? modeRaw : "letter";

  const levelRaw = single(raw?.level);
  const level: LevelId = isLevel(levelRaw) ? levelRaw : "mixed";

  const accepted = new Set(
    list(raw?.strings)
      .map((s) => s.trim())
      .filter(isStringName),
  );
  const strings: readonly StringName[] =
    level === "custom" ? STRING_ORDER.filter((s) => accepted.has(s)) : [];

  // custom 但無有效弦 → 退回混合關。
  if (level === "custom" && strings.length === 0)
    return { mode, level: "mixed", strings: [] };

  return { mode, level, strings };
}
