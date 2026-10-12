// 配布用のデスクトップアプリ（Windows の exe）の本体
// 1. 書き出した画面（out/）を PC 内の Web サーバーで配る
// 2. クリスタ連携ブリッジを同じアプリの中で動かす（コマンドプロンプトで npm run bridge をしなくてよい）
// 3. それを開いたウィンドウを出す
import { BrowserWindow, app, dialog, shell } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DEFAULT_BRIDGE_PORT, startBridge } from "../bridge/core.mjs";
import { APP_PORT, startAppServer } from "./server.mjs";

const APP_NAME = "進捗ブースター";

// 2つ目を起動したら、新しく開かずに今のウィンドウを前に出す（同じポートを2つで取り合わないように）
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;
  let appServer = null;
  let bridge = null;

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // うまく動かないときに見られるよう、ブリッジの記録をファイルにも残す
  // （%APPDATA%\SyurabaBooster\logs\bridge.log）
  function writeLog(level, args) {
    const line = `${new Date().toISOString()} [${level}] ${args.map(String).join(" ")}\n`;
    try {
      const dir = path.join(app.getPath("userData"), "logs");
      mkdirSync(dir, { recursive: true });
      appendFileSync(path.join(dir, "bridge.log"), line);
    } catch {
      // 記録できなくても動作は続ける
    }
  }
  const bridgeLog = {
    info: (...args) => (console.log("[bridge]", ...args), writeLog("info", args)),
    warn: (...args) => (console.warn("[bridge]", ...args), writeLog("warn", args)),
    error: (...args) => (console.error("[bridge]", ...args), writeLog("error", args)),
  };

  async function startBridgeSafely() {
    // クリスタの操作を検知できるのは Windows だけ。ほかの OS（開発中の確認）は擬似モードを選べる
    const mode = process.argv.includes("--simulate") ? "simulate" : process.platform === "win32" ? "crista" : null;
    if (!mode) return;
    try {
      bridge = await startBridge({ port: DEFAULT_BRIDGE_PORT, mode, log: bridgeLog });
    } catch (err) {
      // 開発用のブリッジ（npm run bridge）がすでに動いているときなど。アプリはそちらにつながる
      bridgeLog.warn("ブリッジを起動できませんでした:", err.message);
    }
  }

  function createWindow(url) {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      title: APP_NAME,
      backgroundColor: "#09090b",
      autoHideMenuBar: true,
      webPreferences: {
        // 線を引いたときの効果音・BGM を、画面をクリックしなくても鳴らせるように
        autoplayPolicy: "no-user-gesture-required",
        contextIsolation: true,
        sandbox: true,
      },
    });

    // API キーのページなど、外のサイトはいつものブラウザで開く
    const isAppUrl = (target) => target.startsWith(url);
    mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
      if (/^https?:/.test(target)) void shell.openExternal(target);
      return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (event, target) => {
      if (isAppUrl(target)) return;
      event.preventDefault();
      if (/^https?:/.test(target)) void shell.openExternal(target);
    });

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    void mainWindow.loadURL(url);
  }

  app.whenReady().then(async () => {
    const root = path.join(app.getAppPath(), "out");
    try {
      appServer = await startAppServer(root, APP_PORT);
    } catch (err) {
      dialog.showErrorBox(
        APP_NAME,
        err.code === "EADDRINUSE"
          ? `ポート ${APP_PORT} がほかのアプリに使われているため起動できませんでした。\nPC を再起動してからもう一度お試しください。`
          : `起動できませんでした: ${err.message}`,
      );
      app.quit();
      return;
    }
    await startBridgeSafely();
    createWindow(appServer.url);
  });

  app.on("window-all-closed", () => app.quit());

  let cleanedUp = false;
  app.on("will-quit", (event) => {
    if (cleanedUp) return;
    event.preventDefault();
    cleanedUp = true;
    Promise.allSettled([bridge?.close(), appServer?.close()]).finally(() => app.quit());
  });
}
