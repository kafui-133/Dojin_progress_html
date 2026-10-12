import type { Manuscript, ManuscriptPage, StageId } from "@/types";

/** 1ページあたりの工程（この順番で進める想定） */
export interface StageDefinition {
  id: StageId;
  label: string;
  short: string;
  emoji: string;
  /**
   * 工程を表す色（ボード・グラフ共通）。暗い背景向けに色覚の違いでも見分けられる順で検証済み。
   * 文字の色には使わず、色の付いた印・塗りに使う（塗りの中の文字は暗い色）
   */
  color: string;
  exp: number;
  cutIns: string[];
}

export const STAGES: StageDefinition[] = [
  {
    id: "paneling",
    label: "コマ割り",
    short: "割",
    emoji: "📐",
    color: "#3987e5",
    exp: 10_000,
    cutIns: ["神コマ割り！", "構図が決まった！", "ネーム突破！"],
  },
  {
    id: "dialogue",
    label: "セリフ入れ",
    short: "セ",
    emoji: "💬",
    color: "#d95926",
    exp: 10_000,
    cutIns: ["名ゼリフ誕生！", "キャラが喋った！", "エモさ限界突破！"],
  },
  {
    id: "sketch",
    label: "下書き",
    short: "下",
    emoji: "✏️",
    color: "#199e70",
    exp: 10_000,
    cutIns: ["下書き完了！", "アタリが取れた！", "線が見えた！"],
  },
  {
    id: "inking",
    label: "ペン入れ",
    short: "ペ",
    emoji: "🖋️",
    color: "#c98500",
    exp: 10_000,
    cutIns: ["神作画！", "ペン入れ完了！", "作画崩壊回避！"],
  },
  {
    id: "finishing",
    label: "仕上げ",
    short: "仕",
    emoji: "✨",
    color: "#d55181",
    exp: 10_000,
    cutIns: ["仕上げ完了！", "トーン職人！", "完成度MAX！"],
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageDefinition>;

export const PAGE_COMPLETE_LINE = "1ページ完成！！";

export function emptyPage(): ManuscriptPage {
  return { done: {} };
}

/** ページ数に合わせて増減する（減らすときは後ろのページを消す） */
export function resizePages(pages: ManuscriptPage[], count: number): ManuscriptPage[] {
  if (pages.length === count) return pages;
  if (pages.length > count) return pages.slice(0, count);
  return [...pages, ...Array.from({ length: count - pages.length }, emptyPage)];
}

export function isPageComplete(page: ManuscriptPage): boolean {
  return STAGES.every((stage) => page.done[stage.id] !== undefined);
}

export interface BoardStats {
  done: number;
  total: number;
  percent: number;
  pagesComplete: number;
  byStage: Record<StageId, number>;
}

export function getBoardStats(manuscript: Manuscript): BoardStats {
  const byStage = Object.fromEntries(STAGES.map((s) => [s.id, 0])) as Record<StageId, number>;
  let pagesComplete = 0;
  for (const page of manuscript.pages) {
    for (const stage of STAGES) if (page.done[stage.id] !== undefined) byStage[stage.id]++;
    if (isPageComplete(page)) pagesComplete++;
  }
  const done = Object.values(byStage).reduce((a, b) => a + b, 0);
  const total = manuscript.pages.length * STAGES.length;
  return { done, total, percent: total > 0 ? (done / total) * 100 : 0, pagesComplete, byStage };
}

/** 消すと記録が失われるページ（指定ページ数より後ろで、何か完了しているもの） */
export function pagesWithDataBeyond(pages: ManuscriptPage[], count: number): number {
  return pages.slice(count).filter((page) => Object.keys(page.done).length > 0).length;
}
