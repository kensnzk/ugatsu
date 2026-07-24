// 凡例 + 色分けモード切替 — キャンバス左下の最小表示
import type { ColorMode, ModelColors } from "../lib/colors.js";
import { Select } from "../lib/ds.js";
import { useViewer } from "../state/store.js";

const COLOR_ITEMS = [
  { value: "use", label: "用途" },
  { value: "type", label: "型" },
  { value: "level", label: "レベル" },
];

export function Legend({ colors }: { colors: ModelColors }) {
  const colorMode = useViewer((s) => s.colorMode);
  const setColorMode = useViewer((s) => s.setColorMode);
  if (colors.legend.length === 0) return null;
  return (
    <div className="legend">
      <Select
        size="sm"
        value={colorMode}
        onChange={(e: { target: { value: string } }) => setColorMode(e.target.value as ColorMode)}
        options={COLOR_ITEMS}
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
