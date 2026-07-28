// 形の唯一の入口 (koyu ADR-0040 / spec/derivation.md)。
//
// **ugatsu は形を組み立てない。**平面も立体も 2.5D も、ここが返す一つの `Form` を描くだけで
// ある。かつては `PlanView` と `buildScene` が `segmentsFor` `placeOpening` `placeBand`
// `slabs` `columnsFor` `runSolids` `runDrawsForLevel` を**別々に呼んで自分で組み立てて**
// おり、同じ部品から違う形が出る余地が構造的に残っていた — 実際に上部吹抜けの投影が
// 平面から 11 件落ち、壁厚の既定 100mm は四箇所に別々のリテラルとして書かれていた。
//
// 呼び出しが一つであることそのものが、その余地を閉じる。
//
// 導出は同じモデルに対して一度だけ行う。モデルは再合成のたびに新しい実体になるので、
// WeakMap の鍵にちょうどよい (古いモデルの Form は一緒に回収される)。
import { derive, type Form, type Model } from "@kensnzk/koyu";

const cache = new WeakMap<Model, Form>();

/** モデルの形。同じモデルには同じ `Form` を返す — 平面と立体が別の形を見ることはない */
export function formOf(model: Model): Form {
  const hit = cache.get(model);
  if (hit) return hit;
  const form = derive(model);
  cache.set(model, form);
  return form;
}
