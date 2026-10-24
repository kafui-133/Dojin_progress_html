# Dojin_progress_html（進捗ブースター / Syuraba Booster）
同人作家支援アプリ
これはAIで作成した同人作家支援アプリです

日々の進捗管理ができます

> [!WARNING]
> **ご注意（免責事項）**
> このアプリは AI を使って生成したものです。動作やインストールは、ご自身の判断と責任で行ってください。
> 本アプリの利用によって生じたいかなる損害・不具合についても、作者は一切の責任を負いません。

## 使いたい人へ（Windows アプリ）

**[最新版をダウンロード](https://github.com/kafui-133/Dojin_progress_html/releases/tag/desktop-latest)** して、exe を実行するだけで使えます。
使い方は [DISTRIBUTION.md](./DISTRIBUTION.md) を見てください。

## 開発する人へ

```bash
npm install
npm run dev          # http://localhost:3000
npm run dev:crista   # アプリ + クリスタ連携ブリッジ（Windows）
npm run bridge:sim   # クリスタなしで擬似的に線を送る
```

### デスクトップアプリ（配布版）

| コマンド | 内容 |
| --- | --- |
| `npm run build:desktop` | 配布版の画面を `out/` に書き出す（Gemini の声なし・クリスタ連携は最初から ON） |
| `npm run desktop` | 書き出して、Electron で起動して確かめる |
| `npm run dist:win` | Windows 用の exe を `release/` に作る |

`main` か開発ブランチに push すると、GitHub Actions（`.github/workflows/desktop.yml`）が Windows で exe を作り、
Releases の「desktop-latest」に置き直します。`v1.0.0` のようなタグを push すると、その版のリリースを作ります。

- 読み上げ用の音声（21 種類の声）は `voice-pack/audio/` に入っています。読み込み方・作り直し方は [voice-pack/README.md](./voice-pack/README.md) を見てください。
- `public/sounds/*.mp3` は Git に入れず、配布版にも含めません（自分用の曲を置いても配布されません）。
- 配布版のアプリは `electron/main.mjs`（画面を配る小さなサーバー + 内蔵ブリッジ `bridge/core.mjs`）です。

## クレジット

- 読み上げ音声（`voice-pack/audio/`）: Voice: Fish Audio Drama 3 (drama3-small) / **Built with Fish Audio**（[voice-pack/CREDITS.md](./voice-pack/CREDITS.md)）
- アイコン: Blender で作成
