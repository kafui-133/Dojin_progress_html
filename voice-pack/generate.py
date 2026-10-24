"""lines.json の全セリフを、全部の声で作る → output/<声の ID>_<id>.wav

使い方: python generate.py [声の ID ...]   （例: python generate.py cute1 boy2。省略すると全部）
- すでにあるファイルは飛ばす（途中で止めても続きから再開できる）
- 長すぎる・短すぎるものは seed を変えて作り直し、それでもだめなものは最後にまとめて報告する
"""
import array
import json
import re
import shutil
import sys
import wave
from pathlib import Path

from drama3 import VOICE_PACK, WORK, make_request, run_batch
from loudness import normalize

OUTPUT = VOICE_PACK / "output"
REFS = WORK / "refs"

# 声の ID → 声さがしで選んだ見本（work/casting/<見本の役>/seed<N>.wav）
VOICE_REFS = {
    "cute1": ("female", 1), "cute2": ("female", 2), "cute3": ("female", 3), "cute4": ("female", 8),
    "shibui1": ("male", 1),
    "man1": ("male", 2), "man2": ("male", 6), "man3": ("male", 7), "man4": ("male", 8),
    "onee1": ("onee", 1), "onee2": ("onee", 5), "onee3": ("onee", 8), "onee4": ("onee", 9),
    "girl1": ("girl", 2), "girl2": ("girl", 4), "girl3": ("girl", 6), "girl4": ("girl", 10),
    "boy1": ("boy", 1), "boy2": ("boy", 5), "boy3": ("boy", 7), "boy4": ("boy", 8),
}

SEEDS = [1, 2, 3, 4, 5, 6]  # 1回目がだめなら、seed を変えて作り直す
MAX_SEC = {"hype": 4.0, "calm": 5.5}
LONG_CHARS = 15  # これより長いセリフ（ZONE 突入など）は、もともと4秒に収まらないので 6.5秒まで許す
LONG_MAX_SEC = 6.5


def max_sec(speech, mood):
    return LONG_MAX_SEC if len(speech) > LONG_CHARS else MAX_SEC[mood]
TRIM_DBFS = -45
PEAK_DBFS = -1

# ---- 読み間違えやすい数字・英字を読み仮名にする（ファイル名・アプリの文字は変えない） ----

DIGITS = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"]
HUNDREDS = {1: "ひゃく", 2: "にひゃく", 3: "さんびゃく", 4: "よんひゃく", 5: "ごひゃく"}


def number_kana(n):
    h, rest = divmod(n, 100)
    t, o = divmod(rest, 10)
    return (HUNDREDS[h] if h else "") + ((DIGITS[t] if t > 1 else "") + "じゅう" if t else "") + DIGITS[o]


def hon_kana(n):
    """〜本（50本→ごじゅっぽん、100本→ひゃっぽん、1本→いっぽん）"""
    kana = number_kana(n)
    for end, repl in (("じゅう", "じゅっぽん"), ("ひゃく", "ひゃっぽん"), ("びゃく", "びゃっぽん"), ("いち", "いっぽん")):
        if kana.endswith(end):
            return kana[: -len(end)] + repl
    return kana + "ほん"


def to_speech_text(reading):
    text = reading.replace("MAX", "マックス").replace("1ページ", "いちページ").replace("1コマ", "ひとコマ")
    text = re.sub(r"経験値(\d+)倍", lambda m: f"経験値{number_kana(int(m[1]))}ばい", text)
    text = re.sub(r"(\d+)本", lambda m: hon_kana(int(m[1])), text)
    text = re.sub(r"(\d+)メートル", lambda m: f"{number_kana(int(m[1]))}メートル", text)
    return text


# ---- 仕上げ（前後の無音を削る・音量をそろえる） ----

def finish(src, dest):
    """16bit モノラルの WAV を読み、前後の無音を削ってピークをそろえて保存する。長さ（秒）を返す"""
    with wave.open(str(src)) as w:
        rate, width, channels = w.getframerate(), w.getsampwidth(), w.getnchannels()
        samples = array.array("h", w.readframes(w.getnframes()))
    if width != 2 or channels != 1:
        raise ValueError(f"想定外の形式: {width * 8}bit {channels}ch")
    threshold = 32767 * 10 ** (TRIM_DBFS / 20)
    win = rate // 200  # 5ms ごとにピークを見る
    loud = [i for i in range(0, len(samples), win) if max(map(abs, samples[i : i + win])) > threshold]
    if not loud:
        return 0.0
    # 言葉の頭・お尻を切らないよう、少し余白を残す
    start = max(0, loud[0] - rate * 30 // 1000)
    end = min(len(samples), loud[-1] + win + rate * 80 // 1000)
    body = samples[start:end]
    peak = max(map(abs, body)) or 1
    gain = 32767 * 10 ** (PEAK_DBFS / 20) / peak
    out = array.array("h", (max(-32768, min(32767, round(x * gain))) for x in body))
    with wave.open(str(dest), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(out.tobytes())
    return len(out) / rate


def check(sec, speech, mood):
    """長さがおかしければ理由を返す（なければ None）"""
    if sec == 0:
        return "無音"
    if sec > max_sec(speech, mood):
        return f"長すぎる（{sec:.1f}秒）"
    if sec < max(0.4, len(speech) * 0.05):
        return f"短すぎる（{sec:.1f}秒、途中で切れているかも）"
    return None


def prepare_ref(voice_id):
    role, seed = VOICE_REFS[voice_id]
    REFS.mkdir(parents=True, exist_ok=True)
    ref = REFS / f"{voice_id}.wav"
    if not ref.exists():
        shutil.copy(WORK / "casting" / role / f"seed{seed}.wav", ref)
    return ref, (WORK / "casting" / f"{role}.txt").read_text(encoding="utf-8")


def main():
    manifest = json.loads((VOICE_PACK / "lines.json").read_text(encoding="utf-8"))
    voices = {v["id"]: v for v in manifest["voices"]}
    targets = sys.argv[1:] or list(voices)
    unknown = [t for t in targets if t not in voices or t not in VOICE_REFS]
    if unknown:
        sys.exit(f"知らない声の ID: {', '.join(unknown)}")
    OUTPUT.mkdir(exist_ok=True)

    failed = {}
    for n, voice_id in enumerate(targets, 1):
        role = voices[voice_id]["role"]
        ref, ref_text = prepare_ref(voice_id)
        pending = [line for line in manifest["lines"] if not (OUTPUT / line["files"][voice_id]).exists()]
        print(f"[{n}/{len(targets)}] {voices[voice_id]['label']}（{voice_id}）: {len(pending)} 件を作ります", flush=True)
        for attempt, seed in enumerate(SEEDS):
            if not pending:
                break
            requests = []
            for line in pending:
                speech = to_speech_text(line["readings"][role])
                max_tokens = 130 if max_sec(speech, line["mood"]) <= 4.0 else 200
                requests.append(make_request(f"{voice_id}_{line['id']}", speech, seed, ref, ref_text, max_tokens=max_tokens))
            result = run_batch(requests, "clon", WORK / "generate.log")
            retry = []
            for line in pending:
                dest = OUTPUT / line["files"][voice_id]
                speech = to_speech_text(line["readings"][role])
                raw = result.get(f"{voice_id}_{line['id']}")
                if not raw:
                    problem = "出力なし"
                else:
                    tmp = dest.with_suffix(".tmp.wav")
                    problem = check(finish(raw, tmp), speech, line["mood"])
                    if problem is None:
                        tmp.replace(dest)
                        normalize(dest)  # 聞こえる音量を -16 LUFS にそろえる
                    else:
                        tmp.unlink(missing_ok=True)
                if problem:
                    retry.append(line)
                    failed[dest.name] = f"{speech}: {problem}"
                else:
                    failed.pop(dest.name, None)
            done = len(pending) - len(retry)
            print(f"  seed {seed}: OK {done} / NG {len(retry)}", flush=True)
            pending = retry

    print()
    if failed:
        print(f"作れなかったもの {len(failed)} 件:")
        for name, why in failed.items():
            print(f"  {name}  {why}")
    else:
        print("全部作れました")
    (WORK / "failed.json").write_text(json.dumps(failed, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
