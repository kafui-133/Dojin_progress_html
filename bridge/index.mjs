// クリスタ連携ブリッジ（コマンドで起動する版）。本体は bridge/core.mjs
//
// 使い方:
//   npm run bridge                 … クリスタ連携（Windows）
//   npm run bridge -- --simulate   … クリスタなしで擬似的に線を送る（動作確認用）
//   npm run bridge -- --any-app    … クリスタ以外のアプリでも反応する（テスト用）
import { DEFAULT_BRIDGE_PORT, startBridge } from "./core.mjs";

const PORT = Number(process.env.BRIDGE_PORT ?? DEFAULT_BRIDGE_PORT);
const args = new Set(process.argv.slice(2));
const mode = args.has("--simulate") ? "simulate" : args.has("--any-app") ? "any-app" : "crista";

if (mode === "crista" && process.platform !== "win32") {
  // Codespaces などクラウド上では、手元の PC のペン操作は届かない
  console.log(
    [
      "",
      "⚠️  クリスタ連携ブリッジは、クリスタを使っている Windows PC の上で起動する必要があります。",
      process.env.CODESPACES === "true"
        ? "   いまは GitHub Codespaces（クラウド上の Linux）で動いているため、手元の PC のペン操作を検知できません。"
        : `   いまの環境（${process.platform}）では、クリスタの操作を検知できません。`,
      "   手元の Windows PC でプロジェクトを開き、npm run dev:crista を実行してください（手順: bridge/README.md）。",
      "   クリスタなしで動きだけ試すなら npm run bridge:sim を使えます。",
      "   アプリ（http://localhost:3000）はこのまま使えます。",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

let bridge;
try {
  bridge = await startBridge({ port: PORT, mode });
} catch (err) {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ ポート ${PORT} は使用中です。ブリッジがすでに起動していないか確認してください。`);
  } else {
    console.error("❌ ブリッジを起動できませんでした:", err.message);
  }
  process.exit(1);
}

console.log(`\n✅ クリスタ連携ブリッジを起動しました（ws://127.0.0.1:${PORT}）`);
console.log("   進捗ブースター（http://localhost:3000）で「クリスタ連携」を ON にしてください。");
console.log("   終了するには Ctrl + C を押します。\n");

const stop = async () => {
  await bridge.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
