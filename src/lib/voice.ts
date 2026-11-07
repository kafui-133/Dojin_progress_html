import { Howl } from "howler";
import { useSyncExternalStore } from "react";
import { GEMINI_ENABLED } from "@/lib/edition";
import { findCharacter, geminiSource, getCharacter } from "@/lib/geminiTts";
import { soundManager } from "@/lib/soundManager";
import { type VoiceSource, generateShared, getCachedVoice } from "@/lib/ttsCache";
import { toReading } from "@/lib/voiceLines";
import { voicePackSource } from "@/lib/voicePack";
import type { AppSettings } from "@/types";

/**
 * カットインの文字の読み上げ。
 * - ブラウザ標準: 内蔵の音声合成（Web Speech API）。Windows の Edge なら「Nanami」「Keita」、
 *   Chrome なら「Google 日本語」や Windows 標準の「Haruka」「Ichiro」などが使える。
 * - Gemini（Google AI Studio の自然な声）: 作って保存した音声を鳴らす。
 *   まだ無いセリフはブラウザ標準の声で読みつつ、次回用に作っておく。
 * - 自作の音声: 読み込んだ音声ファイルを鳴らす（無いセリフはブラウザ標準の声）。
 */

export type VoiceMode = "off" | "female" | "male" | "third" | "alternate";
export type VoiceGender = "female" | "male";
/** 読み上げる人（保存の値は以前の名前のまま。female = 1人目、male = 2人目） */
export type VoiceSlot = "female" | "male" | "third";

export const VOICE_SLOTS: VoiceSlot[] = ["female", "male", "third"];

export const VOICE_SLOT_LABEL: Record<VoiceSlot, string> = {
  female: "1人目",
  male: "2人目",
  third: "3人目",
};

export const VOICE_MODE_LABEL: Record<VoiceMode, string> = {
  off: "OFF",
  female: "1人目",
  male: "2人目",
  third: "3人目",
  alternate: "シャッフル",
};

/** ブラウザ標準の声を自動で選ぶときの性別 */
export const SLOT_GENDER: Record<VoiceSlot, VoiceGender> = { female: "female", male: "male", third: "female" };

const FEMALE_NAMES = /nanami|aoi|mayu|shiori|haruka|ayumi|sayaka|google 日本語|kyoko|o-ren/i;
const MALE_NAMES = /keita|daichi|naoki|ichiro|otoya|hattori/i;

/** ブラウザ標準の声の調子。1人目は少し高めで元気に、2人目は低めでゆっくり＝渋く、3人目はそのまま */
const STYLE: Record<VoiceSlot, { pitch: number; rate: number }> = {
  female: { pitch: 1.15, rate: 1.1 },
  male: { pitch: 0.6, rate: 0.95 },
  third: { pitch: 1, rate: 1 },
};

export { toReading } from "@/lib/voiceLines";

function isSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// ---- 使える日本語の声の一覧（読み込みが非同期なので購読する） ----

let cachedVoices: SpeechSynthesisVoice[] = [];
let cachedKey = "";
const EMPTY: SpeechSynthesisVoice[] = [];

function readVoices(): SpeechSynthesisVoice[] {
  if (!isSupported()) return EMPTY;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ja"));
  const key = voices.map((v) => v.voiceURI).join("|");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedVoices = voices;
  }
  return cachedVoices;
}

function subscribeVoices(onChange: () => void): () => void {
  if (!isSupported()) return () => {};
  speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => speechSynthesis.removeEventListener("voiceschanged", onChange);
}

export function useJapaneseVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(subscribeVoices, readVoices, () => EMPTY);
}

export function guessGender(voice: SpeechSynthesisVoice): VoiceGender | null {
  if (MALE_NAMES.test(voice.name)) return "male";
  if (FEMALE_NAMES.test(voice.name)) return "female";
  return null;
}

/** 指定がなければ、性別に合う声のうち高品質（Natural / Online）なものを選ぶ */
export function pickVoice(gender: VoiceGender, preferredUri = ""): SpeechSynthesisVoice | null {
  const voices = readVoices();
  if (preferredUri) {
    const chosen = voices.find((v) => v.voiceURI === preferredUri);
    if (chosen) return chosen;
  }
  const matching = voices.filter((v) => guessGender(v) === gender);
  const pool = matching.length > 0 ? matching : voices;
  return pool.find((v) => /natural|online/i.test(v.name)) ?? pool[0] ?? null;
}

// ---- 読み上げ ----

/** シャッフルで、同じ人が続かないようにする */
let lastShuffled: VoiceSlot | null = null;
let current: SpeechSynthesisUtterance | null = null;
/** 新しい読み上げが始まったら、それより前の（非同期の）読み上げは取りやめる */
let speakToken = 0;

export interface SpeakOptions {
  mode: VoiceMode;
  /** ブラウザ標準の声（空なら自動） */
  voiceUris?: Partial<Record<VoiceSlot, string>>;
  /** 外部の声（Gemini・自作の音声）。null ならブラウザ標準の声 */
  sources?: Record<VoiceSlot, VoiceSource | null>;
  volume?: number;
}


// ---- 作った音声の再生 ----

const voiceHowls = new Map<string, Howl>();
let playingHowl: Howl | null = null;

function stopAll(): void {
  // 打ち切った読み上げの終了通知で BGM を戻さないよう、先に忘れる
  current = null;
  if (isSupported()) speechSynthesis.cancel();
  playingHowl?.stop();
  playingHowl = null;
}

/** 保存した音声の形式（Gemini は WAV、自作の音声は読み込んだファイルの形式。OGG などもある） */
function blobFormat(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("ogg") || type.includes("opus")) return "ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("flac")) return "flac";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  return "wav";
}

/** 読み上げの音量（設定 0〜1）を 1 にしたときの大きさ。効果音と同じく控えめにする */
const VOICE_MAX_VOLUME = 0.6;

function playVoiceBlob(key: string, blob: Blob, volume: number): void {
  let howl = voiceHowls.get(key);
  if (!howl) {
    howl = new Howl({ src: [URL.createObjectURL(blob)], format: [blobFormat(blob)] });
    voiceHowls.set(key, howl);
  }
  const target = howl;
  playingHowl = target;
  target.volume(volume * VOICE_MAX_VOLUME);
  soundManager.duck(true);
  const restore = () => {
    if (playingHowl !== target) return;
    playingHowl = null;
    soundManager.duck(false);
  };
  target.once("end", restore);
  target.once("stop", restore);
  target.play();
}

export function speak(text: string, options: SpeakOptions): void {
  const { mode, volume = 1 } = options;
  if (mode === "off") return;

  let slot: VoiceSlot;
  if (mode === "alternate") {
    const candidates = VOICE_SLOTS.filter((s) => s !== lastShuffled);
    slot = candidates[Math.floor(Math.random() * candidates.length)];
    lastShuffled = slot;
  } else {
    slot = mode;
  }

  const reading = toReading(text);
  const token = ++speakToken;
  stopAll();

  const source = options.sources?.[slot] ?? null;
  if (!source) {
    speakWithBrowser(reading, slot, options);
    return;
  }

  void (async () => {
    const cached = await getCachedVoice(source, reading);
    if (token !== speakToken) return;
    if (cached) {
      playVoiceBlob(`${source.id}|${reading}`, cached, volume);
      return;
    }
    const job = generateShared(source, reading);
    job.catch(() => {});
    // 間に合わない・作れないときはブラウザの声で読む（作れたものは次回から使われる）
    speakWithBrowser(reading, slot, options);
  })();
}

function speakWithBrowser(reading: string, slot: VoiceSlot, options: SpeakOptions): void {
  if (!isSupported()) return;
  const { volume = 1 } = options;
  const voice = pickVoice(SLOT_GENDER[slot], options.voiceUris?.[slot]);
  const utterance = new SpeechSynthesisUtterance(reading);
  utterance.lang = "ja-JP";
  if (voice) utterance.voice = voice;
  utterance.pitch = STYLE[slot].pitch;
  utterance.rate = STYLE[slot].rate;
  utterance.volume = volume * VOICE_MAX_VOLUME;

  current = utterance;
  soundManager.duck(true);
  // cancel() で打ち切った前の読み上げの終了通知では BGM を戻さない
  const restore = () => {
    if (current !== utterance) return;
    current = null;
    soundManager.duck(false);
  };
  utterance.onend = restore;
  utterance.onerror = restore;
  speechSynthesis.speak(utterance);
}

/** 設定に合わせた、1〜3人目それぞれの外部の声（ブラウザ標準なら null） */
export function voiceSources(settings: AppSettings): Record<VoiceSlot, VoiceSource | null> {
  // 配布版では Gemini を使わない（読み込んだデータが Gemini のままでもブラウザ標準の声で読む）
  if (settings.ttsEngine === "gemini" && GEMINI_ENABLED) {
    return {
      female: geminiSource(getCharacter(settings.geminiFemaleCharacter, "female")),
      male: geminiSource(getCharacter(settings.geminiMaleCharacter, "male")),
      third: geminiSource(findCharacter(settings.geminiThirdCharacter, "female")),
    };
  }
  if (settings.ttsEngine === "pack") {
    return {
      female: voicePackSource(settings.voicePackFemale),
      male: voicePackSource(settings.voicePackMale),
      third: voicePackSource(settings.voicePackThird),
    };
  }
  return { female: null, male: null, third: null };
}

/** 保存されている設定から読み上げのオプションを作る */
export function voiceOptions(settings: AppSettings): SpeakOptions {
  return {
    mode: settings.voiceMode,
    voiceUris: { female: settings.femaleVoiceUri, male: settings.maleVoiceUri, third: settings.thirdVoiceUri },
    sources: voiceSources(settings),
    volume: settings.voiceVolume,
  };
}

/** 設定画面のテスト用。保存がなければその場で作って、その声で鳴らす（作れなければエラー） */
export async function previewSource(source: VoiceSource, text: string, volume = 1): Promise<void> {
  const reading = toReading(text);
  const token = ++speakToken;
  stopAll();
  const blob = (await getCachedVoice(source, reading)) ?? (await generateShared(source, reading));
  if (token === speakToken) playVoiceBlob(`${source.id}|${reading}`, blob, volume);
}
