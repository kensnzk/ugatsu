import { useRef, useState } from "react";
// 書き出しの二つは別の契約から来る — 正準JSONは**凍る**面 (ルート)、SVGは
// **凍らない**面 (`/draw`) である。同じ入力から同じ形は出るが、同じバイトは出ない (koyu ADR-0053)
import { toCanonical } from "@kensnzk/koyu";
import { svgPlan } from "@kensnzk/koyu/draw";
import { EXAMPLES } from "../examples.js";
import { downloadText, exportEmbeddedHtml } from "../lib/download.js";
import { Button, Icon } from "../lib/ds.js";
import { UGATSU_VERSION, VERSION_LINE } from "../lib/versions.js";
import { useViewer } from "../state/store.js";
import { Dropdown } from "./Dropdown.js";
import { ToolIcon } from "./ui.js";

const MENU_ITEM_STYLE = { justifyContent: "flex-start" } as const;

export function Toolbar() {
  const files = useViewer((s) => s.files);
  const entry = useViewer((s) => s.entry);
  const activeFile = useViewer((s) => s.activeFile);
  const model = useViewer((s) => s.model);
  const source = useViewer((s) => s.source);
  const parseError = useViewer((s) => s.parseError);
  const checkErrors = useViewer((s) => s.checkErrors);
  const checkWarnings = useViewer((s) => s.checkWarnings);
  const planLevel = useViewer((s) => s.planLevel);
  const theme = useViewer((s) => s.theme);
  const setSource = useViewer((s) => s.setSource);
  const setFiles = useViewer((s) => s.setFiles);
  const toggleTheme = useViewer((s) => s.toggleTheme);

  const fileInput = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const layerCount = Object.keys(files).length;
  const base = entry.replace(/\.muro$/, "");
  const status = parseError || checkErrors.length > 0 ? "error" : checkWarnings.length > 0 ? "warning" : "ready";
  const statusLabel =
    status === "error"
      ? `要修正${checkErrors.length > 0 ? ` ${checkErrors.length}` : ""}`
      : status === "warning"
        ? `警告 ${checkWarnings.length}`
        : "整合";
  const statusIcon =
    status === "error" ? "cross-circled" : status === "warning" ? "exclamation-triangle" : "check-circled";

  async function openFile(f: File) {
    setSource(await f.text(), f.name);
  }

  return (
    <header className="toolbar">
      {/* 版は常に見えていること — どの版の形を見ているかを言えない配布物は凍結できない (ADR-0006) */}
      <div className="brand" title={VERSION_LINE}>
        <strong>UGATSU</strong>
        <span className="brand-version">{UGATSU_VERSION}</span>
      </div>
      <span className={`file-status status-${status}`}>
        <Icon name={statusIcon} size={14} />
        <span className="file-name">{entry}</span>
        {layerCount > 1 && <span className="layer-count"> +{layerCount - 1}層</span>}
        <span className="status-label">{statusLabel}</span>
      </span>

      <Dropdown icon="archive" label="例を開く" closeOnSelect>
        {EXAMPLES.map((ex) => (
          <Button
            key={ex.key}
            variant="ghost"
            size="sm"
            fullWidth
            style={MENU_ITEM_STYLE}
            onClick={() => setFiles(ex.files, ex.entry)}
          >
            {ex.label}
          </Button>
        ))}
      </Dropdown>
      <ToolIcon icon="upload" label="ファイルを開く" onClick={() => fileInput.current?.click()} />
      {/* ds:allow-next-line DS Inputはref/accept/hiddenを公開しないため、OSファイル選択用の非表示要素だけ例外 */}
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
        <ToolIcon icon="download" label="書き出し" selected={menuOpen} onClick={() => setMenuOpen((v) => !v)} />
        {menuOpen && (
          <div className="menu panel" onClick={() => setMenuOpen(false)}>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              style={MENU_ITEM_STYLE}
              onClick={() => downloadText(activeFile, source)}
            >
              ソース ({layerCount > 1 ? activeFile : ".muro"})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              style={MENU_ITEM_STYLE}
              onClick={() => model && downloadText(`${base}.canonical.json`, toCanonical(model), "application/json")}
              disabled={!model}
            >
              正準JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              style={MENU_ITEM_STYLE}
              onClick={() => {
                if (!model || !planLevel) return;
                downloadText(`${base}-${planLevel}.svg`, svgPlan(model, { level: planLevel }), "image/svg+xml");
              }}
              disabled={!model || !planLevel}
            >
              平面SVG ({planLevel ?? "–"})
            </Button>
            {import.meta.env.PROD && (
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                style={MENU_ITEM_STYLE}
                onClick={() => {
                  if (!exportEmbeddedHtml(files, entry)) {
                    alert("配布用HTMLの生成に失敗しました");
                  }
                }}
              >
                配布用HTML (モデル埋め込み)
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="toolbar-right">
        <ToolIcon
          icon={theme === "dark" ? "sun" : "moon"}
          label={theme === "dark" ? "ライトテーマへ" : "ダークテーマへ"}
          onClick={toggleTheme}
        />
      </div>
    </header>
  );
}
