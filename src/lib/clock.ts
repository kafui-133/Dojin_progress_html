import { useEffect, useState } from "react";
import { create } from "zustand";

/**
 * アプリ内の「現在時刻」。開発時のデバッグツールで時間を進められるよう、
 * 実時間にオフセットを足して返す（本番ではオフセットは常に0）。
 */
export const useClockOffset = create<{
  offset: number;
  advance: (ms: number) => void;
  reset: () => void;
}>()((set) => ({
  offset: 0,
  advance: (ms) => set((s) => ({ offset: s.offset + ms })),
  reset: () => set({ offset: 0 }),
}));

export function now(): number {
  return Date.now() + useClockOffset.getState().offset;
}

/** 一定間隔で更新される現在時刻 */
export function useNow(intervalMs = 1000): number {
  const offset = useClockOffset((s) => s.offset);
  const [realNow, setRealNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setRealNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return realNow + offset;
}
