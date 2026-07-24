// エディタ — 原本はテキスト。ここでの編集が唯一の「書く」操作であり、
// 平面・立体・面積表はすべてこのテキストからの導出として即座に追随する。
// レイヤー (ファイル) が複数あるときはタブで分担の単位を行き来する (koyu ADR-0010)。
import { StreamLanguage } from "@codemirror/language";
import { Annotation } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { useViewer } from "../state/store.js";

const External = Annotation.define<boolean>();

const KEYWORDS = /^(koyu|name|unit|grid|level|space|boundary|zone|stack|import|asset)\b/;
const SUBS = /^(door|window|seg|area)\b/;

/** koyu (.muro) の簡易ハイライト */
const muroLanguage = StreamLanguage.define<{ head: boolean }>({
  startState: () => ({ head: true }),
  token(stream, state) {
    if (stream.sol()) state.head = true;
    if (stream.eatSpace()) return null;
    if (stream.match(/#.*/)) return "comment";
    if (state.head) {
      state.head = false;
      if (stream.match(KEYWORDS) || stream.match(SUBS)) return "keyword";
    }
    if (stream.match(/"[^"]*"/)) return "string";
    if (stream.match(/\.?\.?\/[^\s#]+/)) return "variableName";
    if (stream.match(/[A-Za-z_][\w-]*(?=:)/)) {
      stream.eat(":");
      return "propertyName";
    }
    if (stream.match(/[XY]\d+([+-]\d+)?(\.\.[XY]\d+([+-]\d+)?)?/)) return "atom";
    if (stream.match(/[A-Za-z]+\d+\.\.[A-Za-z]+\d+/)) return "atom";
    if (stream.match(/-?\d+(\.\d+)?/)) return "number";
    stream.next();
    return null;
  },
});

// DSトークンをそのままCSS変数参照で使う (テーマが変われば追従する)
const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--text-xs)", background: "var(--bg-surface)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)" },
  ".cm-gutters": { background: "var(--bg-subtle)", color: "var(--text-3)", border: "none" },
  ".cm-activeLine": { background: "var(--bg-subtle)" },
  ".cm-activeLineGutter": { background: "var(--bg-active)" },
  "&.cm-focused": { outline: "none" },
});

/** checkメッセージから出所 (ファイル:行) を読む — koyu srcRef の逆 */
function parseRef(message: string): { file?: string; line: number } | null {
  const m = /^(?:([^\s:]+):)?(\d+)行目/.exec(message);
  if (!m) return null;
  return { ...(m[1] ? { file: m[1] } : {}), line: Number(m[2]) };
}

export function EditorPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounce = useRef<number>(0);

  const source = useViewer((s) => s.source);
  const files = useViewer((s) => s.files);
  const entry = useViewer((s) => s.entry);
  const activeFile = useViewer((s) => s.activeFile);
  const parseError = useViewer((s) => s.parseError);
  const checkErrors = useViewer((s) => s.checkErrors);
  const checkWarnings = useViewer((s) => s.checkWarnings);
  const model = useViewer((s) => s.model);
  const editActive = useViewer((s) => s.editActive);
  const setActiveFile = useViewer((s) => s.setActiveFile);

  const fileNames = Object.keys(files);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      doc: useViewer.getState().source,
      parent: host,
      extensions: [
        basicSetup,
        muroLanguage,
        theme,
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          if (u.transactions.some((tr) => tr.annotation(External))) return;
          window.clearTimeout(debounce.current);
          const text = u.state.doc.toString();
          debounce.current = window.setTimeout(
            () => useViewer.getState().editActive(text),
            250,
          );
        }),
      ],
    });
    viewRef.current = view;
    return () => {
      window.clearTimeout(debounce.current);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部からのソース差し替え (例の切替・ファイルを開く・タブ切替)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === source) return;
    window.clearTimeout(debounce.current); // 前のタブの編集を持ち越さない
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: source },
      annotations: External.of(true),
    });
  }, [source, activeFile]);

  function jumpToLine(line: number) {
    const view = viewRef.current;
    if (!view || line < 1 || line > view.state.doc.lines) return;
    const pos = view.state.doc.line(line).from;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  }

  /** タブ切替 — 打鍵中 (デバウンス残り) の編集を先に確定してから移る */
  function switchTab(f: string) {
    const view = viewRef.current;
    const st = useViewer.getState();
    if (view) {
      window.clearTimeout(debounce.current);
      const text = view.state.doc.toString();
      if (text !== st.files[st.activeFile]) st.editActive(text);
    }
    setActiveFile(f);
  }

  /** エラーの出所レイヤーへタブを移してから行へ飛ぶ */
  function jumpTo(file: string | undefined, line: number) {
    if (file && file !== activeFile && file in files) {
      switchTab(file);
      window.setTimeout(() => jumpToLine(line), 0); // ドキュメント差し替え後に
    } else {
      jumpToLine(line);
    }
  }

  const ok = !parseError && checkErrors.length === 0;

  return (
    <div className="editor-pane">
      {fileNames.length > 1 && (
        <div className="file-tabs">
          {fileNames.map((f) => (
            <button
              key={f}
              className={`file-tab ${f === activeFile ? "file-tab-on" : ""}`}
              onClick={() => switchTab(f)}
              title={f === entry ? `${f} — base層 (合成の入口)` : f}
            >
              {f === entry ? `◈ ${f}` : f}
            </button>
          ))}
        </div>
      )}
      <div ref={hostRef} className="editor-host" />
      <div className={`diagnostics ${parseError ? "diag-error" : ok ? "diag-ok" : "diag-warn"}`}>
        {parseError ? (
          <button className="diag-line" onClick={() => jumpTo(parseError.file, parseError.line)}>
            ✖ {parseError.message}
            <span className="diag-note">(表示は最後に整合したモデル)</span>
          </button>
        ) : (
          <>
            <div className="diag-line">
              {checkErrors.length === 0
                ? `✔ 整合 — 空間 ${model?.spaces.size ?? 0} / 境界 ${model?.boundaries.length ?? 0}${
                    fileNames.length > 1 ? ` (${fileNames.length}レイヤー合成)` : ""
                  }`
                : `✖ check エラー ${checkErrors.length}`}
              {checkWarnings.length > 0 && ` ・ 警告 ${checkWarnings.length}`}
            </div>
            {[...checkErrors.map((m) => ["✖", m] as const), ...checkWarnings.map((m) => ["⚠", m] as const)].map(
              ([mark, m], i) => {
                const ref = parseRef(m);
                return (
                  <button key={i} className="diag-item" onClick={() => ref && jumpTo(ref.file, ref.line)}>
                    {mark} {m}
                  </button>
                );
              },
            )}
          </>
        )}
      </div>
    </div>
  );
}
