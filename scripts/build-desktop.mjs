// 配布用のデスクトップアプリに入れる画面を out/ に書き出す（Windows でも Mac/Linux でも動くよう、環境変数をここで付ける）
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_EXPORT: "1", NEXT_PUBLIC_EDITION: "desktop" },
});
process.exit(result.status ?? 1);
