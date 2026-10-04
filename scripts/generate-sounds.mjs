// 仮の効果音・BGM(WAV)を合成して public/sounds/ に書き出す。
// 本番の音源に差し替えるまでのプレースホルダー。実行: node scripts/generate-sounds.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22050;
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds");

function render(seconds, fn) {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < samples.length; i++) samples[i] = fn(i / SAMPLE_RATE);
  return samples;
}

function mix(...tracks) {
  const out = new Float32Array(Math.max(...tracks.map((t) => t.length)));
  for (const t of tracks) for (let i = 0; i < t.length; i++) out[i] += t[i];
  return out;
}

function offset(track, seconds) {
  const pad = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(track.length + pad);
  out.set(track, pad);
  return out;
}

/** 周波数が時間で変化する波形（位相を積分してクリックノイズを防ぐ） */
function sweep(seconds, freqAt, wave, envAt) {
  let phase = 0;
  return render(seconds, (t) => {
    phase += (2 * Math.PI * freqAt(t)) / SAMPLE_RATE;
    return wave(phase) * envAt(t);
  });
}

const sine = (p) => Math.sin(p);
const square = (p) => (Math.sin(p) >= 0 ? 1 : -1);
const triangle = (p) => (2 / Math.PI) * Math.asin(Math.sin(p));

function toWav(samples) {
  let peak = 1e-6;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = 0.89 / peak;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(s * gain * 32767), 44 + i * 2));
  return buf;
}

// 通常タップ: 短い高音のブリップ
const click = sweep(0.07, (t) => 1800 - t * 8000, triangle, (t) => Math.exp(-t * 60));

// 完了演出: 重低音ドーン + キュイーン（上昇スイープ）
const boom = sweep(0.7, (t) => 40 + 110 * Math.exp(-t * 10), sine, (t) => Math.exp(-t * 5));
const kyuin = sweep(
  0.45,
  (t) => 500 * Math.pow(6, t / 0.45),
  square,
  (t) => 0.35 * Math.min(1, t * 30) * Math.exp(-Math.max(0, t - 0.3) * 20),
);
const feverImpact = mix(boom, offset(kyuin, 0.05));

// 目標達成: ド・ミ・ソ・ド〜 のファンファーレ
const note = (freq, seconds) =>
  sweep(seconds, () => freq, (p) => 0.6 * square(p) + 0.4 * triangle(p), (t) =>
    0.5 * Math.min(1, t * 200) * Math.exp(-t * (seconds > 0.5 ? 2 : 6)),
  );
const fanfare = mix(
  note(523.25, 0.14),
  offset(note(659.25, 0.14), 0.14),
  offset(note(783.99, 0.14), 0.28),
  offset(note(1046.5, 0.9), 0.42),
  offset(note(783.99 / 2, 0.9), 0.42),
);

// 線を1本引いたとき: 柔らかいプラック音（C4）。再生時に音程を変えて音階にする
const strokePluck = mix(
  sweep(0.35, () => 261.63, (p) => 0.7 * triangle(p) + 0.3 * sine(2 * p), (t) => Math.min(1, t * 400) * Math.exp(-t * 11)),
  sweep(0.12, () => 523.25 * 2, sine, (t) => 0.15 * Math.exp(-t * 40)),
);

// ---- BGM（ループ素材） ----

const saw = (p) => ((p / (2 * Math.PI)) % 1) * 2 - 1;

// 再現性のある疑似乱数（ハイハット用ノイズ）
let seed = 1;
const noise = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return (seed / 2147483648) * 2 - 1;
};

/** 指定秒の位置に音を足し込む（ループ素材なので末尾をはみ出た分は先頭に回す） */
function place(buf, startSec, samples) {
  const start = Math.round(startSec * SAMPLE_RATE);
  for (let i = 0; i < samples.length; i++) buf[(start + i) % buf.length] += samples[i];
}

const tone = (freq, seconds, wave, vol, decay) =>
  sweep(seconds, () => freq, wave, (t) => vol * Math.min(1, t * 300) * Math.exp(-t * decay));
const kick = (vol) =>
  sweep(0.18, (t) => 45 + 130 * Math.exp(-t * 30), sine, (t) => vol * Math.exp(-t * 18));
const hat = (vol, decay) => {
  let prev = 0;
  return render(0.05, (t) => {
    const n = noise();
    const hp = n - prev; // 簡易ハイパス
    prev = n;
    return vol * hp * Math.exp(-t * decay);
  });
};

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
// Am - F - C - G
const CHORDS = [
  { root: 45, tones: [69, 72, 76] },
  { root: 41, tones: [65, 69, 72] },
  { root: 48, tones: [72, 76, 79] },
  { root: 43, tones: [67, 71, 74] },
];

function bgm({ bpm, bars, bassStep, arpStep, arpOctaves, hatStep, lead }) {
  const beat = 60 / bpm;
  const barSec = beat * 4;
  const buf = new Float32Array(Math.round(barSec * bars * SAMPLE_RATE));

  for (let bar = 0; bar < bars; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    const t0 = bar * barSec;

    for (let b = 0; b < 4; b++) place(buf, t0 + b * beat, kick(0.9));
    for (let t = 0; t < barSec - 1e-6; t += hatStep * beat) {
      place(buf, t0 + t + (hatStep >= 0.5 ? beat * 0.5 : 0), hat(0.25, 60));
    }
    let i = 0;
    for (let t = 0; t < barSec - 1e-6; t += bassStep * beat, i++) {
      const midi = chord.root + (i % 2 === 1 ? 12 : 0);
      place(buf, t0 + t, tone(hz(midi), bassStep * beat * 0.9, saw, 0.3, 4));
    }
    const arp = [];
    for (let o = 0; o < arpOctaves; o++) arp.push(...chord.tones.map((n) => n + o * 12));
    i = 0;
    for (let t = 0; t < barSec - 1e-6; t += arpStep * beat, i++) {
      place(buf, t0 + t, tone(hz(arp[i % arp.length]), arpStep * beat * 0.8, square, 0.09, 10));
    }
    if (lead) {
      // 小節頭に伸びるリード（フィーバー用の高揚感）
      const top = chord.tones[2] + 12;
      place(buf, t0, tone(hz(top), beat * 1.5, (p) => 0.5 * saw(p) + 0.5 * triangle(p), 0.16, 1.5));
      place(buf, t0 + beat * 2, tone(hz(top + 2), beat * 1.5, (p) => 0.5 * saw(p) + 0.5 * triangle(p), 0.14, 1.5));
    }
  }
  return buf;
}

// 130bpm 作業用（シンセウェーブ風）
const bgmNormal = bgm({ bpm: 130, bars: 8, bassStep: 0.5, arpStep: 0.25, arpOctaves: 1, hatStep: 1, lead: false });
// 180bpm フィーバー（ハイパーポップ風・細かいアルペジオ）
const bgmFever = bgm({ bpm: 180, bars: 8, bassStep: 0.25, arpStep: 0.125, arpOctaves: 2, hatStep: 0.25, lead: true });

mkdirSync(outDir, { recursive: true });
for (const [name, samples] of Object.entries({
  se_click: click,
  se_fever_impact: feverImpact,
  se_fanfare: fanfare,
  se_stroke: strokePluck,
  bgm_normal: bgmNormal,
  bgm_fever: bgmFever,
})) {
  writeFileSync(join(outDir, `${name}.wav`), toWav(samples));
  console.log(`wrote public/sounds/${name}.wav`);
}
