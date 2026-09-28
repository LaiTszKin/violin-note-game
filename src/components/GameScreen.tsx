"use client";

// 遊戲頁：狀態機編排（session × judging × audio）。
// ⚠️ STUB（紅線基準）：只有簽名——由所屬 shard 實作後移除本標記。
import type { PlayConfig } from "@/lib/levels";

export interface GameScreenProps {
  config: PlayConfig;
}

export function GameScreen({ config }: GameScreenProps) {
  void config;
  return <main data-testid="play-screen" />;
}
