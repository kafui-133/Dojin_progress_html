import { LINES, getAllVoiceLines, toReading } from "@/lib/voiceLines";

/**
 * 自作の音声（ファイル）の一覧（lines.json）。
 * 手元の音声合成（drama3 など）で作ってもらうセリフと、ファイル名の決まりをまとめる。
 * ブラウザに依存しないので、scripts/voice-pack-lines.mjs からも使う。
 */

export const VOICE_PACK_GENDERS = ["female", "male"] as const;
export type VoicePackGender = (typeof VOICE_PACK_GENDERS)[number];

/** 読み込める音声ファイルの拡張子 */
export const VOICE_PACK_EXTENSIONS = ["wav", "mp3", "ogg", "flac", "m4a"];

export interface VoicePackLine {
  /** ファイル名に使う ID（読みのハッシュ。セリフが変わったら別の ID になる） */
  id: string;
  /** 画面に出す文字 */
  text: string;
  /** 読み上げる文字（この通りに読ませる） */
  reading: string;
  /** 演技の方向: hype = カットインの叫び / calm = 落ち着いたお知らせ */
  mood: "hype" | "calm";
  /** 作ってほしいファイル名 */
  files: Record<VoicePackGender, string>;
}

/** 文字列の短いハッシュ（FNV-1a 32bit、16進8桁） */
export function voicePackId(reading: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < reading.length; i++) {
    hash ^= reading.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function voicePackFileName(gender: VoicePackGender, id: string, ext = "wav"): string {
  return `${gender}_${id}.${ext}`;
}

/** ファイル名から、男女と ID を読み取る（決まりに合わなければ null） */
export function parseVoicePackFileName(name: string): { gender: VoicePackGender; id: string } | null {
  const match = /^(female|male)_([0-9a-f]{8})\.([a-z0-9]+)$/i.exec(name.trim());
  if (!match || !VOICE_PACK_EXTENSIONS.includes(match[3].toLowerCase())) return null;
  return { gender: match[1].toLowerCase() as VoicePackGender, id: match[2].toLowerCase() };
}

const CALM_LINES = new Set<string>([LINES.restStart, LINES.restEnd]);

export function getVoicePackLines(): VoicePackLine[] {
  return getAllVoiceLines().map((text) => {
    const reading = toReading(text);
    const id = voicePackId(reading);
    return {
      id,
      text,
      reading,
      mood: CALM_LINES.has(text) ? "calm" : "hype",
      files: { female: voicePackFileName("female", id), male: voicePackFileName("male", id) },
    };
  });
}

/** lines.json の中身 */
export function buildVoicePackManifest() {
  return {
    app: "syuraba-booster",
    kind: "voice-pack-lines",
    version: 1,
    voices: {
      female: "かわいい女の子の声。明るく元気で、テンション高め。アニメのヒロインが応援してくれる感じ",
      male: "渋い大人の男性の声。低くて落ち着いた声で、熱く短く言い切る。ベテランの師匠が褒めてくれる感じ",
    },
    moods: {
      hype: "マンガのカットインの叫び。勢いよく、短く、気持ちよく言い切る",
      calm: "落ち着いたお知らせ。やさしく、ゆっくりめに",
    },
    format: "WAV（モノラル、24kHz 以上）。前後の無音はなるべく削り、1セリフ4秒以内が目安",
    fileNaming: "female_<id>.wav / male_<id>.wav（lines の files に書いてある名前のまま、1つのフォルダに入れる）",
    lines: getVoicePackLines(),
  };
}
