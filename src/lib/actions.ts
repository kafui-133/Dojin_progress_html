import type { ProgressActionType } from "@/types";

export interface ActionDefinition {
  label: string;
  emoji: string;
  /** 倍率をかける前の獲得EXP */
  exp: number;
  /** 進む completedPages の単位数 */
  pages: number;
  /** 演出のカットインで出すセリフ候補 */
  cutIns: string[];
}

/** 進捗ボタンの定義。獲得量やセリフはここで調整する */
export const ACTIONS: Record<ProgressActionType, ActionDefinition> = {
  paneling: {
    label: "1ページコマ割った！",
    emoji: "📐",
    exp: 10_000,
    pages: 1,
    cutIns: ["神コマ割り！", "構図が決まった！", "ネーム突破！"],
  },
  panel: {
    label: "1コマ描いた！",
    emoji: "🔥",
    exp: 10_000,
    pages: 1,
    cutIns: ["神作画！", "ペン入れ完了！", "作画崩壊回避！"],
  },
  balloon: {
    label: "吹き出し置いた！",
    emoji: "💬",
    exp: 10_000,
    pages: 1,
    cutIns: ["吹き出し配置完了！", "読みやすさ爆上げ！", "ナイス配置！"],
  },
  dialogue: {
    label: "セリフ書いた！",
    emoji: "🗯️",
    exp: 10_000,
    pages: 1,
    cutIns: ["名ゼリフ誕生！", "キャラが喋った！", "エモさ限界突破！"],
  },
  text: {
    label: "500文字書いた！",
    emoji: "✍️",
    exp: 10_000,
    pages: 1,
    cutIns: ["修羅場突破！", "筆が乗ってる！", "名文誕生！"],
  },
};

/** 漫画向け・小説向けのボタンの並び */
export const ACTION_GROUPS: { title: string; types: ProgressActionType[] }[] = [
  { title: "漫画", types: ["paneling", "panel", "balloon", "dialogue"] },
  { title: "小説・文章", types: ["text"] },
];
