// 仮の効果音(WAV)を合成して public/sounds/ に書き出す。
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
  const peak = Math.max(...samples.map(Math.abs), 1e-6);
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

mkdirSync(outDir, { recursive: true });
for (const [name, samples] of Object.entries({
  se_click: click,
  se_fever_impact: feverImpact,
  se_fanfare: fanfare,
})) {
  writeFileSync(join(outDir, `${name}.wav`), toWav(samples));
  console.log(`wrote public/sounds/${name}.wav`);
}
