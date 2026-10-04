import { Howl } from "howler";
import { useSyncExternalStore } from "react";
import { geminiSource, getCharacter } from "@/lib/geminiTts";
import { soundManager } from "@/lib/soundManager";
import { type VoiceSource, generateShared, getCachedVoice } from "@/lib/ttsCache";
import { voicevoxSource } from "@/lib/voicevox";
import type { AppSettings } from "@/types";

/**
 * カットインの文字の読み上げ。
 * - ブラウザ標準: 内蔵の音声合成（Web Speech API）。Windows の Edge なら「Nanami」「Keita」、
 *   Chrome なら「Google 日本語」や Windows 標準の「Haruka」「Ichiro」などが使える。
 * - Gemini（Google AI Studio の自然な声）・VOICEVOX: 作って保存した音声を鳴らす。
 *   まだ無いセリフは、VOICEVOX ならその場で作って鳴らし、
 *   Gemini（または VOICEVOX が間に合わないとき）はブラウザ標準の声で読みつつ次回用に作っておく。
 */

export type VoiceMode = "off" | "female" | "male" | "alternate";
export type VoiceGender = "female" | "male";

export const VOICE_MODE_LABEL: Record<VoiceMode, string> = {
  off: "OFF",
  female: "女性",
  male: "渋い男性",
  alternate: "交互",
};

const FEMALE_NAMES = /nanami|aoi|mayu|shiori|haruka|ayumi|sayaka|google 日本語|kyoko|o-ren/i;
const MALE_NAMES = /keita|daichi|naoki|ichiro|otoya|hattori/i;

/** 声ごとの調子。男性は低めでゆっくり＝渋く、女性は少し高めで元気に */
const STYLE: Record<VoiceGender, { pitch: number; rate: number }> = {
  female: { pitch: 1.15, rate: 1.1 },
  male: { pitch: 0.6, rate: 0.95 },
};

/** 表示用の文字を、読み上げやすい文字に置き換える */
const READINGS: [RegExp, string][] = [
  [/ZONE/g, "ゾーン"],
  [/FEVER/g, "フィーバー"],
  [/EXP×(\d+)/g, "経験値$1倍"],
  [/×/g, "かける"],
  [/(\d+)m/g, "$1メートル"],
];

export function toReading(text: string): string {
  return READINGS.reduce((t, [pattern, reading]) => t.replace(pattern, reading), text);
}

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

let alternateNext: VoiceGender = "female";
let current: SpeechSynthesisUtterance | null = null;
/** 新しい読み上げが始まったら、それより前の（非同期の）読み上げは取りやめる */
let speakToken = 0;

export interface SpeakOptions {
  mode: VoiceMode;
  femaleVoiceUri?: string;
  maleVoiceUri?: string;
  /** 外部の声（Gemini・VOICEVOX）。null ならブラウザ標準の声 */
  sources?: Record<VoiceGender, VoiceSource | null>;
  volume?: number;
}

/** PC 内の VOICEVOX は、この時間までなら作り終わるのを待ってから鳴らす */
const LOCAL_WAIT_MS = 2500;

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

function playVoiceBlob(key: string, blob: Blob, volume: number): void {
  let howl = voiceHowls.get(key);
  if (!howl) {
    howl = new Howl({ src: [URL.createObjectURL(blob)], format: ["wav"] });
    voiceHowls.set(key, howl);
  }
  const target = howl;
  playingHowl = target;
  target.volume(volume);
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

const sleep = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

export function speak(text: string, options: SpeakOptions): void {
  const { mode, volume = 1 } = options;
  if (mode === "off") return;

  let gender: VoiceGender;
  if (mode === "alternate") {
    gender = alternateNext;
    alternateNext = gender === "female" ? "male" : "female";
  } else {
    gender = mode;
  }

  const reading = toReading(text);
  const token = ++speakToken;
  stopAll();

  const source = options.sources?.[gender] ?? null;
  if (!source) {
    speakWithBrowser(reading, gender, options);
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
    if (source.local) {
      const blob = await Promise.race([job, sleep(LOCAL_WAIT_MS)]).catch(() => null);
      if (token !== speakToken) return;
      if (blob) {
        playVoiceBlob(`${source.id}|${reading}`, blob, volume);
        return;
      }
    }
    // 間に合わない・作れないときはブラウザの声で読む（作れたものは次回から使われる）
    speakWithBrowser(reading, gender, options);
  })();
}

function speakWithBrowser(reading: string, gender: VoiceGender, options: SpeakOptions): void {
  if (!isSupported()) return;
  const { femaleVoiceUri, maleVoiceUri, volume = 1 } = options;
  const voice = pickVoice(gender, gender === "female" ? femaleVoiceUri : maleVoiceUri);
  const utterance = new SpeechSynthesisUtterance(reading);
  utterance.lang = "ja-JP";
  if (voice) utterance.voice = voice;
  utterance.pitch = STYLE[gender].pitch;
  utterance.rate = STYLE[gender].rate;
  utterance.volume = volume;

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

/** 設定に合わせた、男女それぞれの外部の声（ブラウザ標準なら null） */
export function voiceSources(settings: AppSettings): Record<VoiceGender, VoiceSource | null> {
  if (settings.ttsEngine === "gemini") {
    return {
      female: geminiSource(getCharacter(settings.geminiFemaleCharacter, "female")),
      male: geminiSource(getCharacter(settings.geminiMaleCharacter, "male")),
    };
  }
  if (settings.ttsEngine === "voicevox") {
    return {
      female: voicevoxSource(settings.voicevoxFemaleStyle, "female"),
      male: voicevoxSource(settings.voicevoxMaleStyle, "male"),
    };
  }
  return { female: null, male: null };
}

/** 保存されている設定から読み上げのオプションを作る */
export function voiceOptions(settings: AppSettings): SpeakOptions {
  return {
    mode: settings.voiceMode,
    femaleVoiceUri: settings.femaleVoiceUri,
    maleVoiceUri: settings.maleVoiceUri,
    sources: voiceSources(settings),
  };
}

/** 設定画面のテスト用。保存がなければその場で作って、その声で鳴らす（作れなければエラー） */
export async function previewSource(source: VoiceSource, text: string): Promise<void> {
  const reading = toReading(text);
  const token = ++speakToken;
  stopAll();
  const blob = (await getCachedVoice(source, reading)) ?? (await generateShared(source, reading));
  if (token === speakToken) playVoiceBlob(`${source.id}|${reading}`, blob, 1);
}
