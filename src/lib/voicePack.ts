import { TtsError, type VoiceSource, countCachedVoices, putCachedVoice } from "@/lib/ttsCache";
import {
  type VoicePackGender,
  buildVoicePackManifest,
  getVoicePackLines,
  parseVoicePackFileName,
} from "@/lib/voicePackManifest";

/**
 * 自作の音声（ファイル）: 手元の音声合成で作った WAV などを読み込んで、その声で読み上げる。
 * 読み込んだ音声は、ほかの声と同じ保存領域（IndexedDB）に入る。無いセリフはブラウザ標準の声で読む。
 */

const LABEL: Record<VoicePackGender, string> = { female: "自作の音声（かわいい役）", male: "自作の音声（渋い役）" };

const sources = new Map<VoicePackGender, VoiceSource>();

export function voicePackSource(gender: VoicePackGender): VoiceSource {
  let source = sources.get(gender);
  if (!source) {
    source = {
      id: `pack-${gender}`,
      label: LABEL[gender],
      local: false,
      // その場では作れない（ファイルを読み込んでもらう）
      synthesize: () => Promise.reject(new TtsError("このセリフの音声ファイルはまだ読み込まれていません", "unavailable")),
    };
    sources.set(gender, source);
  }
  return source;
}

export interface VoicePackImportResult {
  imported: number;
  /** 決まりに合わない・一覧にないファイル名 */
  skipped: string[];
}

/** 選んだファイルのうち、ファイル名が一覧に合うものを読み込む（同じものは上書き） */
export async function importVoicePackFiles(files: File[]): Promise<VoicePackImportResult> {
  const byId = new Map(getVoicePackLines().map((line) => [line.id, line]));
  const result: VoicePackImportResult = { imported: 0, skipped: [] };
  for (const file of files) {
    const parsed = parseVoicePackFileName(file.name);
    const line = parsed && byId.get(parsed.id);
    if (!parsed || !line) {
      result.skipped.push(file.name);
      continue;
    }
    await putCachedVoice(voicePackSource(parsed.gender), line.reading, file);
    result.imported++;
  }
  return result;
}

/** 読み込み済みの数（男女それぞれ） */
export async function countVoicePack(): Promise<Record<VoicePackGender, number> & { total: number }> {
  const readings = getVoicePackLines().map((line) => line.reading);
  return {
    female: await countCachedVoices(voicePackSource("female"), readings),
    male: await countCachedVoices(voicePackSource("male"), readings),
    total: readings.length,
  };
}

/** セリフの一覧（lines.json）をダウンロードする */
export function downloadVoicePackManifest(): void {
  const blob = new Blob([JSON.stringify(buildVoicePackManifest(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lines.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
