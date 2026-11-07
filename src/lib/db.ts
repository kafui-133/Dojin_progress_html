/** ブラウザ内の保存領域（IndexedDB）。自分の曲・自分の効果音と、生成した声の音声を保存する */

const DB_NAME = "syuraba-booster";
const DB_VERSION = 3;

export const STORES = {
  bgmTracks: "bgm-tracks",
  voiceCache: "voice-cache",
  seCustom: "se-custom",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.bgmTracks)) {
        db.createObjectStore(STORES.bgmTracks, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.voiceCache)) {
        db.createObjectStore(STORES.voiceCache);
      }
      if (!db.objectStoreNames.contains(STORES.seCustom)) {
        db.createObjectStore(STORES.seCustom, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(name, mode).objectStore(name));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
