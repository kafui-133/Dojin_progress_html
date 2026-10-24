"use client";

import { Check, Coffee, Pause, Play, RotateCcw, Settings2, Timer as TimerIcon } from "lucide-react";
import { useState } from "react";
import { useNow } from "@/lib/clock";
import { cn } from "@/lib/utils";
import {
  POMODORO_LIMITS,
  clampPomodoroMinutes,
  getPomodoroRemaining,
  toDateString,
  useAppStore,
} from "@/store/useAppStore";
import type { PomodoroMode as Mode } from "@/types";
import Icon from "@/components/Icon";

const MODE_NAME: Record<Mode, string> = {
  focus: "作業",
  break: "休憩",
};

/** よく使う組み合わせ（作業 / 休憩、分） */
const PRESETS: [number, number][] = [
  [25, 5],
  [50, 10],
  [90, 15],
];

/** 作業・休憩の長さを変える */
function DurationEditor({ onClose }: { onClose: () => void }) {
  const focusMin = useAppStore((s) => s.pomodoroFocusMin);
  const breakMin = useAppStore((s) => s.pomodoroBreakMin);
  const pomodoro = useAppStore((s) => s.pomodoro);
  const setPomodoroMinutes = useAppStore((s) => s.setPomodoroMinutes);
  // 入力中は下書きにしておき、「決定」で反映する
  const [draft, setDraft] = useState({ focus: String(focusMin), break: String(breakMin) });
  const inProgress = pomodoro.endAt !== null || pomodoro.pausedRemaining !== pomodoro.totalMs;

  const apply = (focus: number, rest: number) => {
    setPomodoroMinutes({ focus, break: rest });
    onClose();
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-800/70 p-3 text-sm">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(([f, b]) => (
          <button
            key={`${f}-${b}`}
            type="button"
            onClick={() => apply(f, b)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold transition",
              f === focusMin && b === breakMin ? "bg-zinc-100 text-zinc-900" : "bg-zinc-700 text-zinc-300 hover:text-zinc-50",
            )}
          >
            {f}分 / {b}分
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {(["focus", "break"] as const).map((m) => (
          <label key={m} className="flex flex-col gap-1 text-xs text-zinc-300">
            {MODE_NAME[m]}（分）
            <input
              type="number"
              inputMode="numeric"
              min={POMODORO_LIMITS[m].min}
              max={POMODORO_LIMITS[m].max}
              value={draft[m]}
              onChange={(e) => setDraft((d) => ({ ...d, [m]: e.target.value }))}
              className="w-20 rounded bg-zinc-900 px-2 py-1 text-sm tabular-nums"
              aria-label={`${MODE_NAME[m]}の時間（分）`}
            />
          </label>
        ))}
        <button
          type="button"
          onClick={() =>
            apply(clampPomodoroMinutes("focus", Number(draft.focus)), clampPomodoroMinutes("break", Number(draft.break)))
          }
          className="ml-auto flex items-center gap-1 rounded bg-fuchsia-600 px-3 py-1.5 font-bold"
        >
          <Check className="size-4" /> 決定
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        作業は{POMODORO_LIMITS.focus.min}〜{POMODORO_LIMITS.focus.max}分、休憩は{POMODORO_LIMITS.break.min}〜
        {POMODORO_LIMITS.break.max}分。
        {inProgress && "いま進めている回はそのままで、次の回から新しい長さになります。"}
      </p>
    </div>
  );
}

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function format(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  return `${String(Math.floor(totalSec / 60)).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}`;
}

/**
 * ポモドーロタイマー（表示と操作。作業・休憩の長さは変えられる）。時間の管理はストアにあり、
 * 終わったときの切り替え・BGM・読み上げは GlobalRuntime が行うので、別のページに移っても続く。
 */
export default function Timer() {
  const now = useNow(250);
  const pomodoro = useAppStore((s) => s.pomodoro);
  const startTimer = useAppStore((s) => s.startTimer);
  const pauseTimer = useAppStore((s) => s.pauseTimer);
  const resetTimer = useAppStore((s) => s.resetTimer);
  const setTimerMode = useAppStore((s) => s.setTimerMode);
  const focusMin = useAppStore((s) => s.pomodoroFocusMin);
  const breakMin = useAppStore((s) => s.pomodoroBreakMin);
  const [editing, setEditing] = useState(false);
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

  const ratio = Math.min(1, remaining / pomodoro.totalMs);
  const modeLabel = (m: Mode) => `${MODE_NAME[m]} ${m === "focus" ? focusMin : breakMin}分`;
  const color = mode === "focus" ? "#e0401f" : "#3f8a55";

  return (
    <section className="flex flex-col gap-3 koma p-4">
      <div className="flex items-center">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <TimerIcon className="size-4" /> ポモドーロ
        </h2>
        <span className="ml-auto text-xs text-zinc-400">今日 <Icon name="tomato" /> × {completedCount}</span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label="作業・休憩の時間を変更"
          title="作業・休憩の時間を変更"
          className={cn("ml-2 rounded p-1 transition hover:text-zinc-50", editing ? "text-zinc-50" : "text-zinc-400")}
        >
          <Settings2 className="size-4" />
        </button>
      </div>

      {editing && <DurationEditor onClose={() => setEditing(false)} />}

      <div className="flex gap-1 rounded-lg bg-zinc-800 p-1 text-sm">
        {(["focus", "break"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md py-1 font-bold transition",
              mode === m ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-50",
            )}
          >
            {m === "break" && <Coffee className="size-3.5" />}
            {modeLabel(m)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative size-32 shrink-0">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="#e8e1d1" strokeWidth="8" />
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
            {isRunning ? "一時停止" : remaining < pomodoro.totalMs ? "再開" : "スタート"}
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
