#!/usr/bin/env node
// デザインシステム遵守の検査 — TS/TSX内の生のhex色 (# / 0x)・px直書き・DS外フォントを検出する。
// 例外: src/lib/theme.ts (フォールバック) と src/lib/colors.ts (カテゴリカル配色)、
//       行末に `ds:allow` コメントを書いた行 (理由を添えること)。
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXEMPT = new Set(["src/lib/theme.ts", "src/lib/colors.ts"]);
const DS_FONT_MARKS = ["Libre Baskerville", "Roboto", "Roboto Mono", "Noto Sans JP", "--font-"];

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
})(join(ROOT, "src"));

const findings = [];
for (const f of files) {
  const rel = relative(ROOT, f).replaceAll("\\", "/");
  if (EXEMPT.has(rel)) continue;
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("ds:allow")) return;
      const code = line.replace(/\/\/.*$/, "");
      const flag = (msg) => findings.push(`${rel}:${i + 1}  ${msg}\n    ${line.trim()}`);
      if (/["'`]#[0-9a-fA-F]{3,8}\b|\b0x[0-9a-fA-F]{6}\b/.test(code))
        flag("生の色 — src/lib/theme.ts の token()/tokenColor() を使う");
      if (/["'`][^"'`]*\b\d+(\.\d+)?px\b/.test(code))
        flag("生のpx — spacing/typographyトークン (var(--...)) を使う");
      if (/font-?family/i.test(code) && !DS_FONT_MARKS.some((m) => code.includes(m)))
        flag("DS外のフォント指定の疑い");
    });
}

if (findings.length > 0) {
  console.error(`ds:check — ${findings.length}件の逸脱\n`);
  for (const m of findings) console.error(`${m}\n`);
  process.exit(1);
}
console.log(`ds:check ✓ 逸脱なし (${files.length}ファイル)`);
