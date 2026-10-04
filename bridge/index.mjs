// クリスタ連携ブリッジ
// CLIP STUDIO PAINT が前面にあるときだけ、ペンのストロークと Ctrl+S（保存）・Ctrl+Z（やり直し）を検知して
// ローカルの WebSocket で進捗ブースターに知らせる常駐プログラム。
//
// 検知するのは「ペン/マウスの左ボタンを押した・離した・動いた距離」と「Ctrl+S」「Ctrl+Z」だけ。
// 他のキー入力や描いた内容は読み取らず、記録もしない。通信は PC 内（127.0.0.1）だけ。
//
// 使い方:
//   npm run bridge                 … クリスタ連携（Windows）
//   npm run bridge -- --simulate   … クリスタなしで擬似的に線を送る（動作確認用）
//   npm run bridge -- --any-app    … クリスタ以外のアプリでも反応する（テスト用）
import { WebSocketServer } from "ws";

const PORT = Number(process.env.BRIDGE_PORT ?? 38917);
const args = new Set(process.argv.slice(2));
const SIMULATE = args.has("--simulate");
const ANY_APP = args.has("--any-app");

/** クリスタのプロセス名（例: C:\Program Files\CELSYS\CLIP STUDIO 1.5\CLIP STUDIO PAINT\CLIPStudioPaint.exe） */
const TARGET_PROCESS = /clipstudiopaint/i;
/** これより短い・動いていない操作はクリック（ツール切替など）とみなして数えない */
const MIN_STROKE_MS = 40;
const MIN_STROKE_PX = 6;
/** 保存の連打を1回にまとめる */
const SAVE_COOLDOWN_MS = 5000;
/** Ctrl+Z の押しっぱなし（キーリピート）は数えすぎないよう間引く */
const UNDO_MIN_INTERVAL_MS = 120;

const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// ---- WebSocket サーバー ----

const wss = new WebSocketServer({
  host: "127.0.0.1",
  port: PORT,
  // 他のサイトから PC 内の操作情報を読まれないよう、localhost のページからの接続だけ受け付ける
  verifyClient: ({ origin }) => !origin || ALLOWED_ORIGIN.test(origin),
});

wss.on("listening", () => {
  console.log(`\n✅ クリスタ連携ブリッジを起動しました（ws://127.0.0.1:${PORT}）`);
  console.log("   進捗ブースター（http://localhost:3000）で「クリスタ連携」を ON にしてください。");
  console.log("   終了するには Ctrl + C を押します。\n");
});

wss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ ポート ${PORT} は使用中です。ブリッジがすでに起動していないか確認してください。`);
  } else {
    console.error("❌ ブリッジでエラーが発生しました:", err.message);
  }
  process.exit(1);
});

wss.on("connection", (socket) => {
  console.log("🔗 進捗ブースターと接続しました");
  socket.send(JSON.stringify({ type: "hello", mode: SIMULATE ? "simulate" : ANY_APP ? "any-app" : "crista" }));
  socket.on("close", () => console.log("🔌 進捗ブースターとの接続が切れました"));
});

function broadcast(event) {
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}

let strokeCount = 0;
function emitStroke(durationMs, lengthPx) {
  strokeCount++;
  broadcast({ type: "stroke", durationMs, lengthPx });
  if (strokeCount % 50 === 0) console.log(`✏️  ${strokeCount} 本目の線`);
}

let lastSaveAt = 0;
function emitSave() {
  const now = Date.now();
  if (now - lastSaveAt < SAVE_COOLDOWN_MS) return;
  lastSaveAt = now;
  broadcast({ type: "save" });
  console.log("💾 保存を検知しました（1コマ完成！）");
}

let lastUndoAt = 0;
let undoCount = 0;
function emitUndo() {
  const now = Date.now();
  if (now - lastUndoAt < UNDO_MIN_INTERVAL_MS) return;
  lastUndoAt = now;
  undoCount++;
  broadcast({ type: "undo" });
  if (undoCount % 25 === 0) console.log(`↩️  やり直し ${undoCount} 回目`);
}

// ---- 擬似モード ----

if (!SIMULATE && !ANY_APP && process.platform !== "win32") {
  // Codespaces などクラウド上では、手元の PC のペン操作は届かない
  console.log(
    [
      "",
      "⚠️  クリスタ連携ブリッジは、クリスタを使っている Windows PC の上で起動する必要があります。",
      process.env.CODESPACES === "true"
        ? "   いまは GitHub Codespaces（クラウド上の Linux）で動いているため、手元の PC のペン操作を検知できません。"
        : `   いまの環境（${process.platform}）では、クリスタの操作を検知できません。`,
      "   手元の Windows PC でプロジェクトを開き、npm run dev:crista を実行してください（手順: bridge/README.md）。",
      "   クリスタなしで動きだけ試すなら npm run bridge:sim を使えます。",
      "   アプリ（http://localhost:3000）はこのまま使えます。",
      "",
    ].join("\n"),
  );
  wss.close();
} else if (SIMULATE) {
  console.log("🧪 擬似モード: 数秒おきに線のまとまりとやり直しを送り、約60秒ごとに保存を送ります");
  const burst = () => {
    const strokes = 3 + Math.floor(Math.random() * 10);
    let t = 0;
    for (let i = 0; i < strokes; i++) {
      t += 150 + Math.random() * 500;
      setTimeout(() => emitStroke(120 + Math.round(Math.random() * 600), 40 + Math.round(Math.random() * 400)), t);
    }
    // ときどき描き直す
    if (Math.random() < 0.4) {
      const undos = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < undos; i++) setTimeout(emitUndo, t + 400 + i * 250);
      t += 400 + undos * 250;
    }
    setTimeout(burst, t + 1000 + Math.random() * 4000);
  };
  burst();
  setInterval(emitSave, 60_000);
} else {
  await startHooks();
}

// ---- 入力の検知（Windows） ----

async function startHooks() {
  let isTargetForeground = () => true;

  if (!ANY_APP) {
    if (process.platform !== "win32") {
      console.warn("⚠️ クリスタの判定は Windows のみ対応です。すべてのアプリで反応します。");
    } else {
      isTargetForeground = await createForegroundChecker();
    }
  }

  let uiohook;
  try {
    uiohook = await import("uiohook-napi");
  } catch (err) {
    console.error("❌ 入力検知モジュール（uiohook-napi）を読み込めませんでした。npm install をやり直してください。");
    console.error("   ", err.message);
    wss.close();
    return;
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

  uIOhook.on("keydown", (e) => {
    if (!e.ctrlKey || !isTargetForeground()) return;
    if (e.keycode === UiohookKey.S) emitSave();
    // Ctrl+Shift+Z（やり直しの取り消し）は数えない
    else if (e.keycode === UiohookKey.Z && !e.shiftKey) emitUndo();
  });

  uIOhook.start();
  console.log(
    ANY_APP
      ? "👀 すべてのアプリでペン操作を検知中（--any-app）"
      : "👀 クリスタが前面にあるときのペン操作と Ctrl+S・Ctrl+Z を検知中",
  );

  const stop = () => {
    uIOhook.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

/** 前面ウィンドウがクリスタかどうかを Win32 API で調べる関数を作る */
async function createForegroundChecker() {
  let koffi;
  try {
    koffi = (await import("koffi")).default;
  } catch (err) {
    console.warn("⚠️ 前面ウィンドウの判定モジュール（koffi）を読み込めませんでした。すべてのアプリで反応します。");
    console.warn("   ", err.message);
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
        console.log(isTarget ? "🎨 クリスタが前面になりました" : "💤 クリスタ以外のウィンドウです");
        lastLogged = isTarget;
      }
      return isTarget;
    } catch (err) {
      console.warn("⚠️ 前面ウィンドウの判定に失敗しました:", err.message);
      return true;
    }
  };
}
