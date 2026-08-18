// 書かれた自由語の**意味**を決める一点 — ugatsu がここでだけ語を読む。
//
// 索引から原本へ戻る道 (`writtenOf`) は koyu が持つようになった (koyu 0.24 / `@kensnzk/koyu/draw`)。
// 正準順の並べ替えはモデル一つにつき一度で、配列そのものは渡ってこないので、
// `model.boundaries[i]` を当てて別の境界の語を読む事故は起こしようがない (koyu ADR-0041)。
// ここに残るのは koyu が決して持たないもの — **語の意味の判断**である。
import type { Model } from "@kensnzk/koyu/model";
import { writtenOf } from "@kensnzk/koyu/draw";

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
