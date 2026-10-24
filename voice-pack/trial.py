"""お試し: 声さがしの見本を参照音声にして、3セリフを作る → work/trial/<role>_seed<N>/<line>.wav

使い方: python trial.py female:1 female:2 male:1 ...   （すでにあるものは飛ばす）
"""
import shutil
import sys

from drama3 import WORK, make_request, run_batch

LINES = {
    "kamisakuga": "神作画！",
    "kyuukei": "休憩の時間です。少し休みましょう。",
    "100m": "ひゃくメートル描いた！",
}

requests, dest = [], {}
for spec in sys.argv[1:]:
    role, seed = spec.split(":")
    ref = WORK / "casting" / role / f"seed{seed}.wav"
    ref_text = (WORK / "casting" / f"{role}.txt").read_text(encoding="utf-8")
    out = WORK / "trial" / f"{role}_seed{seed}"
    out.mkdir(parents=True, exist_ok=True)
    for key, text in LINES.items():
        path = out / f"{key}.wav"
        if path.exists():
            continue
        req_id = f"{role}_seed{seed}_{key}"
        requests.append(make_request(req_id, text, 1, voice_ref=ref, reference_text=ref_text))
        dest[req_id] = path

print(f"生成開始: {len(requests)} 件")
result = run_batch(requests, "clon") if requests else {}
for req_id, path in dest.items():
    if req_id in result:
        shutil.copy(result[req_id], path)
        print("OK:", path)
    else:
        print("NG:", req_id)
