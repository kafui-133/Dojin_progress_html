"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNow } from "@/lib/clock";
import { STAGES, getBoardStats } from "@/lib/stages";
import {
  ACTIVITY_METRICS,
  type ActivityMetric,
  activityByDay,
  addDays,
  buildBurnup,
  completionsByDay,
  dateRange,
  firstActiveDay,
  shortDate,
} from "@/lib/statsData";
import { cn } from "@/lib/utils";
import { EMPTY_DAY, daysBetween, formatDuration, getEffectiveStreak, toDateString, useAppStore } from "@/store/useAppStore";

/** 暗い背景用の配色（色覚の違いでも見分けられるよう検証済みの値） */
const COLORS = {
  surface: "#18181b",
  grid: "#2e2e33",
  axis: "#a1a1aa",
  actual: "#3987e5",
  ideal: "#8f8f8a",
  good: "#0ca30c",
  critical: "#d03b3b",
};

type Period = 7 | 14 | 30 | "all";
const PERIODS: { id: Period; label: string }[] = [
  { id: 7, label: "7日" },
  { id: 14, label: "14日" },
  { id: 30, label: "30日" },
  { id: "all", label: "全期間" },
];

// ---- 部品 ----

function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
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

function StatTile({ label, value, sub, status }: { label: string; value: string; sub?: string; status?: "good" | "critical" }) {
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
function ChartTooltip({
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

function LegendItem({ color, label, shape }: { color: string; label: string; shape: "line" | "rect" }) {
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

const axisProps = {
  stroke: COLORS.grid,
  tick: { fill: COLORS.axis, fontSize: 11 },
  tickLine: false,
} as const;

// ---- 本体 ----

export default function StatsDashboard() {
  const now = useNow(60_000);
  const manuscript = useAppStore((s) => s.manuscript);
  const dailyStats = useAppStore((s) => s.dailyStats);
  const progress = useAppStore((s) => s.progress);
  const [period, setPeriod] = useState<Period>(14);
  const [metricId, setMetricId] = useState<ActivityMetric>("strokeMs");

  const today = toDateString(new Date(now));
  const board = getBoardStats(manuscript);
  const burnup = buildBurnup(manuscript, progress.deadline, today);
  const daysLeft = progress.deadline ? daysBetween(today, progress.deadline) : null;
  const remaining = board.total - board.done;
  const neededPace = daysLeft !== null && daysLeft >= 0 && remaining > 0 ? remaining / (daysLeft + 1) : null;
  const onTrack = burnup.forecast !== null && progress.deadline ? burnup.forecast <= progress.deadline : null;

  const from =
    period === "all" ? firstActiveDay(dailyStats, manuscript, today) : addDays(today, -(period - 1));
  const days = dateRange(from, today);
  const metric = ACTIVITY_METRICS.find((m) => m.id === metricId)!;
  const activity = activityByDay(dailyStats, days, metric);
  const byDay = completionsByDay(manuscript, days);
  const todayStats = dailyStats[today] ?? EMPTY_DAY;
  const todayStages = byDay.at(-1);
  const todayStageCount = todayStages ? STAGES.reduce((sum, s) => sum + todayStages[s.id], 0) : 0;
  const periodTotal = activity.reduce((sum, d) => sum + d.value, 0);

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4">
      {/* フィルター（期間）は1行で、すべてのグラフの上に */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-black">📊 進捗グラフ</h1>
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="全体の進捗" value={`${Math.floor(board.percent)}%`} sub={`${board.done} / ${board.total} 工程`} />
        <StatTile label="完成ページ" value={`${board.pagesComplete}`} sub={`/ ${manuscript.pages.length} ページ`} />
        <StatTile
          label="締め切りまで"
          value={daysLeft === null ? "—" : daysLeft >= 0 ? `${daysLeft}日` : `${-daysLeft}日超過`}
          sub={progress.deadline ? `${shortDate(progress.deadline)} 入稿` : "締め切り未設定"}
        />
        <StatTile
          label="必要なペース"
          value={neededPace === null ? "—" : `${Math.ceil(neededPace * 10) / 10}`}
          sub={neededPace === null ? (remaining === 0 ? "全工程完了！" : "締め切りを設定すると出ます") : "工程 / 日"}
        />
        <StatTile
          label="完了予測"
          value={burnup.forecast ? shortDate(burnup.forecast) : "—"}
          sub={
            onTrack === null
              ? `平均 ${Math.round(burnup.pacePerDay * 10) / 10} 工程 / 日`
              : onTrack
                ? "締め切りに間に合うペース"
                : "このままだと締め切りに遅れる"
          }
          status={onTrack === null ? undefined : onTrack ? "good" : "critical"}
        />
        <StatTile
          label="今日"
          value={`${todayStageCount} 工程`}
          sub={`ペン ${formatDuration(todayStats.strokeMs)}・🔥${getEffectiveStreak(progress, today)}日連続`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          title="完了した工程の累計（バーンアップ）"
          subtitle="青い線が実績、灰色の線が締め切りに間に合う理想のペース。青が灰色より上なら順調です。"
        >
          <div className="flex flex-wrap gap-4">
            <LegendItem color={COLORS.actual} label="実績" shape="line" />
            {progress.deadline && <LegendItem color={COLORS.ideal} label="理想ペース" shape="line" />}
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burnup.points} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                <YAxis {...axisProps} allowDecimals={false} domain={[0, burnup.total]} />
                <ReferenceLine y={burnup.total} stroke={COLORS.grid} />
                {progress.deadline && (
                  <ReferenceLine
                    x={shortDate(progress.deadline)}
                    stroke={COLORS.axis}
                    label={{ value: "締め切り", fill: COLORS.axis, fontSize: 11, position: "insideTopRight" }}
                  />
                )}
                <Tooltip
                  cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
                  content={(props) => <ChartTooltip {...props} unit=" 工程" />}
                />
                {progress.deadline && (
                  <Line
                    type="linear"
                    dataKey="ideal"
                    name="理想ペース"
                    stroke={COLORS.ideal}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="実績"
                  stroke={COLORS.actual}
                  strokeWidth={2}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 5, stroke: COLORS.surface, strokeWidth: 2 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="工程ごとの進み具合" subtitle={`全 ${manuscript.pages.length} ページのうち、その工程が終わったページ数`}>
          <ul className="flex flex-col gap-3">
            {STAGES.map((stage) => {
              const count = board.byStage[stage.id];
              const pct = manuscript.pages.length > 0 ? (count / manuscript.pages.length) * 100 : 0;
              return (
                <li key={stage.id} className="flex flex-col gap-1" title={`${stage.label}: ${count} / ${manuscript.pages.length} ページ`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-bold text-zinc-200">
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: stage.color }} aria-hidden />
                      {stage.emoji} {stage.label}
                    </span>
                    <span className="tabular-nums text-zinc-300">
                      {count} / {manuscript.pages.length}（{Math.floor(pct)}%）
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-r bg-zinc-800">
                    <div className="h-full rounded-r" style={{ width: `${pct}%`, backgroundColor: stage.color }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="日ごとに完了した工程" subtitle="その日に完了ボタンを押した工程の数（工程別）">
          <div className="flex flex-wrap gap-3">
            {STAGES.map((stage) => (
              <LegendItem key={stage.id} color={stage.color} label={stage.label} shape="rect" />
            ))}
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={16} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={(props) => <ChartTooltip {...props} unit=" 工程" />} />
                {STAGES.map((stage, i) => (
                  <Bar
                    key={stage.id}
                    dataKey={stage.id}
                    name={stage.label}
                    stackId="stages"
                    fill={stage.color}
                    stroke={COLORS.surface}
                    strokeWidth={2}
                    maxBarSize={24}
                    radius={i === STAGES.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="日ごとの作業量" subtitle={`期間の合計: ${periodTotal.toLocaleString()} ${metric.unit}`}>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="指標">
            {ACTIVITY_METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={metricId === m.id}
                onClick={() => setMetricId(m.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold transition",
                  metricId === m.id ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:text-white",
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
                <YAxis {...axisProps} allowDecimals={metric.id === "strokeMs"} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  content={(props) => <ChartTooltip {...props} unit={` ${metric.unit}`} />}
                />
                <Bar dataKey="value" name={metric.label} fill={COLORS.actual} maxBarSize={24} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="ページ × 工程" subtitle="色の付いたマスが完了した工程。数字は完了した日付です。">
        <div className="overflow-x-auto">
          <div
            className="grid gap-[2px] text-[10px] tabular-nums"
            style={{ gridTemplateColumns: `6rem repeat(${manuscript.pages.length}, minmax(1.9rem, 1fr))` }}
          >
            <span />
            {manuscript.pages.map((_, i) => (
              <span key={i} className="py-1 text-center font-bold text-zinc-400">
                P{i + 1}
              </span>
            ))}
            {STAGES.map((stage) => (
              <div key={stage.id} className="contents">
                <span className="flex items-center gap-1 whitespace-nowrap pr-1 text-xs font-bold text-zinc-300">
                  <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: stage.color }} aria-hidden />
                  {stage.label}
                </span>
                {manuscript.pages.map((page, i) => {
                  const at = page.done[stage.id];
                  const date = at !== undefined ? toDateString(new Date(at)) : null;
                  return (
                    <span
                      key={i}
                      title={`P${i + 1} ${stage.label}: ${date ? `${shortDate(date)} 完了` : "未完了"}`}
                      className="flex h-7 items-center justify-center rounded-sm font-bold"
                      style={date ? { backgroundColor: stage.color, color: "#0b0b0b" } : { backgroundColor: "#27272a" }}
                    >
                      {date ? shortDate(date) : ""}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <details className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <summary className="cursor-pointer text-sm font-black">表で見る（日ごとの記録）</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-right text-xs tabular-nums">
            <thead className="text-zinc-400">
              <tr>
                <th className="py-1 text-left">日付</th>
                <th>完了工程</th>
                {ACTIVITY_METRICS.map((m) => (
                  <th key={m.id}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((date) => {
                const row = byDay.find((r) => r.date === date)!;
                const stats = dailyStats[date] ?? EMPTY_DAY;
                return (
                  <tr key={date} className="border-t border-white/5 text-zinc-200">
                    <td className="py-1 text-left">{shortDate(date)}</td>
                    <td>{STAGES.reduce((sum, s) => sum + row[s.id], 0)}</td>
                    {ACTIVITY_METRICS.map((m) => (
                      <td key={m.id}>{m.toValue(stats).toLocaleString()}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  );
}
