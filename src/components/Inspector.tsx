// インスペクタ — 選択した空間の属性・隣接・経路。
// 「この室とこの室は繋がっているか」「扉をいくつ通るか」が変換なしにグラフへの問いになる。
import { useMemo } from "react";
import {
  areaM2,
  displayName,
  effectiveUse,
  heff,
  neighbors,
  type Boundary,
} from "../core/index.js";
import { useViewer } from "../state/store.js";

function boundaryMark(b: Boundary, passable: boolean, doors: number): string {
  switch (b.kind) {
    case "open":
      return "〰 開放";
    case "stair":
      return "↕ 階段";
    case "shaft":
      return "↕ シャフト (通行不可)";
    case "void":
      return "↕ 吹抜け";
    default:
      return passable ? `— 扉${doors}` : "│ 壁";
  }
}

export function Inspector() {
  const model = useViewer((s) => s.model);
  const modelKey = useViewer((s) => s.modelKey);
  const selected = useViewer((s) => s.selected);
  const routeTarget = useViewer((s) => s.routeTarget);
  const route = useViewer((s) => s.route);
  const select = useViewer((s) => s.select);
  const setRouteTarget = useViewer((s) => s.setRouteTarget);
  const checkErrors = useViewer((s) => s.checkErrors);
  const checkWarnings = useViewer((s) => s.checkWarnings);

  const space = model && selected ? model.spaces.get(selected) : undefined;
  const ns = useMemo(
    () => (model && space ? neighbors(model, space.path) : []),
    [model, modelKey, space],
  );
  const allPaths = useMemo(
    () =>
      model
        ? [...model.spaces.values()].map((s) => ({ path: s.path, label: `${s.path} ${displayName(s)}` }))
        : [],
    [model, modelKey],
  );

  if (!model) return <aside className="inspector" />;

  if (!space) {
    return (
      <aside className="inspector">
        <h2>{model.name ?? "無題"}</h2>
        <table className="kv">
          <tbody>
            <tr>
              <td>空間</td>
              <td>{model.spaces.size}</td>
            </tr>
            <tr>
              <td>境界</td>
              <td>{model.boundaries.length}</td>
            </tr>
            <tr>
              <td>レベル</td>
              <td>{Object.keys(model.levels).length}</td>
            </tr>
            <tr>
              <td>ゾーン</td>
              <td>{model.zones.size}</td>
            </tr>
            <tr>
              <td>check</td>
              <td>
                {checkErrors.length === 0 ? "✔ 整合" : `✖ ${checkErrors.length}`}
                {checkWarnings.length > 0 ? ` ・ ⚠ ${checkWarnings.length}` : ""}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="hint">
          空間をクリックすると属性と隣接が出ます。壁は二空間の境界であり、平面も立体もこのテキストからの生成物です。
        </p>
      </aside>
    );
  }

  const use = effectiveUse(model, space);
  const h = heff(model, space);
  const attrs = Object.entries(space.attrs).filter(([k]) => k !== "name");

  return (
    <aside className="inspector">
      <h2>{displayName(space)}</h2>
      <div className="path sel-path">{space.path}</div>
      <table className="kv">
        <tbody>
          <tr>
            <td>型</td>
            <td>{space.type}</td>
          </tr>
          {space.level && (
            <tr>
              <td>レベル</td>
              <td>
                {space.level} (FL {model.levels[space.level]?.z} mm)
              </td>
            </tr>
          )}
          <tr>
            <td>面積</td>
            <td>{space.type === "void" ? "吹抜け (不算入)" : `${areaM2(space)?.toFixed(2) ?? "–"} ㎡`}</td>
          </tr>
          {h !== undefined && (
            <tr>
              <td>天井高</td>
              <td>{h} mm</td>
            </tr>
          )}
          {use && (
            <tr>
              <td>用途 (実効)</td>
              <td>{use}</td>
            </tr>
          )}
          {space.rects.length > 1 && (
            <tr>
              <td>領域</td>
              <td>{space.rects.length}矩形の合併</td>
            </tr>
          )}
          {attrs.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>隣接 — 境界 {ns.length}</h3>
      <ul className="neighbors">
        {ns.map((n, i) => (
          <li key={i}>
            <button className="link" onClick={() => select(n.space.path)}>
              {displayName(n.space)}
            </button>
            <span className="muted"> {boundaryMark(n.boundary, n.passable, n.doors)}</span>
            {typeof n.boundary.attrs["fire"] === "number" && (
              <span className="badge">耐火{n.boundary.attrs["fire"]}</span>
            )}
          </li>
        ))}
      </ul>

      <h3>経路 — 扉をいくつ通るか</h3>
      <select
        className="route-select"
        value={routeTarget ?? ""}
        onChange={(e) => setRouteTarget(e.target.value || null)}
      >
        <option value="">行き先を選ぶ…</option>
        {allPaths
          .filter((p) => p.path !== space.path)
          .map((p) => (
            <option key={p.path} value={p.path}>
              {p.label}
            </option>
          ))}
      </select>
      {route === "unreachable" && <p className="route-result">✖ 到達できません</p>}
      {route && route !== "unreachable" && (
        <div className="route-result">
          <strong>扉 {route.doors} 枚</strong>
          <ol>
            {route.path.map((p) => (
              <li key={p}>
                <button className="link" onClick={() => select(p)}>
                  {model.spaces.get(p) ? displayName(model.spaces.get(p)!) : p}
                </button>
                <span className="muted path"> {p}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}
