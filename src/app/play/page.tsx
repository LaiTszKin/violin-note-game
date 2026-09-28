import { GameScreen } from "@/components/GameScreen";
import { parsePlayQuery } from "@/lib/params";

interface PlayPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PlayPage({ searchParams }: PlayPageProps) {
  const config = parsePlayQuery(await searchParams);
  return <GameScreen config={config} />;
}
