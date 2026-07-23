import { createRoot } from "react-dom/client";
import { App } from "./components/App.js";
import { DEFAULT_EXAMPLE } from "./examples.js";
import { capturePristineHtml, decodeBase64 } from "./lib/download.js";
import { useViewer } from "./state/store.js";
import "./styles.css";

// 配布用HTMLの自己複製のため、Reactがマウントする前の素のHTMLを確保する
capturePristineHtml();

// 埋め込みモデル (MUN-143: 一つのファイルとして閲覧) があればそれを、なければ同梱の例を開く
const embedEl = document.getElementById("ifcxs-embed");
const embedded = embedEl?.textContent?.trim();
if (embedded) {
  try {
    useViewer
      .getState()
      .setSource(decodeBase64(embedded), embedEl?.getAttribute("data-name") ?? "embedded.ifcxs");
  } catch {
    useViewer.getState().setSource(DEFAULT_EXAMPLE.source, DEFAULT_EXAMPLE.fileName);
  }
} else {
  useViewer.getState().setSource(DEFAULT_EXAMPLE.source, DEFAULT_EXAMPLE.fileName);
}

createRoot(document.getElementById("root")!).render(<App />);
