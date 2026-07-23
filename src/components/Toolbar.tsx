import { useRef, useState } from "react";
import { svgPlan, toCanonical } from "@kensnzk/koyu";
import { EXAMPLES } from "../examples.js";
import { downloadText, exportEmbeddedHtml } from "../lib/download.js";
import type { ColorMode } from "../lib/colors.js";
import { useViewer, type MainView } from "../state/store.js";

const VIEWS: Array<[MainView, string]> = [
  ["plan", "平面"],
  ["3d", "3D"],
  ["table", "面積表"],
];

export function Toolbar() {
  const files = useViewer((s) => s.files);
  const entry = useViewer((s) => s.entry);
  const activeFile = useViewer((s) => s.activeFile);
  const model = useViewer((s) => s.model);
  const source = useViewer((s) => s.source);
  const parseError = useViewer((s) => s.parseError);
  const mainView = useViewer((s) => s.mainView);
  const colorMode = useViewer((s) => s.colorMode);
  const planLevel = useViewer((s) => s.planLevel);
  const showEditor = useViewer((s) => s.showEditor);
  const setMainView = useViewer((s) => s.setMainView);
  const setColorMode = useViewer((s) => s.setColorMode);
  const setSource = useViewer((s) => s.setSource);
  const setFiles = useViewer((s) => s.setFiles);
  const toggleEditor = useViewer((s) => s.toggleEditor);

  const fileInput = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const layerCount = Object.keys(files).length;
  const base = entry.replace(/\.muro$/, "");

  async function openFile(f: File) {
    setSource(await f.text(), f.name);
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <strong>ugatsu</strong>
        <span className={`status-dot ${parseError ? "bad" : "good"}`} title={parseError ? "パースエラー" : "整合"} />
        <span className="file-name">
          {entry}
          {layerCount > 1 && <span className="layer-count"> +{layerCount - 1}層</span>}
        </span>
      </div>

      <select
        className="example-select"
        value=""
        onChange={(e) => {
          const ex = EXAMPLES.find((x) => x.key === e.target.value);
          if (ex) setFiles(ex.files, ex.entry);
        }}
      >
        <option value="">例を開く…</option>
        {EXAMPLES.map((ex) => (
          <option key={ex.key} value={ex.key}>
            {ex.label}
          </option>
        ))}
      </select>
      <button className="mini" onClick={() => fileInput.current?.click()}>
        開く
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".muro,.txt"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openFile(f);
          e.target.value = "";
        }}
      />

      <div className="export-menu">
        <button className="mini" onClick={() => setMenuOpen((v) => !v)}>
          書き出し ▾
        </button>
        {menuOpen && (
          <div className="menu panel" onClick={() => setMenuOpen(false)}>
            <button onClick={() => downloadText(activeFile, source)}>
              ソース ({layerCount > 1 ? activeFile : ".muro"})
            </button>
            <button onClick={() => model && downloadText(`${base}.canonical.json`, toCanonical(model), "application/json")} disabled={!model}>
              正準JSON
            </button>
            <button
              onClick={() => {
                if (!model || !planLevel) return;
                downloadText(`${base}-${planLevel}.svg`, svgPlan(model, { level: planLevel }), "image/svg+xml");
              }}
              disabled={!model || !planLevel}
            >
              平面SVG ({planLevel ?? "–"})
            </button>
            {import.meta.env.PROD && (
              <button
                onClick={() => {
                  if (!exportEmbeddedHtml(files, entry)) {
                    alert("配布用HTMLの生成に失敗しました");
                  }
                }}
                title="このモデルを埋め込んだ単一HTMLビューワーを書き出す"
              >
                配布用HTML (モデル埋め込み)
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="view-tabs">
        {VIEWS.map(([v, label]) => (
          <button key={v} className={`tab ${mainView === v ? "tab-on" : ""}`} onClick={() => setMainView(v)}>
            {label}
          </button>
        ))}
      </nav>

      <label className="color-mode">
        色
        <select value={colorMode} onChange={(e) => setColorMode(e.target.value as ColorMode)}>
          <option value="use">用途</option>
          <option value="type">型</option>
          <option value="level">レベル</option>
        </select>
      </label>

      <button className={`mini ${showEditor ? "" : "mini-off"}`} onClick={toggleEditor}>
        {showEditor ? "◀ エディタ" : "▶ エディタ"}
      </button>
    </header>
  );
}
