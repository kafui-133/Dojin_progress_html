// 書き出した画面（out/）を PC 内だけで配る小さな Web サーバー
// 画面の保存データ（LocalStorage・IndexedDB）はページのアドレスごとに分かれるので、ポートは毎回同じものを使う
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const APP_PORT = 38920;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} root 書き出した画面のフォルダ（out/）
 * @returns {Promise<{ url: string, close: () => Promise<void> }>} 待ち受けを始めたら解決する（ポートが使用中なら失敗する）
 */
export async function startAppServer(root, port = APP_PORT) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
      const target = path.normalize(path.join(root, pathname));
      // out/ の外のファイルは返さない
      if (target !== root && !target.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      // /stats → stats.html、/ → index.html のように、Next.js の書き出し方に合わせて探す
      const candidates = [target, `${target.replace(/[\\/]+$/, "")}.html`, path.join(target, "index.html")];
      let file;
      for (const candidate of candidates) {
        if (await isFile(candidate)) {
          file = candidate;
          break;
        }
      }
      const status = file ? 200 : 404;
      file ??= path.join(root, "404.html");
      const body = await readFile(file);
      res.writeHead(status, {
        "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(500).end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
