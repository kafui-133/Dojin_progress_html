import { Howl } from "howler";
import { useSyncExternalStore } from "react";
import {
  type VoiceCharacter,
  cacheKey,
  generateAndCache,
  generateInBackground,
  getCachedVoice,
  getCharacter,
  loadApiKey,
} from "@/lib/geminiTts";
import { soundManager } from "@/lib/soundManager";

/**
 * カットインの文字の読み上げ。
 * - ブラウザ標準: 内蔵の音声合成（Web Speech API）。Windows の Edge なら「Nanami」「Keita」、
 *   Chrome なら「Google 日本語」や Windows 標準の「Haruka」「Ichiro」などが使える。
 * - Gemini: Google AI Studio の自然な声。作って保存した音声を鳴らし、
 *   まだ無いセリフはブラウザ標準の声で読みつつ、次回用に裏で作っておく。
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
  engine?: "browser" | "gemini";
  femaleCharacter?: string;
  maleCharacter?: string;
  volume?: number;
}

// ---- Gemini で作った音声の再生 ----

const voiceHowls = new Map<string, Howl>();
let playingHowl: Howl | null = null;

function stopAll(): void {
  // 打ち切った読み上げの終了通知で BGM を戻さないよう、先に忘れる
  current = null;
  if (isSupported()) speechSynthesis.cancel();
  playingHowl?.stop();
  playingHowl = null;
}

function playVoiceBlob(character: VoiceCharacter, text: string, blob: Blob, volume: number): void {
  const key = cacheKey(character, text);
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

export function speak(text: string, options: SpeakOptions): void {
  const { mode, engine = "browser", volume = 1 } = options;
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

  if (engine === "gemini") {
    const character = getCharacter(
      (gender === "female" ? options.femaleCharacter : options.maleCharacter) ?? "",
      gender,
    );
    void getCachedVoice(character, reading).then((blob) => {
      if (token !== speakToken) return;
      if (blob) {
        playVoiceBlob(character, reading, blob, volume);
      } else {
        speakWithBrowser(reading, gender, options);
        generateInBackground(reading, character);
      }
    });
    return;
  }

  speakWithBrowser(reading, gender, options);
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

  // 次の演出が来たら前の読み上げは打ち切る（溜まって遅れないように）
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

/** 保存されている設定から読み上げのオプションを作る */
export function voiceOptions(settings: {
  voiceMode: VoiceMode;
  femaleVoiceUri: string;
  maleVoiceUri: string;
  ttsEngine: "browser" | "gemini";
  geminiFemaleCharacter: string;
  geminiMaleCharacter: string;
}): SpeakOptions {
  return {
    mode: settings.voiceMode,
    femaleVoiceUri: settings.femaleVoiceUri,
    maleVoiceUri: settings.maleVoiceUri,
    engine: settings.ttsEngine,
    femaleCharacter: settings.geminiFemaleCharacter,
    maleCharacter: settings.geminiMaleCharacter,
  };
}

/** 設定画面のテスト用。保存がなければその場で作って、Gemini の声で鳴らす */
export async function previewGeminiCharacter(character: VoiceCharacter, text: string): Promise<void> {
  const reading = toReading(text);
  const token = ++speakToken;
  stopAll();
  const blob = (await getCachedVoice(character, reading)) ?? (await generateAndCache(reading, character, loadApiKey()));
  if (token === speakToken) playVoiceBlob(character, reading, blob, 1);
}
