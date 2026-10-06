"use client";

import { motion } from "framer-motion";
import { BarChart3, LayoutDashboard, Maximize, Minimize, Music, Settings, VolumeX } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ProjectDialog, { PROJECT_TYPE_LABEL } from "@/components/ProjectDialog";
import SettingsDialog from "@/components/SettingsDialog";
import { useNow } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { getEffectiveStreak, toDateString, useActiveProject, useAppStore } from "@/store/useAppStore";

export default function Header() {
  const now = useNow(60_000);
  const progress = useAppStore((s) => s.progress);
  const combo = useAppStore((s) => s.combo);
  const isBgmOn = useAppStore((s) => s.isBgmOn);
  const setBgmOn = useAppStore((s) => s.setBgmOn);
  const shurabaMode = useAppStore((s) => s.shurabaMode);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const streak = getEffectiveStreak(progress, toDateString(new Date(now)));

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const project = useActiveProject();
  const pathname = usePathname();
  const onStats = pathname === "/stats";

  // 別モニターで全画面表示するためのボタン
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-1.5 px-4 py-3 sm:gap-3">
        <h1 className="shrink-0 text-sm font-black tracking-tight sm:text-xl">
          進捗ブースター
          <span className="ml-2 hidden text-xs font-bold text-fuchsia-400 xl:inline">Syuraba Booster</span>
        </h1>

        <button
          type="button"
          onClick={() => setIsProjectOpen(true)}
          title="プロジェクトの切り替え・新規作成・JSON の保存と読み込み"
          className="mr-auto flex min-w-0 items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-sm font-bold text-zinc-200 hover:bg-zinc-700"
        >
          <span className="shrink-0">{PROJECT_TYPE_LABEL[project.type].split(" ")[0]}</span>
          <span className="truncate">{project.name}</span>
        </button>

        <Link
          href={onStats ? "/" : "/stats"}
          className="flex shrink-0 items-center gap-1 rounded-full bg-zinc-800 px-2 py-1 text-sm font-bold text-zinc-200 transition hover:bg-zinc-700 sm:px-3"
        >
          {onStats ? <LayoutDashboard className="size-4" /> : <BarChart3 className="size-4" />}
          <span className="hidden sm:inline">{onStats ? "ダッシュボード" : "進捗グラフ"}</span>
        </Link>

        <span
          className={cn(
            "whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold sm:px-3 sm:text-sm",
            streak > 0 ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-400",
          )}
        >
          🔥 {streak}日<span className="hidden sm:inline">連続</span>
        </span>

        {combo.isFever && (
          <motion.span
            className="whitespace-nowrap rounded-md bg-yellow-400 px-2 py-1 text-xs font-black sm:text-sm text-black shadow-[0_0_16px_rgba(250,204,21,0.8)]"
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          >
            FEVER {combo.feverMultiplier.toFixed(1)}x
          </motion.span>
        )}

        <span className="whitespace-nowrap text-sm font-bold tabular-nums sm:text-base">
          🪙 {progress.coins.toLocaleString()}
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={shurabaMode}
          aria-label="修羅場モード"
          title={shurabaMode ? "修羅場モード ON（ZONE の回数制限なし）" : "修羅場モード OFF（ZONE は1日の上限まで）"}
          onClick={() => updateSettings({ shurabaMode: !shurabaMode })}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm font-bold transition sm:px-3",
            shurabaMode ? "bg-red-600 text-white shadow-[0_0_12px_rgba(220,38,38,0.6)]" : "bg-zinc-800 text-zinc-400",
          )}
        >
          🔥<span className="hidden lg:inline">修羅場</span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={isBgmOn}
          aria-label="BGM"
          title={isBgmOn ? "BGM ON（連続で押すと鳴ります）" : "BGM OFF"}
          onClick={() => setBgmOn(!isBgmOn)}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm font-bold transition sm:px-3",
            isBgmOn ? "bg-fuchsia-600 text-white" : "bg-zinc-800 text-zinc-400",
          )}
        >
          {isBgmOn ? <Music className="size-4" /> : <VolumeX className="size-4" />}
          <span className="hidden sm:inline">BGM {isBgmOn ? "ON" : "OFF"}</span>
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "全画面を終了" : "全画面表示"}
          title={isFullscreen ? "全画面を終了" : "全画面表示（別モニター用）"}
          className="hidden shrink-0 rounded-full bg-zinc-800 p-1.5 text-zinc-300 transition hover:bg-zinc-700 hover:text-white sm:block"
        >
          {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </button>

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          aria-label="設定"
          title="設定（BGM・読み上げ・効果音）"
          className="shrink-0 rounded-full bg-zinc-800 p-1.5 text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
        >
          <Settings className="size-4" />
        </button>
      </div>
      {isSettingsOpen && <SettingsDialog onClose={() => setIsSettingsOpen(false)} />}
      {isProjectOpen && <ProjectDialog onClose={() => setIsProjectOpen(false)} />}
    </header>
  );
}
