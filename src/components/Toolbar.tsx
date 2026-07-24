import { useRef, useState } from "react";
import { svgPlan, toCanonical } from "@kensnzk/koyu";
import { EXAMPLES } from "../examples.js";
import { downloadText, exportEmbeddedHtml } from "../lib/download.js";
import { useViewer } from "../state/store.js";
import { Dropdown } from "./Dropdown.js";
import { RoundIcon } from "./ui.js";

export function Toolbar() {
  const files = useViewer((s) => s.files);
  const entry = useViewer((s) => s.entry);
  const activeFile = useViewer((s) => s.activeFile);
  const model = useViewer((s) => s.model);
  const source = useViewer((s) => s.source);
  const parseError = useViewer((s) => s.parseError);
  const planLevel = useViewer((s) => s.planLevel);
  const theme = useViewer((s) => s.theme);
  const setSource = useViewer((s) => s.setSource);
  const setFiles = useViewer((s) => s.setFiles);
  const toggleTheme = useViewer((s) => s.toggleTheme);

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
      </div>
      {/* 開いているファイル — ピルで浮かべる */}
      <span className="file-pill" title={parseError ? "パースエラー" : "整合"}>
        <span className={`status-dot ${parseError ? "bad" : "good"}`} />
        {entry}
        {layerCount > 1 && <span className="layer-count"> +{layerCount - 1}層</span>}
      </span>

      <Dropdown icon="archive" label="例を開く" closeOnSelect>
        {EXAMPLES.map((ex) => (
          <button key={ex.key} className="dd-item" onClick={() => setFiles(ex.files, ex.entry)}>
            {ex.label}
          </button>
        ))}
      </Dropdown>
      <RoundIcon icon="upload" label="ファイルを開く" onClick={() => fileInput.current?.click()} />
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
        <RoundIcon icon="download" label="書き出し" selected={menuOpen} onClick={() => setMenuOpen((v) => !v)} />
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

      <div className="toolbar-right">
        <RoundIcon
          icon={theme === "dark" ? "sun" : "moon"}
          label={theme === "dark" ? "ライトテーマへ" : "ダークテーマへ"}
          onClick={toggleTheme}
        />
      </div>
    </header>
  );
}
