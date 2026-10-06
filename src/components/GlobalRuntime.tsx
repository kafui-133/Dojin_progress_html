"use client";

import { Coffee } from "lucide-react";
import { useEffect } from "react";
import AudioUnlockBanner from "@/components/AudioUnlockBanner";
import EffectOverlay from "@/components/EffectOverlay";
import { now as clockNow, useNow } from "@/lib/clock";
import { useBridgeStatus, useCristaBridge } from "@/lib/crista";
import { soundManager } from "@/lib/soundManager";
import { useIsClient } from "@/lib/useIsClient";
import { speak, voiceOptions } from "@/lib/voice";
import { LINES } from "@/lib/voiceLines";
import { getPomodoroRemaining, isResting, useAppStore } from "@/store/useAppStore";
import { ensureCurrentPanel, startPanelTracking } from "@/store/usePanelStore";

/** クリスタ連携の接続を保ち、状態をストアに知らせる */
function BridgeConnection() {
  const isBridgeEnabled = useAppStore((s) => s.isBridgeEnabled);
  const { status, mode } = useCristaBridge(isBridgeEnabled);
  useEffect(() => {
    useBridgeStatus.setState({ status, mode });
  }, [status, mode]);
  return null;
}

/** ポモドーロの時間を見て、作業⇄休憩を切り替える。休憩に入る・終わるときは声で知らせる */
function PomodoroController() {
  useEffect(() => {
    const id = setInterval(() => {
      // 日付が変わっていればパネルを新しいコマにする
      ensureCurrentPanel();
      const event = useAppStore.getState().tickPomodoro(clockNow());
      if (!event) return;
      const settings = useAppStore.getState();
      // 読み上げを OFF にしていても、休憩の合図だけは女性の声で伝える
      const options = voiceOptions(settings);
      if (options.mode === "off") options.mode = "female";
      speak(event === "focus-done" ? LINES.restStart : LINES.restEnd, options);
      soundManager.play(event === "focus-done" ? "click" : "fanfare");
    }, 500);
    return () => clearInterval(id);
  }, []);
  return null;
}

/** 休憩中のお知らせ（演出は止まり、BGM はゆったりした曲になる） */
function RestBanner() {
  const now = useNow(500);
  const pomodoro = useAppStore((s) => s.pomodoro);
  const setTimerMode = useAppStore((s) => s.setTimerMode);
  if (!isResting(pomodoro, now)) return null;

  const remaining = Math.ceil(getPomodoroRemaining(pomodoro, now) / 1000);
  return (
    <div className="fixed bottom-4 left-4 z-[55] flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-400/30 bg-zinc-950/95 px-4 py-3 text-sm text-zinc-100 shadow-2xl">
      <Coffee className="size-6 shrink-0 text-emerald-300" aria-hidden />
      <div className="flex flex-col">
        <span className="font-black">
          休憩中 <span className="tabular-nums">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span>
        </span>
        <span className="text-xs text-zinc-400">手首と目を休めましょう。演出はお休み中です。</span>
      </div>
      <button
        type="button"
        onClick={() => setTimerMode("focus")}
        className="shrink-0 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-bold hover:bg-zinc-700"
      >
        休憩を終える
      </button>
    </div>
  );
}

/**
 * どのページでも動き続ける仕組み（クリスタ連携・パネルの記録・ポモドーロ・演出・BGM）。
 * ルートのレイアウトに置くので、進捗グラフに移っても途切れない。
 */
export default function GlobalRuntime() {
  const isClient = useIsClient();

  useEffect(() => startPanelTracking(), []);

  if (!isClient) return null;
  return (
    <>
      <BridgeConnection />
      <PomodoroController />
      <EffectOverlay />
      <RestBanner />
      <AudioUnlockBanner />
    </>
  );
}
