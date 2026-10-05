"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Pencil } from "lucide-react";
import { useState } from "react";
import { useNow } from "@/lib/clock";
import { getBoardStats, pagesWithDataBeyond } from "@/lib/stages";
import { MAX_PAGES, toDateString, useAppStore } from "@/store/useAppStore";

const STAGES = [
  { min: 0, label: "白紙の原稿", comment: "まずは1コマから！" },
  { min: 25, label: "下書き・枠線", comment: "アタリが取れてきた！" },
  { min: 50, label: "ペン入れ", comment: "アシスタントが駆けつけた！" },
  { min: 75, label: "トーン・仕上げ", comment: "ゴールが見えてきた！" },
  { min: 100, label: "完成・入稿完了！", comment: "おつかれさまでした！！" },
] as const;

const DAY = 86_400_000;

function getStageIndex(percent: number): number {
  return STAGES.reduce((idx, stage, i) => (percent >= stage.min ? i : idx), 0);
}

function daysUntil(deadline: string, today: string): number | null {
  if (!deadline) return null;
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(deadline) - toUtc(today)) / DAY);
}

function deadlineLabel(days: number | null): string {
  if (days === null) return "締め切り未設定";
  if (days < 0) return `締め切りを${-days}日過ぎています`;
  if (days === 0) return "今日が締め切り！";
  return `あと ${days}日`;
}

const fadeIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.6 },
};

/** 進捗段階に応じて描き進む原稿用紙 */
function ManuscriptPage({ stage }: { stage: number }) {
  const sketch = stage === 1;
  const stroke = sketch ? "#60a5fa" : "#111";
  const panelStroke = stage >= 2 ? 2.2 : 1;

  return (
    <svg viewBox="0 0 210 297" className="h-full w-full" role="img" aria-label={STAGES[stage].label}>
      <defs>
        <pattern id="tone" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.8" fill="#555" />
        </pattern>
      </defs>

      {/* 原稿用紙 */}
      <rect x="0" y="0" width="210" height="297" fill="#fdfdf8" />
      <rect x="10" y="10" width="190" height="277" fill="none" stroke="#bfdbfe" strokeWidth="0.6" />

      <AnimatePresence>
        {stage >= 1 && (
          <motion.g key={`panels-${stage >= 2}`} {...fadeIn} fill="none" stroke={stroke} strokeWidth={panelStroke}>
            {/* コマ枠 */}
            <rect x="15" y="15" width="180" height="80" />
            <rect x="15" y="102" width="85" height="90" />
            <rect x="107" y="102" width="88" height="90" />
            <rect x="15" y="199" width="180" height="83" />
          </motion.g>
        )}

        {stage >= 3 && (
          <motion.g key="tone" {...fadeIn}>
            {/* トーン */}
            <rect x="16" y="16" width="178" height="78" fill="url(#tone)" opacity="0.5" />
            <rect x="108" y="103" width="86" height="88" fill="url(#tone)" opacity="0.35" />
          </motion.g>
        )}

        {stage >= 1 && (
          <motion.g
            key={`figures-${stage >= 2}`}
            {...fadeIn}
            fill="none"
            stroke={stroke}
            strokeWidth={sketch ? 0.8 : 1.6}
            strokeLinecap="round"
            opacity={sketch ? 0.8 : 1}
          >
            {/* 1コマ目: キャラの顔 */}
            <circle cx="70" cy="58" r="22" fill={stage >= 2 ? "#fff" : "none"} />
            <path d="M48 52 Q60 28 92 50" />
            <circle cx="62" cy="58" r="2.5" fill={stroke} />
            <circle cx="78" cy="58" r="2.5" fill={stroke} />
            <path d="M64 70 Q70 74 76 70" />
            {/* 2コマ目: 全身 */}
            <circle cx="57" cy="125" r="9" fill={stage >= 2 ? "#fff" : "none"} />
            <path d="M57 134 L57 165 M57 142 L44 155 M57 142 L70 150 M57 165 L47 185 M57 165 L67 185" />
            {/* 3コマ目: 目のアップ */}
            <path d="M120 150 Q151 125 182 150 Q151 170 120 150 Z" fill={stage >= 2 ? "#fff" : "none"} />
            <circle cx="151" cy="149" r="9" fill={stage >= 2 ? "#111" : "none"} />
            {/* 4コマ目: 集中線 */}
            {Array.from({ length: 14 }, (_, i) => {
              const a = (i / 14) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1={105 + Math.cos(a) * 30}
                  y1={240 + Math.sin(a) * 22}
                  x2={105 + Math.cos(a) * 85}
                  y2={240 + Math.sin(a) * 38}
                  strokeWidth={sketch ? 0.5 : 0.9}
                />
              );
            })}
          </motion.g>
        )}

        {stage >= 3 && (
          <motion.g key="balloons" {...fadeIn} stroke="#111" strokeWidth="1.2">
            {/* 吹き出し */}
            <ellipse cx="150" cy="45" rx="34" ry="20" fill="#fff" />
            <path d="M120 52 L104 60 L124 58" fill="#fff" />
            <text x="150" y="49" textAnchor="middle" fontSize="11" fill="#111" stroke="none" fontWeight="bold">
              締め切り…！
            </text>
            <ellipse cx="105" cy="240" rx="28" ry="15" fill="#fff" />
            <text x="105" y="244" textAnchor="middle" fontSize="11" fill="#111" stroke="none" fontWeight="bold">
              できた！
            </text>
          </motion.g>
        )}

        {stage >= 4 && (
          <motion.g
            key="stamp"
            initial={{ opacity: 0, scale: 2.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 14 }}
            style={{ transformOrigin: "105px 150px" }}
          >
            <g transform="rotate(-14 105 150)">
              <rect x="40" y="125" width="130" height="50" rx="6" fill="rgba(255,255,255,0.85)" stroke="#dc2626" strokeWidth="4" />
              <text x="105" y="161" textAnchor="middle" fontSize="26" fontWeight="900" fill="#dc2626">
                入稿完了！
              </text>
            </g>
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}

function GoalEditor({ onDone }: { onDone: () => void }) {
  const progress = useAppStore((s) => s.progress);
  const manuscript = useAppStore((s) => s.manuscript);
  const setGoal = useAppStore((s) => s.setGoal);
  // ページ数は入力途中（"12" を打つ途中の "1" など）で原稿を減らさないよう、完了を押したときに反映する
  const [pagesDraft, setPagesDraft] = useState(String(progress.targetPages));
  const [deadlineDraft, setDeadlineDraft] = useState(progress.deadline);

  const apply = () => {
    const pages = Math.min(MAX_PAGES, Math.max(1, Math.floor(Number(pagesDraft) || progress.targetPages)));
    const lost = pagesWithDataBeyond(manuscript.pages, pages);
    if (lost > 0 && !confirm(`${pages + 1}ページ目以降の ${lost} ページ分の完了記録が消えます。よろしいですか？`)) return;
    setGoal({ targetPages: pages, deadline: deadlineDraft });
    onDone();
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-zinc-900 p-3 text-sm">
      <label className="flex flex-col gap-1">
        総ページ数
        <input
          type="number"
          min={1}
          max={MAX_PAGES}
          value={pagesDraft}
          onChange={(e) => setPagesDraft(e.target.value)}
          className="w-24 rounded bg-zinc-800 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        入稿締め切り日
        <input
          type="date"
          value={deadlineDraft}
          onChange={(e) => setDeadlineDraft(e.target.value)}
          className="rounded bg-zinc-800 px-2 py-1"
        />
      </label>
      <button type="button" onClick={apply} className="ml-auto flex items-center gap-1 rounded bg-fuchsia-600 px-3 py-1.5 font-bold">
        <Check className="size-4" /> 完了
      </button>
    </div>
  );
}

export default function VisualStage() {
  const now = useNow(60_000);
  const progress = useAppStore((s) => s.progress);
  const manuscript = useAppStore((s) => s.manuscript);
  const [isEditing, setIsEditing] = useState(false);

  const board = getBoardStats(manuscript);
  const percent = board.percent;
  const stageIndex = getStageIndex(percent);
  const stage = STAGES[stageIndex];
  const next = STAGES[stageIndex + 1];
  const remainingToNext = next ? Math.max(0, Math.ceil((board.total * next.min) / 100) - board.done) : 0;
  const days = daysUntil(progress.deadline, toDateString(new Date(now)));
  const remainingTasks = board.total - board.done;
  // 今日を含めて締め切り日までに、1日あたりいくつ工程を終わらせればよいか
  const pacePerDay = days !== null && days >= 0 && remainingTasks > 0 ? Math.ceil(remainingTasks / (days + 1)) : null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-fuchsia-400">STAGE {stageIndex + 1} / 5</p>
          <h2 className="text-lg font-black">{stage.label}</h2>
          <p className="text-sm text-zinc-400">
            {stage.comment}
            {next && `（次の「${next.label}」まであと ${remainingToNext} 工程）`}
          </p>
        </div>
        {stageIndex >= 2 && (
          <motion.span
            key="assistant"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-sm"
          >
            🧑‍🎨 アシスタント
          </motion.span>
        )}
      </div>

      <div className="mx-auto aspect-[210/297] w-full max-w-[280px] overflow-hidden rounded shadow-[0_0_40px_rgba(217,70,239,0.25)]">
        <ManuscriptPage stage={stageIndex} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm font-bold">
          <span>
            進捗 <span className="text-2xl tabular-nums">{Math.floor(percent)}</span>%
            <span className="ml-2 text-zinc-400">
              {board.pagesComplete} / {progress.targetPages} ページ完成
            </span>
          </span>
          <span className={days !== null && days <= 3 ? "text-red-400" : undefined}>
            {deadlineLabel(days)}
          </span>
        </div>
        <div className="h-5 overflow-hidden rounded-full bg-zinc-800">
          {/* 演出のカットインに合わせて「ズズズ…ドカン！」と伸びる */}
          <motion.div
            className="h-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-yellow-400"
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ delay: 0.8, duration: 0.7, ease: [0.8, 0, 0.2, 1.3] }}
          />
        </div>
        <p className="text-xs text-zinc-400">
          完了した工程 {board.done} / {board.total}
          {pacePerDay !== null && (
            <span className="ml-2 font-bold text-amber-300">締め切りまで 1日 {pacePerDay} 工程ペース</span>
          )}
        </p>
      </div>

      {isEditing ? (
        <GoalEditor onDone={() => setIsEditing(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1 self-end text-sm text-zinc-400 hover:text-white"
        >
          <Pencil className="size-4" /> ページ数・締め切りを設定
        </button>
      )}
    </section>
  );
}
