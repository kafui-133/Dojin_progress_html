import { cn } from "@/lib/utils";

/**
 * 手描き風のアイコン（Blender でトゥーン調に描いたもの。public/icons/*.png）。
 * 絵文字の代わりに使う。飾りなので読み上げない。
 */
export const ICON_NAMES = [
  "balloon",
  "brush",
  "chart",
  "coin",
  "cup",
  "flame",
  "floppy",
  "gpen",
  "manuscript",
  "palette",
  "pencil",
  "ruler",
  "shout",
  "sparkle",
  "stopwatch",
  "tomato",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export default function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    // 静的書き出し（デスクトップ版）でも同じ場所から読めるよう、next/image ではなく img にする
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/${name}.png`}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("inline-block size-[1.25em] shrink-0 select-none object-contain align-[-0.25em]", className)}
    />
  );
}
