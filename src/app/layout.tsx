import type { Metadata } from "next";
import { Dela_Gothic_One, DotGothic16, Geist_Mono, Zen_Kaku_Gothic_New } from "next/font/google";
import GlobalRuntime from "@/components/GlobalRuntime";
import "./globals.css";

// 本文: 写植っぽさのある読みやすいゴシック
const zenKaku = Zen_Kaku_Gothic_New({
  variable: "--font-zen-kaku",
  weight: ["400", "500", "700"],
  preload: false,
});

// 見出し・大きな数字: マンガの描き文字のような太いゴシック
const delaGothic = Dela_Gothic_One({
  variable: "--font-dela-gothic",
  weight: "400",
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// カットイン用のドット風フォント（日本語グリフのためプリロードしない）
const dotGothic = DotGothic16({
  variable: "--font-dot-gothic",
  weight: "400",
  preload: false,
});

export const metadata: Metadata = {
  title: "進捗ブースター（Syuraba Booster）",
  description: "同人原稿の修羅場をパチンコ風演出で乗り切るゲーミフィケーション習慣化アプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${zenKaku.variable} ${delaGothic.variable} ${geistMono.variable} ${dotGothic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <GlobalRuntime />
      </body>
    </html>
  );
}
