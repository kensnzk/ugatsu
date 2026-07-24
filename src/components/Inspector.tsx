// インスペクタ — 選択した空間の属性。
import {
  areaM2,
  displayName,
  effectiveUse,
  heff,
  isSemiOutdoor,
  siteReport,
} from "@kensnzk/koyu";
import { useViewer } from "../state/store.js";

export function Inspector() {
  const model = useViewer((s) => s.model);
  const selected = useViewer((s) => s.selected);
  const checkErrors = useViewer((s) => s.checkErrors);
  const checkWarnings = useViewer((s) => s.checkWarnings);

  const space = model && selected ? model.spaces.get(selected) : undefined;

  if (!model) return <aside className="inspector" />;

  if (!space) {
    const site = siteReport(model);
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
        {site.siteZone && (
          <>
            <h3>敷地 — 構成からの導出</h3>
            <table className="kv">
              <tbody>
                <tr>
                  <td>敷地面積</td>
                  <td>
                    {site.derivedArea.toFixed(2)} ㎡
                    {site.declaredArea !== undefined && (
                      <span className="muted"> / 宣言 {site.declaredArea.toFixed(2)}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>建築面積</td>
                  <td>{site.footprint.toFixed(2)} ㎡</td>
                </tr>
                <tr>
                  <td>延べ面積</td>
                  <td>{site.totalFloor.toFixed(2)} ㎡</td>
                </tr>
                {site.roads.map((r, i) => (
                  <tr key={i}>
                    <td>接道</td>
                    <td>
                      {displayName(r.road)} 幅員{(r.width / 1000).toFixed(1)}m ・ 接道長{" "}
                      {(r.frontage / 1000).toFixed(1)}m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
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
          {isSemiOutdoor(model, space) && (
            <tr>
              <td>半屋外</td>
              <td>外部に開く (導出)</td>
            </tr>
          )}
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
    </aside>
  );
}
