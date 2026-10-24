// 自作の音声で作ってもらうセリフの一覧（voice-pack/lines.json）を書き出す
// セリフ（src/lib/voiceLines.ts など）を変えたら、npm run voice:lines で作り直す
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { buildVoicePackManifest } = await jiti.import(path.join(root, "src/lib/voicePackManifest.ts"));

const manifest = buildVoicePackManifest();
const ids = manifest.lines.map((line) => line.id);
if (new Set(ids).size !== ids.length) throw new Error("ID が重複しています（セリフのハッシュが衝突しました）");

const out = path.join(root, "voice-pack", "lines.json");
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✅ ${out} に ${manifest.lines.length} セリフ（男女で ${manifest.lines.length * 2} ファイル）を書き出しました`);
