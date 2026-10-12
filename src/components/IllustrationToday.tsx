"use client";

import { Check, Pencil } from "lucide-react";
import { useState } from "react";
import { useNow } from "@/lib/clock";
import { ACTIVITY_METRICS, addDays, dateRange, recentAverage, shortDate, sumDaily } from "@/lib/statsData";
import { EMPTY_DAY, daysBetween, formatDuration, formatLength, toDateString, useActiveProject, useAppStore } from "@/store/useAppStore";

const PEN_TIME = ACTIVITY_METRICS.find((m) => m.id === "strokeMs")!;

/** イラストモードのダッシュボード左側: 今日の作業量と、ここ1週間の様子 */
export default function IllustrationToday() {
  const now = useNow(30_000);
  const project = useActiveProject();
  const setGoal = useAppStore((s) => s.setGoal);
  const [editing, setEditing] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState(project.deadline);

  const today = toDateString(new Date(now));
  const day = project.dailyStats[today] ?? EMPTY_DAY;
  const total = sumDaily(project.dailyStats);
  const avgMin = recentAverage(project.dailyStats, today, 7, PEN_TIME);
  const week = dateRange(addDays(today, -6), today).map((date) => ({
    date,
    minutes: PEN_TIME.toValue(project.dailyStats[date] ?? EMPTY_DAY),
  }));
  const maxMin = Math.max(1, ...week.map((d) => d.minutes));
  const undoRate = day.strokes > 0 ? Math.round((day.undos / day.strokes) * 100) : 0;
  const daysLeft = project.deadline ? daysBetween(today, project.deadline) : null;

  const tiles = [
    { label: "ペン時間", value: formatDuration(day.strokeMs), sub: `7日平均 ${Math.round(avgMin)}分` },
    { label: "線の本数", value: day.strokes.toLocaleString(), sub: `累計 ${total.strokes.toLocaleString()}本` },
    { label: "線の長さ", value: formatLength(day.strokeLength), sub: `累計 ${formatLength(total.strokeLength)}` },
    { label: "やり直し", value: `${day.undos.toLocaleString()}回`, sub: `線に対して ${undoRate}%` },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
      <div>
        <p className="text-xs font-bold text-fuchsia-400">🎨 イラスト</p>
        <h2 className="text-lg font-black">{project.name}</h2>
        <p className="text-sm text-zinc-400">今日の作業（クリスタでの線・ペン時間・やり直しを記録しています）</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-zinc-800/70 p-3">
            <p className="text-xs font-bold text-zinc-400">{t.label}</p>
            <p className="text-2xl font-black tabular-nums">{t.value}</p>
            <p className="text-xs text-zinc-400">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold text-zinc-400">ここ7日のペン時間（分）</p>
        <div className="flex h-28 items-end gap-2">
          {week.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${shortDate(d.date)} ${d.minutes}分`}>
              <span className="text-[10px] tabular-nums text-zinc-400">{d.minutes > 0 ? Math.round(d.minutes) : ""}</span>
              <div
                className="w-full max-w-6 rounded-t bg-[#3987e5]"
                style={{ height: `${Math.max(d.minutes > 0 ? 4 : 0, (d.minutes / maxMin) * 72)}px` }}
              />
              <span className={d.date === today ? "text-[10px] font-bold text-white" : "text-[10px] text-zinc-500"}>
                {shortDate(d.date)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-zinc-900 p-3 text-sm">
          <label className="flex flex-col gap-1">
            締め切り（任意）
            <input
              type="date"
              value={deadlineDraft}
              onChange={(e) => setDeadlineDraft(e.target.value)}
              className="rounded bg-zinc-800 px-2 py-1"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setGoal({ deadline: deadlineDraft });
              setEditing(false);
            }}
            className="ml-auto flex items-center gap-1 rounded bg-fuchsia-600 px-3 py-1.5 font-bold"
          >
            <Check className="size-4" /> 完了
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between text-sm">
          <span className={daysLeft !== null && daysLeft <= 3 ? "font-bold text-red-400" : "text-zinc-300"}>
            {daysLeft === null ? "締め切り未設定" : daysLeft >= 0 ? `締め切りまで あと ${daysLeft}日` : `締め切りを${-daysLeft}日過ぎています`}
          </span>
          <button
            type="button"
            onClick={() => {
              setDeadlineDraft(project.deadline);
              setEditing(true);
            }}
            className="flex items-center gap-1 text-zinc-400 hover:text-white"
          >
            <Pencil className="size-4" /> 締め切りを設定
          </button>
        </div>
      )}
    </section>
  );
}
