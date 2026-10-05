"use client";

import { Coffee, Pause, Play, RotateCcw, Timer as TimerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { vibrate } from "@/lib/effects";
import { soundManager } from "@/lib/soundManager";
import { cn } from "@/lib/utils";
import { EMPTY_DAY, toDateString, useAppStore } from "@/store/useAppStore";

type Mode = "focus" | "break";

const DURATION_MS: Record<Mode, number> = {
  focus: 25 * 60_000,
  break: 5 * 60_000,
};

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

/** 25分ポモドーロタイマー。終わると音で知らせ、作業⇄休憩を切り替える */
export default function Timer() {
  const [mode, setMode] = useState<Mode>("focus");
  const [endAt, setEndAt] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState(DURATION_MS.focus);
  const [tick, setTick] = useState(() => Date.now());
  const recordPomodoro = useAppStore((s) => s.recordPomodoro);
  const completedCount = useAppStore(
    (s) => (s.dailyStats[toDateString(new Date(tick))] ?? EMPTY_DAY).pomodoros,
  );

  const isRunning = endAt !== null;
  const remaining = isRunning ? Math.max(0, endAt - tick) : pausedRemaining;

  useEffect(() => {
    if (endAt === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      if (t < endAt) {
        setTick(t);
        return;
      }
      soundManager.play("fanfare");
      vibrate([200, 100, 200]);
      const nextMode: Mode = mode === "focus" ? "break" : "focus";
      if (mode === "focus") recordPomodoro();
      setMode(nextMode);
      setEndAt(null);
      setPausedRemaining(DURATION_MS[nextMode]);
    }, 250);
    return () => clearInterval(id);
  }, [endAt, mode, recordPomodoro]);

  const start = () => {
    const t = Date.now();
    setTick(t);
    setEndAt(t + pausedRemaining);
  };
  const pause = () => {
    if (endAt === null) return;
    setPausedRemaining(Math.max(0, endAt - Date.now()));
    setEndAt(null);
  };
  const reset = () => {
    setEndAt(null);
    setPausedRemaining(DURATION_MS[mode]);
  };
  const switchMode = (next: Mode) => {
    setMode(next);
    setEndAt(null);
    setPausedRemaining(DURATION_MS[next]);
  };

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
