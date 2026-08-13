// インスペクタ — 選択した空間の属性。
import { useMemo } from "react";
import {
  areaM2,
  displayName,
  effectiveAttr,
  heff,
  isSemiOutdoor,
  isVoid,
} from "@kensnzk/koyu/model";
import { carriedKeys } from "../lib/colors.js";
import { Icon, Select } from "../lib/ds.js";
import { siteReport } from "../lib/koyu-compat.js";
import { UNTYPED_LABEL } from "../lib/stats.js";
import { KOYU_VERSION, MURO_READS, MURO_UNDECLARED, MURO_VERSION, UGATSU_VERSION } from "../lib/versions.js";
import { useViewer } from "../state/store.js";

const NONE = "";

export function Inspector() {
  const model = useViewer((s) => s.model);
  const modelKey = useViewer((s) => s.modelKey);
  const selected = useViewer((s) => s.selected);
  const routeTarget = useViewer((s) => s.routeTarget);
  const route = useViewer((s) => s.route);
  const setRouteTarget = useViewer((s) => s.setRouteTarget);
  const checkErrors = useViewer((s) => s.checkErrors);
  const checkWarnings = useViewer((s) => s.checkWarnings);

  // 行き先の候補 — 母集団は書かれた空間そのもの。ugatsu が絞り込みの意味を作らない
  const targets = useMemo(() => {
    if (!model) return [];
    return [...model.spaces.keys()].sort();
  }, [model, modelKey]);

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
            {/* 版 — 「どの版の形を見ているか」を利用者が言えるようにする (ADR-0006)。
                muro は一点ではなく**幅**である: 読める範囲・最新・版行の無い原本の読み方。
                版行を書かない原本は 1.1 として読まれ、それは新しい記法へは動かない */}
            <tr>
              <td>版</td>
              <td className="version-cell" title={`muro ${MURO_READS} を読む`}>
                ugatsu {UGATSU_VERSION}
                <br />
                koyu {KOYU_VERSION} ・ muro {MURO_VERSION}
                <br />
                <span className="muted">版行の無い原本は muro {MURO_UNDECLARED} として読む</span>
              </td>
            </tr>
            <tr>
              <td>check</td>
              <td>
                <span className={checkErrors.length > 0 ? "status-inline status-error" : "status-inline status-ready"}>
                  <Icon name={checkErrors.length > 0 ? "cross-circled" : "check-circled"} size={14} />
                  {checkErrors.length === 0 ? "整合" : `エラー ${checkErrors.length}`}
                </span>
                {checkWarnings.length > 0 && (
                  <span className="status-inline status-warning">
                    <Icon name="exclamation-triangle" size={14} />
                    警告 {checkWarnings.length}
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        {site.hasSite && (
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
                {site.roads.map((r) => (
                  <tr key={r.path}>
                    <td>接道</td>
                    <td>
                      {r.name} 幅員{(r.width / 1000).toFixed(1)}m ・ 接道長{" "}
                      {(r.frontage / 1000).toFixed(1)}m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="hint">
          空間をクリックすると属性と動線が出ます。壁は二空間の境界であり、平面も立体もこのテキストからの生成物です。
        </p>
        <p className="hint">
          描く範囲と、描かないものと、埋めている既定値は <code>docs/scope.md</code> にあります。
          <strong>描けないことは、書けないことではありません。</strong>
        </p>
      </aside>
    );
  }

  const h = heff(model, space);
  const attrs = Object.entries(space.attrs).filter(([k]) => k !== "name");
  // ゾーンから継いだ区分 — 自分では書いていないが、問えば答えが返る鍵。
  // **鍵を名乗るのは呼ぶ側**であり、koyu はその意味を作らない (koyu ADR-0061 決定7)
  const inherited = carriedKeys(model)
    .filter((k) => space.attrs[k] === undefined)
    .map((k) => [k, effectiveAttr(model, space, k)] as const)
    .filter((e): e is readonly [string, NonNullable<(typeof e)[1]>] => e[1] !== undefined);

  return (
    <aside className="inspector">
      <h2>{displayName(space)}</h2>
      <div className="path sel-path">{space.path}</div>
      <table className="kv">
        <tbody>
          {/* 型 = 室の目的 (koyu ADR-0061 決定1)。**書かれないことがある** */}
          <tr>
            <td>型</td>
            <td>{space.type ?? <span className="muted">{UNTYPED_LABEL}</span>}</td>
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
            <td>{isVoid(space) ? "吹抜け (不算入)" : `${areaM2(space)?.toFixed(2) ?? "–"} ㎡`}</td>
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
          {inherited.map(([k, v]) => (
            <tr key={`inh-${k}`}>
              <td>
                {k} <span className="muted">(継承)</span>
              </td>
              <td>{String(v)}</td>
            </tr>
          ))}
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

      {/*
        動線 — 経路も扉の数も koyu の `doorsBetween` が答える。ugatsu は行き先を渡し、
        返ってきた空間の列を塗るだけである。**通れるかどうかの判断はここに無い。**
      */}
      <h3>動線 — koyu への問い</h3>
      <Select
        fullWidth
        size="sm"
        label="行き先"
        value={routeTarget ?? NONE}
        options={[
          { value: NONE, label: "—" },
          ...targets.filter((p) => p !== space.path).map((p) => ({ value: p, label: p })),
        ]}
        onChange={(e: { target: { value: string } }) =>
          setRouteTarget(e.target.value === NONE ? null : e.target.value)
        }
      />
      {routeTarget && (
        <p className="hint">
          {route === "unreachable" || !route ? (
            <>
              到達できない — この二つの空間を結ぶ、通行できる境界の列がない。
              <strong>接する空間の既定は壁であり、扉は書かなければ無い。</strong>
            </>
          ) : (
            <>
              扉 {route.doors} 枚 ・ 空間 {route.path.length} 室を経由 (最少の扉数)。平面・3D・面積表に同じ経路が出る。
            </>
          )}
        </p>
      )}
    </aside>
  );
}
