"use client";

import { CalendarDays, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { now as clockNow } from "@/lib/clock";
import { soundManager } from "@/lib/soundManager";
import { STAGES, getBoardStats, isPageComplete } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { toDateString, useActiveProject, useAppStore } from "@/store/useAppStore";
import type { StageId } from "@/types";
import Icon from "@/components/Icon";

function formatDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 日付（YYYY-MM-DD）のお昼の時刻。時差で前後の日にずれないようにする */
function dateToMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

/**
 * ページ × 工程（コマ割り・セリフ入れ・下書き・ペン入れ・仕上げ）のボタン表。
 * 押すとその日付で完了を記録し、演出が出る。完了済みを押すと取り消せる。
 * 「日付を指定して記録」にすると、過去の分を選んだ日付で記録・日付を直せる（EXP や演出は出さない）。
 */
export default function ManuscriptBoard() {
  const { manuscript } = useActiveProject();
  const completeStage = useAppStore((s) => s.completeStage);
  const undoStage = useAppStore((s) => s.undoStage);
  const setStageDate = useAppStore((s) => s.setStageDate);
  const today = toDateString(new Date(clockNow()));
  const [pickMode, setPickMode] = useState(false);
  const [pickDate, setPickDate] = useState(today);
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
    const label = STAGES.find((s) => s.id === stage)?.label;
    // 今日の分は、日付を指定していても普通に記録する（演出・EXP あり）
    const date = pickMode ? pickDate : today;
    if (doneAt === undefined) {
      soundManager.play("click");
      if (date === today) completeStage(page, stage);
      else setStageDate(page, stage, dateToMs(date));
      return;
    }
    if (pickMode && toDateString(new Date(doneAt)) !== date) {
      const at = dateToMs(date);
      if (confirm(`P${page + 1} の「${label}」の完了日を ${formatDay(doneAt)} → ${formatDay(at)} に直しますか？`)) {
        setStageDate(page, stage, at);
      }
      return;
    }
    if (confirm(`P${page + 1} の「${label}」の完了（${formatDay(doneAt)}）を取り消しますか？`)) undoStage(page, stage);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-black">
          <Icon name="manuscript" className="size-6" /> 原稿ボード
        </h3>
        <span className="text-xs text-zinc-400 tabular-nums">
          {board.done} / {board.total} 工程・{board.pagesComplete}ページ完成
        </span>
      </div>

      <div className={cn("flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-xs", pickMode ? "tone-shu border border-fuchsia-500" : "bg-zinc-800/60")}>
        <label className="flex cursor-pointer items-center gap-1.5 font-bold text-zinc-300">
          <input
            type="checkbox"
            checked={pickMode}
            onChange={(e) => {
              setPickMode(e.target.checked);
              if (e.target.checked) setPickDate(today);
            }}
            className="accent-fuchsia-500"
          />
          <CalendarDays className="size-4" /> 日付を指定して記録
        </label>
        {pickMode && (
          <input
            type="date"
            value={pickDate}
            max={today}
            onChange={(e) => e.target.value && setPickDate(e.target.value > today ? today : e.target.value)}
            aria-label="記録する日付"
            className="rounded bg-zinc-900 px-2 py-0.5 font-bold tabular-nums ring-1 ring-zinc-600"
          />
        )}
      </div>

      <div ref={scrollRef} className="max-h-[420px] overflow-y-auto rounded-lg border border-zinc-600">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-900">
            <tr>
              <th className="w-10 py-1.5 text-zinc-500">P</th>
              {STAGES.map((stage) => (
                <th key={stage.id} className="py-1.5 font-bold text-zinc-200">
                  <Icon name={stage.icon} className="mx-auto block size-6" />
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
                  className={cn("border-t border-zinc-700", isCurrent && "bg-fuchsia-500/10")}
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
                            done ? "text-zinc-950 shadow-inner" : "bg-zinc-800/80 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-50",
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
      <p className="text-xs text-zinc-500">
        {pickMode
          ? "押すと選んだ日付で完了を記録します（今日以外は EXP・演出なし）。完了済みを押すと、その日付に直せます（同じ日付なら取り消し）。"
          : "押すと今日の日付で完了を記録します。完了済みを押すと取り消せます。過去の分は「日付を指定して記録」で付けられます。"}
      </p>
    </div>
  );
}
