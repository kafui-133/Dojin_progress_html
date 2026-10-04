"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNow } from "@/lib/clock";
import { type BridgeMode, type BridgeStatus, useCristaBridge } from "@/lib/crista";
import { cn } from "@/lib/utils";
import {
  RUSH_GAP_MS,
  ZONE_EXIT_LEVEL,
  getFlowLevel,
  isInZone,
  useAppStore,
} from "@/store/useAppStore";
import type { StrokeResult } from "@/types";

// ---- ライブ集中線キャンバス ----

interface InkLine {
  angle: number;
  /** 線の先端が届く位置（中心からの距離 / 短辺の半分） */
  reach: number;
  width: number;
  color: string;
  bornAt: number;
}

const GROW_MS = 220;
const MAX_LINES = 400;

function lineFromStroke(stroke: StrokeResult, bornAt: number): InkLine {
  const reach = 0.85 - Math.min(0.6, stroke.lengthPx / 1500) + (Math.random() - 0.5) * 0.16;
  return {
    angle: Math.random() * Math.PI * 2,
    reach: Math.min(0.9, Math.max(0.18, reach)),
    width: 2 + Math.min(7, stroke.durationMs / 120),
    color: stroke.inZone ? (Math.random() < 0.5 ? "#f59e0b" : "#d946ef") : "#111111",
    bornAt,
  };
}

function drawLines(canvas: HTMLCanvasElement, lines: InkLine[], now: number): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.hypot(w, h) / 2;
  const half = Math.min(w, h) / 2;
  let animating = false;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  for (const line of lines) {
    const raw = Math.min(1, (now - line.bornAt) / GROW_MS);
    if (raw < 1) animating = true;
    const p = 1 - Math.pow(1 - raw, 3); // easeOutCubic: シュッと伸びて止まる
    const inner = line.reach * half;
    const tip = outer - (outer - inner) * p;
    const cos = Math.cos(line.angle);
    const sin = Math.sin(line.angle);
    const nx = -sin * (line.width / 2);
    const ny = cos * (line.width / 2);

    // 外側が太く中心に向かって細くなる、入り抜きのある線
    ctx.beginPath();
    ctx.moveTo(cx + cos * outer + nx, cy + sin * outer + ny);
    ctx.lineTo(cx + cos * outer - nx, cy + sin * outer - ny);
    ctx.lineTo(cx + cos * tip, cy + sin * tip);
    ctx.closePath();
    ctx.fillStyle = line.color;
    if (raw < 1) {
      ctx.shadowColor = "#e879f9";
      ctx.shadowBlur = 12;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  return animating;
}

function LiveInk() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<InkLine[]>([]);
  const frameRef = useRef<number | null>(null);
  const [lineCount, setLineCount] = useState(0);
  const [completedPanels, setCompletedPanels] = useState(0);
  const [lastPopup, setLastPopup] = useState<StrokeResult | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      frameRef.current = null;
      if (drawLines(canvas, linesRef.current, performance.now())) {
        frameRef.current = requestAnimationFrame(render);
      }
    };
    const requestRender = () => {
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(render);
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      requestRender();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.lastStroke && state.lastStroke !== prev.lastStroke) {
        const lines = [...linesRef.current, lineFromStroke(state.lastStroke, performance.now())];
        linesRef.current = lines.slice(-MAX_LINES);
        setLineCount((n) => n + 1);
        setLastPopup(state.lastStroke);
        requestRender();
      }
      if (state.lastAction?.type === "save" && state.lastAction !== prev.lastAction) {
        // 保存したらこのコマは完成。演出のあと新しいコマにする
        setCompletedPanels((n) => n + 1);
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => {
          linesRef.current = [];
          setLineCount(0);
          requestRender();
        }, 1200);
      }
      if (!state.lastStroke && prev.lastStroke) {
        linesRef.current = [];
        setLineCount(0);
        setCompletedPanels(0);
        requestRender();
      }
    });

    return () => {
      unsubscribe();
      observer.disconnect();
      clearTimeout(clearTimer);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border-4 border-black bg-[#fdfdf8] shadow-[0_0_40px_rgba(217,70,239,0.25)]">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />

      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/80 px-2 py-0.5 text-xs font-bold text-white">
        このコマ {lineCount}本
      </div>
      {completedPanels > 0 && (
        <div className="pointer-events-none absolute right-2 top-2 rounded bg-fuchsia-600 px-2 py-0.5 text-xs font-bold text-white">
          完成 {completedPanels}コマ
        </div>
      )}

      {lineCount === 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-bold text-zinc-400">
          クリスタで線を引くと、ここに集中線が描かれていきます
        </p>
      )}

      {/* 線ごとの +EXP */}
      <AnimatePresence>
        {lastPopup && (
          <motion.span
            key={lastPopup.id}
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 text-2xl font-black drop-shadow-[0_2px_0_rgba(0,0,0,0.6)] [-webkit-text-stroke:1px_#000]",
              lastPopup.inZone ? "text-amber-300" : "text-white",
            )}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -40, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.8, times: [0, 0.15, 0.6, 1] }}
          >
            +{lastPopup.expGained}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- 勢いゲージ ----

function FlowGauge() {
  const now = useNow(200);
  const flow = useAppStore((s) => s.flow);
  const totalStrokes = useAppStore((s) => s.progress.totalStrokes);

  const level = getFlowLevel(flow, now);
  const zone = isInZone(flow, now);
  const rushAlive = flow.lastStrokeAt > 0 && now - flow.lastStrokeAt <= RUSH_GAP_MS;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-2">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={rushAlive ? flow.rush : 0}
              initial={{ scale: 1.5, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn("text-3xl font-black tabular-nums", zone ? "text-amber-300" : "text-white")}
            >
              {rushAlive ? flow.rush : 0}
            </motion.span>
          </AnimatePresence>
          <span className="text-sm font-black text-zinc-400">RUSH</span>
        </div>
        <div className="text-right text-xs text-zinc-400">
          {level > 0 && <div>今回 {flow.sessionStrokes}本</div>}
          <div>累計 {totalStrokes.toLocaleString()}本</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-xs font-bold text-zinc-400">勢い</span>
        <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={cn(
              "h-full transition-[width] duration-200 ease-out",
              zone
                ? "animate-pulse bg-gradient-to-r from-amber-400 via-fuchsia-500 to-cyan-400"
                : "bg-gradient-to-r from-fuchsia-600 to-pink-400",
            )}
            style={{ width: `${level}%` }}
          />
          {/* ゾーン終了ライン */}
          {zone && (
            <div
              className="absolute inset-y-0 w-0.5 bg-white/60"
              style={{ left: `${ZONE_EXIT_LEVEL}%` }}
            />
          )}
        </div>
        <span
          className={cn(
            "w-14 shrink-0 text-right text-xs font-black",
            zone ? "text-amber-300" : "text-zinc-500",
          )}
        >
          {zone ? "ZONE×2" : `${Math.floor(level)}%`}
        </span>
      </div>
    </div>
  );
}

// ---- パネル本体 ----

const STATUS_LABEL: Record<BridgeStatus, string> = {
  off: "OFF",
  connecting: "ブリッジを探しています…",
  connected: "接続中",
};

const MODE_LABEL: Record<BridgeMode, string> = {
  crista: "クリスタを監視中",
  "any-app": "全アプリで検知（テスト）",
  simulate: "擬似モード",
};

export default function CristaPanel() {
  const isBridgeEnabled = useAppStore((s) => s.isBridgeEnabled);
  const setBridgeEnabled = useAppStore((s) => s.setBridgeEnabled);
  const isStrokeSoundOn = useAppStore((s) => s.isStrokeSoundOn);
  const setStrokeSoundOn = useAppStore((s) => s.setStrokeSoundOn);
  const { status, mode } = useCristaBridge(isBridgeEnabled);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-lg font-black">🎨 クリスタ連携</h2>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold",
            status === "connected" ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-400",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              status === "connected" ? "bg-emerald-400" : status === "connecting" ? "animate-pulse bg-amber-400" : "bg-zinc-500",
            )}
          />
          {status === "connected" && mode ? MODE_LABEL[mode] : STATUS_LABEL[status]}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isBridgeEnabled}
          aria-label="クリスタ連携"
          onClick={() => setBridgeEnabled(!isBridgeEnabled)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition",
            isBridgeEnabled ? "bg-fuchsia-600" : "bg-zinc-700",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white transition-all",
              isBridgeEnabled ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </div>

      {status === "connecting" && (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
          ブリッジが起動していません。ターミナルで <code className="font-mono font-bold">npm run bridge</code>{" "}
          を実行してください（クリスタなしで試すなら <code className="font-mono font-bold">npm run bridge:sim</code>）。
        </p>
      )}
      {status === "off" && (
        <p className="text-sm text-zinc-400">
          ON にすると、クリスタで線を引くたび・保存するたびにここが反応します。保存（Ctrl+S）は「1コマ完成」として記録されます。
        </p>
      )}

      <LiveInk />
      <FlowGauge />

      <button
        type="button"
        onClick={() => setStrokeSoundOn(!isStrokeSoundOn)}
        className="flex items-center gap-1.5 self-start text-sm text-zinc-400 hover:text-white"
      >
        {isStrokeSoundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        線の効果音 {isStrokeSoundOn ? "ON" : "OFF"}
      </button>
    </section>
  );
}
