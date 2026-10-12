import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * クライアントでの描画時のみ true。
 * LocalStorage から復元した状態を SSR の HTML と食い違わせないために使う。
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
