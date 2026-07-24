// CSSはコードより先に評価する — モジュール初期化でDSトークンを読む (src/lib/theme.ts) ため
import "@kensnzk/koyu-design-system/styles.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./components/App.js";
import { DEFAULT_EXAMPLE } from "./examples.js";
import { capturePristineHtml, decodeBase64 } from "./lib/download.js";
import { useViewer } from "./state/store.js";

// 配布用HTMLの自己複製のため、Reactがマウントする前の素のHTMLを確保する
capturePristineHtml();

// 埋め込みモデル (MUN-143: 一つのファイルとして閲覧) があればそれを、なければ同梱の例を開く。
// data-format="files" はレイヤー群 (合成 — koyu ADR-0010) のJSON埋め込み。
const embedEl = document.getElementById("muro-embed");
const embedded = embedEl?.textContent?.trim();
const openDefault = () => useViewer.getState().setFiles(DEFAULT_EXAMPLE.files, DEFAULT_EXAMPLE.entry);
if (embedded) {
  try {
    const text = decodeBase64(embedded);
    if (embedEl?.getAttribute("data-format") === "files") {
      const { entry, files } = JSON.parse(text) as { entry: string; files: Record<string, string> };
      useViewer.getState().setFiles(files, entry);
    } else {
      useViewer.getState().setSource(text, embedEl?.getAttribute("data-name") ?? "embedded.muro");
    }
  } catch {
    openDefault();
  }
} else {
  openDefault();
}

createRoot(document.getElementById("root")!).render(<App />);
