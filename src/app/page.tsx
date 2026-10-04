"use client";

import ActionPanel from "@/components/ActionPanel";
import DebugTools from "@/components/DebugTools";
import EffectOverlay from "@/components/EffectOverlay";
import Header from "@/components/Header";
import Timer from "@/components/Timer";
import VisualStage from "@/components/VisualStage";
import { useIsClient } from "@/lib/useIsClient";

/** メインダッシュボード。進捗は LocalStorage にあるため、クライアントでのみ描画する */
export default function Home() {
  const isClient = useIsClient();

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      {isClient ? (
        <>
          <Header />
          <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <VisualStage />
            <div className="flex flex-col gap-4">
              <ActionPanel />
              <Timer />
              <DebugTools />
            </div>
          </main>
          <EffectOverlay />
        </>
      ) : (
        <p className="m-auto animate-pulse text-sm text-zinc-500">読み込み中…</p>
      )}
    </div>
  );
}
