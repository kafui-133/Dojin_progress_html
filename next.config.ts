import type { NextConfig } from "next";

/** 配布用のデスクトップアプリを作るとき（npm run build:desktop）は、静的な HTML として書き出す */
const isExport = process.env.NEXT_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isExport && { output: "export" }),
};

export default nextConfig;
