"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  COLORS,
  Card,
  CalendarHeatmap,
  ChartTooltip,
  LegendItem,
  type Period,
  StatTile,
  axisProps,
} from "@/components/stats/parts";
import { PROJECT_TYPE_LABEL } from "@/components/ProjectDialog";
import { getBoardStats } from "@/lib/stages";
import {
  ACTIVITY_METRICS,
  type ActivityMetric,
  activeDayCount,
  addDays,
  byTypeDaily,
  dateRange,
  mergeDailyStats,
  periodDays,
  firstActiveDay,
  sumDaily,
} from "@/lib/statsData";
import { cn } from "@/lib/utils";
import { EMPTY_DAY, formatDuration, formatLength } from "@/store/useAppStore";
import type { Project } from "@/types";

/** マンガ・イラストの色（カテゴリの1番目・2番目。検証済みの配色） */
const TYPE_COLORS = { manga: "#3987e5", illustration: "#d95926" };
const PEN_TIME = ACTIVITY_METRICS.find((m) => m.id === "strokeMs")!;
const INTEGRATED_METRICS = ACTIVITY_METRICS.filter((m) => ["strokeMs", "strokes", "strokeLength", "undos"].includes(m.id));

/** 連続して描いた最長の日数（記録上） */
function longestStreak(activeDates: string[]): number {
  const sorted = [...new Set(activeDates)].sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const date of sorted) {
    run = prev && addDays(prev, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

/** 全プロジェクトを合わせた「お絵描き履歴」 */
export default function IntegratedStats({ projects, period, today }: { projects: Project[]; period: Period; today: string }) {
  const [metricId, setMetricId] = useState<ActivityMetric>("strokeMs");
  const merged = mergeDailyStats(projects);
  const total = sumDaily(merged);
  const days = periodDays(period, firstActiveDay(merged, null, today), today);
  const metric = INTEGRATED_METRICS.find((m) => m.id === metricId) ?? INTEGRATED_METRICS[0];
  const rows = byTypeDaily(projects, days, metric);
  const activeDates = Object.entries(merged)
    .filter(([, d]) => d.strokes > 0)
    .map(([date]) => date);

  const thisWeek = dateRange(addDays(today, -6), today).reduce((sum, d) => sum + (merged[d] ?? EMPTY_DAY).strokeMs, 0);
  const lastWeek = dateRange(addDays(today, -13), addDays(today, -7)).reduce(
    (sum, d) => sum + (merged[d] ?? EMPTY_DAY).strokeMs,
    0,
  );
  const pagesDone = projects
    .filter((p) => p.type === "manga")
    .reduce((sum, p) => sum + getBoardStats(p.manuscript).pagesComplete, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="これまでのペン時間" value={formatDuration(total.strokeMs)} sub={`線 ${total.strokes.toLocaleString()}本`} />
        <StatTile label="描いた日数" value={`${activeDayCount(merged)}日`} sub={`最長 ${longestStreak(activeDates)}日連続`} />
        <StatTile
          label="今週のペン時間"
          value={formatDuration(thisWeek)}
          sub={`先週 ${formatDuration(lastWeek)}`}
          status={thisWeek === 0 && lastWeek === 0 ? undefined : thisWeek >= lastWeek ? "good" : "critical"}
        />
        <StatTile label="線の総延長" value={formatLength(total.strokeLength)} sub="全プロジェクト" />
        <StatTile label="完成したページ" value={`${pagesDone}`} sub="マンガの合計" />
        <StatTile
          label="プロジェクト"
          value={`${projects.length}`}
          sub={`マンガ ${projects.filter((p) => p.type === "manga").length}・イラスト ${projects.filter((p) => p.type === "illustration").length}`}
        />
      </div>

      <Card title="お絵描きカレンダー" subtitle="マンガもイラストも合わせて、毎日どれだけペンを動かしたか（濃いほど長い）">
        <CalendarHeatmap dailyStats={merged} today={today} metric={PEN_TIME} weeks={30} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="日ごとの作業量（マンガ・イラスト別）" subtitle="積み上げの高さが、その日の合計です">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-3">
              <LegendItem color={TYPE_COLORS.manga} label="マンガ" shape="rect" />
              <LegendItem color={TYPE_COLORS.illustration} label="イラスト" shape="rect" />
            </div>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="指標">
              {INTEGRATED_METRICS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={metric.id === m.id}
                  onClick={() => setMetricId(m.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold transition",
                    metric.id === m.id ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:text-white",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={16} />
                <YAxis {...axisProps} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  content={(props) => <ChartTooltip {...props} unit={` ${metric.unit}`} />}
                />
                <Bar dataKey="manga" name="マンガ" stackId="type" fill={TYPE_COLORS.manga} stroke={COLORS.surface} strokeWidth={2} maxBarSize={24} />
                <Bar
                  dataKey="illustration"
                  name="イラスト"
                  stackId="type"
                  fill={TYPE_COLORS.illustration}
                  stroke={COLORS.surface}
                  strokeWidth={2}
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="プロジェクトごとの記録" subtitle="ペン時間の長い順">
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-zinc-400">
                <tr>
                  <th className="py-1 text-left">プロジェクト</th>
                  <th className="text-right">ペン時間</th>
                  <th className="text-right">線</th>
                  <th className="text-right">やり直し</th>
                  <th className="text-right">日数</th>
                </tr>
              </thead>
              <tbody>
                {projects
                  .map((p) => ({ project: p, sum: sumDaily(p.dailyStats), days: activeDayCount(p.dailyStats) }))
                  .sort((a, b) => b.sum.strokeMs - a.sum.strokeMs)
                  .map(({ project, sum, days }) => (
                    <tr key={project.id} className="border-t border-white/5 text-zinc-200">
                      <td className="max-w-[12rem] py-1.5 text-left">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: TYPE_COLORS[project.type] }}
                            aria-label={PROJECT_TYPE_LABEL[project.type]}
                          />
                          <span className="truncate">{project.name}</span>
                        </span>
                      </td>
                      <td className="text-right">{formatDuration(sum.strokeMs)}</td>
                      <td className="text-right">{sum.strokes.toLocaleString()}</td>
                      <td className="text-right">{sum.undos.toLocaleString()}</td>
                      <td className="text-right">{days}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
