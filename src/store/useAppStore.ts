import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ACTIONS } from "@/lib/actions";
import { now as clockNow } from "@/lib/clock";
import type {
  ComboState,
  ProgressActionResult,
  ProgressActionType,
  UserProgress,
} from "@/types";

/** 1アクションあたりの基本獲得コイン（EXP と進むページ数は lib/actions.ts で定義） */
export const BASE_COINS_PER_ACTION = 100;

/** 前回アクションからこの時間以内ならコンボ継続 */
export const COMBO_WINDOW_MS = 15 * 60 * 1000;

/** コンボ数に応じた倍率の段階（コンボ数の降順） */
export const FEVER_TIERS = [
  { minCombo: 5, multiplier: 2.0 },
  { minCombo: 3, multiplier: 1.5 },
] as const;
export const FEVER_START_COMBO = 3;
/** このコンボ数から BGM を自動再生する（連続で押したら鳴る） */
export const BGM_START_COMBO = 2;

export const DEFAULT_TARGET_PAGES = 24;

export function getFeverMultiplier(comboCount: number): number {
  return FEVER_TIERS.find((tier) => comboCount >= tier.minCombo)?.multiplier ?? 1.0;
}

export function isComboAlive(lastActionTime: number, now: number): boolean {
  return lastActionTime > 0 && now - lastActionTime <= COMBO_WINDOW_MS;
}

/** ローカルタイムゾーンでの YYYY-MM-DD */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** 今日アクションした場合の連続日数 */
export function getNextStreak(progress: UserProgress, today: string): number {
  if (!progress.lastActiveDate) return 1;
  const diff = daysBetween(progress.lastActiveDate, today);
  if (diff <= 0) return Math.max(progress.currentStreak, 1);
  if (diff === 1) return progress.currentStreak + 1;
  return 1;
}

/** 表示用の連続日数（昨日より前で途切れていれば0） */
export function getEffectiveStreak(progress: UserProgress, today: string): number {
  if (!progress.lastActiveDate) return 0;
  return daysBetween(progress.lastActiveDate, today) <= 1 ? progress.currentStreak : 0;
}

/** 次にボタンを押したときにかかる倍率 */
export function getNextMultiplier(combo: ComboState, now: number): number {
  return getFeverMultiplier(isComboAlive(combo.lastActionTime, now) ? combo.comboCount + 1 : 1);
}

export function getProgressPercent(progress: UserProgress): number {
  if (progress.targetPages <= 0) return 0;
  return Math.min(100, (progress.completedPages / progress.targetPages) * 100);
}

const initialProgress: UserProgress = {
  totalExp: 0,
  coins: 0,
  currentStreak: 0,
  lastActiveDate: "",
  targetPages: DEFAULT_TARGET_PAGES,
  completedPages: 0,
  deadline: "",
};

const initialCombo: ComboState = {
  comboCount: 0,
  isFever: false,
  feverMultiplier: 1.0,
  lastActionTime: 0,
};

interface AppState {
  progress: UserProgress;
  combo: ComboState;
  /** 直近の進捗アクション結果。EffectOverlay がこれを監視して演出する */
  lastAction: (ProgressActionResult & { id: number }) | null;
  /** BGM を鳴らしてよいか（ON でも連続タップ中のみ鳴る） */
  isBgmOn: boolean;

  recordProgress: (type: ProgressActionType, now?: number) => ProgressActionResult;
  /** コンボ受付時間切れならコンボ・フィーバーを解除する（タイマー等から定期的に呼ぶ） */
  expireCombo: (now?: number) => void;
  setGoal: (goal: { targetPages?: number; deadline?: string }) => void;
  setBgmOn: (on: boolean) => void;
  resetProgress: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      progress: initialProgress,
      combo: initialCombo,
      lastAction: null,
      isBgmOn: true,

      recordProgress: (type, now = clockNow()) => {
        const { progress, combo } = get();

        const comboCount = isComboAlive(combo.lastActionTime, now) ? combo.comboCount + 1 : 1;
        const feverMultiplier = getFeverMultiplier(comboCount);
        const isFever = comboCount >= FEVER_START_COMBO;

        const expGained = Math.round(ACTIONS[type].exp * feverMultiplier);
        const coinsGained = Math.round(BASE_COINS_PER_ACTION * feverMultiplier);
        const completedPages = progress.completedPages + ACTIONS[type].pages;
        const today = toDateString(new Date(now));
        const currentStreak = getNextStreak(progress, today);

        const result: ProgressActionResult = {
          type,
          expGained,
          coinsGained,
          comboCount,
          feverMultiplier,
          isFever,
          enteredFever: isFever && !combo.isFever,
          multiplierUp: feverMultiplier > combo.feverMultiplier,
          goalReached:
            progress.targetPages > 0 &&
            progress.completedPages < progress.targetPages &&
            completedPages >= progress.targetPages,
          currentStreak,
        };

        set({
          progress: {
            ...progress,
            totalExp: progress.totalExp + expGained,
            coins: progress.coins + coinsGained,
            completedPages,
            currentStreak,
            lastActiveDate: today,
          },
          combo: { comboCount, isFever, feverMultiplier, lastActionTime: now },
          lastAction: { ...result, id: now },
        });

        return result;
      },

      expireCombo: (now = clockNow()) => {
        const { combo } = get();
        if (combo.comboCount > 0 && !isComboAlive(combo.lastActionTime, now)) {
          set({ combo: { ...initialCombo } });
        }
      },

      setGoal: ({ targetPages, deadline }) =>
        set((state) => ({
          progress: {
            ...state.progress,
            ...(targetPages !== undefined && { targetPages: Math.max(1, Math.floor(targetPages)) }),
            ...(deadline !== undefined && { deadline }),
          },
        })),

      setBgmOn: (on) => set({ isBgmOn: on }),

      resetProgress: () =>
        set({ progress: initialProgress, combo: initialCombo, lastAction: null }),
    }),
    {
      name: "syuraba-booster",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // v0 では BGM が手動 ON 方式で初期値 OFF だったため、自動再生方式に合わせて ON にする
      migrate: (persisted, version) => {
        const state = persisted as Partial<AppState>;
        return version < 1 ? { ...state, isBgmOn: true } : state;
      },
      // 演出トリガーは再読込時に再生しない
      partialize: ({ progress, combo, isBgmOn }) => ({ progress, combo, isBgmOn }),
    },
  ),
);
