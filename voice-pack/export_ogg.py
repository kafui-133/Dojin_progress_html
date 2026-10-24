"""output/ の WAV を OGG（Opus）に圧縮して audio/ に書き出す（リポジトリに入れる・配る用）

使い方: python export_ogg.py [output フォルダ]   （省略すると voice-pack/output）
- ファイル名は同じで拡張子だけ .ogg（アプリはどちらも読み込める）
- すでに新しい OGG があるものは飛ばす
"""
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

VOICE_PACK = Path(__file__).resolve().parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else VOICE_PACK / "output"
DEST = VOICE_PACK / "audio"
BITRATE = "48k"  # 声だけなので 48kbps で十分（WAV の約 1/10）


def convert(wav):
    ogg = DEST / (wav.stem + ".ogg")
    if ogg.exists() and ogg.stat().st_mtime >= wav.stat().st_mtime:
        return False
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
         "-c:a", "libopus", "-b:a", BITRATE, "-vbr", "on", "-application", "audio", "-ac", "1",
         "-map_metadata", "-1", str(ogg)],
        check=True,
    )
    return True


def main():
    DEST.mkdir(exist_ok=True)
    wavs = sorted(SRC.glob("*.wav"))
    with ThreadPoolExecutor(8) as pool:
        done = sum(pool.map(convert, wavs))
    total = sum(p.stat().st_size for p in DEST.glob("*.ogg"))
    print(f"{len(wavs)} 個のうち {done} 個を書き出しました（audio/ 合計 {total / 1024 / 1024:.1f} MB）")


if __name__ == "__main__":
    main()
