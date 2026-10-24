"""声さがし: 参照音声なしで seed 違いの見本を作る → work/casting/<role>/seed<N>.wav

使い方: python casting.py [役 ...] [--seeds 1-8]   （すでにある見本は飛ばす）
"""
import argparse
import shutil

from drama3 import WORK, make_request, run_batch

TEXTS = {
    "female": "やったー！すっごーい、今の線、最高だよ！この調子で、どんどん描いちゃおう！……でも、無理はしないでね。ちょっと休憩しよっか。",
    "male": "見事だ。いい線を引くようになったな。迷うな、そのまま描き切れ！……少し休め。手を止めるのも、仕事のうちだ。",
    "onee": "ふふっ、いい感じじゃない。その線、すごく素敵よ。この調子で、最後まで描いてみましょう。……疲れたら、少し休んでもいいのよ。",
    "girl": "わあっ、すごいすごい！今の絵、めっちゃ上手！もっと描いて描いて！……つかれたら、ちょっとだけおやすみしようね。",
    "boy": "うおーっ、すげー！今のめっちゃかっこいい！もっと描こうぜ！……つかれたら、ちょっとだけ休もうな。",
}

parser = argparse.ArgumentParser()
parser.add_argument("roles", nargs="*", default=list(TEXTS))
parser.add_argument("--seeds", default="1-8")
args = parser.parse_args()
lo, _, hi = args.seeds.partition("-")
seeds = range(int(lo), int(hi or lo) + 1)

requests, dest = [], {}
for role in args.roles:
    text = TEXTS[role]
    (WORK / "casting" / role).mkdir(parents=True, exist_ok=True)
    (WORK / "casting" / f"{role}.txt").write_text(text, encoding="utf-8")
    for seed in seeds:
        path = WORK / "casting" / role / f"seed{seed}.wav"
        if path.exists():
            continue
        req_id = f"{role}_seed{seed}"
        requests.append(make_request(req_id, text, seed, max_tokens=645))
        dest[req_id] = path

print(f"生成開始: {len(requests)} 件")
result = run_batch(requests, "tts") if requests else {}
for req_id, path in dest.items():
    if req_id in result:
        shutil.copy(result[req_id], path)
        print("OK:", path)
    else:
        print("NG:", req_id)
