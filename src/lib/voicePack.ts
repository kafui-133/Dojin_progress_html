import { TtsError, type VoiceSource, countCachedVoices, putCachedVoice } from "@/lib/ttsCache";
import {
  DEFAULT_PACK_FEMALE,
  DEFAULT_PACK_MALE,
  VOICE_PACK_VOICES,
  buildVoicePackManifest,
  getVoicePackLines,
  getVoicePackVoice,
  parseVoicePackFileName,
} from "@/lib/voicePackManifest";

/**
 * 自作の音声（ファイル）: 手元の音声合成で作った WAV などを読み込んで、その声で読み上げる。
 * 読み込んだ音声は、ほかの声と同じ保存領域（IndexedDB）に入る。無いセリフはブラウザ標準の声で読む。
 */

/** 以前（かわいい役・渋い役の2つだけだったころ）に読み込んだ音声をそのまま使えるよう、保存のキーを引き継ぐ */
const LEGACY_SOURCE_IDS: Record<string, string> = {
  [DEFAULT_PACK_FEMALE]: "pack-female",
  [DEFAULT_PACK_MALE]: "pack-male",
};

const sources = new Map<string, VoiceSource>();

export function voicePackSource(voiceId: string): VoiceSource {
  const voice = getVoicePackVoice(voiceId) ?? getVoicePackVoice(DEFAULT_PACK_FEMALE)!;
  let source = sources.get(voice.id);
  if (!source) {
    source = {
      id: LEGACY_SOURCE_IDS[voice.id] ?? `pack-${voice.id}`,
      label: `自作の音声（${voice.label}）`,
      // その場では作れない（ファイルを読み込んでもらう）
      synthesize: () => Promise.reject(new TtsError("このセリフの音声ファイルはまだ読み込まれていません", "unavailable")),
    };
    sources.set(voice.id, source);
  }
  return source;
}

export interface VoicePackImportResult {
  imported: number;
  /** 決まりに合わない・一覧にないファイル名 */
  skipped: string[];
}

const AUDIO_TYPES: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
};

/** 再生のときに形式が分かるよう、種類が空のファイル（ブラウザによってある）には拡張子から付ける */
function withAudioType(file: File): Blob {
  if (file.type) return file;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return new Blob([file], { type: AUDIO_TYPES[ext] ?? "audio/wav" });
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
    await putCachedVoice(voicePackSource(parsed.voiceId), line.reading, withAudioType(file));
    result.imported++;
  }
  return result;
}

/** 読み込み済みの数（声ごと） */
export async function countVoicePack(): Promise<{ byVoice: Record<string, number>; total: number }> {
  const readings = getVoicePackLines().map((line) => line.reading);
  const byVoice: Record<string, number> = {};
  for (const voice of VOICE_PACK_VOICES) byVoice[voice.id] = await countCachedVoices(voicePackSource(voice.id), readings);
  return { byVoice, total: readings.length };
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
