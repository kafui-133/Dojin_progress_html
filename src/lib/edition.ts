/**
 * どの形で動いているか。
 * - 開発版（npm run dev / build）: これまでどおり全部の機能
 * - 配布版（デスクトップアプリ。npm run build:desktop で NEXT_PUBLIC_EDITION=desktop を付けてビルド）:
 *   API キーの要る Gemini の声は出さず、クリスタ連携はアプリに内蔵したブリッジに最初からつなぐ
 */
export const IS_DESKTOP = process.env.NEXT_PUBLIC_EDITION === "desktop";

/** Gemini の声を使えるか（配布版では出さない） */
export const GEMINI_ENABLED = !IS_DESKTOP;
