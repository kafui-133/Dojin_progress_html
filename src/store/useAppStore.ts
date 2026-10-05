import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ACTIONS } from "@/lib/actions";
import { now as clockNow } from "@/lib/clock";
import { DEFAULT_FEMALE_CHARACTER, DEFAULT_MALE_CHARACTER } from "@/lib/geminiTts";
import { DEFAULT_BGM_FEVER, DEFAULT_BGM_NORMAL } from "@/lib/soundManager";
import { PAGE_COMPLETE_LINE, STAGE_BY_ID, getBoardStats, isPageComplete, resizePages } from "@/lib/stages";
import { DEFAULT_VOICEVOX_FEMALE, DEFAULT_VOICEVOX_MALE } from "@/lib/voicevox";
import { LINES } from "@/lib/voiceLines";
import type {
  AppSettings,
  ComboState,
  DailyStats,
  FlowState,
  Manuscript,
  ProgressActionResult,
  ProgressActionType,
  StageId,
  StrokeResult,
  TypingResult,
  UndoResult,
  UserProgress,
} from "@/types";

/** 1アクションあたりの基本獲得コイン（EXP は lib/actions.ts・lib/stages.ts で定義） */
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
export const MAX_PAGES = 200;

// ---- クリスタ連携: 線1本ごとの報酬と「勢い」 ----
/**
 * 線の長さは、ペンが触れていた時間から決める（1秒 ≒ 16cm）。
 * 実際に動かした距離ではなく「描いていた時間」を長さとして積み上げる。
 */
export const STROKE_PX_PER_MS = 0.6;
/** これより長く触れていても同じ扱い（置きっぱなしで稼げないように） */
export const STROKE_MAX_MS = 4000;
/** 線1本の EXP = 基本 + 長さ(px) × 係数。長く描いた線ほど多くもらえる */
export const STROKE_BASE_EXP = 50;
export const STROKE_EXP_PER_PX = 0.1;
export const STROKE_COINS = 1;
/** 線1本で溜まる勢い = 基本 + 長さに応じた分（平均的な線で20本ほどで MAX） */
export const FLOW_GAIN_BASE = 3;
export const FLOW_GAIN_PER_PX = 1 / 250;
export const FLOW_GAIN_LENGTH_MAX = 4;
/** やり直し（Ctrl+Z）1回の EXP。試行錯誤もこだわりとして少しだけ評価する */
export const UNDO_EXP = 20;
export const UNDO_MILESTONE = 25;
/** セリフ入力: 1打鍵の EXP と勢い（連続した打鍵のまとまりごとに記録） */
export const TYPING_EXP_PER_KEY = 8;
export const TYPING_FLOW_PER_KEY = 0.4;
export const TYPING_FLOW_MAX = 8;
export const TYPING_MILESTONE = 200;
/** キー操作（ショートカット）1回の EXP */
export const KEY_OP_EXP = 2;
/** 長さの区切り（この長さごとに演出） */
export const LENGTH_MILESTONE_M = 5;
/** 画面上の px をおおよその実寸（m）に直す係数（96dpi 換算） */
export const PX_TO_M = 0.0254 / 96;
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

export function daysBetween(from: string, to: string): number {
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
  const idleSec = Math.max(0, now - flow.lastActivityAt - FLOW_GRACE_MS) / 1000;
  return Math.max(0, flow.level - FLOW_DECAY_PER_SEC * idleSec);
}

export function isInZone(flow: FlowState, now: number): boolean {
  return flow.inZone && getFlowLevel(flow, now) >= ZONE_EXIT_LEVEL;
}

/** 描き続けていて BGM を鳴らす状態か */
export function isFlowBgmActive(flow: FlowState, now: number): boolean {
  return getFlowLevel(flow, now) > 0 && flow.sessionStrokes >= FLOW_BGM_STROKES;
}

/** ペンが触れていた時間から線の長さ（px）を出す */
export function strokeLengthFromDuration(durationMs: number): number {
  return Math.min(Math.max(0, durationMs), STROKE_MAX_MS) * STROKE_PX_PER_MS;
}

/** 線の長さ（px）を「12cm」「3.4m」のような表示にする */
export function formatLength(px: number): string {
  const m = px * PX_TO_M;
  if (m < 1) return `${Math.round(m * 100)}cm`;
  if (m < 1000) return `${m.toFixed(1)}m`;
  return `${(m / 1000).toFixed(2)}km`;
}

/** 時間（ms）を「12分」「1時間5分」のような表示にする */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return `${Math.round(ms / 1000)}秒`;
  if (totalMin < 60) return `${totalMin}分`;
  return `${Math.floor(totalMin / 60)}時間${totalMin % 60}分`;
}

/** 原稿全体の進み具合（ページ × 工程のうち完了した割合） */
export function getProgressPercent(manuscript: Manuscript): number {
  return getBoardStats(manuscript).percent;
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
  totalStrokeLength: 0,
  totalUndos: 0,
  totalStrokeMs: 0,
  totalTypedKeys: 0,
  totalKeyOps: 0,
};

const initialFlow: FlowState = {
  level: 0,
  lastActivityAt: 0,
  rush: 0,
  sessionStrokes: 0,
  sessionLengthPx: 0,
  inZone: false,
};

const initialCombo: ComboState = {
  comboCount: 0,
  isFever: false,
  feverMultiplier: 1.0,
  lastActionTime: 0,
};

export const EMPTY_DAY: DailyStats = {
  exp: 0,
  strokes: 0,
  strokeMs: 0,
  undos: 0,
  typedKeys: 0,
  keyOps: 0,
  saves: 0,
  pomodoros: 0,
};

function initialManuscript(pages = DEFAULT_TARGET_PAGES): Manuscript {
  return { pages: resizePages([], pages), startedAt: 0 };
}

const initialSettings: AppSettings = {
  isBgmOn: true,
  isBridgeEnabled: false,
  isStrokeSoundOn: true,
  bgmNormalId: DEFAULT_BGM_NORMAL,
  bgmFeverId: DEFAULT_BGM_FEVER,
  voiceMode: "female",
  femaleVoiceUri: "",
  maleVoiceUri: "",
  ttsEngine: "browser",
  geminiFemaleCharacter: DEFAULT_FEMALE_CHARACTER,
  geminiMaleCharacter: DEFAULT_MALE_CHARACTER,
  voicevoxFemaleStyle: DEFAULT_VOICEVOX_FEMALE,
  voicevoxMaleStyle: DEFAULT_VOICEVOX_MALE,
};

interface AppState extends AppSettings {
  progress: UserProgress;
  combo: ComboState;
  /** ページ × 工程の完了記録 */
  manuscript: Manuscript;
  /** 日ごとの記録（YYYY-MM-DD → 記録） */
  dailyStats: Record<string, DailyStats>;
  /** 直近の進捗アクション結果。EffectOverlay がこれを監視して演出する */
  lastAction: (ProgressActionResult & { id: number }) | null;
  /** クリスタ連携の勢い（保存しない） */
  flow: FlowState;
  /** 直近の線の結果。線の演出がこれを監視する */
  lastStroke: StrokeResult | null;
  /** 直近のやり直しの結果 */
  lastUndo: UndoResult | null;
  /** 直近のセリフ入力の結果 */
  lastTyping: TypingResult | null;

  recordProgress: (type: ProgressActionType, now?: number) => ProgressActionResult;
  /** ページの工程を完了にする */
  completeStage: (page: number, stage: StageId, now?: number) => ProgressActionResult | null;
  /** ページの工程の完了を取り消す */
  undoStage: (page: number, stage: StageId) => void;
  /** クリスタで線を1本引いた */
  recordStroke: (stroke: { durationMs: number }, now?: number) => StrokeResult;
  /** クリスタでやり直し（Ctrl+Z）した */
  recordUndo: (now?: number) => UndoResult;
  /** クリスタでセリフを入力した（連続した打鍵のまとまり） */
  recordTyping: (keys: number, now?: number) => TypingResult;
  /** クリスタでキー操作（ショートカット）をした */
  recordKeyOps: (count: number, now?: number) => void;
  /** ポモドーロを1回終えた */
  recordPomodoro: (now?: number) => void;
  /** コンボ受付時間切れならコンボ・フィーバーを解除する（タイマー等から定期的に呼ぶ） */
  expireCombo: (now?: number) => void;
  setGoal: (goal: { targetPages?: number; deadline?: string }) => void;
  setBgmOn: (on: boolean) => void;
  setBridgeEnabled: (on: boolean) => void;
  setStrokeSoundOn: (on: boolean) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetProgress: () => void;
}

/** 今日の記録に足し込んだ dailyStats を返す */
function addDaily(
  dailyStats: Record<string, DailyStats>,
  today: string,
  patch: Partial<DailyStats>,
): Record<string, DailyStats> {
  const day = { ...EMPTY_DAY, ...dailyStats[today] };
  for (const [key, value] of Object.entries(patch) as [keyof DailyStats, number][]) day[key] += value;
  return { ...dailyStats, [today]: day };
}

/** 勢いを上げる（ゾーン判定込み） */
function gainFlow(flow: FlowState, now: number, gain: number) {
  const level = getFlowLevel(flow, now);
  const wasInZone = isInZone(flow, now);
  const newLevel = Math.min(100, level + gain);
  const inZone = wasInZone || newLevel >= 100;
  return { level, newLevel, wasInZone, inZone };
}

/** 勢いは減らさず（増やしもせず）、手が動いていることだけ記録する */
function keepFlowAlive(flow: FlowState, now: number): FlowState {
  return flow.lastActivityAt > 0
    ? { ...flow, level: getFlowLevel(flow, now), inZone: isInZone(flow, now), lastActivityAt: now }
    : flow;
}

/** ゾーンの倍率とボタン/保存のコンボ倍率のうち、高い方 */
function activityMultiplier(combo: ComboState, inZone: boolean, now: number): number {
  const comboMultiplier = isComboAlive(combo.lastActionTime, now) ? combo.feverMultiplier : 1;
  return Math.max(inZone ? ZONE_MULTIPLIER : 1, comboMultiplier);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      /**
       * ボタン・保存・工程の完了に共通の処理（コンボ・EXP・コイン・連続日数）。
       * 演出は lastAction を見て EffectOverlay が出す。
       */
      const applyAction = (
        now: number,
        input: {
          type: ProgressActionResult["type"];
          exp: number;
          cutIns: string[];
          stage?: ProgressActionResult["stage"];
          goalReached?: boolean;
          manuscript?: Manuscript;
          daily?: Partial<DailyStats>;
        },
      ): ProgressActionResult => {
        const { progress, combo, dailyStats } = get();

        const comboCount = isComboAlive(combo.lastActionTime, now) ? combo.comboCount + 1 : 1;
        const feverMultiplier = getFeverMultiplier(comboCount);
        const isFever = comboCount >= FEVER_START_COMBO;
        const expGained = Math.round(input.exp * feverMultiplier);
        const coinsGained = Math.round(BASE_COINS_PER_ACTION * feverMultiplier);
        const today = toDateString(new Date(now));
        const currentStreak = getNextStreak(progress, today);
        const enteredFever = isFever && !combo.isFever;
        const goalReached = input.goalReached ?? false;

        let cutIn = input.cutIns[now % input.cutIns.length];
        if (input.stage?.pageComplete) cutIn = PAGE_COMPLETE_LINE;
        if (enteredFever) cutIn = LINES.fever;
        if (goalReached) cutIn = LINES.goal;

        const result: ProgressActionResult = {
          type: input.type,
          cutIn,
          stage: input.stage,
          expGained,
          coinsGained,
          comboCount,
          feverMultiplier,
          isFever,
          enteredFever,
          multiplierUp: feverMultiplier > combo.feverMultiplier,
          goalReached,
          currentStreak,
        };

        set({
          progress: {
            ...progress,
            totalExp: progress.totalExp + expGained,
            coins: progress.coins + coinsGained,
            currentStreak,
            lastActiveDate: today,
          },
          combo: { comboCount, isFever, feverMultiplier, lastActionTime: now },
          dailyStats: addDaily(dailyStats, today, { exp: expGained, ...input.daily }),
          ...(input.manuscript && { manuscript: input.manuscript }),
          lastAction: { ...result, id: now },
        });
        return result;
      };

      return {
        progress: initialProgress,
        combo: initialCombo,
        manuscript: initialManuscript(),
        dailyStats: {},
        lastAction: null,
        flow: initialFlow,
        lastStroke: null,
        lastUndo: null,
        lastTyping: null,
        ...initialSettings,

        recordProgress: (type, now = clockNow()) =>
          applyAction(now, {
            type,
            exp: ACTIONS[type].exp,
            cutIns: ACTIONS[type].cutIns,
            daily: type === "save" ? { saves: 1 } : undefined,
          }),

        completeStage: (pageIndex, stageId, now = clockNow()) => {
          const { manuscript } = get();
          const page = manuscript.pages[pageIndex];
          if (!page || page.done[stageId] !== undefined) return null;

          const before = getBoardStats(manuscript);
          const pages = manuscript.pages.map((p, i) =>
            i === pageIndex ? { done: { ...p.done, [stageId]: now } } : p,
          );
          const next: Manuscript = {
            pages,
            startedAt: manuscript.startedAt || now,
          };
          const after = getBoardStats(next);
          const stage = STAGE_BY_ID[stageId];

          return applyAction(now, {
            type: "stage",
            exp: stage.exp,
            cutIns: stage.cutIns,
            stage: { page: pageIndex, stage: stageId, pageComplete: isPageComplete(pages[pageIndex]) },
            goalReached: before.done < before.total && after.done === after.total,
            manuscript: next,
          });
        },

        undoStage: (pageIndex, stageId) =>
          set(({ manuscript }) => ({
            manuscript: {
              ...manuscript,
              pages: manuscript.pages.map((p, i) => {
                if (i !== pageIndex) return p;
                const done = { ...p.done };
                delete done[stageId];
                return { done };
              }),
            },
          })),

        recordStroke: ({ durationMs }, now = clockNow()) => {
          const { progress, combo, flow, lastStroke, dailyStats } = get();

          const lengthPx = strokeLengthFromDuration(durationMs);
          const contactMs = Math.min(Math.max(0, durationMs), STROKE_MAX_MS);
          const gain = FLOW_GAIN_BASE + Math.min(FLOW_GAIN_LENGTH_MAX, lengthPx * FLOW_GAIN_PER_PX);
          const { level, newLevel, wasInZone, inZone } = gainFlow(flow, now, gain);
          const rush = flow.lastActivityAt > 0 && now - flow.lastActivityAt <= RUSH_GAP_MS ? flow.rush + 1 : 1;
          const sessionContinues = level > 0;
          const sessionStrokes = (sessionContinues ? flow.sessionStrokes : 0) + 1;
          const prevSessionLength = sessionContinues ? flow.sessionLengthPx : 0;
          const sessionLengthPx = prevSessionLength + lengthPx;
          const prevMeters = Math.floor((prevSessionLength * PX_TO_M) / LENGTH_MILESTONE_M);
          const meters = Math.floor((sessionLengthPx * PX_TO_M) / LENGTH_MILESTONE_M);

          const multiplier = activityMultiplier(combo, inZone, now);
          const expGained = Math.round((STROKE_BASE_EXP + lengthPx * STROKE_EXP_PER_PX) * multiplier);
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
            lengthMilestoneM: meters > prevMeters ? meters * LENGTH_MILESTONE_M : null,
            durationMs,
            lengthPx,
          };

          set({
            progress: {
              ...progress,
              totalExp: progress.totalExp + expGained,
              coins: progress.coins + coinsGained,
              totalStrokes: progress.totalStrokes + 1,
              totalStrokeLength: progress.totalStrokeLength + lengthPx,
              totalStrokeMs: progress.totalStrokeMs + contactMs,
              currentStreak: getNextStreak(progress, today),
              lastActiveDate: today,
            },
            flow: { level: newLevel, lastActivityAt: now, rush, sessionStrokes, sessionLengthPx, inZone },
            dailyStats: addDaily(dailyStats, today, { exp: expGained, strokes: 1, strokeMs: contactMs }),
            lastStroke: result,
          });

          return result;
        },

        recordUndo: (now = clockNow()) => {
          const { progress, flow, lastUndo, dailyStats } = get();
          const totalUndos = progress.totalUndos + 1;
          const today = toDateString(new Date(now));
          const result: UndoResult = {
            id: (lastUndo?.id ?? 0) + 1,
            expGained: UNDO_EXP,
            totalUndos,
            milestone: totalUndos % UNDO_MILESTONE === 0,
          };

          set({
            progress: {
              ...progress,
              totalExp: progress.totalExp + UNDO_EXP,
              totalUndos,
              currentStreak: getNextStreak(progress, today),
              lastActiveDate: today,
            },
            // 直している間も手は動いているので、勢いは減らさない（増やしもしない）
            flow: keepFlowAlive(flow, now),
            dailyStats: addDaily(dailyStats, today, { exp: UNDO_EXP, undos: 1 }),
            lastUndo: result,
          });

          return result;
        },

        recordTyping: (keys, now = clockNow()) => {
          const { progress, combo, flow, lastTyping, dailyStats } = get();
          const count = Math.max(1, Math.round(keys));
          const { newLevel, inZone } = gainFlow(flow, now, Math.min(TYPING_FLOW_MAX, count * TYPING_FLOW_PER_KEY));
          const multiplier = activityMultiplier(combo, inZone, now);
          const expGained = Math.round(count * TYPING_EXP_PER_KEY * multiplier);
          const totalTypedKeys = progress.totalTypedKeys + count;
          const today = toDateString(new Date(now));

          const result: TypingResult = {
            id: (lastTyping?.id ?? 0) + 1,
            keys: count,
            expGained,
            totalTypedKeys,
            milestone:
              Math.floor(totalTypedKeys / TYPING_MILESTONE) > Math.floor(progress.totalTypedKeys / TYPING_MILESTONE),
            inZone,
          };

          set({
            progress: {
              ...progress,
              totalExp: progress.totalExp + expGained,
              totalTypedKeys,
              currentStreak: getNextStreak(progress, today),
              lastActiveDate: today,
            },
            // セリフ入力も描いているのと同じく勢いになる（線の本数・RUSH は増えない）
            flow: { ...flow, level: newLevel, inZone, lastActivityAt: now },
            dailyStats: addDaily(dailyStats, today, { exp: expGained, typedKeys: count }),
            lastTyping: result,
          });

          return result;
        },

        recordKeyOps: (count, now = clockNow()) => {
          const { progress, flow, dailyStats } = get();
          const ops = Math.max(1, Math.round(count));
          const today = toDateString(new Date(now));
          set({
            progress: {
              ...progress,
              totalExp: progress.totalExp + ops * KEY_OP_EXP,
              totalKeyOps: progress.totalKeyOps + ops,
              currentStreak: getNextStreak(progress, today),
              lastActiveDate: today,
            },
            flow: keepFlowAlive(flow, now),
            dailyStats: addDaily(dailyStats, today, { exp: ops * KEY_OP_EXP, keyOps: ops }),
          });
        },

        recordPomodoro: (now = clockNow()) =>
          set(({ dailyStats }) => ({
            dailyStats: addDaily(dailyStats, toDateString(new Date(now)), { pomodoros: 1 }),
          })),

        expireCombo: (now = clockNow()) => {
          const { combo } = get();
          if (combo.comboCount > 0 && !isComboAlive(combo.lastActionTime, now)) {
            set({ combo: { ...initialCombo } });
          }
        },

        setGoal: ({ targetPages, deadline }) =>
          set((state) => {
            const pages =
              targetPages !== undefined ? Math.min(MAX_PAGES, Math.max(1, Math.floor(targetPages))) : undefined;
            return {
              progress: {
                ...state.progress,
                ...(pages !== undefined && { targetPages: pages }),
                ...(deadline !== undefined && { deadline }),
              },
              ...(pages !== undefined && {
                manuscript: { ...state.manuscript, pages: resizePages(state.manuscript.pages, pages) },
              }),
            };
          }),

        setBgmOn: (on) => set({ isBgmOn: on }),
        setBridgeEnabled: (on) => set({ isBridgeEnabled: on }),
        setStrokeSoundOn: (on) => set({ isStrokeSoundOn: on }),
        updateSettings: (patch) => set(patch),

        resetProgress: () =>
          set((state) => ({
            progress: { ...initialProgress, targetPages: state.progress.targetPages, deadline: state.progress.deadline },
            combo: initialCombo,
            manuscript: initialManuscript(state.progress.targetPages),
            dailyStats: {},
            lastAction: null,
            flow: initialFlow,
            lastStroke: null,
            lastUndo: null,
            lastTyping: null,
          })),
      };
    },
    {
      name: "syuraba-booster",
      storage: createJSONStorage(() => localStorage),
      version: 4,
      migrate: (persisted, version) => {
        const state = { ...(persisted as Partial<AppState>) };
        // v0 では BGM が手動 ON 方式で初期値 OFF だったため、自動再生方式に合わせて ON にする
        if (version < 1) state.isBgmOn = true;
        // 後から増えた進捗の項目を 0 で補う
        state.progress = { ...initialProgress, ...state.progress };
        // v4 でページ × 工程の記録と日ごとの記録を追加
        const pages = state.progress.targetPages;
        state.manuscript = state.manuscript
          ? { ...state.manuscript, pages: resizePages(state.manuscript.pages, pages) }
          : initialManuscript(pages);
        state.dailyStats ??= {};
        return state;
      },
      // 演出トリガーと勢いは再読込時に引き継がない
      partialize: (state) => ({
        progress: state.progress,
        combo: state.combo,
        manuscript: state.manuscript,
        dailyStats: state.dailyStats,
        isBgmOn: state.isBgmOn,
        isBridgeEnabled: state.isBridgeEnabled,
        isStrokeSoundOn: state.isStrokeSoundOn,
        bgmNormalId: state.bgmNormalId,
        bgmFeverId: state.bgmFeverId,
        voiceMode: state.voiceMode,
        femaleVoiceUri: state.femaleVoiceUri,
        maleVoiceUri: state.maleVoiceUri,
        ttsEngine: state.ttsEngine,
        geminiFemaleCharacter: state.geminiFemaleCharacter,
        geminiMaleCharacter: state.geminiMaleCharacter,
        voicevoxFemaleStyle: state.voicevoxFemaleStyle,
        voicevoxMaleStyle: state.voicevoxMaleStyle,
      }),
    },
  ),
);
