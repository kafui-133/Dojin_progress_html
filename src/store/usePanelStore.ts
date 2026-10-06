import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { now as clockNow } from "@/lib/clock";
import { getActiveProject, toDateString, useAppStore } from "@/store/useAppStore";
import type { StrokeResult } from "@/types";

/**
 * ライブ集中線パネルの中身。進捗グラフのページに移っても・再読込しても残り、
 * 日付が変わったとき（またはプロジェクトを切り替えたとき）に新しいコマになる。
 */

export interface InkLine {
  kind: "line";
  angle: number;
  /** 線の先端が届く位置（中心からの距離 / 短辺の半分） */
  reach: number;
  width: number;
  color: string;
  lengthPx: number;
  /** 描かれた時刻（ms, Date.now） */
  bornAt: number;
  /** やり直しで巻き戻し中なら、その開始時刻 */
  removedAt?: number;
}

/** セリフ入力で置かれる吹き出し */
export interface InkBalloon {
  kind: "balloon";
  /** 中心の位置（キャンバスに対する割合） */
  x: number;
  y: number;
  /** 大きさ（短辺の半分に対する割合）。打った数が多いほど大きい */
  size: number;
  /** 中の文字の行数 */
  rows: number;
  bornAt: number;
  removedAt?: number;
}

export type InkItem = InkLine | InkBalloon;

export const GROW_MS = 220;
export const RETRACT_MS = 260;
const MAX_ITEMS = 400;
/** 保存したあと、完成の演出を見せてから新しいコマにするまで */
const PANEL_CLEAR_DELAY_MS = 1200;

function lineFromStroke(stroke: StrokeResult, bornAt: number): InkLine {
  const reach = 0.85 - Math.min(0.6, stroke.lengthPx / 1500) + (Math.random() - 0.5) * 0.16;
  return {
    kind: "line",
    angle: Math.random() * Math.PI * 2,
    reach: Math.min(0.9, Math.max(0.18, reach)),
    width: 2 + Math.min(7, stroke.durationMs / 120),
    color: stroke.inZone ? (Math.random() < 0.5 ? "#f59e0b" : "#d946ef") : "#111111",
    lengthPx: stroke.lengthPx,
    bornAt,
  };
}

function balloonFromTyping(keys: number, bornAt: number): InkBalloon {
  return {
    kind: "balloon",
    x: 0.2 + Math.random() * 0.6,
    y: 0.2 + Math.random() * 0.6,
    size: 0.12 + Math.min(0.18, keys * 0.006),
    rows: Math.min(4, 1 + Math.floor(keys / 10)),
    bornAt,
  };
}

interface PanelState {
  /** このパネルの日付とプロジェクト。違っていたら新しいコマから */
  day: string;
  projectId: string;
  items: InkItem[];
  lineCount: number;
  lengthPx: number;
  undos: number;
  typed: number;
  completedPanels: number;
}

const emptyPanel: Pick<PanelState, "items" | "lineCount" | "lengthPx" | "undos" | "typed"> = {
  items: [],
  lineCount: 0,
  lengthPx: 0,
  undos: 0,
  typed: 0,
};

export const usePanelStore = create<PanelState>()(
  persist(
    (): PanelState => ({ day: "", projectId: "", completedPanels: 0, ...emptyPanel }),
    { name: "syuraba-booster-panel", storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

/** 巻き戻しが終わった線を取り除く */
function prune(items: InkItem[], now: number): InkItem[] {
  return items.filter((item) => item.removedAt === undefined || now - item.removedAt < RETRACT_MS);
}

/** 日付・プロジェクトが変わっていたら新しいパネルにする */
export function ensureCurrentPanel(now = clockNow()): void {
  const day = toDateString(new Date(now));
  const projectId = useAppStore.getState().activeProjectId;
  const panel = usePanelStore.getState();
  if (panel.day !== day || panel.projectId !== projectId) {
    usePanelStore.setState({ day, projectId, completedPanels: 0, ...emptyPanel });
  }
}

/** アプリの記録（線・やり直し・セリフ・保存）をパネルに反映し続ける。解除関数を返す */
export function startPanelTracking(): () => void {
  ensureCurrentPanel();
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  const unsubscribe = useAppStore.subscribe((state, prev) => {
    // 演出の時刻は実時間、日付の判定はアプリの時刻（デバッグで日付を進められる）
    const now = Date.now();
    if (state.activeProjectId !== prev.activeProjectId) ensureCurrentPanel();

    const stroke = state.lastStroke;
    if (stroke && stroke !== prev.lastStroke) {
      ensureCurrentPanel();
      usePanelStore.setState((p) => ({
        items: [...prune(p.items, now), lineFromStroke(stroke, now)].slice(-MAX_ITEMS),
        lineCount: p.lineCount + 1,
        lengthPx: p.lengthPx + stroke.lengthPx,
      }));
    }

    const typing = state.lastTyping;
    if (typing && typing !== prev.lastTyping) {
      ensureCurrentPanel();
      usePanelStore.setState((p) => ({
        items: [...prune(p.items, now), balloonFromTyping(typing.keys, now)].slice(-MAX_ITEMS),
        typed: p.typed + typing.keys,
      }));
    }

    const undo = state.lastUndo;
    if (undo && undo !== prev.lastUndo) {
      ensureCurrentPanel();
      usePanelStore.setState((p) => {
        // 最後に描いた線・置いた吹き出しを巻き戻す
        const items = prune(p.items, now);
        const index = items.findLastIndex((item) => item.removedAt === undefined);
        if (index < 0) return { items, undos: p.undos + 1 };
        const target = items[index];
        const next = items.map((item, i) => (i === index ? { ...item, removedAt: now } : item));
        return {
          items: next,
          undos: p.undos + 1,
          ...(target.kind === "line" && {
            lineCount: Math.max(0, p.lineCount - 1),
            lengthPx: Math.max(0, p.lengthPx - target.lengthPx),
          }),
        };
      });
    }

    if (state.lastAction?.type === "save" && state.lastAction !== prev.lastAction) {
      // 保存したらこのコマは完成。演出のあと新しいコマにする
      ensureCurrentPanel();
      usePanelStore.setState((p) => ({ completedPanels: p.completedPanels + 1 }));
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => usePanelStore.setState(emptyPanel), PANEL_CLEAR_DELAY_MS);
    }

    // デバッグの全リセット
    if (!state.lastStroke && prev.lastStroke && getActiveProject(state).dailyStats !== getActiveProject(prev).dailyStats) {
      usePanelStore.setState({ completedPanels: 0, ...emptyPanel });
    }
  });

  return () => {
    unsubscribe();
    clearTimeout(clearTimer);
  };
}
