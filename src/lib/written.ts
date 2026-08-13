// 書かれた自由語を、`Form` の索引から引く。
//
// `Form` は形しか持たない。`spec` (「ガラス」「PW1」…) は**書かれた自由語**であって形ではなく、
// koyu は意味を与えない (koyu ADR-0020)。だから図に出すには原本へ戻る必要があり、戻り道は
// `FormBoundary.boundary` / `FormSeg.boundary` の索引である。
//
// **その索引は宣言順ではなく正準順への添字である** (koyu ADR-0041)。`model.boundaries[i]` を
// 当てると落ちずに別の境界の語を読むので、並べ替えは `koyu-compat` の一箇所に閉じる。
//
// ここが在るもう一つの理由は速さである。かつて `glassSpec` は述語の**中で**
// `canonicalBoundaryOrder(model)` を呼んでおり、境界の数だけ全体を並べ直していた
// (平面の `seg` 注記も同じ)。koyu ADR-0041 が「索引を引き続ける消費者は一度だけ呼んで持て」と
// 名指しで言っている当のことである。**並べ替えはモデル一つにつき一度**になった。
import type { Model } from "@kensnzk/koyu/model";
import { canonicalBoundaryOrder } from "./koyu-compat.js";

export interface Written {
  /** 境界に書かれた `spec` (`FormBoundary.boundary` の索引で引く) */
  boundarySpec(boundary: number): string | undefined;
  /** 数えない分節に書かれた `spec` (`FormSeg` の `boundary` と `index` で引く) */
  segSpec(boundary: number, index: number): string | undefined;
}

const cache = new WeakMap<Model, Written>();

/** そのモデルの自由語の引き。同じモデルには同じ引きを返す (並べ替えは一度だけ) */
export function writtenOf(model: Model): Written {
  const hit = cache.get(model);
  if (hit) return hit;
  const ordered = canonicalBoundaryOrder(model);
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const made: Written = {
    boundarySpec: (b) => str(ordered[b]?.attrs["spec"]),
    segSpec: (b, i) => str(ordered[b]?.segs[i]?.attrs["spec"]),
  };
  cache.set(model, made);
  return made;
}

/**
 * `spec` に「ガラス / カーテンウォール / サッシ / glass」を含む境界を透過で描く述語。
 *
 * **`spec` は自由語である。**語の意味を決めているのは ugatsu であり、これは ugatsu が
 * 意味を作ることに最も近い一点なので、形の外に置いて述語として渡す (docs/scope.md §5.2)。
 */
export function glassSpec(model: Model): (b: { boundary: number }) => boolean {
  const written = writtenOf(model);
  return (b) => {
    const v = written.boundarySpec(b.boundary);
    return v !== undefined && /カーテンウォール|ガラス|サッシ|glass/i.test(v);
  };
}
