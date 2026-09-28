// /play URL 參數解析（含 fallback 規則）。
// ⚠️ STUB（紅線基準）：實作未開始——由所屬 shard 實作後移除本標記。
import type { PlayConfig } from "./levels";

export type RawQuery = Record<string, string | string[] | undefined>;

export function parsePlayQuery(raw: RawQuery): PlayConfig {
  void raw;
  return { mode: "letter", level: "mixed", strings: [] };
}
