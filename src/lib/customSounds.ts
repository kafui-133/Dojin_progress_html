import { create } from "zustand";
import { STORES, withStore } from "@/lib/db";
import { type SoundEffect, soundManager } from "@/lib/soundManager";

/**
 * 自分で選んだ効果音（フリー素材など）。効果音の種類ごとに1つ。
 * 音声ファイルはブラウザの IndexedDB に保存するので、次に開いたときも使える。
 */

interface StoredSound {
  id: SoundEffect;
  name: string;
  blob: Blob;
  format: string;
}

/** 1つあたりの上限（効果音なので小さめ） */
export const MAX_SOUND_BYTES = 5 * 1024 * 1024;

/** Howler に渡す形式。拡張子か MIME タイプから判断する */
function detectFormat(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ["mp3", "wav", "ogg", "m4a", "aac", "flac", "webm"].includes(ext)) return ext;
  if (file.type.includes("mpeg")) return "mp3";
  if (file.type.includes("ogg")) return "ogg";
  return "wav";
}

const objectUrls = new Map<SoundEffect, string>();

function register(sound: StoredSound): void {
  const old = objectUrls.get(sound.id);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(sound.blob);
  objectUrls.set(sound.id, url);
  soundManager.setCustomSe(sound.id, { url, format: sound.format });
}

export const useCustomSounds = create<{
  /** 効果音の種類 → 選んだファイルの名前 */
  names: Partial<Record<SoundEffect, string>>;
  loaded: boolean;
  load: () => Promise<void>;
  set: (id: SoundEffect, file: File) => Promise<void>;
  clear: (id: SoundEffect) => Promise<void>;
}>()((set, get) => ({
  names: {},
  loaded: false,

  load: async () => {
    if (get().loaded || typeof indexedDB === "undefined") return;
    set({ loaded: true });
    try {
      const stored = await withStore<StoredSound[]>(STORES.seCustom, "readonly", (s) => s.getAll());
      stored.forEach(register);
      set({ names: Object.fromEntries(stored.map((s) => [s.id, s.name])) });
    } catch (err) {
      console.warn("自分の効果音を読み込めませんでした", err);
    }
  },

  set: async (id, file) => {
    if (file.size > MAX_SOUND_BYTES) {
      throw new Error(`ファイルが大きすぎます（${Math.round(MAX_SOUND_BYTES / 1024 / 1024)}MB まで）`);
    }
    const sound: StoredSound = { id, name: file.name, blob: file, format: detectFormat(file) };
    await withStore(STORES.seCustom, "readwrite", (s) => s.put(sound));
    register(sound);
    set((state) => ({ names: { ...state.names, [id]: sound.name } }));
  },

  clear: async (id) => {
    await withStore(STORES.seCustom, "readwrite", (s) => s.delete(id));
    soundManager.setCustomSe(id, null);
    const url = objectUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(id);
    set((state) => {
      const names = { ...state.names };
      delete names[id];
      return { names };
    });
  },
}));
