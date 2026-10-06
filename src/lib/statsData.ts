import { STAGES } from "@/lib/stages";
import { EMPTY_DAY, PX_TO_M, daysBetween, toDateString } from "@/store/useAppStore";
import type { DailyStats, Manuscript, Project, ProjectType, StageId } from "@/types";

/** グラフ用の集計（進捗グラフのページで使う） */

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return toDateString(new Date(y, m - 1, d + days));
}

export function dateRange(from: string, to: string): string[] {
  const days = daysBetween(from, to);
  return Array.from({ length: Math.max(0, days) + 1 }, (_, i) => addDays(from, i));
}

export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

/** 完了した工程（日付つき）の一覧 */
function completions(manuscript: Manuscript): { date: string; stage: StageId }[] {
  return manuscript.pages.flatMap((page) =>
    STAGES.flatMap((stage) => {
      const at = page.done[stage.id];
      return at === undefined ? [] : [{ date: toDateString(new Date(at)), stage: stage.id }];
    }),
  );
}

export interface BurnupPoint {
  date: string;
  label: string;
  /** その日までに完了した工程数（今日より先は無し） */
  actual?: number;
  /** 締め切りに間に合う理想のペース */
  ideal?: number;
}

export interface Burnup {
  points: BurnupPoint[];
  total: number;
  done: number;
  start: string;
  /** 今のペースで続けた場合に全部終わる日（ペースが出ていなければ null） */
  forecast: string | null;
  /** 1日あたりの平均（始めてから今日まで） */
  pacePerDay: number;
}

export function buildBurnup(manuscript: Manuscript, deadline: string, today: string): Burnup {
  const items = completions(manuscript);
  const total = manuscript.pages.length * STAGES.length;
  const done = items.length;
  const firstDone = items.map((c) => c.date).sort()[0];
  const startedAt = manuscript.startedAt ? toDateString(new Date(manuscript.startedAt)) : today;
  const start = [startedAt, firstDone ?? startedAt, today].sort()[0];

  const elapsedDays = daysBetween(start, today) + 1;
  const pacePerDay = done / Math.max(1, elapsedDays);
  const forecast = done >= total ? today : pacePerDay > 0 ? addDays(today, Math.ceil((total - done) / pacePerDay)) : null;

  const end = [today, deadline || today, forecast && forecast < addDays(today, 365) ? forecast : today].sort().at(-1)!;
  const perDay = new Map<string, number>();
  for (const c of items) perDay.set(c.date, (perDay.get(c.date) ?? 0) + 1);

  const idealDays = deadline ? Math.max(1, daysBetween(start, deadline)) : 0;
  let cumulative = 0;
  const points = dateRange(start, end).map((date) => {
    cumulative += perDay.get(date) ?? 0;
    const point: BurnupPoint = { date, label: shortDate(date) };
    if (date <= today) point.actual = cumulative;
    if (deadline && date <= deadline) point.ideal = Math.round((total * daysBetween(start, date)) / idealDays * 10) / 10;
    return point;
  });

  return { points, total, done, start, forecast, pacePerDay };
}

export type StageCounts = Record<StageId, number>;

/** 日ごとの、工程別の完了数（積み上げ棒グラフ用） */
export function completionsByDay(manuscript: Manuscript, days: string[]): ({ date: string; label: string } & StageCounts)[] {
  const rows = new Map(
    days.map((date) => [
      date,
      { date, label: shortDate(date), ...(Object.fromEntries(STAGES.map((s) => [s.id, 0])) as StageCounts) },
    ]),
  );
  for (const c of completions(manuscript)) {
    const row = rows.get(c.date);
    if (row) row[c.stage]++;
  }
  return [...rows.values()];
}

export type ActivityMetric = keyof DailyStats;

export interface MetricDefinition {
  id: ActivityMetric;
  label: string;
  unit: string;
  /** 表示用に値を変換する（ms → 分など） */
  toValue: (day: DailyStats) => number;
}

export const ACTIVITY_METRICS: MetricDefinition[] = [
  { id: "strokeMs", label: "ペン時間", unit: "分", toValue: (d) => Math.round((d.strokeMs / 60_000) * 10) / 10 },
  { id: "strokes", label: "線の本数", unit: "本", toValue: (d) => d.strokes },
  { id: "strokeLength", label: "線の長さ", unit: "m", toValue: (d) => Math.round(d.strokeLength * PX_TO_M * 10) / 10 },
  { id: "typedKeys", label: "セリフ打鍵", unit: "打", toValue: (d) => d.typedKeys },
  { id: "undos", label: "やり直し", unit: "回", toValue: (d) => d.undos },
  { id: "keyOps", label: "キー操作", unit: "回", toValue: (d) => d.keyOps },
  { id: "pomodoros", label: "ポモドーロ", unit: "回", toValue: (d) => d.pomodoros },
  { id: "zones", label: "ZONE", unit: "回", toValue: (d) => d.zones },
  { id: "exp", label: "獲得 EXP", unit: "EXP", toValue: (d) => d.exp },
];

export function activityByDay(dailyStats: Record<string, DailyStats>, days: string[], metric: MetricDefinition) {
  return days.map((date) => ({ date, label: shortDate(date), value: metric.toValue(dailyStats[date] ?? EMPTY_DAY) }));
}

/** イラストでは使わない指標（セリフ入力はマンガ向け） */
export const ILLUSTRATION_METRICS = ACTIVITY_METRICS.filter((m) => m.id !== "typedKeys");

/** 記録のある最初の日（全期間の表示用） */
export function firstActiveDay(dailyStats: Record<string, DailyStats>, manuscript: Manuscript | null, today: string): string {
  const candidates = [
    ...Object.keys(dailyStats),
    ...(manuscript ? completions(manuscript).map((c) => c.date) : []),
    today,
  ].sort();
  return candidates[0];
}

/** 期間（直近 n 日 / 全期間）の日付の一覧 */
export function periodDays(period: number | "all", firstDay: string, today: string): string[] {
  return dateRange(period === "all" ? firstDay : addDays(today, -(period - 1)), today);
}

/** 複数プロジェクトの日ごとの記録を足し合わせる（統合のお絵描き履歴） */
export function mergeDailyStats(projects: Project[]): Record<string, DailyStats> {
  const merged: Record<string, DailyStats> = {};
  for (const project of projects) {
    for (const [date, day] of Object.entries(project.dailyStats)) {
      const sum = { ...EMPTY_DAY, ...merged[date] };
      for (const key of Object.keys(EMPTY_DAY) as (keyof DailyStats)[]) sum[key] += day[key] ?? 0;
      merged[date] = sum;
    }
  }
  return merged;
}

/** 日ごとの値を、マンガ・イラスト別に（積み上げ棒グラフ用） */
export function byTypeDaily(projects: Project[], days: string[], metric: MetricDefinition) {
  const byType = (type: ProjectType) => mergeDailyStats(projects.filter((p) => p.type === type));
  const manga = byType("manga");
  const illustration = byType("illustration");
  return days.map((date) => ({
    date,
    label: shortDate(date),
    manga: metric.toValue(manga[date] ?? EMPTY_DAY),
    illustration: metric.toValue(illustration[date] ?? EMPTY_DAY),
  }));
}

/** 記録のある日数 */
export function activeDayCount(dailyStats: Record<string, DailyStats>): number {
  return Object.values(dailyStats).filter((d) => d.strokes > 0 || d.typedKeys > 0 || d.pomodoros > 0).length;
}

/** 合計 */
export function sumDaily(dailyStats: Record<string, DailyStats>): DailyStats {
  const total = { ...EMPTY_DAY };
  for (const day of Object.values(dailyStats)) {
    for (const key of Object.keys(EMPTY_DAY) as (keyof DailyStats)[]) total[key] += day[key] ?? 0;
  }
  return total;
}

/** 直近 n 日の1日あたり平均（記録の無い日も 0 として数える） */
export function recentAverage(dailyStats: Record<string, DailyStats>, today: string, days: number, metric: MetricDefinition): number {
  const values = dateRange(addDays(today, -(days - 1)), today).map((d) => metric.toValue(dailyStats[d] ?? EMPTY_DAY));
  return values.reduce((a, b) => a + b, 0) / days;
}

/** 曜日が月曜はじまりの週ごとのカレンダー（ヒートマップ用）。古い週から順 */
export function calendarWeeks(today: string, weeks: number): string[][] {
  const [y, m, d] = today.split("-").map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // 月曜 = 0
  const lastMonday = addDays(today, -dow);
  return Array.from({ length: weeks }, (_, w) => {
    const monday = addDays(lastMonday, -(weeks - 1 - w) * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  });
}
