"use client";

// 仮UI: Step 4 で正式なコンポーネント群に置き換える前提の動作確認用パネル
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  COMBO_WINDOW_MS,
  getEffectiveStreak,
  getProgressPercent,
  toDateString,
  useAppStore,
} from "@/store/useAppStore";
import { soundManager } from "@/lib/soundManager";
import { useIsClient } from "@/lib/useIsClient";
import { cn } from "@/lib/utils";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function daysUntil(deadline: string, today: string): number | null {
  if (!deadline) return null;
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(deadline) - toUtc(today)) / DAY);
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-zinc-800 px-3 py-2">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

export default function DebugPanel() {
  const isClient = useIsClient();
  const {
    progress,
    combo,
    lastAction,
    isBgmOn,
    recordProgress,
    expireCombo,
    setGoal,
    setBgmOn,
    resetProgress,
  } = useAppStore();

  // デバッグ用の時間オフセット（コンボ受付時間や連続日数を待たずに試すため）
  const [timeOffset, setTimeOffset] = useState(0);
  const [realNow, setRealNow] = useState(() => Date.now());
  const now = realNow + timeOffset;

  useEffect(() => {
    const id = setInterval(() => setRealNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    expireCombo(now);
  }, [now, expireCombo]);

  if (!isClient) return null;

  const today = toDateString(new Date(now));
  const percent = getProgressPercent(progress);
  const remainingDays = daysUntil(progress.deadline, today);
  const comboRemainingMs =
    combo.lastActionTime > 0 ? Math.max(0, combo.lastActionTime + COMBO_WINDOW_MS - now) : 0;
  const comboRemaining = `${Math.floor(comboRemainingMs / MINUTE)}:${String(
    Math.floor((comboRemainingMs % MINUTE) / 1000),
  ).padStart(2, "0")}`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 text-zinc-100">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-black">進捗ブースター <span className="text-xs font-normal text-zinc-400">仮UI</span></h1>
        <span className="rounded-full bg-orange-600 px-3 py-1 text-sm font-bold">
          🔥 {getEffectiveStreak(progress, today)}日連続
        </span>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-sm font-bold",
            combo.isFever ? "animate-pulse bg-yellow-400 text-black" : "bg-zinc-700 text-zinc-300",
          )}
        >
          {combo.isFever ? `FEVER ${combo.feverMultiplier.toFixed(1)}x` : `${combo.feverMultiplier.toFixed(1)}x`}
        </span>
        <span className="ml-auto text-lg font-bold tabular-nums">🪙 {progress.coins.toLocaleString()}</span>
        <button
          onClick={() => setBgmOn(!isBgmOn)}
          className={cn(
            "rounded-full px-3 py-1 text-sm font-bold",
            isBgmOn ? "bg-fuchsia-600" : "bg-zinc-700 text-zinc-300",
          )}
        >
          BGM {isBgmOn ? "ON" : "OFF"}
        </button>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex justify-between text-sm">
          <span>
            進捗 {percent.toFixed(0)}%（{progress.completedPages} / {progress.targetPages}）
          </span>
          <span>{remainingDays === null ? "締め切り未設定" : `あと ${remainingDays}日`}</span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-zinc-800">
          {/* 演出のカットインに合わせて「ズズズ…ドカン！」と伸びる */}
          <motion.div
            className="h-full bg-gradient-to-r from-pink-500 to-yellow-400"
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ delay: 0.8, duration: 0.7, ease: [0.8, 0, 0.2, 1.3] }}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="累計EXP" value={progress.totalExp.toLocaleString()} />
        <Stat label="コンボ" value={combo.comboCount} />
        <Stat label="コンボ受付 残り" value={combo.comboCount > 0 ? comboRemaining : "-"} />
        <Stat label="最終活動日" value={progress.lastActiveDate || "-"} />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={() => {
            soundManager.play("click");
            recordProgress("panel", now);
          }}
          className="rounded-xl bg-red-600 px-4 py-5 text-lg font-black shadow-lg transition active:scale-95 hover:bg-red-500"
        >
          🔥 1コマ描いた！
        </button>
        <button
          onClick={() => {
            soundManager.play("click");
            recordProgress("text", now);
          }}
          className="rounded-xl bg-blue-600 px-4 py-5 text-lg font-black shadow-lg transition active:scale-95 hover:bg-blue-500"
        >
          ✍️ 500文字書いた！
        </button>
      </section>

      <section className="rounded-lg border border-zinc-700 p-3">
        <h2 className="mb-2 text-sm font-bold text-zinc-400">直近のアクション結果</h2>
        {lastAction ? (
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="font-bold text-yellow-300">+{lastAction.expGained.toLocaleString()} EXP</span>
            <span>+{lastAction.coinsGained} コイン</span>
            <span>{lastAction.comboCount}コンボ</span>
            <span>{lastAction.feverMultiplier.toFixed(1)}x</span>
            {lastAction.enteredFever && <span className="rounded bg-yellow-400 px-1 text-black">フィーバー突入！</span>}
            {lastAction.multiplierUp && <span className="rounded bg-pink-500 px-1">倍率UP</span>}
            {lastAction.goalReached && <span className="rounded bg-green-500 px-1 text-black">目標達成！</span>}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">まだアクションがありません</p>
        )}
      </section>

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-700 p-3">
        <label className="flex flex-col text-sm">
          目標ページ
          <input
            type="number"
            min={1}
            value={progress.targetPages}
            onChange={(e) => setGoal({ targetPages: Number(e.target.value) || 1 })}
            className="w-24 rounded bg-zinc-800 px-2 py-1"
          />
        </label>
        <label className="flex flex-col text-sm">
          締め切り
          <input
            type="date"
            value={progress.deadline}
            onChange={(e) => setGoal({ deadline: e.target.value })}
            className="rounded bg-zinc-800 px-2 py-1"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-600 p-3 text-sm">
        <h2 className="font-bold text-zinc-400">デバッグ: 時間操作</h2>
        <p className="text-zinc-400">
          仮想時刻: {new Date(now).toLocaleString("ja-JP")}
          {timeOffset > 0 && `（+${Math.round(timeOffset / MINUTE)}分）`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTimeOffset((o) => o + 5 * MINUTE)} className="rounded bg-zinc-700 px-3 py-1 hover:bg-zinc-600">
            +5分
          </button>
          <button onClick={() => setTimeOffset((o) => o + 16 * MINUTE)} className="rounded bg-zinc-700 px-3 py-1 hover:bg-zinc-600">
            +16分（コンボ切れ）
          </button>
          <button onClick={() => setTimeOffset((o) => o + DAY)} className="rounded bg-zinc-700 px-3 py-1 hover:bg-zinc-600">
            +1日
          </button>
          <button onClick={() => setTimeOffset(0)} className="rounded bg-zinc-700 px-3 py-1 hover:bg-zinc-600">
            現在時刻に戻す
          </button>
          <button
            onClick={() => {
              if (confirm("進捗をすべてリセットしますか？")) resetProgress();
            }}
            className="ml-auto rounded bg-zinc-900 px-3 py-1 text-red-400 ring-1 ring-red-400/50 hover:bg-red-950"
          >
            全リセット
          </button>
        </div>
      </section>
    </main>
  );
}
