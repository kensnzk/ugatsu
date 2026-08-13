// 色 — 開かれた語彙に対して安定した割当を行う。
// 既知の語には固定色、未知の語には出現順でパレットから割り当てる (同一モデル内で安定)。
//
// **軸は三つではなく、二つ + 書かれた鍵である。**muro 1.3 で `use` が廃された (koyu ADR-0061)。
// `use` は用途ではなく集計軸であり、一つしか書けないので、賃貸区分と防火区画と部門が
// 同じ鍵を奪い合っていた。いま用途は**型の位置**が持ち、それ以外の区分は名前空間つきの
// 鍵 (`lease.category` `fire.compartment` `dept.name` …) が各自持つ。
//
// **既定の鍵は持たない。**既定を置けば、廃したはずの「特権的な集計軸」がそのまま戻る
// (ADR-0061 決定6)。色分けの第三の軸は、モデルに**実際に書かれている**鍵から利用者が選ぶ。
import { effectiveAttr, isVoid, type Model, type Space } from "@kensnzk/koyu/model";
import { isNamespaced } from "@kensnzk/koyu/vocabulary";
import { token } from "./theme.js";

/**
 * 色分けの軸。`type` は室の目的、`level` は階、`attr:<鍵>` は書かれた区分である。
 * 文字列一つで表すのは、状態にも `<Select>` の値にもそのまま載るからである。
 */
export type ColorMode = "type" | "level" | `attr:${string}`;

export const ATTR_MODE_PREFIX = "attr:";

/** その軸が読む属性の鍵 (`attr:` 以外なら undefined) */
export const attrKeyOf = (mode: ColorMode): string | undefined =>
  mode.startsWith(ATTR_MODE_PREFIX) ? mode.slice(ATTR_MODE_PREFIX.length) : undefined;

/**
 * そのモデルに**書かれている**名前空間つきの鍵。色分けと面積表の集計軸の母集団になる。
 *
 * 名前空間つき (`a.b`) に限るのは、それが koyu の言う「担ぎの層」— 誰でも書いてよく、
 * core が意味を与えない鍵 — そのものだからである (koyu ADR-0033 / ADR-0061 決定2)。
 * `h` や `daylight` や `name` は区分ではないので入らない。
 */
export function carriedKeys(model: Model): string[] {
  const keys = new Set<string>();
  for (const s of model.spaces.values()) {
    for (const k of Object.keys(s.attrs)) if (isNamespaced(k)) keys.add(k);
  }
  for (const z of model.zones.values()) {
    for (const k of Object.keys(z.attrs)) if (isNamespaced(k)) keys.add(k);
  }
  return [...keys].sort();
}

/* 空間の色分け (型/レベル/区分) はカテゴリカルなデータ配色で、DSのUIトークンには無い語彙。
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

// **固定色の表は持たない。**かつて `rentable` / `exclusive` / `common` の三語に色を固定して
// おり、それは賃貸の語彙を ugatsu の側で特権化することだった。muro 1.3 がその特権を
// 言語から外した以上、色の側にだけ残す理由が無い (koyu ADR-0061 が名指しした下流の一つが
// まさにこの表である)。いまはどの語も出現順でパレットから取る。

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
  const assigner = new ColorAssigner();
  const key = attrKeyOf(mode);
  // `attr:` の解決は koyu が持つ — 自分の宣言、無ければパスが前方一致する最も深いゾーン。
  // **鍵を名乗るのは呼ぶ側であり、core は意味を作らない** (koyu ADR-0061 決定7)
  const keyOf = (s: Space): string | undefined =>
    key !== undefined
      ? valueText(effectiveAttr(model, s, key))
      : mode === "type"
        ? s.type
        : s.level;

  const seen = new Set<string>();
  const legend: Array<[string, string]> = [];
  // レベルはz順、それ以外は空間の宣言順で安定させる
  const spaces = [...model.spaces.values()].filter((s) => s.rects.length > 0);
  if (mode === "level") {
    spaces.sort((a, b) => (model.levels[a.level ?? ""]?.z ?? 0) - (model.levels[b.level ?? ""]?.z ?? 0));
  }
  for (const s of spaces) {
    // 吹抜けは宣言 (`void:1`) であって型の語ではない — 型の位置から構造を読まない
    // (koyu ADR-0051 / muro 1.1 以降)
    if (isVoid(s)) continue;
    const k = keyOf(s);
    if (k !== undefined && !seen.has(k)) {
      seen.add(k);
      legend.push([k, assigner.color(k)]);
    }
  }
  const colorOf = (s: Space) => (isVoid(s) ? voidColor() : assigner.color(keyOf(s)));
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

/** 属性の値を凡例の文字へ。**数も真偽も書かれたとおりに出す** (`dept.name:2024` は 2024) */
const valueText = (v: unknown): string | undefined => (v === undefined ? undefined : String(v));
