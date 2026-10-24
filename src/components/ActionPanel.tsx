"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { ACTIONS, ACTION_GROUPS } from "@/lib/actions";
import ManuscriptBoard from "@/components/ManuscriptBoard";
import { useNow } from "@/lib/clock";
import { soundManager } from "@/lib/soundManager";
import { cn } from "@/lib/utils";
import {
  BGM_START_COMBO,
  COMBO_WINDOW_MS,
  FEVER_START_COMBO,
  getNextMultiplier,
  useActiveProject,
  useAppStore,
} from "@/store/useAppStore";
import Icon from "@/components/Icon";

function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

function ComboGauge({ now }: { now: number }) {
  const combo = useAppStore((s) => s.combo);
  const isBgmOn = useAppStore((s) => s.isBgmOn);
  const remainingMs = combo.comboCount > 0 ? Math.max(0, combo.lastActionTime + COMBO_WINDOW_MS - now) : 0;

  let hint: string;
  if (combo.comboCount === 0) {
    hint = `15分以内に続けて押すとコンボ！${isBgmOn ? ` ${BGM_START_COMBO}コンボでBGMスタート` : ""}`;
  } else if (combo.comboCount < FEVER_START_COMBO) {
    hint = `あと${FEVER_START_COMBO - combo.comboCount}コンボでフィーバー！`;
  } else if (combo.feverMultiplier < 2) {
    hint = "あと少しで 2.0x！";
  } else {
    hint = "最大倍率！この勢いで描き切れ！";
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={combo.comboCount}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "text-2xl font-black tabular-nums",
              combo.isFever ? "text-fuchsia-500" : "text-zinc-50",
            )}
          >
            {combo.comboCount} <span className="text-base">COMBO</span>
          </motion.span>
        </AnimatePresence>
        <span className="text-sm text-zinc-400 tabular-nums">
          {combo.comboCount > 0 ? `受付 残り ${formatRemaining(remainingMs)}` : "コンボ待機中"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn("h-full transition-[width] duration-1000 ease-linear", combo.isFever ? "bg-yellow-400" : "bg-fuchsia-500")}
          style={{ width: `${(remainingMs / COMBO_WINDOW_MS) * 100}%` }}
        />
      </div>
      <p className="text-xs text-zinc-400">{hint}</p>
    </div>
  );
}

export default function ActionPanel() {
  const isManga = useActiveProject().type === "manga";
  const now = useNow();
  const combo = useAppStore((s) => s.combo);
  const recordProgress = useAppStore((s) => s.recordProgress);
  const expireCombo = useAppStore((s) => s.expireCombo);

  // コンボ受付時間が過ぎたらコンボ・フィーバー・BGM を終了させる
  useEffect(() => {
    expireCombo(now);
  }, [now, expireCombo]);

  const nextMultiplier = getNextMultiplier(combo, now);

  return (
    <section className="flex flex-col gap-4 koma p-4">
      <ComboGauge now={now} />

      {isManga ? (
        <ManuscriptBoard />
      ) : (
        <p className="rounded-lg bg-zinc-800/60 p-3 text-xs text-zinc-400">
          イラストモードでは、クリスタでの線・ペン時間・やり直し（Ctrl+Z）を記録します。保存（Ctrl+S）でコンボが進みます。グラフは「進捗グラフ」で見られます。
        </p>
      )}

      {/* ページに紐づかない記録（以前からのボタン）。EXP とコンボだけ増える */}
      {isManga && (
        <details className="group rounded-lg border border-zinc-600 p-3">
          <summary className="cursor-pointer text-xs font-bold text-zinc-400">
            ほかの記録（ページに関係なく EXP・コンボだけ）
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {ACTION_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <h3 className="text-xs font-bold text-zinc-400">{group.title}</h3>
                <div className={cn("grid gap-2", group.types.length > 1 && "grid-cols-2")}>
                  {group.types.map((type) => {
                    const action = ACTIONS[type];
                    const exp = Math.round(action.exp * nextMultiplier);
                    return (
                      <motion.button
                        key={type}
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => {
                          soundManager.play("click");
                          recordProgress(type);
                        }}
                        className={cn(
                          "flex flex-col items-center justify-center rounded-lg border-2 border-zinc-100 bg-zinc-900 px-2 py-3 font-black text-zinc-50 transition hover:bg-zinc-800 active:translate-y-px",
                          combo.isFever && "tone-shu border-fuchsia-500",
                        )}
                      >
                        <Icon name={action.icon} className="size-9" />
                        <span className="mt-1 whitespace-nowrap text-sm sm:text-lg">{action.label}</span>
                        <span
                          className={cn(
                            "text-xs font-bold",
                            nextMultiplier > 1 ? "text-fuchsia-600" : "text-zinc-400",
                          )}
                        >
                          +{exp.toLocaleString()} EXP{nextMultiplier > 1 && ` (${nextMultiplier.toFixed(1)}x)`}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
