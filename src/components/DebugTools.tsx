"use client";

import { Bug } from "lucide-react";
import { useClockOffset, useNow } from "@/lib/clock";
import { handleBridgeEvent } from "@/lib/crista";
import { useAppStore } from "@/store/useAppStore";

const MINUTE = 60_000;

/** 線を n 本、人が描くくらいの間隔で送る */
function fakeStrokes(n: number) {
  for (let i = 0; i < n; i++) {
    setTimeout(
      () =>
        handleBridgeEvent({
          type: "stroke",
          durationMs: 100 + Math.round(Math.random() * 600),
          lengthPx: 30 + Math.round(Math.random() * 500),
        }),
      i * 180,
    );
  }
}

/** 開発時（npm run dev）だけ表示する動作確認用ツール */
export default function DebugTools() {
  const now = useNow();
  const offset = useClockOffset((s) => s.offset);
  const advance = useClockOffset((s) => s.advance);
  const resetClock = useClockOffset((s) => s.reset);
  const resetProgress = useAppStore((s) => s.resetProgress);

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <details className="rounded-2xl border border-dashed border-zinc-700 p-3 text-sm text-zinc-400">
      <summary className="flex cursor-pointer items-center gap-1.5 font-bold">
        <Bug className="size-4" /> デバッグツール（開発時のみ表示）
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <p>
          仮想時刻: {new Date(now).toLocaleString("ja-JP")}
          {offset > 0 && `（+${Math.round(offset / MINUTE)}分）`}
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="w-full text-xs">クリスタ連携の擬似イベント</span>
          <button type="button" onClick={() => fakeStrokes(1)} className="rounded bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
            ✏️ 線を1本
          </button>
          <button type="button" onClick={() => fakeStrokes(10)} className="rounded bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
            ✏️ 線を10本
          </button>
          <button type="button" onClick={() => handleBridgeEvent({ type: "save" })} className="rounded bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
            💾 保存
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => advance(5 * MINUTE)} className="rounded bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
            +5分
          </button>
          <button type="button" onClick={() => advance(16 * MINUTE)} className="rounded bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
            +16分（コンボ切れ）
          </button>
          <button type="button" onClick={() => advance(24 * 60 * MINUTE)} className="rounded bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
            +1日
          </button>
          <button type="button" onClick={resetClock} className="rounded bg-zinc-800 px-3 py-1 hover:bg-zinc-700">
            現在時刻に戻す
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("進捗をすべてリセットしますか？")) {
                resetProgress();
                resetClock();
              }
            }}
            className="ml-auto rounded px-3 py-1 text-red-400 ring-1 ring-red-400/50 hover:bg-red-950"
          >
            全リセット
          </button>
        </div>
      </div>
    </details>
  );
}
