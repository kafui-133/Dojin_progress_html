import { useCallback, useEffect, useState } from "react";
import { TtsError, type VoiceSource } from "@/lib/ttsCache";

/**
 * VOICEVOX（無料の読み上げソフト）の声でセリフを作る。
 * PC で VOICEVOX を起動しておくと、http://127.0.0.1:50021 で音声合成エンジンが動く。
 * エンジンは標準設定で localhost のページからの利用を許可しているので、ブラウザから直接呼べる。
 */

export const VOICEVOX_URL = "http://127.0.0.1:50021";
export const VOICEVOX_DOWNLOAD_PAGE = "https://voicevox.hiroshiba.jp/";

/** 標準の話者 ID（VOICEVOX 同梱）。かわいい女性: 四国めたん（あまあま）、渋い男性: 青山龍星（ノーマル） */
export const DEFAULT_VOICEVOX_FEMALE = 0;
export const DEFAULT_VOICEVOX_MALE = 13;

export type VoicevoxRole = "female" | "male";

/** 役ごとの話し方の調整（かわいい側は少し速く抑揚多め、渋い側は少しゆっくり低め） */
const ROLE_TUNING: Record<VoicevoxRole, { speedScale: number; pitchScale: number; intonationScale: number }> = {
  female: { speedScale: 1.1, pitchScale: 0, intonationScale: 1.25 },
  male: { speedScale: 0.95, pitchScale: -0.04, intonationScale: 1.0 },
};

const TIMEOUT_MS = 8000;

export interface VoicevoxStyle {
  id: number;
  speakerName: string;
  styleName: string;
}

interface SpeakerResponse {
  name: string;
  styles: { id: number; name: string; type?: string }[];
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${VOICEVOX_URL}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new TtsError("VOICEVOX に接続できません。VOICEVOX を起動してください", "unavailable");
  }
  if (!res.ok) throw new TtsError(`VOICEVOX でエラーが発生しました（HTTP ${res.status}）`, "other");
  return res;
}

export async function fetchVoicevoxStyles(): Promise<VoicevoxStyle[]> {
  const speakers = (await (await call("/speakers")).json()) as SpeakerResponse[];
  return speakers.flatMap((speaker) =>
    speaker.styles
      // 歌唱用などの話者は除く
      .filter((style) => !style.type || style.type === "talk")
      .map((style) => ({ id: style.id, speakerName: speaker.name, styleName: style.name })),
  );
}

export async function synthesizeVoicevox(text: string, styleId: number, role: VoicevoxRole): Promise<Blob> {
  const query = await (
    await call(`/audio_query?text=${encodeURIComponent(text)}&speaker=${styleId}`, { method: "POST" })
  ).json();
  const res = await call(`/synthesis?speaker=${styleId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...query, ...ROLE_TUNING[role] }),
  });
  return res.blob();
}

export function voicevoxSource(styleId: number, role: VoicevoxRole, label = `ID ${styleId}`): VoiceSource {
  return {
    id: `voicevox|${styleId}|${role}`,
    label,
    local: true,
    synthesize: (text) => synthesizeVoicevox(text, styleId, role),
  };
}

/** 利用規約で求められているクレジット表記（例: VOICEVOX:四国めたん） */
export function voicevoxCredit(styles: VoicevoxStyle[], ids: number[]): string {
  const names = [...new Set(ids.map((id) => styles.find((s) => s.id === id)?.speakerName).filter(Boolean))];
  return names.map((name) => `VOICEVOX:${name}`).join("、");
}

/** VOICEVOX の話者一覧。起動していなければ offline */
export function useVoicevoxStyles(enabled: boolean): {
  status: "checking" | "ok" | "offline";
  styles: VoicevoxStyle[];
  retry: () => void;
} {
  const [state, setState] = useState<{ status: "checking" | "ok" | "offline"; styles: VoicevoxStyle[] }>({
    status: "checking",
    styles: [],
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchVoicevoxStyles().then(
      (styles) => !cancelled && setState({ status: "ok", styles }),
      () => !cancelled && setState({ status: "offline", styles: [] }),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, status: "checking" }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
