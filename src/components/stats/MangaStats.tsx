"use client";

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
import { ActivityChart, COLORS, Card, ChartTooltip, LegendItem, type Period, StatTile, axisProps } from "@/components/stats/parts";
import { STAGES, getBoardStats } from "@/lib/stages";
import {
  ACTIVITY_METRICS,
  buildBurnup,
  completionsByDay,
  firstActiveDay,
  periodDays,
  shortDate,
} from "@/lib/statsData";
import { EMPTY_DAY, daysBetween, formatDuration, getEffectiveStreak, toDateString, useAppStore } from "@/store/useAppStore";
import type { Project } from "@/types";


/** マンガのプロジェクトの進捗グラフ（ページ × 工程・締め切りまでのペース） */
export default function MangaStats({ project, period, today }: { project: Project; period: Period; today: string }) {
  const { manuscript, dailyStats } = project;
  const progress = useAppStore((s) => s.progress);
  const board = getBoardStats(manuscript);
  const burnup = buildBurnup(manuscript, project.deadline, today);
  const daysLeft = project.deadline ? daysBetween(today, project.deadline) : null;
  const remaining = board.total - board.done;
  const neededPace = daysLeft !== null && daysLeft >= 0 && remaining > 0 ? remaining / (daysLeft + 1) : null;
  const onTrack = burnup.forecast !== null && project.deadline ? burnup.forecast <= project.deadline : null;

  const days = periodDays(period, firstActiveDay(dailyStats, manuscript, today), today);
  const byDay = completionsByDay(manuscript, days);
  const todayStats = dailyStats[today] ?? EMPTY_DAY;
  const todayStages = byDay.at(-1);
  const todayStageCount = todayStages ? STAGES.reduce((sum, s) => sum + todayStages[s.id], 0) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="全体の進捗" value={`${Math.floor(board.percent)}%`} sub={`${board.done} / ${board.total} 工程`} />
        <StatTile label="完成ページ" value={`${board.pagesComplete}`} sub={`/ ${manuscript.pages.length} ページ`} />
        <StatTile
          label="締め切りまで"
          value={daysLeft === null ? "—" : daysLeft >= 0 ? `${daysLeft}日` : `${-daysLeft}日超過`}
          sub={project.deadline ? `${shortDate(project.deadline)} 入稿` : "締め切り未設定"}
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
            {project.deadline && <LegendItem color={COLORS.ideal} label="理想ペース" shape="line" />}
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burnup.points} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                <YAxis {...axisProps} allowDecimals={false} domain={[0, burnup.total]} />
                <ReferenceLine y={burnup.total} stroke={COLORS.grid} />
                {project.deadline && (
                  <ReferenceLine
                    x={shortDate(project.deadline)}
                    stroke={COLORS.axis}
                    label={{ value: "締め切り", fill: COLORS.axis, fontSize: 11, position: "insideTopRight" }}
                  />
                )}
                <Tooltip
                  cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
                  content={(props) => <ChartTooltip {...props} unit=" 工程" />}
                />
                {project.deadline && (
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

        <ActivityChart dailyStats={dailyStats} days={days} metrics={ACTIVITY_METRICS} />
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
    </div>
  );
}
