import { STAGES, resizePages } from "@/lib/stages";
import {
  type AppState,
  MAX_PAGES,
  SETTING_KEYS,
  normalizeDailyStats,
  toDateString,
  useAppStore,
} from "@/store/useAppStore";
import type { AppSettings, ManuscriptPage, Project, ProjectType, StageId, UserProgress } from "@/types";

/**
 * 記録の保存・読み込み（JSON ファイル）。
 * - manga: 漫画のプロジェクトだけ / illustration: イラストのプロジェクトだけ
 * - all: 統合データ（全プロジェクト・EXP などの全体の記録・設定）
 * 自分の曲・作った声の音声は大きいので含めない（API キーも含めない）。
 */

export type ExportKind = "manga" | "illustration" | "all";

export const EXPORT_KIND_LABEL: Record<ExportKind, string> = {
  manga: "マンガのデータ",
  illustration: "イラストのデータ",
  all: "統合データ（すべて）",
};

interface ExportFile {
  app: "syuraba-booster";
  kind: ExportKind;
  version: 1;
  exportedAt: string;
  projects: Project[];
  progress?: UserProgress;
  settings?: Partial<AppSettings>;
  activeProjectId?: string;
}

export function buildExport(kind: ExportKind, state: AppState = useAppStore.getState()): ExportFile {
  const projects = kind === "all" ? state.projects : state.projects.filter((p) => p.type === kind);
  return {
    app: "syuraba-booster",
    kind,
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
    ...(kind === "all" && {
      progress: state.progress,
      settings: Object.fromEntries(SETTING_KEYS.map((key) => [key, state[key]])) as Partial<AppSettings>,
      activeProjectId: state.activeProjectId,
    }),
  };
}

export function downloadExport(kind: ExportKind): void {
  const file = buildExport(kind);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `syuraba-${kind}-${toDateString(new Date()).replaceAll("-", "")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- 読み込み（ファイルの中身は信用せず、形を確かめてから使う） ----

export class ImportError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const STAGE_IDS = new Set<string>(STAGES.map((s) => s.id));
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function toNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function sanitizePage(raw: unknown): ManuscriptPage {
  const done: ManuscriptPage["done"] = {};
  if (isRecord(raw) && isRecord(raw.done)) {
    for (const [stage, at] of Object.entries(raw.done)) {
      if (STAGE_IDS.has(stage) && typeof at === "number" && Number.isFinite(at)) done[stage as StageId] = at;
    }
  }
  return { done };
}

function sanitizeProject(raw: unknown): Project {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) throw new ImportError("プロジェクトの形式が正しくありません");
  const type: ProjectType = raw.type === "illustration" ? "illustration" : "manga";
  const targetPages = type === "manga" ? Math.min(MAX_PAGES, Math.max(1, Math.floor(toNumber(raw.targetPages, 1)))) : 0;
  const manuscript = isRecord(raw.manuscript) ? raw.manuscript : {};
  const pages = Array.isArray(manuscript.pages) ? manuscript.pages.map(sanitizePage) : [];
  const dailyRaw = isRecord(raw.dailyStats) ? raw.dailyStats : {};
  const daily = Object.fromEntries(
    Object.entries(dailyRaw)
      .filter(([date, day]) => DATE_KEY.test(date) && isRecord(day))
      .map(([date, day]) => [
        date,
        Object.fromEntries(Object.entries(day as Record<string, unknown>).map(([k, v]) => [k, toNumber(v)])),
      ]),
  );
  return {
    id: raw.id.slice(0, 100),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 100) : "読み込んだプロジェクト",
    type,
    createdAt: toNumber(raw.createdAt, Date.now()),
    targetPages,
    deadline: typeof raw.deadline === "string" && DATE_KEY.test(raw.deadline) ? raw.deadline : "",
    manuscript: { pages: resizePages(pages, targetPages), startedAt: toNumber(manuscript.startedAt) },
    dailyStats: normalizeDailyStats(daily),
  };
}

export function parseImport(text: string): ExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("JSON ファイルとして読めませんでした");
  }
  if (!isRecord(data) || data.app !== "syuraba-booster") throw new ImportError("進捗ブースターで保存したファイルではありません");
  const kind = data.kind;
  if (kind !== "manga" && kind !== "illustration" && kind !== "all") throw new ImportError("データの種類が分かりません");
  if (!Array.isArray(data.projects)) throw new ImportError("プロジェクトが入っていません");

  const projects = data.projects.map(sanitizeProject);
  const file: ExportFile = { app: "syuraba-booster", kind, version: 1, exportedAt: String(data.exportedAt ?? ""), projects };
  if (kind === "all") {
    if (isRecord(data.progress)) {
      file.progress = Object.fromEntries(
        Object.entries(data.progress).map(([k, v]) => [k, typeof v === "string" ? v : toNumber(v)]),
      ) as unknown as UserProgress;
    }
    const settings = data.settings;
    if (isRecord(settings)) {
      const defaults = useAppStore.getState();
      // 設定は、今ある項目と同じ型のものだけ受け取る
      file.settings = Object.fromEntries(
        SETTING_KEYS.filter((key) => key in settings && typeof settings[key] === typeof defaults[key]).map((key) => [
          key,
          settings[key],
        ]),
      ) as Partial<AppSettings>;
    }
    if (typeof data.activeProjectId === "string") file.activeProjectId = data.activeProjectId;
  }
  return file;
}

/** 読み込んだ内容の説明（確認ダイアログ用） */
export function describeImport(file: ExportFile, state: AppState = useAppStore.getState()): string {
  const names = file.projects.map((p) => `・${p.type === "manga" ? "📖" : "🎨"} ${p.name}`).join("\n");
  if (file.kind === "all") {
    return `統合データを読み込みます。いまの記録（${state.projects.length} プロジェクト・EXP など）はすべて置き換わります。\n\n${names}`;
  }
  const overwrite = file.projects.filter((p) => state.projects.some((q) => q.id === p.id)).length;
  return `${EXPORT_KIND_LABEL[file.kind]}を読み込みます（${file.projects.length} プロジェクト）。${
    overwrite > 0 ? `\nそのうち ${overwrite} 件は同じプロジェクトなので、ファイルの内容で上書きします。` : ""
  }\n\n${names}`;
}

export function applyImport(file: ExportFile): void {
  if (file.projects.length === 0) throw new ImportError("プロジェクトが1つも入っていません");
  const store = useAppStore.getState();
  if (file.kind === "all") {
    const activeProjectId = file.projects.some((p) => p.id === file.activeProjectId)
      ? file.activeProjectId!
      : file.projects[0].id;
    useAppStore.setState({
      projects: file.projects,
      activeProjectId,
      ...(file.progress && { progress: { ...store.progress, ...file.progress } }),
      ...file.settings,
    });
    return;
  }
  // マンガ・イラストのデータは、今のプロジェクトに足す（同じプロジェクトは上書き）
  store.mergeProjects(file.projects.filter((p) => p.type === file.kind));
}
