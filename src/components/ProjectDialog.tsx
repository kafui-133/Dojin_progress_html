"use client";

import { Download, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  EXPORT_KIND_LABEL,
  type ExportKind,
  ImportError,
  applyImport,
  describeImport,
  downloadExport,
  parseImport,
} from "@/lib/dataTransfer";
import { getBoardStats } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { DEFAULT_TARGET_PAGES, EMPTY_DAY, MAX_PAGES, formatDuration, useAppStore } from "@/store/useAppStore";
import type { Project, ProjectType } from "@/types";

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  manga: "📖 マンガ",
  illustration: "🎨 イラスト",
};

function projectSummary(project: Project): string {
  const days = Object.values(project.dailyStats);
  const penMs = days.reduce((sum, d) => sum + (d ?? EMPTY_DAY).strokeMs, 0);
  if (project.type === "manga") {
    const board = getBoardStats(project.manuscript);
    return `${project.targetPages}P・進捗 ${Math.floor(board.percent)}%・ペン ${formatDuration(penMs)}`;
  }
  const strokes = days.reduce((sum, d) => sum + d.strokes, 0);
  return `線 ${strokes.toLocaleString()}本・ペン ${formatDuration(penMs)}`;
}

function NewProjectForm({ onCreated }: { onCreated: () => void }) {
  const createProject = useAppStore((s) => s.createProject);
  const [type, setType] = useState<ProjectType>("manga");
  const [name, setName] = useState("");
  const [pages, setPages] = useState(String(DEFAULT_TARGET_PAGES));
  const [deadline, setDeadline] = useState("");

  return (
    <form
      className="flex flex-col gap-3 rounded-lg bg-zinc-800/60 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        createProject({ name, type, targetPages: Number(pages), deadline });
        setName("");
        onCreated();
      }}
    >
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-900 p-1">
        {(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "rounded-md py-1.5 font-bold transition",
              type === t ? "bg-fuchsia-600 text-white" : "text-zinc-400 hover:text-white",
            )}
          >
            {PROJECT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        名前
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === "manga" ? "例: 冬コミ新刊" : "例: 誕生日イラスト"}
          className="rounded-lg bg-zinc-900 px-3 py-2"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        {type === "manga" && (
          <label className="flex flex-col gap-1">
            総ページ数
            <input
              type="number"
              min={1}
              max={MAX_PAGES}
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              className="w-24 rounded-lg bg-zinc-900 px-3 py-2"
            />
          </label>
        )}
        <label className="flex flex-col gap-1">
          締め切り（任意）
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-lg bg-zinc-900 px-3 py-2"
          />
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        {type === "manga"
          ? "マンガはページごとの工程（コマ割り〜仕上げ）と、線・セリフなどの作業量を記録します。"
          : "イラストは線の本数・長さ・ペン時間・やり直し（Ctrl+Z）を記録し、イラスト用のグラフで見られます。"}
      </p>
      <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-fuchsia-600 py-2 font-bold hover:bg-fuchsia-500">
        <Plus className="size-4" /> 作成して切り替える
      </button>
    </form>
  );
}

function DataTransfer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      const parsed = parseImport(await file.text());
      if (!confirm(describeImport(parsed))) return;
      applyImport(parsed);
      setMessage({ tone: "ok", text: `「${file.name}」を読み込みました（${parsed.projects.length} プロジェクト）` });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof ImportError ? err.message : `読み込めませんでした: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-zinc-300">JSON で保存</span>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(EXPORT_KIND_LABEL) as ExportKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => downloadExport(kind)}
            className="flex items-center justify-center gap-1 rounded-lg bg-zinc-700 px-3 py-2 font-bold hover:bg-zinc-600"
          >
            <Download className="size-4" /> {EXPORT_KIND_LABEL[kind]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center justify-center gap-1 rounded-lg bg-zinc-800 px-3 py-2 font-bold ring-1 ring-white/10 hover:bg-zinc-700"
      >
        <Upload className="size-4" /> JSON を読み込む
      </button>
      <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <p className="text-xs text-zinc-500">
        マンガ・イラストのデータは今のプロジェクトに追加されます（同じプロジェクトは上書き）。統合データはすべての記録を置き換えます。自分の曲・作った声は含まれません。
      </p>
      {message && <p className={cn("text-xs", message.tone === "ok" ? "text-emerald-300" : "text-red-400")}>{message.text}</p>}
    </div>
  );
}

/** プロジェクトの切り替え・作成・削除と、データの保存・読み込み */
export default function ProjectDialog({ onClose }: { onClose: () => void }) {
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const switchProject = useAppStore((s) => s.switchProject);
  const renameProject = useAppStore((s) => s.renameProject);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-title"
        className="flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="project-title" className="text-lg font-black">
            プロジェクト
          </h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-1.5 hover:bg-zinc-800">
            <X className="size-5" />
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {projects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <li
                key={project.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-3",
                  active ? "border-fuchsia-500/60 bg-fuchsia-500/10" : "border-white/10 bg-zinc-800/40",
                )}
              >
                <button
                  type="button"
                  onClick={() => switchProject(project.id)}
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                  aria-pressed={active}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="shrink-0 rounded bg-zinc-950 px-1.5 py-0.5 text-[11px] font-bold text-zinc-300">
                      {PROJECT_TYPE_LABEL[project.type]}
                    </span>
                    <span className="truncate font-bold">{project.name}</span>
                    {active && <span className="shrink-0 text-xs font-bold text-fuchsia-300">使用中</span>}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {projectSummary(project)}
                    {project.deadline && `・締め切り ${project.deadline}`}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`${project.name} の名前を変える`}
                  onClick={() => {
                    const name = prompt("新しい名前", project.name);
                    if (name) renameProject(project.id, name);
                  }}
                  className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`${project.name} を削除`}
                  disabled={projects.length <= 1}
                  onClick={() => {
                    if (confirm(`「${project.name}」の記録をすべて削除します。先に JSON で保存しておくと安心です。削除しますか？`)) {
                      deleteProject(project.id);
                    }
                  }}
                  className="rounded p-1.5 text-zinc-400 hover:bg-red-950 hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>

        {creating ? (
          <NewProjectForm onCreated={() => setCreating(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center justify-center gap-1 rounded-lg bg-fuchsia-600 py-2 text-sm font-bold hover:bg-fuchsia-500"
          >
            <Plus className="size-4" /> 新しいプロジェクト
          </button>
        )}

        <div className="border-t border-white/10 pt-4">
          <DataTransfer />
        </div>
      </div>
    </div>,
    document.body,
  );
}
