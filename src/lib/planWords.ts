// 図面の言葉 — **koyu が持たないもの、ここにしか無いもの。**
//
// `planMarks` が届ける印は、座 (`at`) と丸めない事実 (`note`) までしか持たない。"UP" と "DN"、
// 「上部吹抜け」、「12段 蹴上180/踏面240」、勾配の "1/8" は、どれも言葉であって形ではない
// (koyu docs/reference/form/marks.md)。同じ建物を英語で描く消費者は別の綴りを選ぶし、
// 丸めをどこでやるかも選ぶ — 1/12.5 を "1/13" と書くかどうかは、この頁の判断である。
import type { Mark } from "@kensnzk/koyu/draw";

/** 勾配を図面の綴りへ — `1/8`。**丸めはここでやる。**Form は割り切れない数のまま届ける */
export function slopeText(slope: number): string {
  if (slope <= 0) return "—";
  return `1/${(1 / slope).toFixed(1).replace(/\.0$/, "")}`;
}

/** 印に添える言葉。持たない印には何も無い */
export function planWords(k: Mark): string | undefined {
  if (k.role === "void-above") return "上部吹抜け";
  const n = k.note;
  if (!n) return undefined;
  if (n.of === "direction") return n.up ? "UP" : "DN";
  if (n.of === "stair") {
    return `${n.risers}段 蹴上${Math.round(n.riser)}/踏面${Math.round(n.tread)}`;
  }
  return `${n.lanes > 1 ? `${n.lanes}台 ` : ""}勾配 ${slopeText(n.slope)}`;
}
