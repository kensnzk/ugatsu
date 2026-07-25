import { useEffect, useState } from "react";
import { Tabs } from "../lib/ds.js";
import { useViewer, type MainView } from "../state/store.js";
import { AreaTable } from "./AreaTable.js";
import { EditorPane } from "./EditorPane.js";
import { Inspector } from "./Inspector.js";
import { PlanView } from "./PlanView.js";
import { Scene3D } from "./Scene3D.js";
import { Toolbar } from "./Toolbar.js";
import { ToolIcon } from "./ui.js";

const VIEW_ITEMS: Array<{ value: MainView; label: string; icon: string }> = [
  { value: "plan", label: "平面", icon: "grid" },
  { value: "3d", label: "3D", icon: "cube" },
  { value: "table", label: "面積表", icon: "table" },
];

export function App() {
  const mainView = useViewer((s) => s.mainView);
  const setMainView = useViewer((s) => s.setMainView);
  const showEditor = useViewer((s) => s.showEditor);
  const showInspector = useViewer((s) => s.showInspector);
  const inspectorWidth = useViewer((s) => s.inspectorWidth);
  const setInspectorWidth = useViewer((s) => s.setInspectorWidth);
  const toggleEditor = useViewer((s) => s.toggleEditor);
  const toggleInspector = useViewer((s) => s.toggleInspector);
  const setSource = useViewer((s) => s.setSource);
  const setFiles = useViewer((s) => s.setFiles);
  const [dropping, setDropping] = useState(false);

  // プロパティパネルの左端ドラッグでリサイズ
  function startInspectorResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = inspectorWidth;
    const move = (ev: PointerEvent) => setInspectorWidth(startW + (startX - ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // .muro のドラッグ&ドロップ
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDropping(true);
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropping(false);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDropping(false);
      const list = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.(muro|txt)$/.test(f.name));
      if (list.length === 0) return;
      if (list.length === 1) {
        void list[0]!.text().then((text) => setSource(text, list[0]!.name));
        return;
      }
      // 複数ファイル: レイヤー群として合成。entryは import を持つファイル (無ければ先頭)
      void Promise.all(list.map(async (f) => [f.name, await f.text()] as const)).then((pairs) => {
        const files = Object.fromEntries(pairs);
        const entry = pairs.find(([, t]) => /^import\s/m.test(t))?.[0] ?? pairs[0]![0];
        setFiles(files, entry);
      });
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [setSource, setFiles]);

  return (
    <div className="app">
      <Toolbar />
      {/* キャンバスが主面。両サイドはその上に浮かぶ開閉可能なパネル */}
      <div
        className={`body ${showEditor ? "with-editor" : ""} ${showInspector ? "with-inspector" : ""}`}
        style={{ "--inspector-w": `${inspectorWidth}px` } as React.CSSProperties}
      >
        <main className="main">
          {/* 3Dはタブ切替でもWebGLコンテキストを保つため display 切替 */}
          <div className="view-slot" style={{ display: mainView === "plan" ? "contents" : "none" }}>
            {mainView === "plan" && <PlanView />}
          </div>
          <div className="view-slot-3d" style={{ display: mainView === "3d" ? "block" : "none" }}>
            <Scene3D />
          </div>
          {mainView === "table" && <AreaTable />}
        </main>
        {/* ビュー切替 — キャンバス上のセグメント */}
        <div className="view-switch">
          <Tabs
            variant="segmented"
            items={VIEW_ITEMS}
            value={mainView}
            onChange={(v: string) => setMainView(v as MainView)}
          />
        </div>
        {showEditor ? (
          <div className="side side-left">
            <EditorPane />
            <div className="side-close">
              <ToolIcon icon="pin-left" label="エディタを閉じる" onClick={toggleEditor} />
            </div>
          </div>
        ) : (
          <div className="side-reopen side-reopen-left">
            <ToolIcon icon="pin-right" label="エディタを開く" variant="outline" onClick={toggleEditor} />
          </div>
        )}
        {showInspector ? (
          <div className="side side-right" style={{ width: inspectorWidth }}>
            <div className="side-resize" onPointerDown={startInspectorResize} />
            <Inspector />
            <div className="side-close">
              <ToolIcon icon="pin-right" label="プロパティを閉じる" onClick={toggleInspector} />
            </div>
          </div>
        ) : (
          <div className="side-reopen side-reopen-right">
            <ToolIcon icon="pin-left" label="プロパティを開く" variant="outline" onClick={toggleInspector} />
          </div>
        )}
      </div>
      {dropping && <div className="drop-overlay">.muro をドロップして開く (複数ならレイヤー合成)</div>}
    </div>
  );
}
