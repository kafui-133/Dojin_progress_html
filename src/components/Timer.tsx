"use client";

import { Coffee, Pause, Play, RotateCcw, Timer as TimerIcon } from "lucide-react";
import { useNow } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { POMODORO_DURATION, getPomodoroRemaining, toDateString, useAppStore } from "@/store/useAppStore";
import type { PomodoroMode as Mode } from "@/types";

const DURATION_MS = POMODORO_DURATION;

const MODE_LABEL: Record<Mode, string> = {
  focus: "作業 25分",
  break: "休憩 5分",
};

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function format(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  return `${String(Math.floor(totalSec / 60)).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}`;
}

/**
 * 25分ポモドーロタイマー（表示と操作）。時間の管理はストアにあり、
 * 終わったときの切り替え・BGM・読み上げは GlobalRuntime が行うので、別のページに移っても続く。
 */
export default function Timer() {
  const now = useNow(250);
  const pomodoro = useAppStore((s) => s.pomodoro);
  const startTimer = useAppStore((s) => s.startTimer);
  const pauseTimer = useAppStore((s) => s.pauseTimer);
  const resetTimer = useAppStore((s) => s.resetTimer);
  const setTimerMode = useAppStore((s) => s.setTimerMode);
  const completedCount = useAppStore((s) => {
    const today = toDateString(new Date(now));
    return s.projects.reduce((sum, p) => sum + (p.dailyStats[today]?.pomodoros ?? 0), 0);
  });

  const { mode } = pomodoro;
  const isRunning = pomodoro.endAt !== null;
  const remaining = getPomodoroRemaining(pomodoro, now);
  const start = () => startTimer();
  const pause = () => pauseTimer();
  const reset = () => resetTimer();
  const switchMode = (next: Mode) => setTimerMode(next);

  const ratio = remaining / DURATION_MS[mode];
  const color = mode === "focus" ? "#e879f9" : "#34d399";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <TimerIcon className="size-4" /> ポモドーロ
        </h2>
        <span className="text-xs text-zinc-400">今日 🍅 × {completedCount}</span>
      </div>

      <div className="flex gap-1 rounded-lg bg-zinc-800 p-1 text-sm">
        {(["focus", "break"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md py-1 font-bold transition",
              mode === m ? "bg-zinc-950 text-white" : "text-zinc-400 hover:text-white",
            )}
          >
            {m === "break" && <Coffee className="size-3.5" />}
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative size-32 shrink-0">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="#27272a" strokeWidth="8" />
            <circle
              cx="60"
              cy="60"
              r={RING_RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - ratio)}
              className="transition-[stroke-dashoffset] duration-300 ease-linear"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-black tabular-nums">
            {format(remaining)}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={isRunning ? pause : start}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg py-2.5 font-bold transition hover:brightness-110",
              isRunning ? "bg-zinc-700" : mode === "focus" ? "bg-fuchsia-600" : "bg-emerald-600",
            )}
          >
            {isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
            {isRunning ? "一時停止" : remaining < DURATION_MS[mode] ? "再開" : "スタート"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            <RotateCcw className="size-4" /> リセット
          </button>
        </div>
      </div>
    </section>
  );
}
