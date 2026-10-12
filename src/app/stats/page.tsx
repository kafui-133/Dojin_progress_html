"use client";

import Header from "@/components/Header";
import StatsDashboard from "@/components/StatsDashboard";
import { useIsClient } from "@/lib/useIsClient";

/** 進捗グラフのページ。記録は LocalStorage にあるため、クライアントでのみ描画する */
export default function StatsPage() {
  const isClient = useIsClient();

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      {isClient ? (
        <>
          <Header />
          <StatsDashboard />
        </>
      ) : (
        <p className="m-auto animate-pulse text-sm text-zinc-500">読み込み中…</p>
      )}
    </div>
  );
}
