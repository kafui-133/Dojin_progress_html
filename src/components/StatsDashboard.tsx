"use client";

import { useState } from "react";
import { PROJECT_TYPE_LABEL } from "@/components/ProjectDialog";
import CspUsageStats from "@/components/stats/CspUsageStats";
import IllustrationStats from "@/components/stats/IllustrationStats";
import IntegratedStats from "@/components/stats/IntegratedStats";
import MangaStats from "@/components/stats/MangaStats";
import { PERIODS, type Period } from "@/components/stats/parts";
import { useNow } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { toDateString, useActiveProject, useAppStore } from "@/store/useAppStore";

type View = "project" | "integrated" | "csp";

/** 進捗グラフ: 今のプロジェクト（マンガ / イラスト）と、全部を合わせたお絵描き履歴 */
export default function StatsDashboard() {
  const now = useNow(60_000);
  const project = useActiveProject();
  const projects = useAppStore((s) => s.projects);
  const cspUsage = useAppStore((s) => s.cspUsage);
  const [view, setView] = useState<View>("project");
  const [period, setPeriod] = useState<Period>(14);
  const today = toDateString(new Date(now));

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4">
      {/* 表示の切り替えと期間のフィルターは1行で、すべてのグラフの上に */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-black">📊 進捗グラフ</h1>
        <div className="mr-auto flex gap-1 rounded-lg bg-zinc-800 p-1 text-sm" role="tablist" aria-label="表示">
          {(
            [
              ["project", `${PROJECT_TYPE_LABEL[project.type]}：${project.name}`],
              ["integrated", "🖌️ 統合（お絵描き履歴）"],
              ["csp", "⏱️ クリスタ使用時間"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                "max-w-[16rem] truncate rounded-md px-3 py-1 font-bold transition",
                view === id ? "bg-zinc-950 text-white" : "text-zinc-400 hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-400">日ごとのグラフの期間</span>
        <div className="flex gap-1 rounded-lg bg-zinc-800 p-1 text-sm" role="radiogroup" aria-label="期間">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "rounded-md px-3 py-1 font-bold transition",
                period === p.id ? "bg-zinc-950 text-white" : "text-zinc-400 hover:text-white",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {view === "csp" ? (
        <CspUsageStats usage={cspUsage} projects={projects} period={period} today={today} />
      ) : view === "integrated" ? (
        <IntegratedStats projects={projects} period={period} today={today} />
      ) : project.type === "manga" ? (
        <MangaStats project={project} period={period} today={today} />
      ) : (
        <IllustrationStats project={project} period={period} today={today} />
      )}
    </main>
  );
}
