import { LINES, getAllVoiceLines, toReading } from "@/lib/voiceLines";

/**
 * 自作の音声（ファイル）の一覧（lines.json）。
 * 手元の音声合成（drama3 など）で作ってもらうセリフと、ファイル名の決まりをまとめる。
 * ブラウザに依存しないので、scripts/voice-pack-lines.mjs からも使う。
 */

/** 声の役（キャラの種類）。役ごとに少し言い回しを変える */
export const VOICE_PACK_ROLES = ["cute", "shibui", "man", "onee", "girl", "boy"] as const;
export type VoicePackRole = (typeof VOICE_PACK_ROLES)[number];

export const VOICE_PACK_ROLE_INFO: Record<VoicePackRole, { label: string; description: string }> = {
  cute: {
    label: "かわいい役",
    description: "かわいい女の子の声。明るく元気で、テンション高め。アニメのヒロインが応援してくれる感じ",
  },
  shibui: {
    label: "渋い役",
    description: "渋い大人の男性の声。低くて落ち着いた声で、熱く短く言い切る。ベテランの師匠が褒めてくれる感じ",
  },
  man: { label: "男性", description: "ふつうの大人の男性の声。さわやかで素直に褒めてくれる感じ" },
  onee: { label: "お姉さん", description: "大人の女性の声。余裕があって、やさしく包み込むように褒めてくれる感じ" },
  girl: { label: "小学生の女の子", description: "小学生くらいの女の子の声。無邪気で、すごいすごいと喜んでくれる感じ" },
  boy: { label: "小学生の男の子", description: "小学生くらいの男の子の声。わんぱくで、すげーと興奮してくれる感じ" },
};

/** 役ごとに用意する声の数（同じ役の中で声色を選べる） */
const VOICES_PER_ROLE: Record<VoicePackRole, number> = { cute: 4, shibui: 1, man: 4, onee: 4, girl: 4, boy: 4 };

export interface VoicePackVoice {
  /** ファイル名の頭に付く ID（例: cute1） */
  id: string;
  role: VoicePackRole;
  label: string;
}

export const VOICE_PACK_VOICES: VoicePackVoice[] = VOICE_PACK_ROLES.flatMap((role) =>
  Array.from({ length: VOICES_PER_ROLE[role] }, (_, i) => ({
    id: `${role}${i + 1}`,
    role,
    label: VOICES_PER_ROLE[role] > 1 ? `${VOICE_PACK_ROLE_INFO[role].label} ${i + 1}` : VOICE_PACK_ROLE_INFO[role].label,
  })),
);

export const DEFAULT_PACK_FEMALE = "cute1";
export const DEFAULT_PACK_MALE = "shibui1";

/** 以前の名前（female_ / male_）のファイルも読み込めるようにする */
const LEGACY_VOICE_IDS: Record<string, string> = { female: DEFAULT_PACK_FEMALE, male: DEFAULT_PACK_MALE };

export function getVoicePackVoice(id: string): VoicePackVoice | undefined {
  return VOICE_PACK_VOICES.find((voice) => voice.id === id);
}

/** 読み込める音声ファイルの拡張子 */
export const VOICE_PACK_EXTENSIONS = ["wav", "mp3", "ogg", "flac", "m4a"];

export interface VoicePackLine {
  /** ファイル名に使う ID（読みのハッシュ。セリフが変わったら別の ID になる） */
  id: string;
  /** 画面に出す文字 */
  text: string;
  /** 読み上げる文字（基本の読み。アプリはこれで音声を探す） */
  reading: string;
  /** 役ごとの言い回し（この通りに読ませる。内容は reading と同じ） */
  readings: Record<VoicePackRole, string>;
  /** 演技の方向: hype = カットインの叫び / calm = 落ち着いたお知らせ */
  mood: "hype" | "calm";
  /** 作ってほしいファイル名（声の ID → ファイル名） */
  files: Record<string, string>;
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

export function voicePackFileName(voiceId: string, id: string, ext = "wav"): string {
  return `${voiceId}_${id}.${ext}`;
}

/** ファイル名から、声と ID を読み取る（決まりに合わなければ null） */
export function parseVoicePackFileName(name: string): { voiceId: string; id: string } | null {
  const match = /^([a-z]+[0-9]*)_([0-9a-f]{8})\.([a-z0-9]+)$/i.exec(name.trim());
  if (!match || !VOICE_PACK_EXTENSIONS.includes(match[3].toLowerCase())) return null;
  const raw = match[1].toLowerCase();
  const voiceId = LEGACY_VOICE_IDS[raw] ?? raw;
  if (!getVoicePackVoice(voiceId)) return null;
  return { voiceId, id: match[2].toLowerCase() };
}

// ---- 役ごとの言い回し（内容は変えず、語尾だけ変える） ----

/** 休憩のお知らせは文ごとに書く（ない役は基本の読みのまま） */
const CALM_VARIANTS: Record<string, Partial<Record<VoicePackRole, string>>> = {
  [LINES.restStart]: {
    shibui: "休憩の時間だ。少し休もう",
    man: "休憩の時間だよ。少し休もう",
    onee: "休憩の時間よ。少し休みましょうね",
    girl: "休憩の時間だよ。ちょっと休もうね",
    boy: "休憩の時間だぜ。ちょっと休もうぜ",
  },
  [LINES.restEnd]: {
    shibui: "休憩終わりだ。また描いていこう",
    man: "休憩おわり！また描いていこう",
    onee: "休憩おわり！また描いていきましょうね",
    girl: "休憩おわり！また描こうね",
    boy: "休憩おわり！また描こうぜ",
  },
};

/** カットインの語尾。名詞で終わる（神作画！）か、動詞・形容詞で終わる（決まった！）かで変える */
const HYPE_ENDINGS: Partial<Record<VoicePackRole, { noun: string; verb: string }>> = {
  shibui: { noun: "だ", verb: "な" },
  onee: { noun: "ね", verb: "わね" },
  girl: { noun: "だよ", verb: "ね" },
  boy: { noun: "だぜ", verb: "ぜ" },
};

/** 語尾を付けないセリフ（長い・言い切りの形になっている） */
const KEEP_AS_IS = /よし！|経験値/;

function hypeVariant(reading: string, role: VoicePackRole): string {
  const ending = HYPE_ENDINGS[role];
  if (!ending || KEEP_AS_IS.test(reading)) return reading;
  const match = /^(.*?)(！+)$/.exec(reading);
  if (!match) return reading;
  const [, body, marks] = match;
  const isVerb = /(た|だ|ない|てる)$/.test(body);
  return `${body}${isVerb ? ending.verb : ending.noun}${marks}`;
}

function roleReadings(text: string, reading: string): Record<VoicePackRole, string> {
  const calm = CALM_VARIANTS[text];
  return Object.fromEntries(
    VOICE_PACK_ROLES.map((role) => [role, calm ? (calm[role] ?? reading) : hypeVariant(reading, role)]),
  ) as Record<VoicePackRole, string>;
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
      readings: roleReadings(text, reading),
      mood: CALM_LINES.has(text) ? "calm" : "hype",
      files: Object.fromEntries(VOICE_PACK_VOICES.map((voice) => [voice.id, voicePackFileName(voice.id, id)])),
    };
  });
}

/** lines.json の中身 */
export function buildVoicePackManifest() {
  return {
    app: "syuraba-booster",
    kind: "voice-pack-lines",
    version: 2,
    roles: VOICE_PACK_ROLE_INFO,
    voices: VOICE_PACK_VOICES,
    moods: {
      hype: "マンガのカットインの叫び。勢いよく、短く、気持ちよく言い切る",
      calm: "落ち着いたお知らせ。やさしく、ゆっくりめに",
    },
    format: "WAV（モノラル、24kHz 以上）。前後の無音はなるべく削り、1セリフ4秒以内が目安",
    fileNaming:
      "<声の ID>_<id>.wav（lines の files に書いてある名前のまま、1つのフォルダに入れる）。読ませるのは readings の、その声の役の言い回し",
    lines: getVoicePackLines(),
  };
}
