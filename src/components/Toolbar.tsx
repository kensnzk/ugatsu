import { useRef, useState } from "react";
import { svgPlan, toCanonical } from "@kensnzk/koyu";
import { EXAMPLES } from "../examples.js";
import { Select, Tabs } from "../lib/ds.js";
import { downloadText, exportEmbeddedHtml } from "../lib/download.js";
import type { ColorMode } from "../lib/colors.js";
import { useViewer, type MainView } from "../state/store.js";
import { RoundIcon } from "./ui.js";

const VIEW_ITEMS: Array<{ value: MainView; label: string }> = [
  { value: "plan", label: "平面" },
  { value: "3d", label: "3D" },
  { value: "table", label: "面積表" },
];

const COLOR_ITEMS = [
  { value: "use", label: "用途" },
  { value: "type", label: "型" },
  { value: "level", label: "レベル" },
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
  const theme = useViewer((s) => s.theme);
  const setMainView = useViewer((s) => s.setMainView);
  const setColorMode = useViewer((s) => s.setColorMode);
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

      <Select
        size="sm"
        value=""
        onChange={(e: { target: { value: string } }) => {
          const ex = EXAMPLES.find((x) => x.key === e.target.value);
          if (ex) setFiles(ex.files, ex.entry);
        }}
        options={[
          { value: "", label: "例を開く…" },
          ...EXAMPLES.map((ex) => ({ value: ex.key, label: ex.label })),
        ]}
      />
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

      <nav className="view-tabs">
        <Tabs
          variant="segmented"
          items={VIEW_ITEMS}
          value={mainView}
          onChange={(v: string) => setMainView(v as MainView)}
        />
      </nav>

      <label className="color-mode">
        色
        <Select
          size="sm"
          value={colorMode}
          onChange={(e: { target: { value: string } }) => setColorMode(e.target.value as ColorMode)}
          options={COLOR_ITEMS}
        />
      </label>

      <RoundIcon
        icon={theme === "dark" ? "sun" : "moon"}
        label={theme === "dark" ? "ライトテーマへ" : "ダークテーマへ"}
        onClick={toggleTheme}
      />
    </header>
  );
}
