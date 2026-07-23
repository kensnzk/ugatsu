import { useRef, useState } from "react";
import { svgPlan, toCanonical } from "../core/index.js";
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
  const fileName = useViewer((s) => s.fileName);
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
  const toggleEditor = useViewer((s) => s.toggleEditor);

  const fileInput = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const base = fileName.replace(/\.ifcxs$/, "");

  async function openFile(f: File) {
    setSource(await f.text(), f.name);
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <strong>IFCXS Viewer</strong>
        <span className={`status-dot ${parseError ? "bad" : "good"}`} title={parseError ? "パースエラー" : "整合"} />
        <span className="file-name">{fileName}</span>
      </div>

      <select
        className="example-select"
        value=""
        onChange={(e) => {
          const ex = EXAMPLES.find((x) => x.key === e.target.value);
          if (ex) setSource(ex.source, ex.fileName);
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
        accept=".ifcxs,.txt"
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
            <button onClick={() => downloadText(fileName, source)}>ソース (.ifcxs)</button>
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
                  if (!exportEmbeddedHtml(source, fileName)) {
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
