#!/usr/bin/env node
// 生成した図面 (モデル) を一つのファイルとして閲覧できるHTMLに埋め込む (MUN-143)。
//   npm run build
//   npm run embed -- path/to/model.muro [-o out.html]
// ビューワーのUI内 (書き出し→配布用HTML) でも同じことができる。これはCI/CLI向け。
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("-"));
const oIdx = args.indexOf("-o");
if (!input) {
  console.error("使い方: npm run embed -- <model.muro> [-o out.html]");
  process.exit(2);
}
const dist = join(root, "dist", "index.html");
let html;
try {
  html = readFileSync(dist, "utf8");
} catch {
  console.error("dist/index.html がありません。先に npm run build を実行してください。");
  process.exit(1);
}

const source = readFileSync(input, "utf8");
const name = basename(input);
const b64 = Buffer.from(source, "utf8").toString("base64");

const re = /(<script[^>]*id="muro-embed"[^>]*>)([\s\S]*?)(<\/script>)/;
if (!re.test(html)) {
  console.error("埋め込みポイント (id=muro-embed) が見つかりません。");
  process.exit(1);
}
const out = html.replace(
  re,
  (_m, open, _body, close) =>
    open.replace(/\s*data-name="[^"]*"/, "").replace(/>$/, ` data-name="${name}">`) + b64 + close,
);

const outFile = oIdx >= 0 && args[oIdx + 1] ? args[oIdx + 1] : input.replace(/\.muro$/, "") + ".ugatsu.html";
writeFileSync(outFile, out);
console.log(`書き出しました: ${outFile} (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
