import { useEffect, useState } from "react";
import { soundManager } from "@/lib/soundManager";
import { useAppStore } from "@/store/useAppStore";

/** bridge/index.mjs と同じポート */
export const BRIDGE_URL = "ws://127.0.0.1:38917";

export type BridgeMode = "crista" | "any-app" | "simulate";

export type BridgeEvent =
  | { type: "hello"; mode: BridgeMode }
  | { type: "stroke"; durationMs: number; lengthPx: number }
  | { type: "save" }
  | { type: "undo" };

export type BridgeStatus = "off" | "connecting" | "connected";

/** ブリッジ（またはデバッグツール）からのイベントを進捗に反映する */
export function handleBridgeEvent(event: BridgeEvent): void {
  const store = useAppStore.getState();
  if (event.type === "stroke") {
    const result = store.recordStroke({ durationMs: event.durationMs, lengthPx: event.lengthPx });
    if (store.isStrokeSoundOn) soundManager.playStroke(result.rush);
  } else if (event.type === "undo") {
    store.recordUndo();
    if (store.isStrokeSoundOn) soundManager.play("undo");
  } else if (event.type === "save") {
    // 保存 = 1コマ完成（演出は EffectOverlay が lastAction を見て出す）
    store.recordProgress("save");
  }
}

function isBridgeEvent(value: unknown): value is BridgeEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  if (event.type === "stroke") {
    return typeof event.durationMs === "number" && typeof event.lengthPx === "number";
  }
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
