"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNow } from "@/lib/clock";
import { type BridgeMode, type BridgeStatus, useBridgeStatus } from "@/lib/crista";
import { IS_DESKTOP } from "@/lib/edition";
import { CSP_COLORS, CSP_STATE_LABEL, activeRatio, formatClock, inactiveMs } from "@/lib/cspUsage";
import { cn } from "@/lib/utils";
import {
  RUSH_GAP_MS,
  ZONE_EXIT_LEVEL,
  formatDuration,
  formatLength,
  getFlowLevel,
  EMPTY_CSP_DAY,
  getZonesToday,
  isInZone,
  isResting,
  toDateString,
  useAppStore,
} from "@/store/useAppStore";
import { GROW_MS, type InkBalloon, type InkItem, RETRACT_MS, usePanelStore } from "@/store/usePanelStore";

// ---- ライブ集中線キャンバス ----

interface Popup {
  key: string;
  text: string;
  tone: "normal" | "zone" | "undo" | "typing";
}

/** 生まれてからの伸び具合と、やり直しで消えていく具合を合わせた 0〜1 */
function itemProgress(item: InkItem, now: number) {
  const grow = Math.min(1, (now - item.bornAt) / GROW_MS);
  const retract = item.removedAt === undefined ? 0 : Math.min(1, (now - item.removedAt) / RETRACT_MS);
  return { raw: grow * (1 - retract), highlighted: grow < 1 || item.removedAt !== undefined };
}

function drawBalloon(ctx: CanvasRenderingContext2D, b: InkBalloon, w: number, h: number, now: number): boolean {
  const { raw, highlighted } = itemProgress(b, now);
  // ポンッと少し大きくなってから落ち着く（easeOutBack）
  const c = 1.7;
  const scale = raw <= 0 ? 0 : 1 + (c + 1) * Math.pow(raw - 1, 3) + c * Math.pow(raw - 1, 2);
  const half = Math.min(w, h) / 2;
  const rx = b.size * half * scale;
  const ry = rx * 0.62;
  const cx = b.x * w;
  const cy = b.y * h;
  if (rx <= 0.5) return highlighted;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111";
  ctx.fillStyle = "#fff";
  if (highlighted) {
    ctx.shadowColor = b.removedAt === undefined ? "#38bdf8" : "#22d3ee";
    ctx.shadowBlur = 14;
  }
  // しっぽ（中心から離れる向き）
  const away = Math.atan2(cy - h / 2, cx - w / 2);
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(away + 0.35) * rx * 0.7, cy + Math.sin(away + 0.35) * ry * 0.7);
  ctx.lineTo(cx + Math.cos(away) * rx * 1.45, cy + Math.sin(away) * ry * 1.6);
  ctx.lineTo(cx + Math.cos(away - 0.35) * rx * 0.7, cy + Math.sin(away - 0.35) * ry * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // 中のセリフ（文字の代わりの線）
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = Math.max(1.5, ry * 0.12);
  for (let i = 0; i < b.rows; i++) {
    const y = cy + (i - (b.rows - 1) / 2) * ry * 0.38;
    const len = rx * (i === b.rows - 1 ? 0.7 : 1.1);
    ctx.beginPath();
    ctx.moveTo(cx - len / 2, y);
    ctx.lineTo(cx + len / 2, y);
    ctx.stroke();
  }
  ctx.restore();
  return highlighted;
}

function drawLines(canvas: HTMLCanvasElement, items: InkItem[], now: number): boolean {
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

  // 吹き出しは集中線の上に重ねる
  for (const line of items) {
    if (line.kind !== "line") continue;
    // やり直された線は、引いたときと逆向きにシュッと縮んで消える
    const { raw, highlighted } = itemProgress(line, now);
    if (highlighted) animating = true;
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
    if (highlighted) {
      ctx.shadowColor = line.removedAt === undefined ? "#e879f9" : "#22d3ee";
      ctx.shadowBlur = 12;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  for (const item of items) {
    if (item.kind === "balloon" && drawBalloon(ctx, item, w, h, now)) animating = true;
  }
  return animating;
}

function LiveInk() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  // 中身はストアに保存されている（ページを移動しても残り、日付が変わったら新しいコマ）
  const lineCount = usePanelStore((s) => s.lineCount);
  const panelLength = usePanelStore((s) => s.lengthPx);
  const panelUndos = usePanelStore((s) => s.undos);
  const panelTyped = usePanelStore((s) => s.typed);
  const completedPanels = usePanelStore((s) => s.completedPanels);
  const [popup, setPopup] = useState<Popup | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      frameRef.current = null;
      if (drawLines(canvas, usePanelStore.getState().items, Date.now())) {
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

    const unsubscribePanel = usePanelStore.subscribe((state, prev) => {
      if (state.items !== prev.items) requestRender();
    });

    // 線ごとの +EXP の表示（その場かぎりなので保存しない）
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      const stroke = state.lastStroke;
      if (stroke && stroke !== prev.lastStroke) {
        setPopup({ key: `s${stroke.id}`, text: `+${stroke.expGained}`, tone: stroke.inZone ? "zone" : "normal" });
      }
      const undo = state.lastUndo;
      if (undo && undo !== prev.lastUndo) {
        setPopup({ key: `u${undo.id}`, text: `↩ こだわり +${undo.expGained}`, tone: "undo" });
      }
      const typing = state.lastTyping;
      if (typing && typing !== prev.lastTyping) {
        setPopup({ key: `t${typing.id}`, text: `💬 +${typing.expGained}`, tone: "typing" });
      }
    });

    return () => {
      unsubscribe();
      unsubscribePanel();
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border-4 border-black bg-[#fdfdf8] shadow-[0_0_40px_rgba(217,70,239,0.25)]">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />

      <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
        <span className="rounded bg-black/80 px-2 py-0.5 text-xs font-bold text-white">
          このコマ {lineCount}本・{formatLength(panelLength)}
        </span>
        {panelTyped > 0 && (
          <span className="rounded bg-sky-700/90 px-2 py-0.5 text-xs font-bold text-white">
            セリフ {panelTyped}打
          </span>
        )}
        {panelUndos > 0 && (
          <span className="rounded bg-cyan-700/90 px-2 py-0.5 text-xs font-bold text-white">
            やり直し {panelUndos}回
          </span>
        )}
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
        {popup && (
          <motion.span
            key={popup.key}
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 whitespace-nowrap text-2xl font-black drop-shadow-[0_2px_0_rgba(0,0,0,0.6)] [-webkit-text-stroke:1px_#000]",
              popup.tone === "zone"
                ? "text-amber-300"
                : popup.tone === "undo"
                  ? "text-cyan-300"
                  : popup.tone === "typing"
                    ? "text-sky-300"
                    : "text-white",
            )}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -40, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.8, times: [0, 0.15, 0.6, 1] }}
          >
            {popup.text}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- 勢いゲージ ----

// ---- クリスタの使用時間（今日） ----

function CspUsageToday() {
  const cspState = useBridgeStatus((s) => s.cspState);
  // ブリッジは実際の時刻で送ってくるので、日付も実際の時刻で見る
  const today = toDateString(new Date());
  const day = useAppStore((s) => s.cspUsage[today]) ?? EMPTY_CSP_DAY;
  const ratio = activeRatio(day);
  const parts = [
    { key: "active", label: "アクティブ", ms: day.activeMs, color: CSP_COLORS.active },
    { key: "idle", label: "放置", ms: day.idleMs, color: CSP_COLORS.idle },
    { key: "background", label: "ほかのアプリ", ms: day.backgroundMs, color: CSP_COLORS.background },
  ];

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-zinc-800/50 p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-bold text-zinc-300">⏱️ 今日のクリスタ</span>
        {cspState && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-bold",
              cspState === "active" ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-300",
            )}
          >
            {CSP_STATE_LABEL[cspState]}
          </span>
        )}
        {day.runMs > 0 && (
          <span className="ml-auto text-zinc-400 tabular-nums">
            {formatClock(day.firstAt)}〜{formatClock(day.lastAt)}
          </span>
        )}
      </div>
      {day.runMs > 0 ? (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums text-zinc-300">
            <span>
              起動 <b className="text-zinc-50">{formatDuration(day.runMs)}</b>
            </span>
            <span>
              アクティブ <b className="text-zinc-50">{formatDuration(day.activeMs)}</b>
              {ratio !== null && <span className="text-zinc-400">（{ratio}%）</span>}
            </span>
            <span>
              ノンアクティブ <b className="text-zinc-50">{formatDuration(inactiveMs(day))}</b>
            </span>
          </div>
          {/* 起動時間の内訳（アクティブ / 放置 / ほかのアプリ） */}
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {parts
              .filter((p) => p.ms > 0)
              .map((p) => (
                <span key={p.key} style={{ flexGrow: p.ms, backgroundColor: p.color }} title={`${p.label} ${formatDuration(p.ms)}`} />
              ))}
          </div>
        </>
      ) : (
        <p className="text-zinc-400">クリスタを起動すると、起動時間・アクティブ時間・ノンアクティブ時間を記録します。</p>
      )}
    </div>
  );
}

function FlowGauge() {
  const now = useNow(200);
  const flow = useAppStore((s) => s.flow);
  const progress = useAppStore((s) => s.progress);

  const level = getFlowLevel(flow, now);
  const zonesToday = useAppStore((s) => getZonesToday(s.projects, toDateString(new Date(now))));
  const zoneDailyLimit = useAppStore((s) => s.zoneDailyLimit);
  const shurabaMode = useAppStore((s) => s.shurabaMode);
  const resting = useAppStore((s) => isResting(s.pomodoro, now));
  const zone = isInZone(flow, now);
  const rushAlive = flow.lastActivityAt > 0 && now - flow.lastActivityAt <= RUSH_GAP_MS;

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
          {level > 0 && (
            <div>
              今回 {flow.sessionStrokes}本・{formatLength(flow.sessionLengthPx)}
            </div>
          )}
          <div>
            累計 {progress.totalStrokes.toLocaleString()}本・{formatLength(progress.totalStrokeLength)}
            <span className="ml-1">（ペン {formatDuration(progress.totalStrokeMs)}）</span>
          </div>
          {(progress.totalTypedKeys > 0 || progress.totalKeyOps > 0) && (
            <div>
              セリフ {progress.totalTypedKeys.toLocaleString()}打・キー操作 {progress.totalKeyOps.toLocaleString()}回
            </div>
          )}
          {progress.totalUndos > 0 && <div>やり直し 累計 {progress.totalUndos.toLocaleString()}回</div>}
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
      <p className="text-right text-xs text-zinc-400">
        {resting
          ? "☕ 休憩中は ZONE に入りません"
          : shurabaMode
            ? `🔥 修羅場モード（今日の ZONE ${zonesToday}回・上限なし）`
            : zonesToday >= zoneDailyLimit
              ? `今日の ZONE は上限（${zoneDailyLimit}回）に達しました。ゆっくり描こう`
              : `今日の ZONE ${zonesToday} / ${zoneDailyLimit}回`}
      </p>
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
  const { status, mode } = useBridgeStatus();

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

      {status === "connecting" &&
        (IS_DESKTOP ? (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
            クリスタ連携の準備中です。しばらくたってもつながらないときは、アプリを一度終了して起動し直してください。
          </p>
        ) : (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
            ブリッジが起動していません。ターミナルで <code className="font-mono font-bold">npm run bridge</code>{" "}
            を実行してください（クリスタなしで試すなら <code className="font-mono font-bold">npm run bridge:sim</code>）。
          </p>
        ))}
      {status === "off" && (
        <p className="text-sm text-zinc-400">
          ON にすると、クリスタで線を引く・セリフを打つ・キーを押す・保存するたびにここが反応します。線の長さはペンが触れていた時間で決まります。
        </p>
      )}

      <LiveInk />
      <FlowGauge />
      <CspUsageToday />

      <button
        type="button"
        onClick={() => setStrokeSoundOn(!isStrokeSoundOn)}
        className="flex items-center gap-1.5 self-start text-sm text-zinc-400 hover:text-white"
      >
        {isStrokeSoundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        線・やり直しの効果音 {isStrokeSoundOn ? "ON" : "OFF"}
      </button>
    </section>
  );
}
