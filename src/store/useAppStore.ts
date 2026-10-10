import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ACTIONS } from "@/lib/actions";
import { now as clockNow } from "@/lib/clock";
import { IS_DESKTOP } from "@/lib/edition";
import { DEFAULT_FEMALE_CHARACTER, DEFAULT_MALE_CHARACTER } from "@/lib/geminiTts";
import { DEFAULT_BGM_FEVER, DEFAULT_BGM_NORMAL } from "@/lib/soundManager";
import { PAGE_COMPLETE_LINE, STAGE_BY_ID, getBoardStats, isPageComplete, resizePages } from "@/lib/stages";
import { DEFAULT_VOICEVOX_FEMALE, DEFAULT_VOICEVOX_MALE } from "@/lib/voicevox";
import { LINES } from "@/lib/voiceLines";
import type {
  AppSettings,
  CspUsageDay,
  CspUsageTick,
  ComboState,
  DailyStats,
  FlowState,
  Manuscript,
  PomodoroMode,
  PomodoroState,
  ProgressActionResult,
  ProgressActionType,
  Project,
  ProjectType,
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

// ---- ポモドーロ ----
export const FOCUS_MS = 25 * 60_000;
export const BREAK_MS = 5 * 60_000;
export const POMODORO_DURATION: Record<PomodoroMode, number> = { focus: FOCUS_MS, break: BREAK_MS };

export function getPomodoroRemaining(pomodoro: PomodoroState, now: number): number {
  return pomodoro.endAt !== null ? Math.max(0, pomodoro.endAt - now) : pomodoro.pausedRemaining;
}

/** 休憩中（休憩のタイマーが動いている）か。休憩中は BGM をゆったりにし、演出と ZONE を止める */
export function isResting(pomodoro: PomodoroState, now: number): boolean {
  return pomodoro.mode === "break" && pomodoro.endAt !== null && now < pomodoro.endAt;
}

export const DEFAULT_ZONE_DAILY_LIMIT = 3;
export const DEFAULT_REST_BGM = "lofi";

export const EMPTY_DAY: DailyStats = {
  exp: 0,
  strokes: 0,
  strokeMs: 0,
  strokeLength: 0,
  zones: 0,
  undos: 0,
  typedKeys: 0,
  keyOps: 0,
  saves: 0,
  pomodoros: 0,
};

export const EMPTY_CSP_DAY: CspUsageDay = {
  runMs: 0,
  activeMs: 0,
  idleMs: 0,
  backgroundMs: 0,
  firstAt: 0,
  lastAt: 0,
  hourlyActiveMs: Array.from({ length: 24 }, () => 0),
};

/** クリスタの使用時間を、ブリッジから届いた分だけ足す */
export function addCspUsage(usage: Record<string, CspUsageDay>, ticks: CspUsageTick[]): Record<string, CspUsageDay> {
  let next = usage;
  for (const tick of ticks) {
    if (tick.state === "closed" || !(tick.ms > 0)) continue;
    const at = new Date(tick.at);
    const date = toDateString(at);
    const prev = next[date] ?? EMPTY_CSP_DAY;
    const day: CspUsageDay = { ...prev, hourlyActiveMs: [...prev.hourlyActiveMs] };
    day.runMs += tick.ms;
    if (tick.state === "active") {
      day.activeMs += tick.ms;
      day.hourlyActiveMs[at.getHours()] += tick.ms;
    } else if (tick.state === "idle") day.idleMs += tick.ms;
    else day.backgroundMs += tick.ms;
    const startedAt = tick.at - tick.ms;
    day.firstAt = day.firstAt > 0 ? Math.min(day.firstAt, startedAt) : startedAt;
    day.lastAt = Math.max(day.lastAt, tick.at);
    next = { ...next, [date]: day };
  }
  return next;
}

/** 古い記録（項目が足りない日）を今の形にそろえる */
export function normalizeDailyStats(dailyStats: Record<string, Partial<DailyStats>> | undefined): Record<string, DailyStats> {
  return Object.fromEntries(Object.entries(dailyStats ?? {}).map(([date, day]) => [date, { ...EMPTY_DAY, ...day }]));
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

const initialPomodoro: PomodoroState = { mode: "focus", endAt: null, pausedRemaining: FOCUS_MS };

function emptyManuscript(pages: number): Manuscript {
  return { pages: resizePages([], pages), startedAt: 0 };
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createProjectData(input: {
  name: string;
  type: ProjectType;
  targetPages?: number;
  deadline?: string;
}): Project {
  const pages = input.type === "manga" ? clampPages(input.targetPages ?? DEFAULT_TARGET_PAGES) : 0;
  return {
    id: newId(),
    name: input.name.trim() || (input.type === "manga" ? "新しい原稿" : "新しいイラスト"),
    type: input.type,
    createdAt: Date.now(),
    targetPages: pages,
    deadline: input.deadline ?? "",
    manuscript: emptyManuscript(pages),
    dailyStats: {},
  };
}

function clampPages(pages: number): number {
  return Math.min(MAX_PAGES, Math.max(1, Math.floor(pages) || 1));
}

const initialProject = createProjectData({ name: "最初の原稿", type: "manga" });

const initialSettings: AppSettings = {
  isBgmOn: true,
  // 配布版はブリッジを内蔵しているので最初から ON
  isBridgeEnabled: IS_DESKTOP,
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
  restBgmId: DEFAULT_REST_BGM,
  zoneDailyLimit: DEFAULT_ZONE_DAILY_LIMIT,
  shurabaMode: false,
};

export const SETTING_KEYS = Object.keys(initialSettings) as (keyof AppSettings)[];

export interface AppState extends AppSettings {
  /** 全プロジェクト共通（EXP・コイン・連続日数・累計） */
  progress: UserProgress;
  combo: ComboState;
  /** 原稿・イラストのプロジェクト */
  projects: Project[];
  activeProjectId: string;
  /** 勢い（その日のうちは再読込しても続く。日付が変わったら 0 から） */
  flow: FlowState;
  pomodoro: PomodoroState;
  /** クリスタの使用時間（日付ごと。全プロジェクト共通） */
  cspUsage: Record<string, CspUsageDay>;
  /** 直近の進捗アクション結果。EffectOverlay がこれを監視して演出する */
  lastAction: (ProgressActionResult & { id: number }) | null;
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
  /** クリスタの使用時間を記録する */
  recordCspUsage: (ticks: CspUsageTick[]) => void;
  /** コンボ受付時間切れならコンボ・フィーバーを解除する（タイマー等から定期的に呼ぶ） */
  expireCombo: (now?: number) => void;
  setGoal: (goal: { targetPages?: number; deadline?: string }) => void;

  // ポモドーロ
  startTimer: (now?: number) => void;
  pauseTimer: (now?: number) => void;
  resetTimer: () => void;
  setTimerMode: (mode: PomodoroMode) => void;
  /** 時間が来たら作業⇄休憩を切り替える。切り替わったらその種類を返す */
  tickPomodoro: (now?: number) => "focus-done" | "break-done" | null;

  // プロジェクト
  createProject: (input: { name: string; type: ProjectType; targetPages?: number; deadline?: string }) => void;
  switchProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  /** 読み込んだプロジェクトを足す（同じ ID は置き換える） */
  mergeProjects: (projects: Project[]) => void;

  setBgmOn: (on: boolean) => void;
  setBridgeEnabled: (on: boolean) => void;
  setStrokeSoundOn: (on: boolean) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetProgress: () => void;
}

export function getActiveProject(state: Pick<AppState, "projects" | "activeProjectId">): Project {
  return state.projects.find((p) => p.id === state.activeProjectId) ?? state.projects[0];
}

/** 今使っているプロジェクト */
export function useActiveProject(): Project {
  return useAppStore((s) => getActiveProject(s));
}

/** 今日 ZONE に入った回数（全プロジェクト合計） */
export function getZonesToday(projects: Project[], today: string): number {
  return projects.reduce((sum, p) => sum + (p.dailyStats[today]?.zones ?? 0), 0);
}

/** 今 ZONE に入れるか（1日の上限・修羅場モード・休憩中） */
export function canEnterZone(state: AppState, now: number): boolean {
  if (isResting(state.pomodoro, now)) return false;
  if (state.shurabaMode) return true;
  return getZonesToday(state.projects, toDateString(new Date(now))) < state.zoneDailyLimit;
}

/** 日ごとの記録に足し込む */
function addDaily(
  dailyStats: Record<string, DailyStats>,
  today: string,
  patch: Partial<DailyStats>,
): Record<string, DailyStats> {
  const day = { ...EMPTY_DAY, ...dailyStats[today] };
  for (const [key, value] of Object.entries(patch) as [keyof DailyStats, number][]) day[key] += value;
  return { ...dailyStats, [today]: day };
}

/** 今のプロジェクトの日ごとの記録に足し込んだ projects を返す */
function addActiveDaily(state: AppState, today: string, patch: Partial<DailyStats>): Project[] {
  const active = getActiveProject(state);
  return state.projects.map((p) => (p.id === active.id ? { ...p, dailyStats: addDaily(p.dailyStats, today, patch) } : p));
}

/** 日付が変わっていたら勢いは 0 から */
function todaysFlow(flow: FlowState, now: number): FlowState {
  return flow.lastActivityAt > 0 && toDateString(new Date(flow.lastActivityAt)) === toDateString(new Date(now))
    ? flow
    : initialFlow;
}

/** 勢いを上げる（ZONE に入れないときは MAX 手前で止める） */
function gainFlow(flow: FlowState, now: number, gain: number, allowZone: boolean) {
  const level = getFlowLevel(flow, now);
  const wasInZone = isInZone(flow, now);
  const raw = Math.min(100, level + gain);
  const blocked = !wasInZone && !allowZone && raw >= 100;
  const newLevel = blocked ? 99 : raw;
  const inZone = wasInZone || newLevel >= 100;
  return { level, newLevel, wasInZone, inZone, blocked };
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
          projects?: Project[];
          daily?: Partial<DailyStats>;
        },
      ): ProgressActionResult => {
        const state = get();
        const { progress, combo } = state;

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

        const projects = input.projects ?? state.projects;
        set({
          progress: {
            ...progress,
            totalExp: progress.totalExp + expGained,
            coins: progress.coins + coinsGained,
            currentStreak,
            lastActiveDate: today,
          },
          combo: { comboCount, isFever, feverMultiplier, lastActionTime: now },
          projects: addActiveDaily({ ...state, projects }, today, { exp: expGained, ...input.daily }),
          lastAction: { ...result, id: now },
        });
        return result;
      };

      return {
        progress: initialProgress,
        combo: initialCombo,
        projects: [initialProject],
        activeProjectId: initialProject.id,
        flow: initialFlow,
        pomodoro: initialPomodoro,
        cspUsage: {},
        lastAction: null,
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
          const state = get();
          const project = getActiveProject(state);
          const page = project.manuscript.pages[pageIndex];
          if (project.type !== "manga" || !page || page.done[stageId] !== undefined) return null;

          const before = getBoardStats(project.manuscript);
          const pages = project.manuscript.pages.map((p, i) =>
            i === pageIndex ? { done: { ...p.done, [stageId]: now } } : p,
          );
          const manuscript: Manuscript = { pages, startedAt: project.manuscript.startedAt || now };
          const after = getBoardStats(manuscript);
          const stage = STAGE_BY_ID[stageId];

          return applyAction(now, {
            type: "stage",
            exp: stage.exp,
            cutIns: stage.cutIns,
            stage: { page: pageIndex, stage: stageId, pageComplete: isPageComplete(pages[pageIndex]) },
            goalReached: before.done < before.total && after.done === after.total,
            projects: state.projects.map((p) => (p.id === project.id ? { ...p, manuscript } : p)),
          });
        },

        undoStage: (pageIndex, stageId) =>
          set((state) => {
            const project = getActiveProject(state);
            const pages = project.manuscript.pages.map((p, i) => {
              if (i !== pageIndex) return p;
              const done = { ...p.done };
              delete done[stageId];
              return { done };
            });
            return {
              projects: state.projects.map((p) =>
                p.id === project.id ? { ...p, manuscript: { ...p.manuscript, pages } } : p,
              ),
            };
          }),

        recordStroke: ({ durationMs }, now = clockNow()) => {
          const state = get();
          const { progress, combo, lastStroke } = state;
          const flow = todaysFlow(state.flow, now);

          const lengthPx = strokeLengthFromDuration(durationMs);
          const contactMs = Math.min(Math.max(0, durationMs), STROKE_MAX_MS);
          const gain = FLOW_GAIN_BASE + Math.min(FLOW_GAIN_LENGTH_MAX, lengthPx * FLOW_GAIN_PER_PX);
          const { level, newLevel, wasInZone, inZone, blocked } = gainFlow(flow, now, gain, canEnterZone(state, now));
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
          const enteredZone = inZone && !wasInZone;

          const result: StrokeResult = {
            id: (lastStroke?.id ?? 0) + 1,
            expGained,
            coinsGained,
            multiplier,
            rush,
            sessionStrokes,
            inZone,
            enteredZone,
            milestone: sessionStrokes % STROKE_MILESTONE === 0,
            // 上限で止まったことは、MAX 手前に届いた最初の1回だけ知らせる
            zoneBlocked: blocked && level < 99,
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
            projects: addActiveDaily(state, today, {
              exp: expGained,
              strokes: 1,
              strokeMs: contactMs,
              strokeLength: lengthPx,
              zones: enteredZone ? 1 : 0,
            }),
            lastStroke: result,
          });

          return result;
        },

        recordUndo: (now = clockNow()) => {
          const state = get();
          const { progress, lastUndo } = state;
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
            flow: keepFlowAlive(todaysFlow(state.flow, now), now),
            projects: addActiveDaily(state, today, { exp: UNDO_EXP, undos: 1 }),
            lastUndo: result,
          });

          return result;
        },

        recordTyping: (keys, now = clockNow()) => {
          const state = get();
          const { progress, combo, lastTyping } = state;
          const flow = todaysFlow(state.flow, now);
          const count = Math.max(1, Math.round(keys));
          const { newLevel, wasInZone, inZone } = gainFlow(
            flow,
            now,
            Math.min(TYPING_FLOW_MAX, count * TYPING_FLOW_PER_KEY),
            canEnterZone(state, now),
          );
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
            projects: addActiveDaily(state, today, {
              exp: expGained,
              typedKeys: count,
              zones: inZone && !wasInZone ? 1 : 0,
            }),
            lastTyping: result,
          });

          return result;
        },

        recordKeyOps: (count, now = clockNow()) => {
          const state = get();
          const ops = Math.max(1, Math.round(count));
          const today = toDateString(new Date(now));
          set({
            progress: {
              ...state.progress,
              totalExp: state.progress.totalExp + ops * KEY_OP_EXP,
              totalKeyOps: state.progress.totalKeyOps + ops,
              currentStreak: getNextStreak(state.progress, today),
              lastActiveDate: today,
            },
            flow: keepFlowAlive(todaysFlow(state.flow, now), now),
            projects: addActiveDaily(state, today, { exp: ops * KEY_OP_EXP, keyOps: ops }),
          });
        },

        expireCombo: (now = clockNow()) => {
          const { combo } = get();
          if (combo.comboCount > 0 && !isComboAlive(combo.lastActionTime, now)) {
            set({ combo: { ...initialCombo } });
          }
        },

        setGoal: ({ targetPages, deadline }) =>
          set((state) => {
            const project = getActiveProject(state);
            const pages = targetPages !== undefined && project.type === "manga" ? clampPages(targetPages) : undefined;
            return {
              projects: state.projects.map((p) =>
                p.id !== project.id
                  ? p
                  : {
                      ...p,
                      ...(deadline !== undefined && { deadline }),
                      ...(pages !== undefined && {
                        targetPages: pages,
                        manuscript: { ...p.manuscript, pages: resizePages(p.manuscript.pages, pages) },
                      }),
                    },
              ),
            };
          }),

        startTimer: (now = clockNow()) =>
          set(({ pomodoro }) =>
            pomodoro.endAt !== null ? {} : { pomodoro: { ...pomodoro, endAt: now + pomodoro.pausedRemaining } },
          ),

        pauseTimer: (now = clockNow()) =>
          set(({ pomodoro }) =>
            pomodoro.endAt === null
              ? {}
              : { pomodoro: { ...pomodoro, endAt: null, pausedRemaining: Math.max(0, pomodoro.endAt - now) } },
          ),

        resetTimer: () =>
          set(({ pomodoro }) => ({
            pomodoro: { ...pomodoro, endAt: null, pausedRemaining: POMODORO_DURATION[pomodoro.mode] },
          })),

        setTimerMode: (mode) => set({ pomodoro: { mode, endAt: null, pausedRemaining: POMODORO_DURATION[mode] } }),

        tickPomodoro: (now = clockNow()) => {
          const state = get();
          const { pomodoro } = state;
          if (pomodoro.endAt === null || now < pomodoro.endAt) return null;
          if (pomodoro.mode === "focus") {
            // 作業が終わったら、そのまま休憩を始める（BGM はゆったり、演出はお休み）
            set({
              pomodoro: { mode: "break", endAt: now + BREAK_MS, pausedRemaining: BREAK_MS },
              projects: addActiveDaily(state, toDateString(new Date(now)), { pomodoros: 1 }),
              flow: { ...todaysFlow(state.flow, now), level: 0, inZone: false },
            });
            return "focus-done";
          }
          set({ pomodoro: { mode: "focus", endAt: null, pausedRemaining: FOCUS_MS } });
          return "break-done";
        },

        createProject: (input) =>
          set((state) => {
            const project = createProjectData(input);
            return { projects: [...state.projects, project], activeProjectId: project.id };
          }),

        switchProject: (id) =>
          set((state) => (state.projects.some((p) => p.id === id) ? { activeProjectId: id } : {})),

        renameProject: (id, name) =>
          set((state) => ({
            projects: state.projects.map((p) => (p.id === id && name.trim() ? { ...p, name: name.trim() } : p)),
          })),

        deleteProject: (id) =>
          set((state) => {
            if (state.projects.length <= 1) return {};
            const projects = state.projects.filter((p) => p.id !== id);
            return {
              projects,
              activeProjectId: state.activeProjectId === id ? projects[0].id : state.activeProjectId,
            };
          }),

        mergeProjects: (incoming) =>
          set((state) => {
            const byId = new Map(state.projects.map((p) => [p.id, p]));
            for (const project of incoming) byId.set(project.id, project);
            return { projects: [...byId.values()] };
          }),

        recordCspUsage: (ticks) =>
          set((state) => {
            const cspUsage = addCspUsage(state.cspUsage, ticks);
            return cspUsage === state.cspUsage ? {} : { cspUsage };
          }),

        setBgmOn: (on) => set({ isBgmOn: on }),
        setBridgeEnabled: (on) => set({ isBridgeEnabled: on }),
        setStrokeSoundOn: (on) => set({ isStrokeSoundOn: on }),
        updateSettings: (patch) => set(patch),

        /** デバッグ用: 今のプロジェクトの記録と全体の EXP などを消す */
        resetProgress: () =>
          set((state) => {
            const active = getActiveProject(state);
            return {
              progress: initialProgress,
              combo: initialCombo,
              projects: state.projects.map((p) =>
                p.id === active.id ? { ...p, manuscript: emptyManuscript(p.targetPages), dailyStats: {} } : p,
              ),
              flow: initialFlow,
              pomodoro: initialPomodoro,
              lastAction: null,
              lastStroke: null,
              lastUndo: null,
              lastTyping: null,
            };
          }),
      };
    },
    {
      name: "syuraba-booster",
      storage: createJSONStorage(() => localStorage),
      version: 6,
      migrate: (persisted, version) => {
        const state = { ...(persisted as Record<string, unknown>) } as Partial<AppState> & {
          manuscript?: Manuscript;
          dailyStats?: Record<string, DailyStats>;
        };
        // v0 では BGM が手動 ON 方式で初期値 OFF だったため、自動再生方式に合わせて ON にする
        if (version < 1) state.isBgmOn = true;
        // 後から増えた進捗の項目を 0 で補う
        state.progress = { ...initialProgress, ...state.progress };
        // v5 でプロジェクトを導入。それまでの原稿・日ごとの記録は「最初の原稿」になる
        if (!state.projects?.length) {
          const pages = clampPages(state.progress.targetPages);
          const project: Project = {
            ...createProjectData({ name: "最初の原稿", type: "manga", targetPages: pages }),
            deadline: state.progress.deadline ?? "",
            manuscript: state.manuscript
              ? { ...state.manuscript, pages: resizePages(state.manuscript.pages, pages) }
              : emptyManuscript(pages),
            dailyStats: normalizeDailyStats(state.dailyStats),
          };
          state.projects = [project];
          state.activeProjectId = project.id;
        }
        state.projects = state.projects.map((p) => ({ ...p, dailyStats: normalizeDailyStats(p.dailyStats) }));
        // v6 でクリスタの使用時間を追加
        state.cspUsage ??= {};
        delete state.manuscript;
        delete state.dailyStats;
        return state as AppState;
      },
      // 演出トリガーは再読込時に引き継がない
      partialize: (state) => ({
        progress: state.progress,
        combo: state.combo,
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        flow: state.flow,
        pomodoro: state.pomodoro,
        cspUsage: state.cspUsage,
        ...Object.fromEntries(SETTING_KEYS.map((key) => [key, state[key]])),
      }),
    },
  ),
);
