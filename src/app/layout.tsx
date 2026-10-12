import type { Metadata } from "next";
import { DotGothic16, Geist, Geist_Mono } from "next/font/google";
import GlobalRuntime from "@/components/GlobalRuntime";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${dotGothic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <GlobalRuntime />
      </body>
    </html>
  );
}
