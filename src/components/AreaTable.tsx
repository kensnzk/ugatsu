// 面積表 — 「面積表に一行として現れてほしいか」が space のリトマス試験である以上、
// この表は IFCXS の一次要素の一覧そのものになる (MUN-144)。
import { useMemo } from "react";
import { computeStats, statsToCsv } from "../lib/stats.js";
import { downloadText } from "../lib/download.js";
import { routePaths, useViewer } from "../state/store.js";

export function AreaTable() {
  const model = useViewer((s) => s.model);
  const modelKey = useViewer((s) => s.modelKey);
  const fileName = useViewer((s) => s.fileName);
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
        <button
          className="mini"
          onClick={() =>
            downloadText(fileName.replace(/\.ifcxs$/, "") + ".areas.csv", statsToCsv(stats, model.name ?? fileName), "text/csv")
          }
        >
          CSV書き出し
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>レベル</th>
            <th>パス</th>
            <th>名称</th>
            <th>型</th>
            <th>用途</th>
            <th className="num">面積</th>
          </tr>
        </thead>
        <tbody>
          {stats.levels.map((lb) => (
            <LevelRows key={lb.level} lb={lb} selected={selected} onRoute={onRoute} select={select} />
          ))}
          <tr className="total-row">
            <td colSpan={5}>合計 (吹抜け不算入)</td>
            <td className="num">{stats.total.toFixed(2)}</td>
          </tr>
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
                <th>用途</th>
                <th className="num">面積</th>
              </tr>
            </thead>
            <tbody>
              {stats.zones.map((z) => (
                <tr key={z.path}>
                  <td className="path">{z.path}</td>
                  <td>{z.name}</td>
                  <td>{z.use ?? ""}</td>
                  <td className="num">{z.area.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="summary-grid">
        {stats.byUse.length > 0 && (
          <div>
            <h3>用途別</h3>
            <table>
              <tbody>
                {stats.byUse.map((u) => (
                  <tr key={u.use}>
                    <td>{u.use}</td>
                    <td className="num">{u.area.toFixed(2)}</td>
                    <td className="num muted">{u.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  selected,
  onRoute,
  select,
}: {
  lb: ReturnType<typeof computeStats>["levels"][number];
  selected: string | null;
  onRoute: Set<string>;
  select: (p: string | null) => void;
}) {
  return (
    <>
      {lb.rows.map((r, i) => (
        <tr
          key={r.path}
          className={`clickable ${r.path === selected ? "row-selected" : onRoute.has(r.path) ? "row-route" : ""}`}
          onClick={() => select(r.path === selected ? null : r.path)}
        >
          <td>{i === 0 ? lb.level : ""}</td>
          <td className="path">{r.path}</td>
          <td>{r.name}</td>
          <td>{r.type}</td>
          <td>{r.use ?? ""}</td>
          <td className="num">{r.isVoid ? "吹抜け" : r.area?.toFixed(2)}</td>
        </tr>
      ))}
      <tr className="subtotal-row">
        <td colSpan={5}>{lb.level} 小計</td>
        <td className="num">{lb.subtotal.toFixed(2)}</td>
      </tr>
    </>
  );
}
