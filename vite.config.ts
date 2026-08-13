import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { configDefaults } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";
import { NEWEST_LANGUAGE_VERSION } from "@kensnzk/koyu";

const require = createRequire(import.meta.url);
const UGATSU_VERSION: string = require("./package.json").version;
// **実際に解決された koyu** の版を読む。package.json の範囲指定 (`^0.21.0`) ではなく、
// このビルドに焼き込まれた実体でなければ、埋め込んだ版が嘘になる (ADR-0005 のリンク時も同じ)
const KOYU_VERSION: string = require("@kensnzk/koyu/package.json").version;

/**
 * 配布HTMLに版を刻む (ADR-0006)。**どの版の形を見ているかを言えない配布物は凍結できない。**
 * meta は React のマウント前から在るので、`exportEmbeddedHtml` が写す素のHTMLにも残る。
 */
function stampVersions(): Plugin {
  return {
    name: "ugatsu-version-meta",
    transformIndexHtml() {
      return [
        { tag: "meta", attrs: { name: "ugatsu:version", content: UGATSU_VERSION }, injectTo: "head" },
        { tag: "meta", attrs: { name: "koyu:version", content: KOYU_VERSION }, injectTo: "head" },
        // **読める最新の版**を刻む。かつてここは `DEFAULT_LANGUAGE_VERSION` (版行の無い
        // 原本の読み方) だった。それは 1.1 に凍っているので、koyu が 1.3 まで読むようになっても
        // 配布HTMLは「muro 1.1」と名乗り続けていた
        { tag: "meta", attrs: { name: "muro:version", content: NEWEST_LANGUAGE_VERSION }, injectTo: "head" },
      ];
    },
  };
}

// ビルドは常に単一HTML (MUN-143: 一つのファイルとして閲覧できるビューワー)。
// dist/index.html がそのまま配布物になり、scripts/embed-model.mjs でモデルを埋め込める。
export default defineConfig({
  plugins: [react(), stampVersions(), viteSingleFile()],
  define: {
    __UGATSU_VERSION__: JSON.stringify(UGATSU_VERSION),
    __KOYU_VERSION__: JSON.stringify(KOYU_VERSION),
  },
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
