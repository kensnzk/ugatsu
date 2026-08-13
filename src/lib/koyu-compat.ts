// koyu が 0.18〜0.21 の公開面切り出し (koyu ADR-0037 / ADR-0053) で**取り下げた**名のうち、
// ugatsu がまだ要るもの。ここが唯一の置き場であり、koyu が出し直した日に消える頁である。
//
// 三種類あって、種類が違うことが重要である。
//
//   ・**公開APIに置き換わったもの** — `siteReport` は `@kensnzk/koyu/analysis` の
//     `runAnalysis(model, SITE_ANALYSIS_ID, …)` になった。数 (面積・建蔽率・接道長) も
//     丸めも koyu の側で決まるので、ここは形を写す転写であって計算の写しではない。
//     **判定は読まない** — `assess` ではなく `runAnalysis` を呼ぶのは、ugatsu が
//     `Finding` を一つも持たないためである (docs/scope.md §4)
//   ・**小さな幾何、移植** — `polyBounds` / `polygonAreaM2` / `slopeText`。どれも数行で、
//     koyu の中では別名 (`poly.bounds` / `poly.area`) で今も生きている。
//     `slopeText` は**そもそも注記の言葉**であり、ugatsu が持つのが筋である (§5.3)
//   ・**移植して、koyu に対して縛ったもの** — `canonicalBoundaryOrder` は
//     `FormBoundary.boundary` の索引がどの境界を指すかを決める (koyu ADR-0041)。
//     間違えても落ちずに**別の壁の spec を読む**だけなので、`derive` の出力に対して
//     同梱例すべてで突き合わせる (`test/koyu-compat.test.ts`)。並びがずれた日に落ちる
//
// **koyu 自身の文書は、これが公開面に在ると今も書いている**
// (docs/reference/form/index.md — "`canonicalBoundaryOrder(model)` is public precisely so
// consumers never index `model.boundaries[i]`")。文書と実装が食い違っている側であり、
// 出し直されたらこの頁の当該部分は消す。
import { runAnalysis } from "@kensnzk/koyu/analysis";
import type { Boundary, Model, Pt } from "@kensnzk/koyu/model";
import { createAssessmentRegistry } from "@kensnzk/koyu/validate";
import {
  SCHEMATIC_ANALYSES,
  SCHEMATIC_PROFILE,
  SCHEMATIC_PROFILE_ID,
  SCHEMATIC_RULE_SET,
  SITE_ANALYSIS_ID,
} from "@kensnzk/koyu/validate/builtin";

/* ------------------------------------------------------------------ */
/* 幾何 — koyu の `core/poly` にある式そのもの                          */
/* ------------------------------------------------------------------ */

/** 頂点列の外接矩形 (koyu `poly.bounds`) */
export function polyBounds(pts: Pt[]): { x1: number; y1: number; x2: number; y2: number } {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of pts) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  return { x1, y1, x2, y2 };
}

/** 多角形の面積 m² (シューレース。koyu `polygonAreaM2`) */
export function polygonAreaM2(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j]!.x * pts[i]!.y - pts[i]!.x * pts[j]!.y;
  }
  return Math.abs(a / 2) / 1e6;
}

/** 勾配を図面の綴りへ — `1/8`。**これは注記の言葉であって形ではない** (docs/scope.md §5.3) */
export function slopeText(slope: number): string {
  if (slope <= 0) return "—";
  return `1/${(1 / slope).toFixed(1).replace(/\.0$/, "")}`;
}

/* ------------------------------------------------------------------ */
/* 境界の正準順 (koyu ADR-0041)                                        */
/* ------------------------------------------------------------------ */
//
// 宣言順は正準JSONが捨てる情報なので、境界を順に読む導出はこの並びを使う —
// `FormBoundary.boundary` / `FormSeg.boundary` の索引はここへの添字である。
// `model.boundaries[i]` (宣言順) を当てると、静かに別の境界の属性を読む。

/** UTF-16 コード単位を符号位置 (= UTF-8 バイト) の順へ写す */
function utf8Order(u: number): number {
  if (u >= 0xd800 && u <= 0xdfff) return u + 0x2000;
  if (u >= 0xe000) return u - 0x800;
  return u;
}

/** 正準の照合順。**JavaScript の `<` と既定の `sort` はここでは使えない** (koyu ADR-0043) */
export function compareCanonical(a: string, b: string): number {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) return utf8Order(x) < utf8Order(y) ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

// `sortObj` が `Map` を返すのは意図である — `JSON.stringify(new Map())` は `{}` なので、
// 並べ替えの鍵に属性は効かない。koyu の挙動であり、移植は直さずに同じでなければならない
const sortObj = <T,>(o: Record<string, T>): Map<string, T> =>
  new Map(Object.entries(o).sort(([a], [b]) => compareCanonical(a, b)));

function sortBySerial<T>(items: T[]): T[] {
  return items
    .map((it) => [JSON.stringify(it), it] as const)
    .sort(([x], [y]) => compareCanonical(x, y))
    .map(([, it]) => it);
}

type Drawn = Boundary["drawn"];

const canonicalLineEnds = (d: NonNullable<Drawn>): [string, string] =>
  d.a.x < d.b.x || (d.a.x === d.b.x && d.a.y <= d.b.y) ? [d.aRef, d.bRef] : [d.bRef, d.aRef];

const canonicalOpeningEntry = (o: Boundary["openings"][number]): Record<string, unknown> => ({
  kind: o.kind,
  ...(o.ref ? { ref: o.ref } : {}),
  w: o.w,
  ...(o.h !== undefined ? { h: o.h } : {}),
  at: o.atRef ?? o.at,
  ...(o.edge ? { edge: o.edge } : {}),
  ...(o.hinge ? { hinge: o.hinge } : {}),
  ...(o.swing ? { swing: o.swing } : {}),
  ...(Object.keys(o.attrs).length ? { attrs: sortObj(o.attrs) } : {}),
});

const canonicalSegEntry = (g: Boundary["segs"][number]): Record<string, unknown> => ({
  w: g.w,
  at: g.atRef ?? g.at,
  ...(g.edge ? { edge: g.edge } : {}),
  ...(Object.keys(g.attrs).length ? { attrs: sortObj(g.attrs) } : {}),
});

const canonicalBoundaryEntry = (b: Boundary): Record<string, unknown> => ({
  between: [b.a, b.b].sort(compareCanonical),
  a: b.a,
  kind: b.kind,
  ...(b.t !== undefined ? { t: b.t } : {}),
  ...(b.air ? { air: true } : {}),
  ...(b.edge ? { edge: b.edge } : {}),
  ...(b.drawn ? { line: canonicalLineEnds(b.drawn) } : {}),
  ...(Object.keys(b.attrs).length ? { attrs: sortObj(b.attrs) } : {}),
  ...(b.openings.length ? { openings: sortBySerial(b.openings.map(canonicalOpeningEntry)) } : {}),
  ...(b.segs.length ? { segs: sortBySerial(b.segs.map(canonicalSegEntry)) } : {}),
});

/**
 * 境界を koyu が導出するときの順に並べる。
 *
 * **`O(n log n)` の並べ替えを毎回走らせる。**`Form` の索引を引き続ける側は一度だけ呼んで
 * 持つこと (koyu ADR-0041 が名指しで言う) — `src/lib/written.ts` がそうしている。
 */
export function canonicalBoundaryOrder(model: Model): Boundary[] {
  return [...model.boundaries]
    .map((b, i) => ({ b, key: JSON.stringify(canonicalBoundaryEntry(b)), i }))
    .sort((p, q) => compareCanonical(p.key, q.key) || p.i - q.i)
    .map((x) => x.b);
}

/* ------------------------------------------------------------------ */
/* 敷地の問い — `siteReport` が何になったか                             */
/* ------------------------------------------------------------------ */

/** 接道 — 道路空間ごとの幅員と接道長 (mm) */
export interface RoadFrontage {
  path: string;
  name: string;
  width: number;
  frontage: number;
}

/**
 * 敷地の問いへの答え。**数は koyu のもの** — 丸めまで含めて koyu が決めるので、
 * ugatsu と `koyu site` が別々に割って食い違うことはない。
 */
export interface SiteReport {
  /** 敷地 (`site:1` のゾーン、または敷地形状) があるか。無ければ比率に意味がない */
  hasSite: boolean;
  siteName: string | null;
  /** 宣言された敷地面積 m² (測量値) */
  declaredArea?: number;
  /** 導出された敷地面積 m² */
  derivedArea: number;
  /** 面積率の分母 — 宣言があれば宣言、無ければ導出 */
  areaBasis: number;
  footprint: number;
  totalFloor: number;
  coveragePercent?: number;
  floorAreaRatioPercent?: number;
  roads: RoadFrontage[];
}

const EMPTY_SITE: SiteReport = {
  hasSite: false,
  siteName: null,
  derivedArea: 0,
  areaBasis: 0,
  footprint: 0,
  totalFloor: 0,
  roads: [],
};

// 目録は**値**であって登録ではない (koyu ADR-0054) ので、一度組んで持ち回してよい
const REGISTRY = createAssessmentRegistry({
  analyses: SCHEMATIC_ANALYSES,
  ruleSets: [SCHEMATIC_RULE_SET],
  profiles: [SCHEMATIC_PROFILE],
});

// 分析は文脈を明示して走る。組込みの敷地分析は文脈の値を一つも読まないので、
// ここに要るのは「日として整った綴り」だけである
const CONTEXT = { schema: "koyu-context/1", asOf: "2026-01-01", values: {} } as const;

const siteCache = new WeakMap<Model, SiteReport>();

/**
 * 敷地の導出。かつての `siteReport(model)`。
 *
 * **構造が矛盾していると `unavailable` が返る** — 分析は整合したモデルにしか走らない。
 * そのとき ugatsu は敷地の表を出さない。**0 ㎡ と表示するのは嘘である。**
 */
export function siteReport(model: Model): SiteReport {
  const hit = siteCache.get(model);
  if (hit) return hit;
  const made = computeSiteReport(model);
  siteCache.set(model, made);
  return made;
}

function computeSiteReport(model: Model): SiteReport {
  const artifact = runAnalysis(model, SITE_ANALYSIS_ID, {
    registry: REGISTRY,
    profile: SCHEMATIC_PROFILE_ID,
    context: CONTEXT,
  }).result.artifact;
  if (artifact.state === "unavailable") return EMPTY_SITE;
  const m = artifact.value.metrics;
  return {
    // 敷地ゾーンも敷地形状も無いモデルでも延べ面積は出る。**比率が意味を持つかを決めるのは
    // 「敷地があるか」である**
    hasSite: m.siteName !== null || m.polygonVertexCount !== null,
    siteName: m.siteName,
    ...(m.declaredAreaM2 !== null ? { declaredArea: m.declaredAreaM2 } : {}),
    derivedArea: m.derivedAreaM2,
    areaBasis: m.areaBasisM2,
    footprint: m.footprintM2,
    totalFloor: m.totalFloorM2,
    ...(m.coveragePercent !== null ? { coveragePercent: m.coveragePercent } : {}),
    ...(m.floorAreaRatioPercent !== null
      ? { floorAreaRatioPercent: m.floorAreaRatioPercent }
      : {}),
    roads: artifact.value.roads.map((r) => ({
      path: r.roadRef,
      name: r.name,
      width: r.widthMm,
      frontage: r.frontageMm,
    })),
  };
}
