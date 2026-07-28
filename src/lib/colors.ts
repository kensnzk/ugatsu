// 色 — 開かれた語彙に対して安定した割当を行う。
// 既知の語には固定色、未知の語には出現順でパレットから割り当てる (同一モデル内で安定)。
import { effectiveUse, type Model, type Space } from "@kensnzk/koyu";
import { token } from "./theme.js";

export type ColorMode = "use" | "type" | "level";

/* 空間の色分け (用途/型/レベル) はカテゴリカルなデータ配色で、DSのUIトークンには無い語彙。
   図面と調和する落ち着いた中間トーンとしてここだけ固有パレットを持つ (ds-check除外)。 */
const PALETTE = [
  "#6d8ca0", // 青灰 — ds:allow 分析カテゴリ専用。製品クロームとは分離
  "#b08968", // 黄土 — ds:allow 分析カテゴリ専用
  "#6ba292", // 青緑 — ds:allow 分析カテゴリ専用
  "#a26769", // 弁柄 — ds:allow 分析カテゴリ専用
  "#8d7ba5", // 藤 — ds:allow 分析カテゴリ専用
  "#a3a380", // 利休 — ds:allow 分析カテゴリ専用
  "#c2a878", // 芥子 — ds:allow 分析カテゴリ専用
  "#7d99b8", // 縹 — ds:allow 分析カテゴリ専用
  "#9a8c78", // 胡桃 — ds:allow 分析カテゴリ専用
  "#78909c", // 鈍色 — ds:allow 分析カテゴリ専用
  "#b39c8f", // 桜鼠 — ds:allow 分析カテゴリ専用
  "#86a67c", // 苔 — ds:allow 分析カテゴリ専用
];

/** 既知の語への固定色 (use) */
const USE_FIXED: Record<string, string> = {
  rentable: "#6ba292", // ds:allow 上の分析カテゴリパレットと同じ固定割当
  exclusive: "#b08968", // ds:allow 上の分析カテゴリパレットと同じ固定割当
  common: "#6d8ca0", // ds:allow 上の分析カテゴリパレットと同じ固定割当
};

// テーマ (light/dark) 追従のため、値の捕捉ではなく呼出時にトークンを読む
export const unsetColor = () => token("--wash-2");
export const voidColor = () => token("--wash-1");
/** 選択の関係線 = mineral。選択面は各ビュー側で --selection-bg を重ねる。 */
export const selectColor = () => token("--selection-line");
/** 経路は分析結果なので cinnabar ではなく drawing の導出線を使う。 */
export const routeColor = () => token("--drawing-derived");

export class ColorAssigner {
  private map = new Map<string, string>();
  private next = 0;
  constructor(fixed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(fixed)) this.map.set(k, v);
  }
  color(key: string | undefined): string {
    if (key === undefined) return unsetColor();
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
  /**
   * 空間のパスから色を引く。**形の側 (`Form`) はパスしか持たない** — 立体を組む側は
   * `Space` を持たないので、色はここを通る (ADR-0007)
   */
  byPath(path: string): string;
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
  const colorOf = (s: Space) => (s.type === "void" ? voidColor() : assigner.color(keyOf(s)));
  const paths = new Map(spaces.map((s) => [s.path, s] as const));
  return {
    mode,
    colorOf,
    byPath: (path: string) => {
      const s = paths.get(path);
      return s ? colorOf(s) : unsetColor();
    },
    legend,
  };
}
