import { useSyncExternalStore } from "react";
import { soundManager } from "@/lib/soundManager";

/**
 * カットインの文字の読み上げ（ブラウザ内蔵の音声合成 Web Speech API）。
 * Windows の Edge なら高品質な「Nanami（女性）」「Keita（男性）」、
 * Chrome なら「Google 日本語」や Windows 標準の「Haruka」「Ichiro」などが使える。
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

export interface SpeakOptions {
  mode: VoiceMode;
  femaleVoiceUri?: string;
  maleVoiceUri?: string;
  volume?: number;
}

export function speak(text: string, { mode, femaleVoiceUri, maleVoiceUri, volume = 1 }: SpeakOptions): void {
  if (mode === "off" || !isSupported()) return;

  let gender: VoiceGender;
  if (mode === "alternate") {
    gender = alternateNext;
    alternateNext = gender === "female" ? "male" : "female";
  } else {
    gender = mode;
  }

  const voice = pickVoice(gender, gender === "female" ? femaleVoiceUri : maleVoiceUri);
  const utterance = new SpeechSynthesisUtterance(toReading(text));
  utterance.lang = "ja-JP";
  if (voice) utterance.voice = voice;
  utterance.pitch = STYLE[gender].pitch;
  utterance.rate = STYLE[gender].rate;
  utterance.volume = volume;

  // 次の演出が来たら前の読み上げは打ち切る（溜まって遅れないように）
  current = utterance;
  speechSynthesis.cancel();
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
