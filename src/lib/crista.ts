import { useEffect, useState } from "react";
import { create } from "zustand";
import { now as clockNow } from "@/lib/clock";
import { soundManager } from "@/lib/soundManager";
import { isResting, useAppStore } from "@/store/useAppStore";
import type { CspState, CspUsageTick } from "@/types";

/** bridge/index.mjs と同じポート */
export const BRIDGE_URL = "ws://127.0.0.1:38917";

export type BridgeMode = "crista" | "any-app" | "simulate";

export type BridgeEvent =
  | { type: "hello"; mode: BridgeMode }
  | { type: "stroke"; durationMs: number; lengthPx: number }
  | { type: "save" }
  | { type: "undo" }
  /** セリフ入力（続けて押したキーの回数） */
  | { type: "typing"; keys: number }
  /** キー操作（ショートカット）の回数 */
  | { type: "keys"; count: number }
  /** クリスタの使用時間（10秒ごと。つながっていなかった間の分はまとめて届く） */
  | { type: "usage"; ticks: CspUsageTick[] };

export type BridgeStatus = "off" | "connecting" | "connected";

/** ブリッジの接続状態（接続はどのページでも GlobalRuntime が保つ） */
export const useBridgeStatus = create<{
  status: BridgeStatus;
  mode: BridgeMode | null;
  /** 今のクリスタの状態（使用時間の記録が届いていなければ null） */
  cspState: CspState | null;
}>()(() => ({
  status: "off",
  mode: null,
  cspState: null,
}));

/** ブリッジ（またはデバッグツール）からのイベントを進捗に反映する */
export function handleBridgeEvent(event: BridgeEvent): void {
  const store = useAppStore.getState();
  // 休憩中は記録だけして、効果音は鳴らさない
  const sound = store.isStrokeSoundOn && !isResting(store.pomodoro, clockNow());
  if (event.type === "stroke") {
    const result = store.recordStroke({ durationMs: event.durationMs });
    if (sound) soundManager.playStroke(result.rush);
  } else if (event.type === "undo") {
    store.recordUndo();
    if (sound) soundManager.play("undo");
  } else if (event.type === "typing") {
    const result = store.recordTyping(event.keys);
    if (sound) soundManager.playStroke(Math.min(11, Math.ceil(result.keys / 4)));
  } else if (event.type === "keys") {
    store.recordKeyOps(event.count);
  } else if (event.type === "usage") {
    store.recordCspUsage(event.ticks);
    const latest = event.ticks.at(-1);
    if (latest) useBridgeStatus.setState({ cspState: latest.state });
  } else if (event.type === "save") {
    // 保存 = 1コマ完成（演出は EffectOverlay が lastAction を見て出す）
    store.recordProgress("save");
  }
}

const CSP_STATES = new Set<unknown>(["active", "idle", "background", "closed"] satisfies CspState[]);
/** 1回分は長くても1分（スリープ明けなどの数えすぎを防ぐ） */
const MAX_TICK_MS = 60_000;

function isUsageTick(value: unknown): value is CspUsageTick {
  if (typeof value !== "object" || value === null) return false;
  const tick = value as Record<string, unknown>;
  return (
    typeof tick.at === "number" &&
    Number.isFinite(tick.at) &&
    typeof tick.ms === "number" &&
    tick.ms >= 0 &&
    tick.ms <= MAX_TICK_MS &&
    CSP_STATES.has(tick.state)
  );
}

function isBridgeEvent(value: unknown): value is BridgeEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  if (event.type === "stroke") {
    return typeof event.durationMs === "number" && typeof event.lengthPx === "number";
  }
  if (event.type === "typing") return typeof event.keys === "number" && event.keys > 0;
  if (event.type === "keys") return typeof event.count === "number" && event.count > 0;
  if (event.type === "usage") return Array.isArray(event.ticks) && event.ticks.every(isUsageTick);
  return event.type === "save" || event.type === "undo" || event.type === "hello";
}

const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 10_000;

/** ブリッジに接続し、切れたら再接続し続ける */
export function useCristaBridge(enabled: boolean): { status: BridgeStatus; mode: BridgeMode | null } {
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<BridgeMode | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = RETRY_MIN_MS;
    let disposed = false;

    const connect = () => {
      socket = new WebSocket(BRIDGE_URL);
      socket.onopen = () => {
        retryMs = RETRY_MIN_MS;
        setConnected(true);
      };
      socket.onmessage = (message) => {
        let event: unknown;
        try {
          event = JSON.parse(String(message.data));
        } catch {
          return;
        }
        if (!isBridgeEvent(event)) return;
        if (event.type === "hello") setMode(event.mode);
        else handleBridgeEvent(event);
      };
      socket.onclose = () => {
        setConnected(false);
        if (disposed) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(RETRY_MAX_MS, retryMs * 1.5);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [enabled]);

  return {
    status: !enabled ? "off" : connected ? "connected" : "connecting",
    mode: connected ? mode : null,
  };
}
