"""聞こえる音量（ラウドネス, LUFS）をそろえる。ffmpeg の ebur128 で測り、ゲインをかけ、ピークが出すぎるものはリミッターで抑える

使い方: python loudness.py measure [ファイル...]   … 測るだけ
        python loudness.py apply [ファイル...]     … そろえる（省略すると output/ の全部）
"""
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from drama3 import VOICE_PACK, WORK

OUTPUT = VOICE_PACK / "output"
TARGET_LUFS = -16.0
PEAK_DBFS = -1.0


def measure(path):
    """(ラウドネス LUFS, トゥルーピーク dBFS) を返す"""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    summary = proc.stderr[proc.stderr.rfind("Summary:") :]
    lufs = float(re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", summary)[1])
    peak = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summary)[1])
    return lufs, peak


def normalize(path):
    """目標のラウドネスにそろえて上書きする。測り直した値を返す"""
    lufs, _ = measure(path)
    gain = TARGET_LUFS - lufs
    limit = 10 ** (PEAK_DBFS / 20)
    tmp = path.with_suffix(".tmp.wav")
    # 上げたぶんピークが出すぎるところだけリミッターで抑える（全体の音量は変えない）
    af = f"volume={gain:.2f}dB,alimiter=limit={limit:.4f}:attack=1:release=50:level=false"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path), "-af", af,
         "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", str(tmp)],
        check=True,
    )
    tmp.replace(path)
    return measure(path)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "measure"
    files = [Path(p) for p in sys.argv[2:]] or sorted(OUTPUT.glob("*.wav"))
    func = normalize if mode == "apply" else measure
    with ThreadPoolExecutor(8) as pool:
        results = dict(zip((f.name for f in files), pool.map(func, files)))
    (WORK / f"loudness_{mode}.json").write_text(json.dumps(results, indent=1), encoding="utf-8")

    by_voice = {}
    for name, (lufs, peak) in results.items():
        by_voice.setdefault(name.split("_")[0], []).append(lufs)
    for voice, values in by_voice.items():
        print(f"{voice:8s} 平均 {sum(values) / len(values):6.1f} LUFS（{min(values):6.1f} 〜 {max(values):6.1f}）")
    all_lufs = [lufs for lufs, _ in results.values()]
    print(f"全体: {min(all_lufs):.1f} 〜 {max(all_lufs):.1f} LUFS / ピーク最大 {max(p for _, p in results.values()):.1f} dBFS")


if __name__ == "__main__":
    main()
