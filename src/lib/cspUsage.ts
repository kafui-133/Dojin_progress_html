import type { CspState, CspUsageDay } from "@/types";

/** クリスタの状態の表示名 */
export const CSP_STATE_LABEL: Record<CspState, string> = {
  active: "作業中",
  idle: "放置中",
  background: "ほかのアプリ",
  closed: "未起動",
};

/** 使用時間の内訳の色（暗い背景用。カテゴリの1〜3番目、色覚の違いでも見分けられるよう検証済み） */
export const CSP_COLORS = {
  active: "#3987e5",
  idle: "#d95926",
  background: "#199e70",
};

/** ノンアクティブ = 放置 + ほかのアプリ */
export function inactiveMs(day: CspUsageDay): number {
  return day.idleMs + day.backgroundMs;
}

/** アクティブの割合（%）。起動していなければ null */
export function activeRatio(day: CspUsageDay): number | null {
  return day.runMs > 0 ? Math.round((day.activeMs / day.runMs) * 100) : null;
}

/** 時刻を「9:05」の形に */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
