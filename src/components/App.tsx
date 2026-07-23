import { useEffect, useState } from "react";
import { useViewer } from "../state/store.js";
import { AreaTable } from "./AreaTable.js";
import { EditorPane } from "./EditorPane.js";
import { Inspector } from "./Inspector.js";
import { PlanView } from "./PlanView.js";
import { Scene3D } from "./Scene3D.js";
import { Toolbar } from "./Toolbar.js";

export function App() {
  const mainView = useViewer((s) => s.mainView);
  const showEditor = useViewer((s) => s.showEditor);
  const setSource = useViewer((s) => s.setSource);
  const setFiles = useViewer((s) => s.setFiles);
  const [dropping, setDropping] = useState(false);

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
      <div className={`body ${showEditor ? "with-editor" : ""}`}>
        {showEditor && <EditorPane />}
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
        <Inspector />
      </div>
      {dropping && <div className="drop-overlay">.muro をドロップして開く (複数ならレイヤー合成)</div>}
    </div>
  );
}
