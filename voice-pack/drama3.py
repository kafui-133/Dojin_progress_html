"""drama3-small（audio.cpp の audiocpp_cli.exe）を呼び出す共通処理"""
import json
import os
import subprocess
import time
from pathlib import Path

TTS_ROOT = Path(r"C:\Users\kafui\source\drama3-tts")
CLI = TTS_ROOT / r"audio.cpp\build\windows-cuda-release\bin\audiocpp_cli.exe"
MODEL = TTS_ROOT / r"models\drama3-small-IQ3_XXS.gguf"
SILENCE = TTS_ROOT / r"models\silence_codes.json"

VOICE_PACK = Path(__file__).resolve().parent
WORK = VOICE_PACK / "work"

DEFAULT_OPTIONS = {
    "temperature": "0.7",
    "top_p": "0.7",
    "top_k": "30",
    "max_tokens": "130",  # 約6秒（21.5フレーム/秒）。カットインは4秒以内が目安
    "max_pause_frames": "10",
}


def make_request(req_id, text, seed, voice_ref=None, reference_text=None, **options):
    opts = dict(DEFAULT_OPTIONS)
    opts["silence_codes"] = str(SILENCE)
    opts["seed"] = str(seed)
    opts.update({k: str(v) for k, v in options.items()})
    req = {"id": req_id, "text": text, "options": opts}
    if voice_ref:
        req["voice_ref"] = str(voice_ref)
        if reference_text:
            opts["reference_text"] = reference_text
    return req


def run_batch(requests, task, log_path=None):
    """requests をまとめて生成し、{req_id: 出力WAVのPath} を返す（モデル読み込みは1回）"""
    job_dir = WORK / "jobs" / f"{task}_{time.strftime('%Y%m%d_%H%M%S')}"
    out_dir = job_dir / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    req_file = job_dir / "requests.json"
    req_file.write_text(json.dumps({"requests": requests}, ensure_ascii=False, indent=1), encoding="utf-8")

    env = dict(os.environ)
    env["AUDIOCPP_DRAMA3_MAX_PAUSE_FRAMES"] = "10"
    env["AUDIOCPP_DRAMA3_SILENCE_CODES"] = str(SILENCE)
    cmd = [
        str(CLI), "--task", task, "--family", "fish_drama3", "--backend", "cuda", "--mode", "offline",
        "--model", str(MODEL), "--request-sequence", str(req_file), "--out-dir", str(out_dir),
        "--session-option", "fish_drama3.cpu_expert_layers=0",
        "--session-option", "fish_drama3.context_length=4096",
    ]
    log_path = Path(log_path or job_dir / "cli.log")
    with open(log_path, "a", encoding="utf-8", errors="replace") as log:
        proc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, env=env)
    if proc.returncode != 0:
        print(f"audiocpp_cli exit={proc.returncode}（ログ: {log_path}）")

    wavs = {w.stem: w for w in out_dir.glob("*.wav")}
    return {req["id"]: wavs[req["id"]] for req in requests if req["id"] in wavs}
