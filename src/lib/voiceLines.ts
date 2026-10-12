import { ACTIONS } from "@/lib/actions";
import { PAGE_COMPLETE_LINE, STAGES } from "@/lib/stages";

/**
 * カットインに出す文字（＝読み上げるセリフ）。
 * 演出（EffectOverlay）と、Gemini の声の事前生成の両方がここを使うので、文言は必ずここで作る。
 */

export const LINES = {
  goal: "入稿完了！！",
  fever: "FEVER突入！！",
  zone: "ZONE突入！！ 線1本 EXP×2",
  unstoppable: "筆が止まらない！！",
  undoMaster: "こだわりの鬼！",
  typing: "セリフが止まらない！",
  restStart: "休憩の時間です。少し休みましょう",
  restEnd: "休憩おわり！また描いていきましょう",
} as const;

export const strokeMilestoneLine = (strokes: number) => `${strokes}本突破！`;
export const lengthMilestoneLine = (meters: number) => `${meters}m描いた！`;

/** 事前に声を作っておく本数・長さの区切り（これを超えたらブラウザの声で読む） */
const PREPARED_STROKES = { step: 50, max: 500 };
const PREPARED_METERS = { step: 5, max: 100 };

function range({ step, max }: { step: number; max: number }): number[] {
  return Array.from({ length: max / step }, (_, i) => (i + 1) * step);
}

/** 読み上げる可能性のあるセリフの一覧（よく出るものから順に） */
export function getAllVoiceLines(): string[] {
  const lines = [
    ...STAGES.flatMap((stage) => stage.cutIns),
    PAGE_COMPLETE_LINE,
    ...Object.values(ACTIONS).flatMap((action) => action.cutIns),
    LINES.fever,
    LINES.zone,
    LINES.goal,
    LINES.unstoppable,
    LINES.undoMaster,
    LINES.typing,
    LINES.restStart,
    LINES.restEnd,
    ...range(PREPARED_STROKES).map(strokeMilestoneLine),
    ...range(PREPARED_METERS).map(lengthMilestoneLine),
  ];
  return [...new Set(lines)];
}
