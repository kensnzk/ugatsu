#!/usr/bin/env node
// IFCXS本体 (兄弟ディレクトリ ../IFCXS) から vendor コピーを更新する。
//   npm run sync-core            # ../IFCXS から
//   npm run sync-core -- <path>  # 任意のパスから
// core は手で編集しない — 乖離したら必ず本体を直してからこれを回す。
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = resolve(root, process.argv[2] ?? "../IFCXS");

if (!existsSync(join(src, "src", "model.ts"))) {
  console.error(`IFCXS本体が見つかりません: ${src} (src/model.ts が無い)`);
  process.exit(1);
}

// cli.ts は node 依存のため対象外。index.ts はビューワー側の入口を持つため対象外。
const CORE_FILES = ["model.ts", "parse.ts", "graph.ts", "check.ts", "light.ts", "plan.ts"];
for (const f of CORE_FILES) {
  copyFileSync(join(src, "src", f), join(root, "src", "core", f));
  console.log(`core  ← ${f}`);
}

for (const f of readdirSync(join(src, "examples"))) {
  if (!f.endsWith(".ifcxs")) continue;
  copyFileSync(join(src, "examples", f), join(root, "examples", f));
  console.log(`example ← ${f}`);
}
console.log("done. 新しい例を足した場合は src/examples.ts への登録も忘れずに。");
