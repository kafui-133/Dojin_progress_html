"use client";

import { ActivityChart, Card, CalendarHeatmap, type Period, StatTile } from "@/components/stats/parts";
import {
  ACTIVITY_METRICS,
  ILLUSTRATION_METRICS,
  activeDayCount,
  firstActiveDay,
  periodDays,
  recentAverage,
  shortDate,
  sumDaily,
} from "@/lib/statsData";
import { EMPTY_DAY, daysBetween, formatDuration, formatLength } from "@/store/useAppStore";
import type { Project } from "@/types";

const PEN_TIME = ACTIVITY_METRICS.find((m) => m.id === "strokeMs")!;

/** イラストのプロジェクトのグラフ（線の本数・長さ・ペン時間・やり直し） */
export default function IllustrationStats({ project, period, today }: { project: Project; period: Period; today: string }) {
  const { dailyStats } = project;
  const total = sumDaily(dailyStats);
  const todayStats = dailyStats[today] ?? EMPTY_DAY;
  const days = periodDays(period, firstActiveDay(dailyStats, null, today), today);
  const weekAvgMin = recentAverage(dailyStats, today, 7, PEN_TIME);
  const todayMin = PEN_TIME.toValue(todayStats);
  const undoRate = total.strokes > 0 ? (total.undos / total.strokes) * 100 : 0;
  const daysLeft = project.deadline ? daysBetween(today, project.deadline) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="総ペン時間" value={formatDuration(total.strokeMs)} sub={`${activeDayCount(dailyStats)} 日描いた`} />
        <StatTile label="線の本数" value={total.strokes.toLocaleString()} sub="本" />
        <StatTile label="線の総延長" value={formatLength(total.strokeLength)} sub="ペンが触れていた時間から計算" />
        <StatTile
          label="やり直し率"
          value={`${Math.round(undoRate)}%`}
          sub={`Ctrl+Z ${total.undos.toLocaleString()}回 / 線 ${total.strokes.toLocaleString()}本`}
        />
        <StatTile
          label="今日のペン時間"
          value={formatDuration(todayStats.strokeMs)}
          sub={`直近7日の平均 ${Math.round(weekAvgMin)}分/日`}
          status={todayMin > 0 ? (todayMin >= weekAvgMin ? "good" : "critical") : undefined}
        />
        <StatTile
          label="締め切りまで"
          value={daysLeft === null ? "—" : daysLeft >= 0 ? `${daysLeft}日` : `${-daysLeft}日超過`}
          sub={project.deadline ? `${shortDate(project.deadline)} まで` : "締め切りは任意です"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ActivityChart dailyStats={dailyStats} days={days} metrics={ILLUSTRATION_METRICS} />
        <Card title="お絵描きカレンダー" subtitle="このイラストに、毎日どれだけペンを動かしたか（濃いほど長い）">
          <CalendarHeatmap dailyStats={dailyStats} today={today} metric={PEN_TIME} weeks={20} />
        </Card>
      </div>

      <DailyTable dailyStats={dailyStats} days={days} />
    </div>
  );
}

function DailyTable({ dailyStats, days }: { dailyStats: Project["dailyStats"]; days: string[] }) {
  return (
    <details className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
      <summary className="cursor-pointer text-sm font-black">表で見る（日ごとの記録）</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-right text-xs tabular-nums">
          <thead className="text-zinc-400">
            <tr>
              <th className="py-1 text-left">日付</th>
              {ILLUSTRATION_METRICS.map((m) => (
                <th key={m.id}>
                  {m.label}（{m.unit}）
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((date) => (
              <tr key={date} className="border-t border-white/5 text-zinc-200">
                <td className="py-1 text-left">{shortDate(date)}</td>
                {ILLUSTRATION_METRICS.map((m) => (
                  <td key={m.id}>{m.toValue(dailyStats[date] ?? EMPTY_DAY).toLocaleString()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
