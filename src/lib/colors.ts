// 色 — 開かれた語彙に対して安定した割当を行う。
// 既知の語には固定色、未知の語には出現順でパレットから割り当てる (同一モデル内で安定)。
import { effectiveUse, type Model, type Space } from "@kensnzk/koyu";

export type ColorMode = "use" | "type" | "level";

/** 紙 (平面図) と調和する落ち着いたパレット */
const PALETTE = [
  "#6d8ca0", // 青灰
  "#b08968", // 黄土
  "#6ba292", // 青緑
  "#a26769", // 弁柄
  "#8d7ba5", // 藤
  "#a3a380", // 利休
  "#c2a878", // 芥子
  "#7d99b8", // 縹
  "#9a8c78", // 胡桃
  "#78909c", // 鈍色
  "#b39c8f", // 桜鼠
  "#86a67c", // 苔
];

/** 既知の語への固定色 (use) */
const USE_FIXED: Record<string, string> = {
  rentable: "#6ba292",
  exclusive: "#b08968",
  common: "#6d8ca0",
};

export const UNSET_COLOR = "#c9c2b4";
export const VOID_COLOR = "#dedad0";
export const SELECT_COLOR = "#d97706";
export const ROUTE_COLOR = "#e8a33d";

export class ColorAssigner {
  private map = new Map<string, string>();
  private next = 0;
  constructor(fixed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(fixed)) this.map.set(k, v);
  }
  color(key: string | undefined): string {
    if (key === undefined) return UNSET_COLOR;
    const hit = this.map.get(key);
    if (hit) return hit;
    const c = PALETTE[this.next % PALETTE.length]!;
    this.next++;
    this.map.set(key, c);
    return c;
  }
  entries(): Array<[string, string]> {
    return [...this.map.entries()];
  }
}

export interface ModelColors {
  mode: ColorMode;
  colorOf(s: Space): string;
  /** 凡例 (キー→色。実際にモデルに現れたものだけ) */
  legend: Array<[string, string]>;
}

/** モデル全体の色割当を作る。呼び出しごとに決定的 */
export function buildColors(model: Model, mode: ColorMode): ModelColors {
  const assigner = new ColorAssigner(mode === "use" ? USE_FIXED : {});
  const keyOf = (s: Space): string | undefined =>
    mode === "use" ? effectiveUse(model, s) : mode === "type" ? s.type : s.level;

  const seen = new Set<string>();
  const legend: Array<[string, string]> = [];
  // レベルはz順、それ以外は空間の宣言順で安定させる
  const spaces = [...model.spaces.values()].filter((s) => s.rects.length > 0);
  if (mode === "level") {
    spaces.sort((a, b) => (model.levels[a.level ?? ""]?.z ?? 0) - (model.levels[b.level ?? ""]?.z ?? 0));
  }
  for (const s of spaces) {
    if (s.type === "void") continue;
    const k = keyOf(s);
    if (k !== undefined && !seen.has(k)) {
      seen.add(k);
      legend.push([k, assigner.color(k)]);
    }
  }
  return {
    mode,
    colorOf: (s: Space) => (s.type === "void" ? VOID_COLOR : assigner.color(keyOf(s))),
    legend,
  };
}
