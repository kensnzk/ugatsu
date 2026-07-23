#!/usr/bin/env node
// インストール済みの @kensnzk/koyu から同梱例 (.muro) を更新する。
//   npm run sync-examples
// examples/ は手で編集しない — 例の原本は koyu 側にある。
// 新しい例が増えたら src/examples.ts への登録も忘れずに。
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const require = createRequire(import.meta.url);
const pkgJson = require.resolve("@kensnzk/koyu/package.json");
const src = join(dirname(pkgJson), "examples");

mkdirSync(join(root, "examples"), { recursive: true });
for (const e of readdirSync(src, { withFileTypes: true })) {
  if (e.isDirectory()) {
    // 合成の例 (examples/house/ など) はディレクトリごと追随する
    mkdirSync(join(root, "examples", e.name), { recursive: true });
    for (const f of readdirSync(join(src, e.name))) {
      if (!f.endsWith(".muro")) continue;
      copyFileSync(join(src, e.name, f), join(root, "examples", e.name, f));
      console.log(`example ← ${e.name}/${f}`);
    }
    continue;
  }
  if (!e.name.endsWith(".muro")) continue;
  copyFileSync(join(src, e.name), join(root, "examples", e.name));
  console.log(`example ← ${e.name}`);
}
console.log("done.");
