import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// ビルドは常に単一HTML (MUN-143: 一つのファイルとして閲覧できるビューワー)。
// dist/index.html がそのまま配布物になり、scripts/embed-model.mjs でモデルを埋め込める。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { chunkSizeWarningLimit: 4096 },
});
