"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  type MetricDefinition,
  type ActivityMetric,
  activityByDay,
  calendarWeeks,
  shortDate,
} from "@/lib/statsData";
import { cn } from "@/lib/utils";
import { EMPTY_DAY } from "@/store/useAppStore";
import type { DailyStats } from "@/types";

/** 暗い背景用の配色（色覚の違いでも見分けられるよう検証済みの値） */
export const COLORS = {
  surface: "#18181b",
  grid: "#2e2e33",
  axis: "#a1a1aa",
  actual: "#3987e5",
  ideal: "#8f8f8a",
  good: "#0ca30c",
  critical: "#d03b3b",
};

export type Period = 7 | 14 | 30 | "all";
export const PERIODS: { id: Period; label: string }[] = [
  { id: 7, label: "7日" },
  { id: 14, label: "14日" },
  { id: 30, label: "30日" },
  { id: "all", label: "全期間" },
];

// ---- 部品 ----

export function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-4", className)}>
      <div>
        <h2 className="text-sm font-black text-zinc-100">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, sub, status }: { label: string; value: string; sub?: string; status?: "good" | "critical" }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
      <span className="text-xs font-bold text-zinc-400">{label}</span>
      <span className="text-3xl font-black tabular-nums text-zinc-50">{value}</span>
      {sub && (
        <span className="flex items-center gap-1 text-xs text-zinc-300">
          {status && (
            <span aria-hidden style={{ color: status === "good" ? COLORS.good : COLORS.critical }}>
              {status === "good" ? "▲" : "▼"}
            </span>
          )}
          {sub}
        </span>
      )}
    </div>
  );
}

interface TooltipItem {
  name?: unknown;
  value?: unknown;
  color?: string;
}

/** ツールチップ: 値を大きく、系列名は小さく、色は短い線で示す */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: readonly TooltipItem[];
  label?: unknown;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => item.value !== undefined && item.value !== null);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 text-zinc-400">{String(label)}</p>
      {rows.map((item) => (
        <p key={String(item.name)} className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          <span className="font-black tabular-nums text-zinc-50">
            {Number(item.value).toLocaleString()}
            {unit}
          </span>
          <span className="text-zinc-400">{String(item.name)}</span>
        </p>
      ))}
    </div>
  );
}

export function LegendItem({ color, label, shape }: { color: string; label: string; shape: "line" | "rect" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
      <span
        aria-hidden
        className={shape === "line" ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-sm"}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export const axisProps = {
  stroke: COLORS.grid,
  tick: { fill: COLORS.axis, fontSize: 11 },
  tickLine: false,
} as const;


/** 日ごとの作業量（指標を切り替えられる棒グラフ） */
export function ActivityChart({
  dailyStats,
  days,
  metrics,
  title = "日ごとの作業量",
}: {
  dailyStats: Record<string, DailyStats>;
  days: string[];
  metrics: MetricDefinition[];
  title?: string;
}) {
  const [metricId, setMetricId] = useState<ActivityMetric>("strokeMs");
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];
  const activity = activityByDay(dailyStats, days, metric);
  const periodTotal = Math.round(activity.reduce((sum, d) => sum + d.value, 0) * 10) / 10;

  return (
    <Card title={title} subtitle={`期間の合計: ${periodTotal.toLocaleString()} ${metric.unit}`}>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="指標">
        {metrics.map((m) => (
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
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={activity} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={16} />
            <YAxis {...axisProps} allowDecimals={metric.id === "strokeMs" || metric.id === "strokeLength"} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={(props) => <ChartTooltip {...props} unit={` ${metric.unit}`} />}
            />
            <Bar dataKey="value" name={metric.label} fill={COLORS.actual} maxBarSize={24} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** 一色の濃淡（少ない→多い）。暗い背景では、少ないほど背景に近い暗い青 */
const HEAT_STEPS = ["#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef"];
const HEAT_EMPTY = "#27272a";
const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

/** お絵描きカレンダー（ペン時間の濃さで、毎日どれだけ描いたかを見る） */
export function CalendarHeatmap({
  dailyStats,
  today,
  weeks = 26,
  metric,
}: {
  dailyStats: Record<string, DailyStats>;
  today: string;
  weeks?: number;
  metric: MetricDefinition;
}) {
  const grid = calendarWeeks(today, weeks);
  const valueOf = (date: string) => metric.toValue(dailyStats[date] ?? EMPTY_DAY);
  const max = Math.max(0, ...grid.flat().filter((d) => d <= today).map(valueOf));
  const colorOf = (value: number) =>
    value <= 0 || max <= 0 ? HEAT_EMPTY : HEAT_STEPS[Math.min(HEAT_STEPS.length - 1, Math.floor((value / max) * HEAT_STEPS.length))];

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px]">
          <div className="flex flex-col gap-[3px] pr-1 pt-4 text-[10px] text-zinc-500">
            {WEEKDAYS.map((w, i) => (
              <span key={w} className="flex h-3 items-center">
                {i % 2 === 0 ? w : ""}
              </span>
            ))}
          </div>
          {grid.map((week, wi) => {
            const first = week[0];
            const showMonth = wi === 0 || first.slice(5, 7) !== grid[wi - 1][0].slice(5, 7);
            return (
              <div key={first} className="flex flex-col gap-[3px]">
                <span className="h-3 whitespace-nowrap text-[10px] text-zinc-500">
                  {showMonth ? `${Number(first.slice(5, 7))}月` : ""}
                </span>
                {week.map((date) => {
                  const future = date > today;
                  const value = future ? 0 : valueOf(date);
                  return (
                    <span
                      key={date}
                      role="img"
                      aria-label={`${shortDate(date)} ${metric.label} ${value.toLocaleString()}${metric.unit}`}
                      title={future ? "" : `${shortDate(date)}  ${metric.label} ${value.toLocaleString()} ${metric.unit}`}
                      className={cn("size-3 rounded-[3px]", date === today && "ring-1 ring-white/70")}
                      style={{ backgroundColor: future ? "transparent" : colorOf(value) }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-1 self-end text-[10px] text-zinc-400">
        少
        {[HEAT_EMPTY, ...HEAT_STEPS].map((c) => (
          <span key={c} className="size-3 rounded-[3px]" style={{ backgroundColor: c }} aria-hidden />
        ))}
        多
      </div>
    </div>
  );
}
