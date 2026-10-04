import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ACTIONS } from "@/lib/actions";
import { now as clockNow } from "@/lib/clock";
import type {
  ComboState,
  FlowState,
  ProgressActionResult,
  ProgressActionType,
  StrokeResult,
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

// ---- クリスタ連携: 線1本ごとの報酬と「勢い」 ----
export const STROKE_EXP = 100;
export const STROKE_COINS = 1;
/** 線1本で溜まる勢い（20本で MAX） */
export const FLOW_GAIN = 5;
/** 手を止めてから勢いが減り始めるまで */
export const FLOW_GRACE_MS = 5000;
/** 減り始めてからの1秒あたりの減少量 */
export const FLOW_DECAY_PER_SEC = 2;
/** ゾーン中はこの勢いを下回るまで続く */
export const ZONE_EXIT_LEVEL = 40;
export const ZONE_MULTIPLIER = 2.0;
/** この間隔以内に次の線を引けば RUSH が続く（効果音の音階も上がり続ける） */
export const RUSH_GAP_MS = 8000;
/** 勢いが続いている間にこの本数を超えたら BGM を鳴らす */
export const FLOW_BGM_STROKES = 3;
export const STROKE_MILESTONE = 50;

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

/** 現在の勢い (0-100) */
export function getFlowLevel(flow: FlowState, now: number): number {
  const idleSec = Math.max(0, now - flow.lastStrokeAt - FLOW_GRACE_MS) / 1000;
  return Math.max(0, flow.level - FLOW_DECAY_PER_SEC * idleSec);
}

export function isInZone(flow: FlowState, now: number): boolean {
  return flow.inZone && getFlowLevel(flow, now) >= ZONE_EXIT_LEVEL;
}

/** 描き続けていて BGM を鳴らす状態か */
export function isFlowBgmActive(flow: FlowState, now: number): boolean {
  return getFlowLevel(flow, now) > 0 && flow.sessionStrokes >= FLOW_BGM_STROKES;
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
  totalStrokes: 0,
};

const initialFlow: FlowState = {
  level: 0,
  lastStrokeAt: 0,
  rush: 0,
  sessionStrokes: 0,
  inZone: false,
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
  /** クリスタ連携の勢い（保存しない） */
  flow: FlowState;
  /** 直近の線の結果。線の演出がこれを監視する */
  lastStroke: StrokeResult | null;
  /** BGM を鳴らしてよいか（ON でも連続タップ中・描き続けている間のみ鳴る） */
  isBgmOn: boolean;
  /** クリスタ連携ブリッジに接続するか */
  isBridgeEnabled: boolean;
  /** 線を引くたびの効果音 */
  isStrokeSoundOn: boolean;

  recordProgress: (type: ProgressActionType, now?: number) => ProgressActionResult;
  /** クリスタで線を1本引いた */
  recordStroke: (stroke: { durationMs: number; lengthPx: number }, now?: number) => StrokeResult;
  /** コンボ受付時間切れならコンボ・フィーバーを解除する（タイマー等から定期的に呼ぶ） */
  expireCombo: (now?: number) => void;
  setGoal: (goal: { targetPages?: number; deadline?: string }) => void;
  setBgmOn: (on: boolean) => void;
  setBridgeEnabled: (on: boolean) => void;
  setStrokeSoundOn: (on: boolean) => void;
  resetProgress: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      progress: initialProgress,
      combo: initialCombo,
      lastAction: null,
      flow: initialFlow,
      lastStroke: null,
      isBgmOn: true,
      isBridgeEnabled: false,
      isStrokeSoundOn: true,

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

      recordStroke: ({ durationMs, lengthPx }, now = clockNow()) => {
        const { progress, combo, flow, lastStroke } = get();

        const level = getFlowLevel(flow, now);
        const wasInZone = isInZone(flow, now);
        const newLevel = Math.min(100, level + FLOW_GAIN);
        const inZone = wasInZone || newLevel >= 100;
        const rush = flow.lastStrokeAt > 0 && now - flow.lastStrokeAt <= RUSH_GAP_MS ? flow.rush + 1 : 1;
        const sessionStrokes = (level > 0 ? flow.sessionStrokes : 0) + 1;

        // ゾーンの倍率とボタン/保存のコンボ倍率のうち、高い方をかける
        const comboMultiplier = isComboAlive(combo.lastActionTime, now) ? combo.feverMultiplier : 1;
        const multiplier = Math.max(inZone ? ZONE_MULTIPLIER : 1, comboMultiplier);
        const expGained = Math.round(STROKE_EXP * multiplier);
        const coinsGained = Math.round(STROKE_COINS * multiplier);
        const today = toDateString(new Date(now));

        const result: StrokeResult = {
          id: (lastStroke?.id ?? 0) + 1,
          expGained,
          coinsGained,
          multiplier,
          rush,
          sessionStrokes,
          inZone,
          enteredZone: inZone && !wasInZone,
          milestone: sessionStrokes % STROKE_MILESTONE === 0,
          durationMs,
          lengthPx,
        };

        set({
          progress: {
            ...progress,
            totalExp: progress.totalExp + expGained,
            coins: progress.coins + coinsGained,
            totalStrokes: progress.totalStrokes + 1,
            currentStreak: getNextStreak(progress, today),
            lastActiveDate: today,
          },
          flow: { level: newLevel, lastStrokeAt: now, rush, sessionStrokes, inZone },
          lastStroke: result,
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
      setBridgeEnabled: (on) => set({ isBridgeEnabled: on }),
      setStrokeSoundOn: (on) => set({ isStrokeSoundOn: on }),

      resetProgress: () =>
        set({
          progress: initialProgress,
          combo: initialCombo,
          lastAction: null,
          flow: initialFlow,
          lastStroke: null,
        }),
    }),
    {
      name: "syuraba-booster",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted, version) => {
        const state = { ...(persisted as Partial<AppState>) };
        // v0 では BGM が手動 ON 方式で初期値 OFF だったため、自動再生方式に合わせて ON にする
        if (version < 1) state.isBgmOn = true;
        // v2 で累計の線の本数を追加
        if (version < 2 && state.progress) state.progress = { ...state.progress, totalStrokes: 0 };
        return state;
      },
      // 演出トリガーと勢いは再読込時に引き継がない
      partialize: ({ progress, combo, isBgmOn, isBridgeEnabled, isStrokeSoundOn }) => ({
        progress,
        combo,
        isBgmOn,
        isBridgeEnabled,
        isStrokeSoundOn,
      }),
    },
  ),
);
