"use client";

import { Play, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCustomTracks } from "@/lib/customTracks";
import { BGM_PRESETS, soundManager } from "@/lib/soundManager";
import { cn } from "@/lib/utils";
import {
  VOICE_MODE_LABEL,
  type VoiceGender,
  type VoiceMode,
  guessGender,
  speak,
  useJapaneseVoices,
} from "@/lib/voice";
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
        <p className="text-xs text-zinc-500">追加した曲はこのブラウザに保存され、上の一覧から選べるようになります。</p>
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

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const isBgmOn = useAppStore((s) => s.isBgmOn);
  const bgmNormalId = useAppStore((s) => s.bgmNormalId);
  const bgmFeverId = useAppStore((s) => s.bgmFeverId);
  const voiceMode = useAppStore((s) => s.voiceMode);
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
          {voices.length === 0 ? (
            <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
              このブラウザで使える日本語の声が見つかりません。Windows の Edge か Chrome で開いてください。
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
