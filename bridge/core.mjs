// クリスタ連携ブリッジの本体（コマンドで起動する bridge/index.mjs と、配布用のデスクトップアプリの両方から使う）
//
// CLIP STUDIO PAINT が前面にあるときだけ、ペンのストロークと Ctrl+S（保存）・Ctrl+Z（やり直し）を検知して
// ローカルの WebSocket で進捗ブースターに知らせる。
// 検知するのは「ペン/マウスの左ボタンを押した・離した・動いた距離」「Ctrl+S」「Ctrl+Z」と、
// キーボードを押した「回数」だけ。どのキーを押したか・入力した文字・描いた内容は読み取らず、
// アプリにも送らない。通信は PC 内（127.0.0.1）だけ。
// あわせて、クリスタが起動しているか・前面で操作しているかを10秒ごとに調べ、使用時間として送る。
import { execFile } from "node:child_process";
import { WebSocketServer } from "ws";

export const DEFAULT_BRIDGE_PORT = 38917;

/** クリスタのプロセス名（例: C:\Program Files\CELSYS\CLIP STUDIO 1.5\CLIP STUDIO PAINT\CLIPStudioPaint.exe） */
const TARGET_PROCESS = /clipstudiopaint/i;
/** これより短い・動いていない操作はクリック（ツール切替など）とみなして数えない */
const MIN_STROKE_MS = 40;
const MIN_STROKE_PX = 6;
/** 保存の連打を1回にまとめる */
const SAVE_COOLDOWN_MS = 5000;
/** Ctrl+Z の押しっぱなし（キーリピート）は数えすぎないよう間引く */
const UNDO_MIN_INTERVAL_MS = 120;
/** キーを押す間隔がこれより空いたら、ひとまとまりの入力が終わったとみなす */
const KEY_BURST_GAP_MS = 1200;
/** 続けてこの回数以上押したら「セリフ入力」、それより少なければ「キー操作（ショートカット）」 */
const TYPING_MIN_KEYS = 4;
/** 長く打ち続けているときも、この回数ごとに途中経過を送る */
const TYPING_FLUSH_KEYS = 30;

/** クリスタの使用時間を記録する間隔 */
const USAGE_TICK_MS = 10_000;
/** クリスタが前面にあっても、これだけ操作がなければ「放置」とみなす */
const IDLE_AFTER_MS = 3 * 60_000;
/** クリスタが前面にないとき、起動しているかを調べ直す間隔 */
const PROCESS_CHECK_MS = 30_000;
/** アプリとつながっていない間の使用時間は、この件数（約24時間分）までためておく */
const MAX_PENDING_USAGE = 8640;

/** localhost（開発時の http://localhost:3000、配布版の http://127.0.0.1:38920）のページからの接続だけ受け付ける */
const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const consoleLog = { info: console.log, warn: console.warn, error: console.error };

/**
 * ブリッジを起動する。
 * @param {{ port?: number, mode?: "crista" | "any-app" | "simulate", log?: typeof consoleLog }} options
 * @returns {Promise<{ close: () => Promise<void> }>} 待ち受けを始めたら解決する（ポートが使用中なら失敗する）
 */
export async function startBridge({ port = DEFAULT_BRIDGE_PORT, mode = "crista", log = consoleLog } = {}) {
  const wss = new WebSocketServer({
    host: "127.0.0.1",
    port,
    // 他のサイトから PC 内の操作情報を読まれないよう、localhost のページからの接続だけ受け付ける
    verifyClient: ({ origin }) => !origin || ALLOWED_ORIGIN.test(origin),
  });

  await new Promise((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });
  wss.on("error", (err) => log.error("❌ ブリッジでエラーが発生しました:", err.message));

  /** アプリとつながっていない間にたまった使用時間 */
  let pendingUsage = [];

  wss.on("connection", (socket) => {
    log.info("🔗 進捗ブースターと接続しました");
    socket.send(JSON.stringify({ type: "hello", mode: mode === "any-app" ? "any-app" : mode }));
    if (pendingUsage.length > 0) {
      socket.send(JSON.stringify({ type: "usage", ticks: pendingUsage }));
      pendingUsage = [];
    }
    socket.on("close", () => log.info("🔌 進捗ブースターとの接続が切れました"));
  });

  function broadcast(event) {
    const data = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(data);
    }
  }

  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };

  let strokeCount = 0;
  function emitStroke(durationMs, lengthPx) {
    strokeCount++;
    broadcast({ type: "stroke", durationMs, lengthPx });
    if (strokeCount % 50 === 0) log.info(`✏️  ${strokeCount} 本目の線`);
  }

  let lastSaveAt = 0;
  function emitSave() {
    const now = Date.now();
    if (now - lastSaveAt < SAVE_COOLDOWN_MS) return;
    lastSaveAt = now;
    broadcast({ type: "save" });
    log.info("💾 保存を検知しました（1コマ完成！）");
  }

  let lastUndoAt = 0;
  let undoCount = 0;
  function emitUndo() {
    const now = Date.now();
    if (now - lastUndoAt < UNDO_MIN_INTERVAL_MS) return;
    lastUndoAt = now;
    undoCount++;
    broadcast({ type: "undo" });
    if (undoCount % 25 === 0) log.info(`↩️  やり直し ${undoCount} 回目`);
  }

  // キーは押した回数だけ数え、ひとまとまりの入力ごとに送る
  let burstKeys = 0;
  let burstIsTyping = false;
  let burstTimer;
  let typedTotal = 0;

  function flushKeys() {
    const keys = burstKeys;
    burstKeys = 0;
    if (keys === 0) return;
    if (burstIsTyping || keys >= TYPING_MIN_KEYS) {
      burstIsTyping = true;
      typedTotal += keys;
      broadcast({ type: "typing", keys });
      if (Math.floor(typedTotal / 200) > Math.floor((typedTotal - keys) / 200)) log.info(`💬 セリフ入力 ${typedTotal} 打鍵`);
    } else {
      broadcast({ type: "keys", count: keys });
    }
  }

  function countKey() {
    burstKeys++;
    clearTimeout(burstTimer);
    burstTimer = setTimeout(() => {
      flushKeys();
      burstIsTyping = false;
    }, KEY_BURST_GAP_MS);
    if (burstKeys >= TYPING_FLUSH_KEYS) flushKeys();
  }

  /** Ctrl などの組み合わせ（保存・やり直し以外）はキー操作として1回だけ数える */
  function emitKeyOp() {
    broadcast({ type: "keys", count: 1 });
  }

  // ---- クリスタの使用時間 ----

  /** 最後にマウス・ペン・キーボードを操作した時刻（どのアプリでも） */
  let lastInputAt = Date.now();
  /** クリスタが前面にあるか（入力の検知を始めたら差し替える） */
  let isCristaForeground = () => mode === "any-app";

  let lastUsageState = null;
  /** @param {{ at: number, ms: number, state: "active" | "idle" | "background" | "closed" }} tick */
  function emitUsage(tick) {
    if (tick.state !== lastUsageState) {
      lastUsageState = tick.state;
      log.info(USAGE_STATE_LOG[tick.state]);
    }
    if (wss.clients.size > 0) broadcast({ type: "usage", ticks: [tick] });
    else if (tick.state !== "closed") pendingUsage = [...pendingUsage, tick].slice(-MAX_PENDING_USAGE);
  }

  function startUsageTracking() {
    let lastTickAt = Date.now();
    /** スリープ明けなどで間が空いたときに数えすぎないよう、1回分の上限をつける */
    const elapsed = (now) => {
      const ms = Math.min(now - lastTickAt, USAGE_TICK_MS * 3);
      lastTickAt = now;
      return Math.max(0, ms);
    };

    if (mode === "simulate") {
      // 擬似モード: たいてい作業中、ときどき放置・ほかのアプリ
      let state = "active";
      const timer = setInterval(() => {
        if (Math.random() < 0.2) state = ["active", "active", "idle", "background"][Math.floor(Math.random() * 4)];
        const now = Date.now();
        emitUsage({ at: now, ms: elapsed(now), state });
      }, USAGE_TICK_MS);
      return () => clearInterval(timer);
    }
    // 起動しているかを調べられるのは Windows だけ（--any-app のテストでは起動中とみなす）
    if (process.platform !== "win32" && mode !== "any-app") return () => {};

    let running = mode === "any-app";
    let lastProcessCheckAt = 0;
    let wasForeground = false;
    let processCheckFailed = false;

    const checkProcess = () => {
      lastProcessCheckAt = Date.now();
      execFile(
        "tasklist",
        ["/FI", "IMAGENAME eq CLIPStudioPaint.exe", "/NH"],
        { windowsHide: true, timeout: 10_000 },
        (err, stdout) => {
          if (err) {
            if (!processCheckFailed) log.warn("⚠️ クリスタが起動しているかを調べられませんでした:", err.message);
            processCheckFailed = true;
            return;
          }
          running = TARGET_PROCESS.test(String(stdout));
        },
      );
    };

    const timer = setInterval(() => {
      const now = Date.now();
      const foreground = isCristaForeground();
      if (mode !== "any-app") {
        if (foreground) running = true; // 前面にあるなら起動している
        // ほかのアプリに切り替わった直後・しばらくたったときに、まだ起動しているか調べる
        else if (wasForeground || now - lastProcessCheckAt >= PROCESS_CHECK_MS) checkProcess();
        // 調べられない環境では、前面にあるときだけ起動中とみなす
        if (processCheckFailed && !foreground) running = false;
      }
      wasForeground = foreground;
      const state = !running
        ? "closed"
        : !foreground
          ? "background"
          : now - lastInputAt >= IDLE_AFTER_MS
            ? "idle"
            : "active";
      emitUsage({ at: now, ms: elapsed(now), state });
    }, USAGE_TICK_MS);
    if (mode !== "any-app") checkProcess();
    return () => clearInterval(timer);
  }

  let stopHooks = () => {};

  if (mode === "simulate") {
    log.info("🧪 擬似モード: 数秒おきに線・やり直し・セリフ入力・キー操作を送り、約60秒ごとに保存を送ります");
    const burst = () => {
      const strokes = 3 + Math.floor(Math.random() * 10);
      let t = 0;
      for (let i = 0; i < strokes; i++) {
        t += 150 + Math.random() * 500;
        later(() => emitStroke(120 + Math.round(Math.random() * 600), 40 + Math.round(Math.random() * 400)), t);
      }
      // ときどきセリフを打つ・ショートカットを押す
      if (Math.random() < 0.25) {
        const keys = 8 + Math.floor(Math.random() * 30);
        later(() => broadcast({ type: "typing", keys }), t + 300);
        t += 1500;
      } else if (Math.random() < 0.3) {
        later(() => broadcast({ type: "keys", count: 1 + Math.floor(Math.random() * 2) }), t + 200);
      }
      // ときどき描き直す
      if (Math.random() < 0.4) {
        const undos = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < undos; i++) later(emitUndo, t + 400 + i * 250);
        t += 400 + undos * 250;
      }
      later(burst, t + 1000 + Math.random() * 4000);
    };
    burst();
    const saveTimer = setInterval(emitSave, 60_000);
    stopHooks = () => clearInterval(saveTimer);
  } else {
    stopHooks = await startHooks();
  }
  const stopUsage = startUsageTracking();

  // ---- 入力の検知（Windows） ----

  async function startHooks() {
    let isTargetForeground = () => true;

    if (mode !== "any-app") {
      if (process.platform !== "win32") {
        log.warn("⚠️ クリスタの判定は Windows のみ対応です。すべてのアプリで反応します。");
      } else {
        isTargetForeground = await createForegroundChecker(log);
      }
    }
    isCristaForeground = isTargetForeground;

    let uiohook;
    try {
      uiohook = await import("uiohook-napi");
    } catch (err) {
      log.error("❌ 入力検知モジュール（uiohook-napi）を読み込めませんでした。", err.message);
      return () => {};
    }
    const { uIOhook, UiohookKey, EventType } = uiohook;

    /** 進行中のストローク */
    let stroke = null;

    uIOhook.on("mousedown", (e) => {
      if (e.button !== 1 || !isTargetForeground()) return;
      stroke = { startedAt: Date.now(), x: e.x, y: e.y, length: 0 };
    });

    // ドラッグ中の移動は 'input' でしか届かない環境があるため、こちらで距離を積算する
    uIOhook.on("input", (e) => {
      lastInputAt = Date.now();
      if (!stroke || (e.type !== EventType.EVENT_MOUSE_MOVED && e.type !== 10)) return;
      stroke.length += Math.hypot(e.x - stroke.x, e.y - stroke.y);
      stroke.x = e.x;
      stroke.y = e.y;
    });

    uIOhook.on("mouseup", (e) => {
      if (e.button !== 1 || !stroke) return;
      const durationMs = Date.now() - stroke.startedAt;
      const lengthPx = Math.round(stroke.length + Math.hypot(e.x - stroke.x, e.y - stroke.y));
      stroke = null;
      if (durationMs >= MIN_STROKE_MS && lengthPx >= MIN_STROKE_PX) emitStroke(durationMs, lengthPx);
    });

    const MODIFIER_KEYS = new Set(
      ["Ctrl", "CtrlRight", "Alt", "AltRight", "Shift", "ShiftRight", "Meta", "MetaRight"].map((k) => UiohookKey[k]),
    );
    /** 押しっぱなしのキーリピートを数えないよう、押されているキーを覚えておく */
    const pressed = new Set();

    uIOhook.on("keyup", (e) => pressed.delete(e.keycode));

    uIOhook.on("keydown", (e) => {
      if (pressed.has(e.keycode)) {
        // Ctrl+Z の押しっぱなしだけは、クリスタでも連続でやり直しになるので数える
        if (e.ctrlKey && e.keycode === UiohookKey.Z && !e.shiftKey && isTargetForeground()) emitUndo();
        return;
      }
      pressed.add(e.keycode);
      if (MODIFIER_KEYS.has(e.keycode) || !isTargetForeground()) return;

      if (e.ctrlKey && e.keycode === UiohookKey.S) emitSave();
      // Ctrl+Shift+Z（やり直しの取り消し）はやり直しとしては数えない
      else if (e.ctrlKey && e.keycode === UiohookKey.Z && !e.shiftKey) emitUndo();
      else if (e.ctrlKey || e.altKey || e.metaKey) emitKeyOp();
      else countKey();
    });

    uIOhook.start();
    log.info(
      mode === "any-app"
        ? "👀 すべてのアプリでペン操作を検知中（--any-app）"
        : "👀 クリスタが前面にあるときのペン操作・キーボード（回数のみ）・Ctrl+S・Ctrl+Z を検知中",
    );
    return () => uIOhook.stop();
  }

  return {
    close: async () => {
      stopHooks();
      stopUsage();
      for (const id of timers) clearTimeout(id);
      clearTimeout(burstTimer);
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

const USAGE_STATE_LOG = {
  active: "⏱️ クリスタ: 作業中（アクティブ）",
  idle: "⏱️ クリスタ: 前面にあるが操作なし（放置）",
  background: "⏱️ クリスタ: 起動中・ほかのアプリを使用中",
  closed: "⏱️ クリスタ: 起動していません",
};

/** 前面ウィンドウがクリスタかどうかを Win32 API で調べる関数を作る */
async function createForegroundChecker(log) {
  let koffi;
  try {
    koffi = (await import("koffi")).default;
  } catch (err) {
    log.warn("⚠️ 前面ウィンドウの判定モジュール（koffi）を読み込めませんでした。すべてのアプリで反応します。");
    log.warn("   ", err.message);
    return () => true;
  }

  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  const HANDLE = koffi.pointer("HANDLE", koffi.opaque());
  koffi.alias("HWND", HANDLE);
  koffi.alias("DWORD", "uint32_t");

  const GetForegroundWindow = user32.func("HWND __stdcall GetForegroundWindow()");
  const GetWindowThreadProcessId = user32.func(
    "DWORD __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ DWORD *lpdwProcessId)",
  );
  const OpenProcess = kernel32.func(
    "HANDLE __stdcall OpenProcess(DWORD dwDesiredAccess, int bInheritHandle, DWORD dwProcessId)",
  );
  const QueryFullProcessImageNameW = kernel32.func(
    "int __stdcall QueryFullProcessImageNameW(HANDLE hProcess, DWORD dwFlags, _Out_ void *lpExeName, _Inout_ DWORD *lpdwSize)",
  );
  const CloseHandle = kernel32.func("int __stdcall CloseHandle(HANDLE hObject)");
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

  // 同じウィンドウなら結果を使い回す（クリックのたびに API を呼びすぎない）
  let cache = { pid: -1, isTarget: false };
  let lastLogged = null;

  return () => {
    try {
      const hwnd = GetForegroundWindow();
      if (!hwnd) return false;
      const pidOut = [0];
      GetWindowThreadProcessId(hwnd, pidOut);
      const pid = pidOut[0];
      if (pid === cache.pid) return cache.isTarget;

      let path = "";
      const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
      if (handle) {
        const buf = Buffer.alloc(1024 * 2);
        const size = [1024];
        if (QueryFullProcessImageNameW(handle, 0, buf, size)) {
          path = buf.toString("utf16le", 0, size[0] * 2);
        }
        CloseHandle(handle);
      }
      const isTarget = TARGET_PROCESS.test(path);
      cache = { pid, isTarget };
      if (isTarget !== lastLogged) {
        log.info(isTarget ? "🎨 クリスタが前面になりました" : "💤 クリスタ以外のウィンドウです");
        lastLogged = isTarget;
      }
      return isTarget;
    } catch (err) {
      log.warn("⚠️ 前面ウィンドウの判定に失敗しました:", err.message);
      return true;
    }
  };
}
