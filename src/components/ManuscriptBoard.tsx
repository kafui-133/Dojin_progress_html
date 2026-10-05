"use client";

import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { soundManager } from "@/lib/soundManager";
import { STAGES, getBoardStats, isPageComplete } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import type { StageId } from "@/types";

function formatDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * ページ × 工程（コマ割り・セリフ入れ・下書き・ペン入れ・仕上げ）のボタン表。
 * 押すとその日付で完了を記録し、演出が出る。完了済みを押すと取り消せる。
 */
export default function ManuscriptBoard() {
  const manuscript = useAppStore((s) => s.manuscript);
  const completeStage = useAppStore((s) => s.completeStage);
  const undoStage = useAppStore((s) => s.undoStage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLTableRowElement>(null);

  const board = getBoardStats(manuscript);
  const currentPage = manuscript.pages.findIndex((page) => !isPageComplete(page));

  // 作業中のページが見えるようにスクロールしておく
  useEffect(() => {
    const container = scrollRef.current;
    const row = currentRowRef.current;
    if (container && row) container.scrollTop = Math.max(0, row.offsetTop - container.clientHeight / 3);
  }, [currentPage]);

  const onCell = (page: number, stage: StageId, doneAt: number | undefined) => {
    if (doneAt === undefined) {
      soundManager.play("click");
      completeStage(page, stage);
      return;
    }
    const label = STAGES.find((s) => s.id === stage)?.label;
    if (confirm(`P${page + 1} の「${label}」の完了（${formatDay(doneAt)}）を取り消しますか？`)) undoStage(page, stage);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-black">📖 原稿ボード</h3>
        <span className="text-xs text-zinc-400 tabular-nums">
          {board.done} / {board.total} 工程・{board.pagesComplete}ページ完成
        </span>
      </div>

      <div ref={scrollRef} className="max-h-[420px] overflow-y-auto rounded-lg border border-white/10">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-900">
            <tr>
              <th className="w-10 py-1.5 text-zinc-500">P</th>
              {STAGES.map((stage) => (
                <th key={stage.id} className="py-1.5 font-bold text-zinc-200">
                  <span className="block text-base leading-none">{stage.emoji}</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} aria-hidden />
                    <span className="hidden sm:inline">{stage.label}</span>
                    <span className="sm:hidden">{stage.short}</span>
                  </span>
                  <span className="block font-normal text-zinc-500 tabular-nums">
                    {board.byStage[stage.id]}/{manuscript.pages.length}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {manuscript.pages.map((page, i) => {
              const complete = isPageComplete(page);
              const isCurrent = i === currentPage;
              return (
                <tr
                  key={i}
                  ref={isCurrent ? currentRowRef : undefined}
                  className={cn("border-t border-white/5", isCurrent && "bg-fuchsia-500/10")}
                >
                  <td className={cn("text-center font-black tabular-nums", complete ? "text-emerald-400" : "text-zinc-400")}>
                    {complete ? <Check className="mx-auto size-4" aria-label={`P${i + 1} 完成`} /> : i + 1}
                  </td>
                  {STAGES.map((stage) => {
                    const doneAt = page.done[stage.id];
                    const done = doneAt !== undefined;
                    return (
                      <td key={stage.id} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => onCell(i, stage.id, doneAt)}
                          aria-label={`P${i + 1} ${stage.label}${done ? ` 完了 ${formatDay(doneAt)}` : ""}`}
                          aria-pressed={done}
                          className={cn(
                            "h-8 w-full rounded-md font-bold tabular-nums transition active:scale-90",
                            done ? "text-zinc-950 shadow-inner" : "bg-zinc-800/80 text-zinc-500 hover:bg-zinc-700 hover:text-white",
                          )}
                          style={done ? { backgroundColor: stage.color } : undefined}
                        >
                          {done ? formatDay(doneAt) : "＋"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">押すと今日の日付で完了を記録します。完了済みを押すと取り消せます。</p>
    </div>
  );
}
