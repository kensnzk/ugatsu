import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// ビルドは常に単一HTML (MUN-143: 一つのファイルとして閲覧できるビューワー)。
// dist/index.html がそのまま配布物になり、scripts/embed-model.mjs でモデルを埋め込める。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { chunkSizeWarningLimit: 4096 },
  // koyu をローカルのツリーへリンクしているとき (npm run koyu:local — ADR-0005) の二つの罠を塞ぐ。
  // どちらも「リンク先の変更が画面に伝わらない」という同じ症状になり、
  // 古い導出の絵を見ながら直したつもりになる、という最も高くつく間違いを生む。
  //   1. Vite は node_modules を監視しない → 再ビルドしてもブラウザが前のモジュールを持ち続ける
  //   2. 事前バンドル (optimizeDeps) に取り込まれると、その版がキャッシュに固定される
  optimizeDeps: { exclude: ["@kensnzk/koyu"] },
  server: { watch: { ignored: ["!**/node_modules/@kensnzk/koyu/**"] } },
  // **.koyu/ は穿つのテストではない。**koyu を特定のコミットで見るために取り出した
  // git worktree (ADR-0005) で、koyu 側のテストは node --test で走る。vitest が拾うと
  // 「テストスイートが無い」と言って21ファイルが落ち、**本当の失敗が埋もれる**。
  test: { exclude: [...configDefaults.exclude, ".koyu/**"] },
});
