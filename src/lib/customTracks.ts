import { create } from "zustand";
import { DEFAULT_BGM_FEVER, DEFAULT_BGM_NORMAL, soundManager } from "@/lib/soundManager";
import { useAppStore } from "@/store/useAppStore";

/**
 * 自分で追加した BGM（Suno で作った曲など）。
 * 音声ファイルはブラウザの IndexedDB に保存するので、次に開いたときも使える。
 */

export interface CustomTrack {
  id: string;
  name: string;
}

interface StoredTrack extends CustomTrack {
  blob: Blob;
  format: string;
}

const DB_NAME = "syuraba-booster";
const STORE = "bgm-tracks";
export const CUSTOM_TRACK_PREFIX = "custom:";
/** 1曲あたりの上限（ブラウザの保存容量を圧迫しないように） */
export const MAX_TRACK_BYTES = 30 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Howler に渡す形式。拡張子か MIME タイプから判断する */
function detectFormat(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ["mp3", "wav", "ogg", "m4a", "aac", "flac", "webm"].includes(ext)) return ext;
  if (file.type.includes("mpeg")) return "mp3";
  if (file.type.includes("wav")) return "wav";
  if (file.type.includes("ogg")) return "ogg";
  return "mp3";
}

const objectUrls = new Map<string, string>();

/** 選択中の曲が無くなっていたら内蔵の曲に戻す */
function fixSelection(available: Set<string>): void {
  const { bgmNormalId, bgmFeverId, updateSettings } = useAppStore.getState();
  const missing = (id: string) => id.startsWith(CUSTOM_TRACK_PREFIX) && !available.has(id);
  if (missing(bgmNormalId)) updateSettings({ bgmNormalId: DEFAULT_BGM_NORMAL });
  if (missing(bgmFeverId)) updateSettings({ bgmFeverId: DEFAULT_BGM_FEVER });
}

function register(track: StoredTrack): void {
  const url = URL.createObjectURL(track.blob);
  objectUrls.set(track.id, url);
  soundManager.registerTrack(track.id, url, track.format);
}

export const useCustomTracks = create<{
  tracks: CustomTrack[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (file: File) => Promise<CustomTrack>;
  remove: (id: string) => Promise<void>;
}>()((set, get) => ({
  tracks: [],
  loaded: false,

  load: async () => {
    if (get().loaded || typeof indexedDB === "undefined") return;
    set({ loaded: true });
    try {
      const stored = await withStore<StoredTrack[]>("readonly", (s) => s.getAll());
      stored.forEach(register);
      set({ tracks: stored.map(({ id, name }) => ({ id, name })) });
      fixSelection(new Set(stored.map((t) => t.id)));
    } catch (err) {
      console.warn("自分の曲を読み込めませんでした", err);
    }
  },

  add: async (file) => {
    if (file.size > MAX_TRACK_BYTES) {
      throw new Error(`ファイルが大きすぎます（${Math.round(MAX_TRACK_BYTES / 1024 / 1024)}MB まで）`);
    }
    const track: StoredTrack = {
      id: `${CUSTOM_TRACK_PREFIX}${crypto.randomUUID()}`,
      name: file.name.replace(/\.[^.]+$/, ""),
      blob: file,
      format: detectFormat(file),
    };
    await withStore("readwrite", (s) => s.put(track));
    register(track);
    const added = { id: track.id, name: track.name };
    set((state) => ({ tracks: [...state.tracks, added] }));
    return added;
  },

  remove: async (id) => {
    await withStore("readwrite", (s) => s.delete(id));
    soundManager.unregisterTrack(id);
    const url = objectUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(id);
    set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) }));
    fixSelection(new Set(get().tracks.map((t) => t.id)));
  },
}));
