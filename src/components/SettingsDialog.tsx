"use client";

import { ExternalLink, Loader2, Play, Plus, RefreshCw, Sparkles, Square, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCustomTracks } from "@/lib/customTracks";
import { GEMINI_ENABLED, IS_DESKTOP } from "@/lib/edition";
import {
  API_KEY_PAGE,
  type CharacterGender,
  GEMINI_PREPARE_INTERVAL_MS,
  VOICE_CHARACTERS,
  geminiSource,
  getCharacter,
  loadApiKey,
  saveApiKey,
} from "@/lib/geminiTts";
import { BGM_PRESETS, soundManager } from "@/lib/soundManager";
import { cn } from "@/lib/utils";
import {
  VOICE_MODE_LABEL,
  type VoiceGender,
  type VoiceMode,
  guessGender,
  previewSource,
  speak,
  toReading,
  useJapaneseVoices,
} from "@/lib/voice";
import { getAllVoiceLines } from "@/lib/voiceLines";
import { type PrepareProgress, TtsError, type VoiceSource, countCachedVoices, prepareVoices } from "@/lib/ttsCache";
import {
  VOICEVOX_DOWNLOAD_PAGE,
  useVoicevoxStyles,
  voicevoxCredit,
  voicevoxSource,
} from "@/lib/voicevox";
import { useAppStore } from "@/store/useAppStore";

const VOICE_SAMPLES: Record<VoiceGender, string> = {
  female: "神作画！",
  male: "修羅場突破！",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-black text-fuchsia-300">{title}</h3>
      {children}
    </section>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-fuchsia-600" : "bg-zinc-700")}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

function TrackSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const customTracks = useCustomTracks((s) => s.tracks);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-300">{label}</span>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg bg-zinc-800 px-3 py-2"
        >
          <optgroup label="内蔵の曲">
            {BGM_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}（{preset.description}）
              </option>
            ))}
          </optgroup>
          {customTracks.length > 0 && (
            <optgroup label="自分の曲">
              {customTracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          onClick={() => soundManager.preview(value)}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-700 px-3 font-bold hover:bg-zinc-600"
          title="8秒だけ試聴"
        >
          <Play className="size-4" /> 試聴
        </button>
      </div>
    </div>
  );
}

function CustomTrackList() {
  const tracks = useCustomTracks((s) => s.tracks);
  const add = useCustomTracks((s) => s.add);
  const remove = useCustomTracks((s) => s.remove);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        await add(file);
      } catch (err) {
        setError(`「${file.name}」を追加できませんでした: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-800/60 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-zinc-300">自分の曲（Suno で作った mp3 など）</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-fuchsia-600 px-3 py-1.5 font-bold hover:bg-fuchsia-500 disabled:opacity-50"
        >
          <Plus className="size-4" /> {busy ? "追加中…" : "曲を追加"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      {tracks.length === 0 ? (
        <p className="text-xs text-zinc-500">
          追加した曲は{IS_DESKTOP ? "この PC（アプリの中）" : "このブラウザ"}に保存され、上の一覧から選べるようになります。
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tracks.map((track) => (
            <li key={track.id} className="flex items-center gap-2 rounded bg-zinc-900 px-2 py-1">
              <span className="min-w-0 flex-1 truncate">{track.name}</span>
              <button
                type="button"
                onClick={() => soundManager.preview(track.id)}
                aria-label={`${track.name} を試聴`}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <Play className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => void remove(track.id)}
                aria-label={`${track.name} を削除`}
                className="rounded p-1 text-zinc-400 hover:bg-red-950 hover:text-red-400"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function VoicePicker({ gender }: { gender: VoiceGender }) {
  const voices = useJapaneseVoices();
  const key = gender === "female" ? "femaleVoiceUri" : "maleVoiceUri";
  const value = useAppStore((s) => s[key]);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // 性別が合う声を先に並べる
  const sorted = [...voices].sort(
    (a, b) => Number(guessGender(b) === gender) - Number(guessGender(a) === gender),
  );

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-300">{gender === "female" ? "女性の声" : "渋い男性の声"}</span>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) =>
            updateSettings(gender === "female" ? { femaleVoiceUri: e.target.value } : { maleVoiceUri: e.target.value })
          }
          className="min-w-0 flex-1 rounded-lg bg-zinc-800 px-3 py-2"
        >
          <option value="">自動で選ぶ</option>
          {sorted.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            speak(VOICE_SAMPLES[gender], {
              mode: gender,
              femaleVoiceUri: useAppStore.getState().femaleVoiceUri,
              maleVoiceUri: useAppStore.getState().maleVoiceUri,
            })
          }
          className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-700 px-3 font-bold hover:bg-zinc-600"
        >
          <Play className="size-4" /> テスト
        </button>
      </div>
    </div>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof TtsError) {
    if (err.kind === "rate-limit") {
      return "無料枠の上限に達しました。時間をおいて（日付が変わってから）もう一度「声を準備する」を押すと、続きから再開します。";
    }
    if (err.kind === "auth") return `${err.message}。Google AI Studio で発行したキーを貼り付けてください。`;
    return err.message;
  }
  return `生成できませんでした: ${err instanceof Error ? err.message : String(err)}`;
}

/** テストボタン（その声で見本のセリフを鳴らす） */
function TestButton({ source, sample }: { source: VoiceSource; sample: string }) {
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const test = async () => {
    setError(null);
    setTesting(true);
    try {
      await previewSource(source, sample);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void test()}
        disabled={testing}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-700 px-3 font-bold hover:bg-zinc-600 disabled:opacity-60"
      >
        {testing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} テスト
      </button>
      {error && <p className="order-last w-full text-xs text-red-400">{error}</p>}
    </>
  );
}

/** 使う声で、全部のセリフを前もって作っておくパネル */
function PreparePanel({ sources, intervalMs, note }: { sources: VoiceSource[]; intervalMs: number; note: string }) {
  const [progress, setProgress] = useState<PrepareProgress | null>(null);
  const [preparedCount, setPreparedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const texts = getAllVoiceLines().map(toReading);
  const total = texts.length * sources.length;
  const sourcesKey = sources.map((source) => source.id).join(",");
  const isRunning = progress !== null;

  useEffect(() => {
    let cancelled = false;
    void Promise.all(sources.map((source) => countCachedVoices(source, texts))).then((counts) => {
      if (!cancelled) setPreparedCount(counts.reduce((a, b) => a + b, 0));
    });
    return () => {
      cancelled = true;
    };
    // sources と texts は sourcesKey が同じなら中身も同じ。数え直しは準備の開始・終了時だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey, isRunning]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total });
    try {
      await prepareVoices(sources, texts, intervalMs, setProgress, controller.signal);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  if (sources.length === 0) return null;
  const shown = progress ?? (preparedCount !== null ? { done: preparedCount, total } : null);
  const complete = shown !== null && shown.done >= shown.total;

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-zinc-300">
          セリフの声
          {shown && (
            <span className="ml-2 tabular-nums text-zinc-400">
              {shown.done} / {shown.total} 準備済み
            </span>
          )}
        </span>
        {isRunning ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-700 px-3 py-1.5 font-bold hover:bg-zinc-600"
          >
            <Square className="size-4" /> 止める
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            disabled={complete}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-fuchsia-600 px-3 py-1.5 font-bold hover:bg-fuchsia-500 disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            <Sparkles className="size-4" />
            {complete ? "準備完了" : shown && shown.done > 0 ? "続きを準備する" : "声を準備する"}
          </button>
        )}
      </div>
      {shown && (
        <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full bg-gradient-to-r from-fuchsia-500 to-amber-400 transition-[width]"
            style={{ width: `${(shown.done / Math.max(1, shown.total)) * 100}%` }}
          />
        </div>
      )}
      {progress?.waitingSec !== undefined && (
        <p className="text-xs text-amber-300">利用上限のため {progress.waitingSec} 秒待っています…</p>
      )}
      <p className="text-xs text-zinc-500">{note}</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** 読み上げモード（女性だけ・男性だけ・交互）で実際に使う側だけを返す */
function usedGenders(voiceMode: VoiceMode): CharacterGender[] {
  if (voiceMode === "alternate") return ["female", "male"];
  if (voiceMode === "female" || voiceMode === "male") return [voiceMode];
  return [];
}

function GeminiVoiceSettings() {
  const femaleId = useAppStore((s) => s.geminiFemaleCharacter);
  const maleId = useAppStore((s) => s.geminiMaleCharacter);
  const voiceMode = useAppStore((s) => s.voiceMode);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [keyInput, setKeyInput] = useState(() => loadApiKey());
  const [savedKey, setSavedKey] = useState(() => loadApiKey());

  const selected: Record<CharacterGender, string> = { female: femaleId, male: maleId };
  const sources = usedGenders(voiceMode).map((gender) => geminiSource(getCharacter(selected[gender], gender)));

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zinc-800/60 p-3 text-sm">
      <div className="flex flex-col gap-1">
        <span className="text-zinc-300">Gemini の API キー</span>
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="AIza... で始まるキーを貼り付け"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg bg-zinc-900 px-3 py-2 font-mono"
          />
          <button
            type="button"
            onClick={() => {
              saveApiKey(keyInput);
              setSavedKey(keyInput.trim());
            }}
            disabled={keyInput.trim() === savedKey}
            className="shrink-0 rounded-lg bg-fuchsia-600 px-3 font-bold hover:bg-fuchsia-500 disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {keyInput.trim() === savedKey && savedKey ? "保存済み" : "保存"}
          </button>
        </div>
        <a
          href={API_KEY_PAGE}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 self-start text-xs text-fuchsia-300 hover:underline"
        >
          Google AI Studio で API キーを取得 <ExternalLink className="size-3" />
        </a>
        <p className="text-xs text-zinc-500">キーはこの PC のブラウザにだけ保存され、Google の API 以外には送られません。</p>
      </div>

      {savedKey && (
        <>
          {(["female", "male"] as const).map((gender) => {
            const character = getCharacter(selected[gender], gender);
            return (
              <div key={gender} className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-300">{gender === "female" ? "女性のキャラクター" : "男性のキャラクター"}</span>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={character.id}
                    onChange={(e) =>
                      updateSettings(
                        gender === "female"
                          ? { geminiFemaleCharacter: e.target.value }
                          : { geminiMaleCharacter: e.target.value },
                      )
                    }
                    className="min-w-0 flex-1 rounded-lg bg-zinc-800 px-3 py-2"
                  >
                    {VOICE_CHARACTERS.filter((c) => c.gender === gender).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}（{c.voiceName}）
                      </option>
                    ))}
                  </select>
                  <TestButton source={geminiSource(character)} sample={VOICE_SAMPLES[gender]} />
                </div>
              </div>
            );
          })}
          <PreparePanel
            sources={sources}
            intervalMs={GEMINI_PREPARE_INTERVAL_MS}
            note="全部のセリフを前もって作っておくと、描いている最中もすぐ自然な声で読み上げます（無料枠に収まるよう、ゆっくり作ります）。準備できていないセリフはブラウザの声で読み、裏で作っておきます。"
          />
        </>
      )}
    </div>
  );
}

function VoicevoxSettings() {
  const femaleStyle = useAppStore((s) => s.voicevoxFemaleStyle);
  const maleStyle = useAppStore((s) => s.voicevoxMaleStyle);
  const voiceMode = useAppStore((s) => s.voiceMode);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const { status, styles, retry } = useVoicevoxStyles(true);

  const selected: Record<CharacterGender, number> = { female: femaleStyle, male: maleStyle };
  const labelOf = (id: number) => {
    const style = styles.find((s) => s.id === id);
    return style ? `${style.speakerName}（${style.styleName}）` : `ID ${id}`;
  };
  const sources = usedGenders(voiceMode).map((gender) =>
    voicevoxSource(selected[gender], gender, labelOf(selected[gender])),
  );

  if (status !== "ok") {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-zinc-800/60 p-3 text-sm">
        {status === "checking" ? (
          <p className="flex items-center gap-2 text-zinc-300">
            <Loader2 className="size-4 animate-spin" /> VOICEVOX を探しています…
          </p>
        ) : (
          <>
            <p className="text-amber-200">
              VOICEVOX が見つかりません。PC で VOICEVOX を起動してから「もう一度探す」を押してください。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={retry}
                className="flex items-center gap-1 rounded-lg bg-fuchsia-600 px-3 py-1.5 font-bold hover:bg-fuchsia-500"
              >
                <RefreshCw className="size-4" /> もう一度探す
              </button>
              <a
                href={VOICEVOX_DOWNLOAD_PAGE}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-fuchsia-300 hover:underline"
              >
                VOICEVOX をダウンロード（無料） <ExternalLink className="size-3" />
              </a>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zinc-800/60 p-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs text-emerald-300">
        <span className="size-2 rounded-full bg-emerald-400" /> VOICEVOX に接続しました（{styles.length} 種類の声）
      </p>
      {(["female", "male"] as const).map((gender) => (
        <div key={gender} className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-300">{gender === "female" ? "かわいい役の声" : "渋い役の声"}</span>
          <div className="flex flex-wrap gap-2">
            <select
              value={selected[gender]}
              onChange={(e) =>
                updateSettings(
                  gender === "female"
                    ? { voicevoxFemaleStyle: Number(e.target.value) }
                    : { voicevoxMaleStyle: Number(e.target.value) },
                )
              }
              className="min-w-0 flex-1 rounded-lg bg-zinc-800 px-3 py-2"
            >
              {!styles.some((s) => s.id === selected[gender]) && (
                <option value={selected[gender]}>ID {selected[gender]}（見つかりません）</option>
              )}
              {styles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.speakerName}（{style.styleName}）
                </option>
              ))}
            </select>
            <TestButton
              source={voicevoxSource(selected[gender], gender, labelOf(selected[gender]))}
              sample={VOICE_SAMPLES[gender]}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-zinc-500">
        クレジット: {voicevoxCredit(styles, usedGenders(voiceMode).map((g) => selected[g])) || "VOICEVOX"}
        （配信や動画に音声が入る場合は、この表記を載せてください）
      </p>
      <PreparePanel
        sources={sources}
        intervalMs={0}
        note="VOICEVOX は PC の中で声を作るので、準備しなくてもその場で読み上げます。前もって準備しておくと、描いている最中の読み上げがより速くなります。"
      />
    </div>
  );
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const isBgmOn = useAppStore((s) => s.isBgmOn);
  const bgmNormalId = useAppStore((s) => s.bgmNormalId);
  const bgmFeverId = useAppStore((s) => s.bgmFeverId);
  const restBgmId = useAppStore((s) => s.restBgmId);
  const zoneDailyLimit = useAppStore((s) => s.zoneDailyLimit);
  const shurabaMode = useAppStore((s) => s.shurabaMode);
  const voiceMode = useAppStore((s) => s.voiceMode);
  const savedEngine = useAppStore((s) => s.ttsEngine);
  // 配布版では Gemini を選べない（読み込んだデータが Gemini のままならブラウザ標準として扱う）
  const ttsEngine = savedEngine === "gemini" && !GEMINI_ENABLED ? "browser" : savedEngine;
  const isStrokeSoundOn = useAppStore((s) => s.isStrokeSoundOn);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const voices = useJapaneseVoices();

  useEffect(() => {
    void useCustomTracks.getState().load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ヘッダーの backdrop-blur の中だと fixed がヘッダー基準になるため、body 直下に出す
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="text-lg font-black">
            設定
          </h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-1.5 hover:bg-zinc-800">
            <X className="size-5" />
          </button>
        </div>

        <Section title="🎵 BGM">
          <Switch
            label="BGM を鳴らす（連続で押したとき・描き続けている間）"
            checked={isBgmOn}
            onChange={(on) => updateSettings({ isBgmOn: on })}
          />
          <TrackSelect label="作業中の曲" value={bgmNormalId} onChange={(id) => updateSettings({ bgmNormalId: id })} />
          <TrackSelect
            label="フィーバー・ゾーン中の曲"
            value={bgmFeverId}
            onChange={(id) => updateSettings({ bgmFeverId: id })}
          />
          <TrackSelect
            label="休憩中の曲（ポモドーロの休憩で、自動でこの曲になります）"
            value={restBgmId}
            onChange={(id) => updateSettings({ restBgmId: id })}
          />
          <CustomTrackList />
        </Section>

        <Section title="🗣️ 読み上げ（カットインの文字を声で読む）">
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-zinc-800 p-1 text-sm">
            {(Object.keys(VOICE_MODE_LABEL) as VoiceMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => updateSettings({ voiceMode: mode })}
                className={cn(
                  "rounded-md py-1.5 font-bold transition",
                  voiceMode === mode ? "bg-fuchsia-600 text-white" : "text-zinc-400 hover:text-white",
                )}
              >
                {VOICE_MODE_LABEL[mode]}
              </button>
            ))}
          </div>
          {voiceMode !== "off" && (
            <div className={cn("grid gap-1 rounded-lg bg-zinc-800 p-1 text-sm", GEMINI_ENABLED ? "grid-cols-3" : "grid-cols-2")}>
              {(
                [
                  ["browser", "ブラウザ標準"],
                  ["gemini", "Gemini"],
                  ["voicevox", "VOICEVOX"],
                ] as const
              )
                .filter(([engine]) => engine !== "gemini" || GEMINI_ENABLED)
                .map(([engine, label]) => (
                <button
                  key={engine}
                  type="button"
                  onClick={() => updateSettings({ ttsEngine: engine })}
                  className={cn(
                    "rounded-md py-1.5 font-bold transition",
                    ttsEngine === engine ? "bg-zinc-950 text-white" : "text-zinc-400 hover:text-white",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {voiceMode !== "off" && GEMINI_ENABLED && ttsEngine === "gemini" && <GeminiVoiceSettings />}
          {voiceMode !== "off" && ttsEngine === "voicevox" && <VoicevoxSettings />}
          {voiceMode !== "off" && ttsEngine !== "browser" && (
            <p className="text-xs font-bold text-zinc-400">ブラウザ標準の声（準備できていないセリフ・つながらないときに使います）</p>
          )}
          {voices.length === 0 ? (
            <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
              {IS_DESKTOP
                ? "日本語の声が見つかりません。Windows の「設定 → 時刻と言語 → 音声」で日本語の音声を追加するか、VOICEVOX を使ってください。"
                : "このブラウザで使える日本語の声が見つかりません。Windows の Edge か Chrome で開いてください。"}
            </p>
          ) : (
            <>
              <VoicePicker gender="female" />
              <VoicePicker gender="male" />
              <p className="text-xs text-zinc-500">
                Edge では自然な「Nanami（女性）」「Keita（男性）」が使えます。男性の声は低め・ゆっくりにして渋くしています。
              </p>
            </>
          )}
        </Section>

        <Section title="⚡ ZONE（勢い MAX）">
          <label className="flex items-center justify-between gap-3 text-sm">
            1日に ZONE に入れる回数
            <input
              type="number"
              min={1}
              max={50}
              value={zoneDailyLimit}
              onChange={(e) => updateSettings({ zoneDailyLimit: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
              className="w-20 rounded-lg bg-zinc-800 px-3 py-1.5 text-right tabular-nums"
            />
          </label>
          <Switch
            label="🔥 修羅場モード（ZONE の回数制限なし）"
            checked={shurabaMode}
            onChange={(on) => updateSettings({ shurabaMode: on })}
          />
          <p className="text-xs text-zinc-500">
            ZONE に入りすぎると疲れるので、普段は1日の回数を決めておき、締め切り前だけ修羅場モードにするのがおすすめです。休憩中は ZONE に入りません。
          </p>
        </Section>

        <Section title="🔔 効果音">
          <Switch
            label="線を引いた・やり直したときの効果音"
            checked={isStrokeSoundOn}
            onChange={(on) => updateSettings({ isStrokeSoundOn: on })}
          />
        </Section>
      </div>
    </div>,
    document.body,
  );
}
