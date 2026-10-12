"use client";

import ActionPanel from "@/components/ActionPanel";
import CristaPanel from "@/components/CristaPanel";
import DebugTools from "@/components/DebugTools";
import Header from "@/components/Header";
import IllustrationToday from "@/components/IllustrationToday";
import Timer from "@/components/Timer";
import VisualStage from "@/components/VisualStage";
import { useIsClient } from "@/lib/useIsClient";
import { useAppStore } from "@/store/useAppStore";

/** メインダッシュボード。進捗は LocalStorage にあるため、クライアントでのみ描画する */
export default function Home() {
  const isClient = useIsClient();
  const isManga = useAppStore((s) => (s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0]).type === "manga");

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      {isClient ? (
        <>
          <Header />
          <main className="mx-auto grid w-full max-w-[1600px] gap-4 px-4 py-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
            {isManga ? <VisualStage /> : <IllustrationToday />}
            <CristaPanel />
            <div className="flex flex-col gap-4 md:col-span-2 md:grid md:grid-cols-2 md:items-start xl:col-span-1 xl:flex">
              <ActionPanel />
              <div className="flex flex-col gap-4">
                <Timer />
                <DebugTools />
              </div>
            </div>
          </main>
        </>
      ) : (
        <p className="m-auto animate-pulse text-sm text-zinc-500">読み込み中…</p>
      )}
    </div>
  );
}
