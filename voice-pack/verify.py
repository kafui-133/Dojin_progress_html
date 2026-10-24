"""output/ を lines.json と照らし合わせて確認し、output/report.txt にまとめる"""
import array
import json
import wave

from concurrent.futures import ThreadPoolExecutor

from drama3 import VOICE_PACK
from loudness import TARGET_LUFS, measure

OUTPUT = VOICE_PACK / "output"
manifest = json.loads((VOICE_PACK / "lines.json").read_text(encoding="utf-8"))
expected = {line["files"][v["id"]]: (line, v) for line in manifest["lines"] for v in manifest["voices"]}
present = {p.name for p in OUTPUT.glob("*.wav")}

missing = sorted(set(expected) - present)
extra = sorted(present - set(expected))
problems, lengths = [], []
for name in sorted(present & set(expected)):
    line, voice = expected[name]
    with wave.open(str(OUTPUT / name)) as w:
        rate, channels = w.getframerate(), w.getnchannels()
        samples = array.array("h", w.readframes(w.getnframes()))
    sec = len(samples) / rate
    lengths.append(sec)
    peak = max(map(abs, samples)) if samples else 0
    clipped = sum(1 for x in samples if abs(x) >= 32767)
    reading = line["readings"][voice["role"]]
    issues = []
    if channels != 1 or rate < 24000:
        issues.append(f"形式（{channels}ch {rate}Hz）")
    if peak < 1000:
        issues.append("ほぼ無音")
    if clipped > 10:
        issues.append(f"音割れ（{clipped} サンプル）")
    if sec > (6.5 if len(reading) > 15 else 5.5 if line["mood"] == "calm" else 4.0):
        issues.append(f"長すぎる（{sec:.1f}秒）")
    if sec < max(0.4, len(reading) * 0.05):
        issues.append(f"短すぎる（{sec:.1f}秒）")
    if issues:
        problems.append(f"{name}  {reading}  → {'、'.join(issues)}")

names = sorted(present & set(expected))
with ThreadPoolExecutor(8) as pool:
    loud = dict(zip(names, pool.map(lambda n: measure(OUTPUT / n), names)))
for name, (lufs, _) in loud.items():
    if abs(lufs - TARGET_LUFS) > 1.5:
        problems.append(f"{name}  → 音量がずれている（{lufs:.1f} LUFS）")
lufs_values = [lufs for lufs, _ in loud.values()] or [0]

report = [
    "進捗ブースター 自作の音声 確認レポート",
    f"声: {len(manifest['voices'])} 種類 × セリフ: {len(manifest['lines'])} = {len(expected)} ファイル",
    f"そろっている: {len(present & set(expected))} / {len(expected)}",
    f"足りない: {len(missing)}",
    *[f"  {n}" for n in missing],
    f"一覧にない（余計な）ファイル: {len(extra)}",
    *[f"  {n}" for n in extra],
    f"長さ: 最短 {min(lengths, default=0):.2f}秒 / 最長 {max(lengths, default=0):.2f}秒 / 平均 {sum(lengths) / max(1, len(lengths)):.2f}秒",
    f"音量（ラウドネス）: 目標 {TARGET_LUFS:.0f} LUFS、実際 {min(lufs_values):.1f} 〜 {max(lufs_values):.1f} LUFS"
    f" / ピーク最大 {max((p for _, p in loud.values()), default=0):.1f} dBFS",
    f"問題のあるもの: {len(problems)}",
    *[f"  {p}" for p in problems],
    "",
    "形式: WAV 16bit モノラル 44.1kHz、前後の無音（-45dBFS 以下）を削り、聞こえる音量を -16 LUFS にそろえています（ピークは -1dBFS 以下にリミッターで抑える）",
    "Voice: Fish Audio Drama 3 (drama3-small) / Built with Fish Audio（Fish Audio Community License v1.0）",
]
(OUTPUT / "report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
print("\n".join(report[:9]))
