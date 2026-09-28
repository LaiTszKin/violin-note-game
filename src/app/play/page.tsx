import { GameScreen } from "@/components/GameScreen";
import { parsePlayQuery } from "@/lib/params";

interface PlayPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// /play 因 searchParams 屬動態頁：每請求抽一個局種子，隨 props 落到客戶端。
// 同一 seed ⇒ 同一題序（純函數重建）⇒ SSR 與 hydration 一致，同時令每局新鮮。
function drawSessionSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export default async function PlayPage({ searchParams }: PlayPageProps) {
  const config = parsePlayQuery(await searchParams);
  return <GameScreen config={config} seed={drawSessionSeed()} />;
}
