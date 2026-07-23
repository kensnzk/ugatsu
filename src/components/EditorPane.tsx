// エディタ — 原本はテキスト。ここでの編集が唯一の「書く」操作であり、
// 平面・立体・面積表はすべてこのテキストからの導出として即座に追随する。
import { StreamLanguage } from "@codemirror/language";
import { Annotation } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { useViewer } from "../state/store.js";

const External = Annotation.define<boolean>();

const KEYWORDS = /^(koyu|name|unit|grid|level|space|boundary|zone|stack)\b/;
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
    if (stream.match(/\/[^\s#]+/)) return "variableName";
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

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "12.5px", background: "#fdfcf9" },
  ".cm-scroller": { fontFamily: "'SF Mono', Menlo, Consolas, monospace" },
  ".cm-gutters": { background: "#f4f0e6", color: "#a49b8a", border: "none" },
  ".cm-activeLine": { background: "#f4efe3" },
  ".cm-activeLineGutter": { background: "#ece5d3" },
  "&.cm-focused": { outline: "none" },
});

export function EditorPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounce = useRef<number>(0);

  const source = useViewer((s) => s.source);
  const parseError = useViewer((s) => s.parseError);
  const checkErrors = useViewer((s) => s.checkErrors);
  const checkWarnings = useViewer((s) => s.checkWarnings);
  const model = useViewer((s) => s.model);
  const setSource = useViewer((s) => s.setSource);

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
          debounce.current = window.setTimeout(() => setSource(text), 250);
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

  // 外部からのソース差し替え (例の切替・ファイルを開く)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === source) return;
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: source },
      annotations: External.of(true),
    });
  }, [source]);

  function jumpToLine(line: number) {
    const view = viewRef.current;
    if (!view || line < 1 || line > view.state.doc.lines) return;
    const pos = view.state.doc.line(line).from;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  }

  const ok = !parseError && checkErrors.length === 0;

  return (
    <div className="editor-pane">
      <div ref={hostRef} className="editor-host" />
      <div className={`diagnostics ${parseError ? "diag-error" : ok ? "diag-ok" : "diag-warn"}`}>
        {parseError ? (
          <button className="diag-line" onClick={() => jumpToLine(parseError.line)}>
            ✖ {parseError.message}
            <span className="diag-note">(表示は最後に整合したモデル)</span>
          </button>
        ) : (
          <>
            <div className="diag-line">
              {checkErrors.length === 0
                ? `✔ 整合 — 空間 ${model?.spaces.size ?? 0} / 境界 ${model?.boundaries.length ?? 0}`
                : `✖ check エラー ${checkErrors.length}`}
              {checkWarnings.length > 0 && ` ・ 警告 ${checkWarnings.length}`}
            </div>
            {[...checkErrors.map((m) => ["✖", m] as const), ...checkWarnings.map((m) => ["⚠", m] as const)].map(
              ([mark, m], i) => {
                const ln = /^(\d+)行目/.exec(m)?.[1];
                return (
                  <button key={i} className="diag-item" onClick={() => ln && jumpToLine(Number(ln))}>
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
