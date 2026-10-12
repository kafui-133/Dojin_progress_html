"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLORS, Card, ChartTooltip, LegendItem, type Period, StatTile, axisProps } from "@/components/stats/parts";
import { CSP_COLORS, activeRatio, formatClock, inactiveMs } from "@/lib/cspUsage";
import { addDays, dateRange, mergeDailyStats, periodDays, shortDate } from "@/lib/statsData";
import { EMPTY_CSP_DAY, EMPTY_DAY, formatDuration } from "@/store/useAppStore";
import type { CspUsageDay, Project } from "@/types";

const toHours = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;

function sumUsage(days: CspUsageDay[]): CspUsageDay {
  const total: CspUsageDay = { ...EMPTY_CSP_DAY, hourlyActiveMs: [...EMPTY_CSP_DAY.hourlyActiveMs] };
  for (const day of days) {
    total.runMs += day.runMs;
    total.activeMs += day.activeMs;
    total.idleMs += day.idleMs;
    total.backgroundMs += day.backgroundMs;
    day.hourlyActiveMs.forEach((ms, h) => (total.hourlyActiveMs[h] += ms));
  }
  return total;
}

/** クリスタの起動時間・アクティブ時間・ノンアクティブ時間 */
export default function CspUsageStats({
  usage,
  projects,
  period,
  today,
}: {
  usage: Record<string, CspUsageDay>;
  projects: Project[];
  period: Period;
  today: string;
}) {
  const recorded = Object.keys(usage).sort();
  const days = periodDays(period, recorded[0] && recorded[0] < today ? recorded[0] : today, today);
  const dayOf = (date: string) => usage[date] ?? EMPTY_CSP_DAY;
  const todayUsage = dayOf(today);
  const total = sumUsage(days.map(dayOf));
  const usedDays = days.filter((d) => dayOf(d).runMs > 0).length;
  const ratio = activeRatio(total);
  const todayRatio = activeRatio(todayUsage);

  // アクティブ時間のうち、実際にペンが動いていた割合（全プロジェクト合計のペン時間）
  const merged = mergeDailyStats(projects);
  const penMs = days.reduce((sum, d) => sum + (merged[d] ?? EMPTY_DAY).strokeMs, 0);
  const penRatio = total.activeMs > 0 ? Math.round((penMs / total.activeMs) * 100) : null;

  const thisWeek = sumUsage(dateRange(addDays(today, -6), today).map(dayOf)).activeMs;
  const lastWeek = sumUsage(dateRange(addDays(today, -13), addDays(today, -7)).map(dayOf)).activeMs;

  const rows = days.map((date) => {
    const day = dayOf(date);
    return {
      label: shortDate(date),
      active: toHours(day.activeMs),
      idle: toHours(day.idleMs),
      background: toHours(day.backgroundMs),
    };
  });
  // 時間帯ごとの、記録のある日1日あたりのアクティブ時間（分）
  const hourly = total.hourlyActiveMs.map((ms, hour) => ({
    label: `${hour}時`,
    minutes: usedDays > 0 ? Math.round(ms / 60_000 / usedDays) : 0,
  }));
  const peakHour = total.activeMs > 0 ? hourly.reduce((best, h, i) => (h.minutes > hourly[best].minutes ? i : best), 0) : null;
  const tableDays = [...days].reverse().filter((d) => dayOf(d).runMs > 0);

  if (recorded.length === 0) {
    return (
      <Card title="クリスタの使用時間" subtitle="まだ記録がありません">
        <p className="text-sm text-zinc-300">
          クリスタ連携を ON にしてクリスタを起動すると、10秒ごとに「起動しているか」「前面で操作しているか」を記録します。
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="今日の起動時間"
          value={formatDuration(todayUsage.runMs)}
          sub={todayUsage.runMs > 0 ? `${formatClock(todayUsage.firstAt)}〜${formatClock(todayUsage.lastAt)}` : "まだ起動していません"}
        />
        <StatTile
          label="今日のアクティブ"
          value={formatDuration(todayUsage.activeMs)}
          sub={todayRatio !== null ? `起動時間の ${todayRatio}%` : undefined}
        />
        <StatTile
          label="今日のノンアクティブ"
          value={formatDuration(inactiveMs(todayUsage))}
          sub={`放置 ${formatDuration(todayUsage.idleMs)}・ほかのアプリ ${formatDuration(todayUsage.backgroundMs)}`}
        />
        <StatTile
          label="今週のアクティブ"
          value={formatDuration(thisWeek)}
          sub={`先週 ${formatDuration(lastWeek)}`}
          status={thisWeek === 0 && lastWeek === 0 ? undefined : thisWeek >= lastWeek ? "good" : "critical"}
        />
        <StatTile
          label="期間のアクティブ率"
          value={ratio !== null ? `${ratio}%` : "—"}
          sub={penRatio !== null ? `アクティブ中にペンが動いていた割合 ${penRatio}%` : `${usedDays}日 起動`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          title="日ごとの起動時間（内訳）"
          subtitle={`積み上げの高さが起動時間（時間）。期間の合計: 起動 ${formatDuration(total.runMs)}・アクティブ ${formatDuration(total.activeMs)}・ノンアクティブ ${formatDuration(inactiveMs(total))}`}
        >
          <div className="flex flex-wrap gap-3">
            <LegendItem color={CSP_COLORS.active} label="アクティブ" shape="rect" />
            <LegendItem color={CSP_COLORS.idle} label="放置（前面だが操作なし）" shape="rect" />
            <LegendItem color={CSP_COLORS.background} label="ほかのアプリ" shape="rect" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={16} />
                <YAxis {...axisProps} allowDecimals />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  content={(props) => <ChartTooltip {...props} unit=" 時間" />}
                />
                <Bar dataKey="active" name="アクティブ" stackId="csp" fill={CSP_COLORS.active} stroke={COLORS.surface} strokeWidth={2} maxBarSize={24} />
                <Bar dataKey="idle" name="放置" stackId="csp" fill={CSP_COLORS.idle} stroke={COLORS.surface} strokeWidth={2} maxBarSize={24} />
                <Bar
                  dataKey="background"
                  name="ほかのアプリ"
                  stackId="csp"
                  fill={CSP_COLORS.background}
                  stroke={COLORS.surface}
                  strokeWidth={2}
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="よく描いている時間帯"
          subtitle={
            peakHour !== null
              ? `起動した日1日あたりのアクティブ時間（分）。いちばん多いのは ${peakHour}時台`
              : "起動した日1日あたりのアクティブ時間（分）"
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval={2} />
                <YAxis {...axisProps} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  content={(props) => <ChartTooltip {...props} unit=" 分" />}
                />
                <Bar dataKey="minutes" name="アクティブ" fill={CSP_COLORS.active} maxBarSize={16} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card
        title="日ごとの記録"
        subtitle="アクティブ = クリスタが前面にあり、3分以内に操作している時間。ノンアクティブ = 起動しているがそれ以外（放置・ほかのアプリ）"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-zinc-400">
              <tr>
                <th className="py-1 text-left">日付</th>
                <th className="text-right">起動</th>
                <th className="text-right">アクティブ</th>
                <th className="text-right">放置</th>
                <th className="text-right">ほかのアプリ</th>
                <th className="text-right">アクティブ率</th>
                <th className="text-right">最初</th>
                <th className="text-right">最後</th>
              </tr>
            </thead>
            <tbody>
              {tableDays.map((date) => {
                const day = dayOf(date);
                return (
                  <tr key={date} className="border-t border-white/5 text-zinc-200">
                    <td className="py-1.5 text-left">{shortDate(date)}</td>
                    <td className="text-right">{formatDuration(day.runMs)}</td>
                    <td className="text-right">{formatDuration(day.activeMs)}</td>
                    <td className="text-right">{formatDuration(day.idleMs)}</td>
                    <td className="text-right">{formatDuration(day.backgroundMs)}</td>
                    <td className="text-right">{activeRatio(day)}%</td>
                    <td className="text-right">{formatClock(day.firstAt)}</td>
                    <td className="text-right">{formatClock(day.lastAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tableDays.length === 0 && <p className="py-2 text-sm text-zinc-400">この期間は起動していません。</p>}
        </div>
      </Card>
    </div>
  );
}
