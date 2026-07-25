#!/usr/bin/env node
// デザインシステム遵守の検査 — CSS/TS/TSX内の生の色・装飾寸法・DS外フォントを検出する。
// 例外は行内に `ds:allow` コメントを書き、理由を添えること。
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DS_FONT_MARKS = ["--font-"];

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(css|ts|tsx)$/.test(e.name)) files.push(p);
  }
})(join(ROOT, "src"));

const findings = [];
for (const f of files) {
  const rel = relative(ROOT, f).replaceAll("\\", "/");
  const source = readFileSync(f, "utf8");
  const isCss = rel.endsWith(".css");
  // CSSの複数行コメントを空白化し、行番号を保ったまま検査する。
  const codeSource = isCss
    ? source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    : source;
  const originalLines = source.split("\n");
  codeSource.split("\n").forEach((codeLine, i) => {
      const line = originalLines[i] ?? "";
      if (line.includes("ds:allow") || originalLines[i - 1]?.includes("ds:allow-next-line")) return;
      const code = isCss ? codeLine : codeLine.replace(/\/\/.*$/, "");
      const flag = (msg) => findings.push(`${rel}:${i + 1}  ${msg}\n    ${line.trim()}`);
      if (isCss) {
        if (/#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\(/.test(code))
          flag("生の色 — DSの色トークンを使う");
        if (/font-family\s*:/i.test(code) && !DS_FONT_MARKS.some((m) => code.includes(m)))
          flag("生の書体 — var(--font-*) を使う");
        if (
          /(?:font-size|line-height|letter-spacing|font-weight)\s*:[^;]*(?:\b\d+(?:\.\d+)?(?:px|rem|em)\b|:\s*\d+(?:\.\d+)?\s*;?)/i.test(
            code,
          )
        )
          flag("生のタイポグラフィ値 — typographyトークンを使う");
        if (
          /^\s*(?:padding|margin(?:-(?:top|right|bottom|left))?|gap|row-gap|column-gap|top|right|bottom|left|inset|text-underline-offset)\s*:[^;]*\b\d+(?:\.\d+)?(?:px|rem|em|ch)\b/i.test(
            code,
          )
        )
          flag("生の余白 — spacingトークンを使う");
        if (/border-radius\s*:[^;]*\b\d+(?:\.\d+)?(?:px|rem|em)\b/i.test(code))
          flag("生の角丸 — radiusトークンを使う");
        if (
          /(?:box|text)-shadow\s*:/i.test(code) &&
          /#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\(|\b\d+(?:\.\d+)?(?:px|rem|em)\b/.test(code)
        )
          flag("生の影 — shadow/ringトークンを使う");
        if (
          /(?:transition|animation)(?:-[a-z-]+)?\s*:[^;]*\b\d+(?:\.\d+)?m?s\b/i.test(code)
        )
          flag("生の時間 — motionトークンを使う");
        if (
          /^\s*(?:(?:min|max)-)?(?:width|height)\s*:[^;]*\b\d+(?:\.\d+)?(?:px|rem|em|ch)\b|^\s*--[a-z0-9-]+\s*:\s*\d+(?:\.\d+)?(?:px|rem|em|ch)\b/i.test(
            code,
          )
        )
          flag("生の固定寸法 — DSで表せない構造寸法なら ds:allow で理由を残す");
      } else {
        if (/["'`]#[0-9a-fA-F]{3,8}\b|\b0x[0-9a-fA-F]{6}\b/.test(code))
          flag("生の色 — src/lib/theme.ts の token()/tokenColor() を使う");
        if (/["'`][^"'`]*\b\d+(\.\d+)?px\b/.test(code))
          flag("生のpx — spacing/typographyトークン (var(--...)) を使う");
        if (/font-?family/i.test(code) && !DS_FONT_MARKS.some((m) => code.includes(m)))
          flag("生の書体 — var(--font-*) を使う");
        if (rel.endsWith(".tsx") && /<(?:button|select|input|textarea)\b/.test(code))
          flag("生のフォーム要素 — src/lib/ds.ts のDSコンポーネントを使う");
      }
    });
}

if (findings.length > 0) {
  console.error(`ds:check — ${findings.length}件の逸脱\n`);
  for (const m of findings) console.error(`${m}\n`);
  process.exit(1);
}
console.log(`ds:check ✓ 逸脱なし (${files.length}ファイル)`);
