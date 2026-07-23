import type { ModelColors } from "../lib/colors.js";

const MODE_LABEL: Record<string, string> = { use: "用途", type: "型", level: "レベル" };

export function Legend({ colors }: { colors: ModelColors }) {
  if (colors.legend.length === 0) return null;
  return (
    <div className="legend panel">
      <span className="legend-title">{MODE_LABEL[colors.mode]}</span>
      {colors.legend.map(([key, color]) => (
        <span key={key} className="legend-item">
          <span className="legend-swatch" style={{ background: color }} />
          {key}
        </span>
      ))}
    </div>
  );
}
