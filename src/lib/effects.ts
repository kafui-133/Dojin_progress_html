import confetti from "canvas-confetti";

const KONPEITO_COLORS = ["#ff4fa3", "#ffd23f", "#3ee6ff", "#7cff6b", "#ffffff", "#b07cff"];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** 画面中央から紙吹雪・金平糖・キラキラを噴射する。フィーバー中は量と勢いを増やす */
export function burstConfetti({ fever = false }: { fever?: boolean } = {}): void {
  if (prefersReducedMotion()) return;
  const scale = fever ? 1.8 : 1;
  const origin = { x: 0.5, y: 0.45 };

  // 紙吹雪
  confetti({
    particleCount: Math.round(90 * scale),
    spread: 100,
    startVelocity: 45 * Math.sqrt(scale),
    origin,
    colors: KONPEITO_COLORS,
    zIndex: 60,
  });
  // 金平糖（丸い粒）
  confetti({
    particleCount: Math.round(40 * scale),
    spread: 360,
    startVelocity: 30,
    scalar: 1.4,
    shapes: ["circle"],
    origin,
    colors: KONPEITO_COLORS,
    zIndex: 60,
  });
  // キラキラ（小さな星）
  confetti({
    particleCount: Math.round(30 * scale),
    spread: 360,
    startVelocity: 20,
    gravity: 0.4,
    scalar: 0.7,
    shapes: ["star"],
    origin,
    colors: ["#fff6a8", "#ffffff", "#ffd23f"],
    zIndex: 60,
  });

  if (fever) {
    // 両サイドからのキャノン
    for (const x of [0, 1]) {
      confetti({
        particleCount: 60,
        angle: x === 0 ? 60 : 120,
        spread: 55,
        startVelocity: 60,
        origin: { x, y: 0.8 },
        colors: KONPEITO_COLORS,
        zIndex: 60,
      });
    }
  }
}

/** 目標達成時の長めの紙吹雪 */
export function celebrateGoal(durationMs = 2500): void {
  if (prefersReducedMotion()) return;
  const end = Date.now() + durationMs;
  const frame = () => {
    for (const x of [0, 1]) {
      confetti({
        particleCount: 6,
        angle: x === 0 ? 60 : 120,
        spread: 60,
        origin: { x, y: 0.7 },
        colors: KONPEITO_COLORS,
        zIndex: 60,
      });
    }
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

/** 対応端末のみバイブレーション（iOS Safari などは非対応のため何もしない） */
export function vibrate(pattern: number | number[] = [100, 50, 100]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
