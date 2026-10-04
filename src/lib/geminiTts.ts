import { STORES, withStore } from "@/lib/db";

/**
 * Gemini（Google AI Studio）の音声合成で、自然な声のセリフを作る。
 * 作った音声はブラウザ（IndexedDB）に保存し、2回目からは保存したものを鳴らす。
 * API キーはこの PC のブラウザにだけ保存し、Google の API 以外には送らない。
 */

export const GEMINI_TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const KEY_STORAGE = "syuraba-booster:gemini-api-key";
export const API_KEY_PAGE = "https://aistudio.google.com/apikey";

export type CharacterGender = "female" | "male";

export interface VoiceCharacter {
  id: string;
  label: string;
  gender: CharacterGender;
  /** Gemini の声の名前 */
  voiceName: string;
  /** 演技の指示（セリフの前に付けて送る） */
  direction: string;
}

export const VOICE_CHARACTERS: VoiceCharacter[] = [
  {
    id: "cute",
    label: "かわいい女の子",
    gender: "female",
    voiceName: "Leda",
    direction: "Say it in a cute, bubbly, high-pitched anime girl voice, bursting with energy:",
  },
  {
    id: "oneesan",
    label: "優しいお姉さん",
    gender: "female",
    voiceName: "Aoede",
    direction: "Say it in a warm, gentle, encouraging big-sister voice with a soft smile:",
  },
  {
    id: "idol",
    label: "元気なアイドル",
    gender: "female",
    voiceName: "Zephyr",
    direction: "Say it like an excited idol cheering on stage, bright and sparkling:",
  },
  {
    id: "shibui",
    label: "渋い男性",
    gender: "male",
    voiceName: "Algenib",
    direction: "Say it in a deep, low, gravelly, dignified older man's voice, slowly and with weight:",
  },
  {
    id: "nekketsu",
    label: "熱血実況",
    gender: "male",
    voiceName: "Fenrir",
    direction: "Shout it like a passionate pachinko announcer, hyped up and dramatic:",
  },
  {
    id: "cool",
    label: "クールな男性",
    gender: "male",
    voiceName: "Charon",
    direction: "Say it in a calm, cool, confident low voice:",
  },
];

export const DEFAULT_FEMALE_CHARACTER = "cute";
export const DEFAULT_MALE_CHARACTER = "shibui";

export function getCharacter(id: string, gender: CharacterGender): VoiceCharacter {
  return (
    VOICE_CHARACTERS.find((c) => c.id === id && c.gender === gender) ??
    VOICE_CHARACTERS.find((c) => c.id === (gender === "female" ? DEFAULT_FEMALE_CHARACTER : DEFAULT_MALE_CHARACTER))!
  );
}

// ---- API キー ----

export function loadApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // 保存できない環境では、そのセッションの間だけ使えない
  }
}

// ---- 音声の生成 ----

export class GeminiTtsError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "rate-limit" | "other",
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Gemini が返す 16bit PCM（モノラル）に WAV のヘッダーを付ける */
export function pcmToWav(pcm: Uint8Array, sampleRate: number): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeText = (offset: number, text: string) =>
    [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  writeText(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // モノラル
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, pcm.length, true);
  return new Blob([header, pcm.slice().buffer], { type: "audio/wav" });
}

/** "30s" のような待ち時間の指定をミリ秒にする */
function parseRetryDelay(body: unknown): number {
  const details = (body as { error?: { details?: { retryDelay?: string }[] } })?.error?.details ?? [];
  const delay = details.find((d) => d.retryDelay)?.retryDelay;
  const seconds = delay ? parseFloat(delay) : NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : 30_000;
}

async function requestSpeech(model: string, text: string, character: VoiceCharacter, apiKey: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${character.direction} ${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voiceName } } },
      },
    }),
  });

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 429) throw new GeminiTtsError("利用上限に達しました", "rate-limit", parseRetryDelay(body));
    if (res.status === 400 && /api key/i.test(message)) throw new GeminiTtsError("API キーが正しくありません", "auth");
    if (res.status === 401 || res.status === 403) throw new GeminiTtsError("API キーが使えません", "auth");
    throw new GeminiTtsError(message, "other");
  }

  type Part = { inlineData?: { data: string; mimeType?: string } };
  const parts = (body as { candidates?: { content?: { parts?: Part[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
  const audio = parts.find((p) => p.inlineData?.data)?.inlineData;
  if (!audio) throw new GeminiTtsError("音声が返ってきませんでした", "other");
  const rate = Number(/rate=(\d+)/.exec(audio.mimeType ?? "")?.[1] ?? 24000);
  return pcmToWav(base64ToBytes(audio.data), rate);
}

let workingModel: string | null = null;

/** セリフ1つ分の音声を作る。新しいモデルが使えなければ1つ前のモデルで作る */
export async function synthesize(text: string, character: VoiceCharacter, apiKey: string): Promise<Blob> {
  const models = workingModel ? [workingModel] : GEMINI_TTS_MODELS;
  let lastError: unknown;
  for (const model of models) {
    try {
      const blob = await requestSpeech(model, text, character, apiKey);
      workingModel = model;
      return blob;
    } catch (err) {
      // キーの問題や上限はモデルを変えても同じなので、そのまま伝える
      if (err instanceof GeminiTtsError && err.kind !== "other") throw err;
      lastError = err;
    }
  }
  throw lastError;
}

// ---- 保存（キャッシュ） ----

export function cacheKey(character: VoiceCharacter, text: string): string {
  return `${character.voiceName}|${character.id}|${text}`;
}

export async function getCachedVoice(character: VoiceCharacter, text: string): Promise<Blob | null> {
  try {
    return (await withStore<Blob | undefined>(STORES.voiceCache, "readonly", (s) => s.get(cacheKey(character, text)))) ?? null;
  } catch {
    return null;
  }
}

async function putCachedVoice(character: VoiceCharacter, text: string, blob: Blob): Promise<void> {
  await withStore(STORES.voiceCache, "readwrite", (s) => s.put(blob, cacheKey(character, text)));
}

export async function countCachedVoices(character: VoiceCharacter, texts: string[]): Promise<number> {
  let count = 0;
  for (const text of texts) if (await getCachedVoice(character, text)) count++;
  return count;
}

export async function generateAndCache(text: string, character: VoiceCharacter, apiKey: string): Promise<Blob> {
  const blob = await synthesize(text, character, apiKey);
  await putCachedVoice(character, text, blob);
  return blob;
}

/** 何度も同じセリフを同時に作らないよう、作成中のものを覚えておく */
const inFlight = new Map<string, Promise<Blob>>();

/** 保存がなければ裏で作っておく（次に同じセリフが出たときに使う） */
export function generateInBackground(text: string, character: VoiceCharacter): void {
  const apiKey = loadApiKey();
  const key = cacheKey(character, text);
  if (!apiKey || inFlight.has(key)) return;
  const job = generateAndCache(text, character, apiKey).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  job.catch(() => {});
}

// ---- まとめて準備 ----

/** 無料枠の毎分の上限に当たりにくい間隔 */
const PREPARE_INTERVAL_MS = 4000;
const MAX_RATE_LIMIT_WAITS = 3;

export interface PrepareProgress {
  done: number;
  total: number;
  /** 上限に当たって待っているときの残り秒数 */
  waitingSec?: number;
}

/**
 * セリフをまとめて作って保存する。保存済みのものは飛ばすので、途中で止めても続きから再開できる。
 */
export async function prepareVoices(
  characters: VoiceCharacter[],
  texts: string[],
  onProgress: (progress: PrepareProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const apiKey = loadApiKey();
  if (!apiKey) throw new GeminiTtsError("API キーを入力してください", "auth");

  const jobs = texts.flatMap((text) => characters.map((character) => ({ text, character })));
  let done = 0;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (const { text, character } of jobs) {
    if (signal.aborted) return;
    if (await getCachedVoice(character, text)) {
      onProgress({ done: ++done, total: jobs.length });
      continue;
    }

    for (let waits = 0; ; waits++) {
      try {
        await generateAndCache(text, character, apiKey);
        break;
      } catch (err) {
        if (!(err instanceof GeminiTtsError) || err.kind !== "rate-limit" || waits >= MAX_RATE_LIMIT_WAITS) throw err;
        // 上限に当たったら、指定された時間だけ待ってから続ける
        for (let left = Math.ceil(err.retryAfterMs / 1000); left > 0; left--) {
          if (signal.aborted) return;
          onProgress({ done, total: jobs.length, waitingSec: left });
          await sleep(1000);
        }
      }
    }
    onProgress({ done: ++done, total: jobs.length });
    await sleep(PREPARE_INTERVAL_MS);
  }
}
