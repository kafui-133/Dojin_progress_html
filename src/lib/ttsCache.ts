import { STORES, withStore } from "@/lib/db";

/**
 * 外部の音声合成（Gemini・VOICEVOX）で作ったセリフの音声を、ブラウザ（IndexedDB）に保存する。
 * 2回目からは保存したものを鳴らすので、待ち時間も API の利用回数もかからない。
 */

export class TtsError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "rate-limit" | "unavailable" | "other",
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}

/** 音声の作り手（Gemini のキャラクター、VOICEVOX の話者など） */
export interface VoiceSource {
  /** 保存のキーに使う。声や話し方が変わったら別のキーになるようにする */
  id: string;
  label: string;
  /** PC 内で動いていてすぐ作れるか（VOICEVOX）。遠くの API なら false（Gemini） */
  local: boolean;
  synthesize: (text: string) => Promise<Blob>;
}

const cacheKey = (source: VoiceSource, text: string) => `${source.id}|${text}`;

export async function getCachedVoice(source: VoiceSource, text: string): Promise<Blob | null> {
  try {
    return (
      (await withStore<Blob | undefined>(STORES.voiceCache, "readonly", (s) => s.get(cacheKey(source, text)))) ?? null
    );
  } catch {
    return null;
  }
}

export async function countCachedVoices(source: VoiceSource, texts: string[]): Promise<number> {
  let count = 0;
  for (const text of texts) if (await getCachedVoice(source, text)) count++;
  return count;
}

export async function generateAndCache(source: VoiceSource, text: string): Promise<Blob> {
  const blob = await source.synthesize(text);
  await withStore(STORES.voiceCache, "readwrite", (s) => s.put(blob, cacheKey(source, text)));
  return blob;
}

/** 同じセリフを同時に何度も作らないよう、作成中のものを共有する */
const inFlight = new Map<string, Promise<Blob>>();

export function generateShared(source: VoiceSource, text: string): Promise<Blob> {
  const key = cacheKey(source, text);
  let job = inFlight.get(key);
  if (!job) {
    job = generateAndCache(source, text).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}

// ---- まとめて準備 ----

const MAX_RATE_LIMIT_WAITS = 3;

export interface PrepareProgress {
  done: number;
  total: number;
  /** 上限に当たって待っているときの残り秒数 */
  waitingSec?: number;
}

/**
 * セリフをまとめて作って保存する。保存済みのものは飛ばすので、途中で止めても続きから再開できる。
 * @param intervalMs 1つ作るごとの間隔（API の無料枠に当たりにくくする）
 */
export async function prepareVoices(
  sources: VoiceSource[],
  texts: string[],
  intervalMs: number,
  onProgress: (progress: PrepareProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const jobs = texts.flatMap((text) => sources.map((source) => ({ text, source })));
  let done = 0;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (const { text, source } of jobs) {
    if (signal.aborted) return;
    if (await getCachedVoice(source, text)) {
      onProgress({ done: ++done, total: jobs.length });
      continue;
    }

    for (let waits = 0; ; waits++) {
      try {
        await generateShared(source, text);
        break;
      } catch (err) {
        if (!(err instanceof TtsError) || err.kind !== "rate-limit" || waits >= MAX_RATE_LIMIT_WAITS) throw err;
        // 上限に当たったら、指定された時間だけ待ってから続ける
        for (let left = Math.ceil(err.retryAfterMs / 1000); left > 0; left--) {
          if (signal.aborted) return;
          onProgress({ done, total: jobs.length, waitingSec: left });
          await sleep(1000);
        }
      }
    }
    onProgress({ done: ++done, total: jobs.length });
    if (intervalMs > 0) await sleep(intervalMs);
  }
}
