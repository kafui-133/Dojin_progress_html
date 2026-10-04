"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { burstConfetti, celebrateGoal, vibrate } from "@/lib/effects";
import { soundManager } from "@/lib/soundManager";
import { useIsClient } from "@/lib/useIsClient";
import { useAppStore } from "@/store/useAppStore";
import type { ProgressActionResult, ProgressActionType } from "@/types";

/** 演出全体の長さ（PRD 5.4: 1.5秒） */
const EFFECT_MS = 1500;
const CONFETTI_AT_MS = 200;
const CUT_IN_AT_S = 0.8;
/** 目標達成時はバナーを長めに残す */
const GOAL_EFFECT_MS = 3000;

const CUT_IN_LINES: Record<ProgressActionType, string[]> = {
  panel: ["神作画！", "ペン入れ完了！", "作画崩壊回避！"],
  text: ["修羅場突破！", "筆が乗ってる！", "名文誕生！"],
};

type ActiveEffect = ProgressActionResult & { id: number };

function cutInLine(effect: ActiveEffect): string {
  if (effect.goalReached) return "入稿完了！！";
  if (effect.enteredFever) return "FEVER突入！！";
  const lines = CUT_IN_LINES[effect.type];
  return lines[effect.id % lines.length];
}

/**
 * 進捗ボタン押下時のパチンコ風演出（PRD 5.4）。
 * 0.0-0.2s フラッシュ + SE + バイブ / 0.2-0.8s 数字スプラッシュ + 紙吹雪 / 0.8-1.5s カットイン。
 * ストアの lastAction の更新を合図に発動し、連打されたら最初からやり直す。
 * あわせて BGM の ON/OFF・通常/フィーバー切り替えもここで行う。
 */
export default function EffectOverlay() {
  const isClient = useIsClient();
  const reduceMotion = useReducedMotion();
  const isFever = useAppStore((s) => s.combo.isFever);
  const isBgmOn = useAppStore((s) => s.isBgmOn);
  const [effect, setEffect] = useState<ActiveEffect | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    soundManager.preload();

    const clearTimers = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };

    const unsubscribe = useAppStore.subscribe((state, prev) => {
      const action = state.lastAction;
      if (!action || action === prev.lastAction) return;

      clearTimers();
      setEffect(action);

      soundManager.play("feverImpact");
      vibrate([100, 50, 100]);
      timers.current.push(
        setTimeout(() => burstConfetti({ fever: action.isFever }), CONFETTI_AT_MS),
        setTimeout(
          () => setEffect(null),
          action.goalReached ? GOAL_EFFECT_MS : EFFECT_MS,
        ),
      );
      if (action.goalReached) {
        timers.current.push(
          setTimeout(() => {
            soundManager.play("fanfare");
            celebrateGoal();
          }, CUT_IN_AT_S * 1000),
        );
      }
    });

    return () => {
      unsubscribe();
      clearTimers();
    };
  }, []);

  useEffect(() => {
    soundManager.setBgm(isBgmOn ? (isFever ? "fever" : "normal") : null);
  }, [isBgmOn, isFever]);

  if (!isClient) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-live="polite">
      {/* フィーバー中は画面の縁を光らせ続ける */}
      <AnimatePresence>
        {isFever && (
          <motion.div
            key="fever-glow"
            className="absolute inset-0 shadow-[inset_0_0_80px_20px_rgba(255,210,63,0.45)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: reduceMotion ? 0.8 : [0.5, 1, 0.5] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, repeat: reduceMotion ? 0 : Infinity }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {effect && (
          <motion.div
            key={effect.id}
            className="absolute inset-0"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* 0.0-0.2s: Impact フラッシュ */}
            {!reduceMotion && (
              <motion.div
                className="absolute inset-0 bg-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.95, 0] }}
                transition={{ duration: 0.2, times: [0, 0.3, 1] }}
              />
            )}

            {/* 0.2-0.8s: 数字スプラッシュ */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <motion.div
                className="text-center text-6xl font-black tracking-tight text-yellow-300 drop-shadow-[0_4px_0_rgba(180,40,0,0.9)] [-webkit-text-stroke:2px_#7a1d00] sm:text-8xl"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 3.2, rotate: -25 }}
                animate={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, scale: [3.2, 0.85, 1.08, 1], rotate: [-25, 6, -2, 0] }
                }
                transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
              >
                +{effect.expGained.toLocaleString()} EXP!
              </motion.div>
              <motion.div
                className="flex items-center gap-3 text-2xl font-black text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.8)]"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.25 }}
              >
                {effect.comboCount >= 2 && <span>{effect.comboCount} COMBO</span>}
                {effect.feverMultiplier > 1 && (
                  <span className="rounded bg-yellow-400 px-2 text-black">
                    ×{effect.feverMultiplier.toFixed(1)}
                  </span>
                )}
                <span className="text-yellow-200">+{effect.coinsGained} 🪙</span>
              </motion.div>
            </div>

            {/* 0.8-1.5s: カットイン */}
            <motion.div
              className="absolute inset-x-0 top-[62%] flex -skew-y-3 justify-center bg-gradient-to-r from-fuchsia-600 via-red-500 to-yellow-400 py-3 shadow-[0_0_30px_rgba(255,80,160,0.7)]"
              initial={{ x: reduceMotion ? 0 : "-110%", opacity: reduceMotion ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: CUT_IN_AT_S, type: "spring", stiffness: 420, damping: 30 }}
            >
              <span className="font-dot text-4xl text-white drop-shadow-[3px_3px_0_rgba(0,0,0,0.85)] sm:text-6xl">
                {cutInLine(effect)}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
