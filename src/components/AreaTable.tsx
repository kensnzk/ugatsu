// 面積表 — 「面積表に一行として現れてほしいか」が space のリトマス試験である以上、
// この表は koyu の一次要素の一覧そのものになる (MUN-144)。
//
// 列は固定ではない。**集計軸はモデルに書かれた鍵から立つ** — muro 1.3 が `use` を廃し、
// 「用途」という特権的な一列が消えた (koyu ADR-0061)。書かれていなければ列も立たない。
import { useMemo } from "react";
import { AREA_CLASS_LABEL, computeStats, statsToCsv, UNTYPED_LABEL } from "../lib/stats.js";
import { Button } from "../lib/ds.js";
import { downloadText } from "../lib/download.js";
import { routePaths, useViewer } from "../state/store.js";

export function AreaTable() {
  const model = useViewer((s) => s.model);
  const modelKey = useViewer((s) => s.modelKey);
  const fileName = useViewer((s) => s.entry);
  const selected = useViewer((s) => s.selected);
  const route = useViewer((s) => s.route);
  const select = useViewer((s) => s.select);

  const stats = useMemo(() => (model ? computeStats(model) : null), [model, modelKey]);
  if (!model || !stats) return <div className="empty-view">モデルがありません</div>;
  const onRoute = routePaths(route);

  return (
    <div className="area-table">
      <div className="table-head">
        <h2>
          面積表 <span className="muted">{model.name ?? ""} ・ 壁芯 ・ ㎡</span>
        </h2>
        <Button
          size="sm"
          icon="download"
          onClick={() =>
            downloadText(fileName.replace(/\.muro$/, "") + ".areas.csv", statsToCsv(stats, model.name ?? fileName), "text/csv")
          }
        >
          CSV書き出し
        </Button>
      </div>

      <table>
        <thead>
          <tr>
            <th>レベル</th>
            <th>パス</th>
            <th>名称</th>
            <th>型</th>
            {stats.keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
            <th className="num">面積</th>
            <th>区分</th>
          </tr>
        </thead>
        <tbody>
          {stats.levels.map((lb) => (
            <LevelRows
              key={lb.level}
              lb={lb}
              keys={stats.keys}
              selected={selected}
              onRoute={onRoute}
              select={select}
            />
          ))}
          <tr className="total-row">
            <td colSpan={4 + stats.keys.length}>延べ面積 (屋内床面積)</td>
            <td className="num">{stats.total.toFixed(2)}</td>
            <td />
          </tr>
          {stats.outdoorTotal > 0 && (
            <tr className="aside-row">
              <td colSpan={4 + stats.keys.length}>屋外 — 広場・空地等 (床面積に算入しない)</td>
              <td className="num">{stats.outdoorTotal.toFixed(2)}</td>
              <td />
            </tr>
          )}
          {stats.semiTotal > 0 && (
            <tr className="aside-row">
              <td colSpan={4 + stats.keys.length}>
                半屋外 — バルコニー・屋外階段等 (算入条件は法規細部のため別掲)
              </td>
              <td className="num">{stats.semiTotal.toFixed(2)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>

      {stats.zones.length > 0 && (
        <>
          <h3>ゾーン別 — 数える集約</h3>
          <table>
            <thead>
              <tr>
                <th>パス</th>
                <th>名称</th>
                {stats.keys.map((k) => (
                  <th key={k}>{k}</th>
                ))}
                <th className="num">面積</th>
              </tr>
            </thead>
            <tbody>
              {stats.zones.map((z) => (
                <tr key={z.path}>
                  <td className="path">{z.path}</td>
                  <td>{z.name}</td>
                  {stats.keys.map((k) => (
                    <td key={k}>{z.carried[k] ?? ""}</td>
                  ))}
                  <td className="num">{z.area.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="summary-grid">
        {/* 鍵ごとの集計。**バケツの合計は延べ面積に閉じる** — その鍵を持たない空間も
            「(未記載)」として一つのバケツになる (koyu ADR-0061 決定6) */}
        {stats.byAttr.map((b) => (
          <div key={b.key}>
            <h3>{b.key} 別</h3>
            <table>
              <tbody>
                {b.rows.map((r) => (
                  <tr key={r.value}>
                    <td>{r.value}</td>
                    <td className="num">{r.area.toFixed(2)}</td>
                    <td className="num muted">{r.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div>
          <h3>型別</h3>
          <table>
            <tbody>
              {stats.byType.map((t) => (
                <tr key={t.type}>
                  <td>{t.type}</td>
                  <td className="num">{t.area.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>規模</h3>
          <table>
            <tbody>
              <tr>
                <td>空間</td>
                <td className="num">{stats.spaceCount}</td>
              </tr>
              <tr>
                <td>境界</td>
                <td className="num">{stats.boundaryCount}</td>
              </tr>
              <tr>
                <td>扉</td>
                <td className="num">{stats.doorCount}</td>
              </tr>
              <tr>
                <td>窓</td>
                <td className="num">{stats.windowCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LevelRows({
  lb,
  keys,
  selected,
  onRoute,
  select,
}: {
  lb: ReturnType<typeof computeStats>["levels"][number];
  keys: string[];
  selected: string | null;
  onRoute: Set<string>;
  select: (p: string | null) => void;
}) {
  return (
    <>
      {lb.rows.map((r, i) => (
        <tr
          key={r.path}
          className={`clickable ${r.cls === "indoor" ? "" : "row-aside"} ${
            r.path === selected ? "row-selected" : onRoute.has(r.path) ? "row-route" : ""
          }`}
          onClick={() => select(r.path === selected ? null : r.path)}
        >
          <td>{i === 0 ? lb.level : ""}</td>
          <td className="path">{r.path}</td>
          <td>{r.name}</td>
          <td>{r.type ?? <span className="muted">{UNTYPED_LABEL}</span>}</td>
          {keys.map((k) => (
            <td key={k}>{r.carried[k] ?? ""}</td>
          ))}
          <td className="num">{r.area?.toFixed(2) ?? "–"}</td>
          <td className="muted">{AREA_CLASS_LABEL[r.cls]}</td>
        </tr>
      ))}
      <tr className="subtotal-row">
        <td colSpan={4 + keys.length}>{lb.level} 小計 (屋内)</td>
        <td className="num">{lb.subtotal.toFixed(2)}</td>
        <td />
      </tr>
    </>
  );
}
