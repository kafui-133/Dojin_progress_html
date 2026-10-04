"use client";

import { Volume2 } from "lucide-react";
import { useState } from "react";
import { useNow } from "@/lib/clock";
import { soundManager } from "@/lib/soundManager";
import { useAppStore } from "@/store/useAppStore";

/**
 * ブラウザは一度もクリックされていないページの音を止める。
 * クリスタ連携中はこのページを触らないので、最初に1回クリックしてもらう。
 */
export default function AudioUnlockBanner() {
  useNow(1000);
  const [, setUnlockCount] = useState(0);
  const isBridgeEnabled = useAppStore((s) => s.isBridgeEnabled);

  if (!isBridgeEnabled || !soundManager.isLocked()) return null;

  return (
    <button
      type="button"
      onClick={() => void soundManager.unlock().then(() => setUnlockCount((n) => n + 1))}
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md animate-pulse items-center justify-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-3 font-bold text-white shadow-2xl"
    >
      <Volume2 className="size-5" /> ここをクリックして音を有効にする
    </button>
  );
}
