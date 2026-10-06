"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useCustomTracks } from "@/lib/customTracks";
import { now as clockNow, useNow } from "@/lib/clock";
import { burstConfetti, celebrateGoal, vibrate } from "@/lib/effects";
import { soundManager } from "@/lib/soundManager";
import { speak, voiceOptions } from "@/lib/voice";
import { LINES, lengthMilestoneLine, strokeMilestoneLine } from "@/lib/voiceLines";
import {
  BGM_START_COMBO,
  TYPING_MILESTONE,
  ZONE_MULTIPLIER,
  isFlowBgmActive,
  isInZone,
  isResting,
  useAppStore,
} from "@/store/useAppStore";
import type { ProgressActionResult, StrokeResult, TypingResult, UndoResult } from "@/types";

/** 演出全体の長さ（PRD 5.4: 1.5秒） */
const EFFECT_MS = 1500;
const CONFETTI_AT_MS = 200;
const CUT_IN_AT_S = 0.8;
/** 目標達成時はバナーを長めに残す */
const GOAL_EFFECT_MS = 3000;
/** 線の区切り（50本ごと）の演出は作画の邪魔にならないよう短く */
const MILESTONE_EFFECT_MS = 1200;
/** 小さい演出はカットインを早めに出す */
const LIGHT_CUT_IN_AT_S = 0.4;

interface OverlayEffect {
  key: string;
  headline: string;
  combo?: number;
  multiplier?: number;
  coins?: number;
  cutIn: string;
  /** 白フラッシュ・バイブ・重低音 */
  impact: boolean;
  fever: boolean;
  goal: boolean;
  durationMs: number;
}

function fromAction(action: ProgressActionResult & { id: number }): OverlayEffect {
  return {
    key: `action-${action.id}`,
    headline: `+${action.expGained.toLocaleString()} EXP!`,
    combo: action.comboCount,
    multiplier: action.feverMultiplier,
    coins: action.coinsGained,
    // セリフは記録したときに決めている（工程・ページ完成・フィーバー・入稿完了）
    cutIn: action.cutIn,
    impact: true,
    fever: action.isFever,
    goal: action.goalReached,
    durationMs: action.goalReached ? GOAL_EFFECT_MS : EFFECT_MS,
  };
}

function fromStroke(stroke: StrokeResult): OverlayEffect | null {
  if (stroke.enteredZone) {
    return {
      key: `zone-${stroke.id}`,
      headline: "ZONE!!",
      multiplier: ZONE_MULTIPLIER,
      cutIn: LINES.zone,
      impact: true,
      fever: true,
      goal: false,
      durationMs: EFFECT_MS,
    };
  }
  if (stroke.milestone) {
    return {
      key: `milestone-${stroke.id}`,
      headline: `${stroke.sessionStrokes}本！`,
      cutIn: stroke.inZone ? LINES.unstoppable : strokeMilestoneLine(stroke.sessionStrokes),
      impact: false,
      fever: stroke.inZone,
      goal: false,
      durationMs: MILESTONE_EFFECT_MS,
    };
  }
  if (stroke.lengthMilestoneM !== null) {
    return {
      key: `length-${stroke.id}`,
      headline: `${stroke.lengthMilestoneM}m！`,
      cutIn: lengthMilestoneLine(stroke.lengthMilestoneM),
      impact: false,
      fever: stroke.inZone,
      goal: false,
      durationMs: MILESTONE_EFFECT_MS,
    };
  }
  return null;
}

function fromTyping(typing: TypingResult): OverlayEffect | null {
  if (!typing.milestone) return null;
  const total = Math.floor(typing.totalTypedKeys / TYPING_MILESTONE) * TYPING_MILESTONE;
  return {
    key: `typing-${typing.id}`,
    headline: `セリフ${total}打！`,
    cutIn: LINES.typing,
    impact: false,
    fever: typing.inZone,
    goal: false,
    durationMs: MILESTONE_EFFECT_MS,
  };
}

function fromUndo(undo: UndoResult): OverlayEffect | null {
  if (!undo.milestone) return null;
  return {
    key: `undo-${undo.id}`,
    headline: `こだわり${undo.totalUndos}回！`,
    cutIn: LINES.undoMaster,
    impact: false,
    fever: false,
    goal: false,
    durationMs: MILESTONE_EFFECT_MS,
  };
}

/**
 * パチンコ風演出（PRD 5.4）。
 * 0.0-0.2s フラッシュ + SE + バイブ / 0.2-0.8s 数字スプラッシュ + 紙吹雪 / 0.8-1.5s カットイン。
 * 進捗ボタン・クリスタの保存（lastAction）、ゾーン突入・本数や長さの区切り（lastStroke）、
 * やり直しの区切り（lastUndo）で発動し、カットインの文字を声で読み上げる。
 * あわせて BGM も制御する: 連続タップ（2コンボ）か描き続けている間は通常曲、
 * フィーバー・ゾーン中はフィーバー曲、手が止まったらフェードアウト。ヘッダーの BGM OFF で常に無音。
 */
export default function EffectOverlay() {
  const reduceMotion = useReducedMotion();
  const now = useNow(500);
  const isFever = useAppStore((s) => s.combo.isFever);
  const isComboBgm = useAppStore((s) => s.combo.comboCount >= BGM_START_COMBO);
  const flow = useAppStore((s) => s.flow);
  const isBgmOn = useAppStore((s) => s.isBgmOn);
  const restBgmId = useAppStore((s) => s.restBgmId);
  const resting = useAppStore((s) => isResting(s.pomodoro, now));
  const bgmNormalId = useAppStore((s) => s.bgmNormalId);
  const bgmFeverId = useAppStore((s) => s.bgmFeverId);
  const [effect, setEffect] = useState<OverlayEffect | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const inZone = isInZone(flow, now);
  const isFlowBgm = isFlowBgmActive(flow, now);

  useEffect(() => {
    const initial = useAppStore.getState();
    soundManager.preload([initial.bgmNormalId, initial.bgmFeverId]);
    void useCustomTracks.getState().load();
    let activeUntil = 0;

    const clearTimers = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };

    const play = (next: OverlayEffect) => {
      clearTimers();
      setEffect(next);
      activeUntil = Date.now() + next.durationMs;

      if (next.impact) {
        soundManager.play("feverImpact");
        vibrate([100, 50, 100]);
      } else {
        soundManager.play("fanfare");
      }
      timers.current.push(
        setTimeout(() => burstConfetti({ fever: next.fever }), CONFETTI_AT_MS),
        setTimeout(() => setEffect(null), next.durationMs),
        // カットインが出るタイミングで読み上げる
        setTimeout(
          () => {
            const settings = useAppStore.getState();
            speak(next.cutIn, voiceOptions(settings));
          },
          (next.impact ? CUT_IN_AT_S : LIGHT_CUT_IN_AT_S) * 1000,
        ),
      );
      if (next.goal) {
        timers.current.push(
          setTimeout(() => {
            soundManager.play("fanfare");
            celebrateGoal();
          }, CUT_IN_AT_S * 1000),
        );
      }
    };

    const unsubscribe = useAppStore.subscribe((state, prev) => {
      // 休憩中は演出を止めて、気持ちを落ち着かせる（記録はされる）
      if (isResting(state.pomodoro, clockNow())) return;
      if (state.lastAction && state.lastAction !== prev.lastAction) {
        play(fromAction(state.lastAction));
      } else {
        const next =
          state.lastStroke && state.lastStroke !== prev.lastStroke
            ? fromStroke(state.lastStroke)
            : state.lastUndo && state.lastUndo !== prev.lastUndo
              ? fromUndo(state.lastUndo)
              : state.lastTyping && state.lastTyping !== prev.lastTyping
                ? fromTyping(state.lastTyping)
                : null;
        // 区切りの演出は、進行中の大きな演出を打ち消さない
        if (next && (next.impact || Date.now() >= activeUntil)) play(next);
      }
    });

    return () => {
      unsubscribe();
      clearTimers();
    };
  }, []);

  useEffect(() => {
    const active = isBgmOn && (isComboBgm || isFlowBgm);
    // 休憩中は、コンボや勢いに関係なくゆったりした曲に切り替える
    if (resting) soundManager.setBgm(isBgmOn ? restBgmId : null);
    else soundManager.setBgm(active ? (isFever || inZone ? bgmFeverId : bgmNormalId) : null);
  }, [isBgmOn, isComboBgm, isFlowBgm, isFever, inZone, bgmNormalId, bgmFeverId, resting, restBgmId]);

  const glow = resting
    ? null
    : isFever
    ? "shadow-[inset_0_0_80px_20px_rgba(255,210,63,0.45)]"
    : inZone
      ? "shadow-[inset_0_0_90px_24px_rgba(217,70,239,0.45)]"
      : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-live="polite">
      {/* フィーバー・ゾーン中は画面の縁を光らせ続ける */}
      <AnimatePresence>
        {glow && (
          <motion.div
            key={glow}
            className={`absolute inset-0 ${glow}`}
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
            key={effect.key}
            className="absolute inset-0"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* 0.0-0.2s: Impact フラッシュ */}
            {effect.impact && !reduceMotion && (
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
                {effect.headline}
              </motion.div>
              <motion.div
                className="flex items-center gap-3 text-2xl font-black text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.8)]"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.25 }}
              >
                {effect.combo !== undefined && effect.combo >= 2 && <span>{effect.combo} COMBO</span>}
                {effect.multiplier !== undefined && effect.multiplier > 1 && (
                  <span className="rounded bg-yellow-400 px-2 text-black">
                    ×{effect.multiplier.toFixed(1)}
                  </span>
                )}
                {effect.coins !== undefined && <span className="text-yellow-200">+{effect.coins} 🪙</span>}
              </motion.div>
            </div>

            {/* 0.8-1.5s: カットイン */}
            <motion.div
              className="absolute inset-x-0 top-[62%] flex -skew-y-3 justify-center bg-gradient-to-r from-fuchsia-600 via-red-500 to-yellow-400 py-3 shadow-[0_0_30px_rgba(255,80,160,0.7)]"
              initial={{ x: reduceMotion ? 0 : "-110%", opacity: reduceMotion ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{
                delay: effect.impact ? CUT_IN_AT_S : LIGHT_CUT_IN_AT_S,
                type: "spring",
                stiffness: 420,
                damping: 30,
              }}
            >
              <span className="font-dot text-4xl text-white drop-shadow-[3px_3px_0_rgba(0,0,0,0.85)] sm:text-6xl">
                {effect.cutIn}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
