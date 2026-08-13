// 凡例 + 色分けモード切替 — キャンバス左下の最小表示。
//
// 軸の並びは「型 (室の目的) / レベル」+ **モデルに書かれている名前空間つきの鍵**である。
// かつてここには「用途」という固定の一項があった。muro 1.3 が `use` を廃した以上
// (koyu ADR-0061)、どの区分を軸にするかは原本が決めることであって、この頁が決めることではない。
import { useMemo } from "react";
import { ATTR_MODE_PREFIX, carriedKeys, type ColorMode, type ModelColors } from "../lib/colors.js";
import { Select } from "../lib/ds.js";
import { useViewer } from "../state/store.js";

const FIXED_ITEMS = [
  { value: "type", label: "型" },
  { value: "level", label: "レベル" },
];

export function Legend({ colors }: { colors: ModelColors }) {
  const model = useViewer((s) => s.model);
  const modelKey = useViewer((s) => s.modelKey);
  const colorMode = useViewer((s) => s.colorMode);
  const setColorMode = useViewer((s) => s.setColorMode);
  const items = useMemo(
    () => [
      ...FIXED_ITEMS,
      ...(model ? carriedKeys(model) : []).map((k) => ({
        value: `${ATTR_MODE_PREFIX}${k}`,
        label: k,
      })),
    ],
    [model, modelKey],
  );
  if (colors.legend.length === 0) return null;
  return (
    <div className="legend">
      <Select
        size="sm"
        value={colorMode}
        onChange={(e: { target: { value: string } }) => setColorMode(e.target.value as ColorMode)}
        options={items}
      />
      {colors.legend.map(([key, color]) => (
        <span key={key} className="legend-item">
          <span className="legend-swatch" style={{ background: color }} />
          {key}
        </span>
      ))}
    </div>
  );
}
