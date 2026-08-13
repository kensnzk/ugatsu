// 平面の作図 — **`Form` の 2Dエンティティを、ugatsu が引く印へ写すだけ**である。
//
// 形の規則はここに一つも無い。壁の厚みも、開口で割られた区間も、扉の軌跡の中心と半径と
// 掃き方向も、階段がどこで切れるかも、上部吹抜けの投影も、koyu の `derive(model)` が返す
// `Form` に既に入っている (koyu ADR-0040 / docs/reference/form)。
//
// ここが決めるのは**見た目**である — 何を引き、何を省き、どの線を太くし、どの言葉を注記に
// 置くか。`Form` は色も線種も注記の言葉も持たない (koyu docs/reference/scope.md) ので、"UP" も
// 「上部吹抜け」も、この頁で初めて生まれる。
//
// **平面は純粋な断面ではない。**扉の軌跡・上部吹抜けの投影・切断線・下りる走りは、立体を
// どれだけ正確に切っても出てこない。だから Form は平面を分類つきのエンティティ集合として
// 渡し、この頁はその分類 (cut / below / above / swing / anchor) を読む。
//
// **帯を厚みのある四辺形へ起こす式は koyu が持つ。**`Form` が持つのは芯線と厚みと z であり、
// そこから実体を組む規則も導出の一部なので唯一の実装が koyu にある (koyu ADR-0058)。
// かつてこの頁は同じ式を書き写していた — 「壁厚 100mm が四箇所に別々のリテラルとして
// 書かれていた」のと同じ壊れ方である。
import { band, type Form, type FormOpening, type Seg2 } from "@kensnzk/koyu/form";
import type { Pt } from "@kensnzk/koyu/model";
import { polyBounds, slopeText } from "./koyu-compat.js";

/** 印の役 — 線の太さも色も PlanView が役から決める */
export type MarkRole =
  /** 空間の面 (切断面が気積を切った姿) */
  | "space"
  /** 吹抜けの面 */
  | "space-void"
  /** 吹抜けの対角破線 (作図慣習) */
  | "void-hatch"
  /** 切断された壁の断面 */
  | "wall"
  /** 遮蔽しない物 (手すり・柵) の芯線 */
  | "rail"
  /** 開放的な分節 */
  | "open"
  /** 数えない分節 (seg) の帯 */
  | "seg"
  /** 窓の芯線 */
  | "window"
  /** 扉の葉 */
  | "door-leaf"
  /** 扉の軌跡 (1/4円) */
  | "door-arc"
  /** 引き戸の戸袋のパネル */
  | "slide-panel"
  /** 引き戸の控えの線 */
  | "slide-tail"
  /** 柱 */
  | "column"
  | "run-outline"
  | "run-tread"
  /** 切断線 (走りを横切る位置。二本の斜線にするのは PlanView) */
  | "run-break"
  | "run-arrow"
  | "run-note"
  /** 上部吹抜けの投影 (切断面より上のものが下階の平面に落ちる) */
  | "void-above";

export interface MarkArc {
  cx: number;
  cy: number;
  r: number;
  from: Pt;
  to: Pt;
  ccw: boolean;
}

export interface Mark {
  role: MarkRole;
  /** Form の対象の同一性 (空間はそのパス、境界・開口・柱・走りは Form の ref) */
  ref: string;
  polygon?: Pt[];
  lines?: Seg2[];
  arc?: MarkArc;
  /** 記号・注記を置く座 */
  at?: Pt;
  /** 注記の言葉 — **Form は言葉を持たない。**ここで初めて生まれる */
  text?: string;
  /** 淡く引く (半屋外の面) */
  faint?: boolean;
  /** 下りる走り (切断面より下の見えがかり) */
  below?: boolean;
}

/** 切断面より上の壁 (垂れ壁) と、開口の下の壁 (腰壁) は平面に出さない — 省く判断は見た目である */
const DROPPED_BOUNDARY_CLASSES = new Set(["above", "below"]);

/** 引き戸の戸袋の壁面からの控え mm (作図表現) */
const SLIDE_OFFSET = 110;

/**
 * そのレベルの平面に引く印を、`Form` から組む。**モデルは見ない** —
 * 書かれた与件 (通り芯・`area` の枠・空間の名) は PlanView が別に引く。
 */
export function planFigure(form: Form, level: string): Mark[] {
  const plan = form.plans.find((p) => p.level === level);
  if (!plan) return [];
  const marks: Mark[] = [];
  const spaces = new Map(form.spaces.map((s) => [s.path, s]));
  const boundaries = new Map(form.boundaries.map((b) => [b.ref, b]));
  const openings = new Map(form.openings.map((o) => [o.ref, o]));
  const runs = new Map(form.runs.map((r) => [r.path, r]));

  // ---- 空間の面 ----
  for (const e of plan.entities) {
    if (e.of !== "space" || e.class !== "cut" || !e.polygon) continue;
    const s = spaces.get(e.ref);
    // 吹抜けかどうかは**宣言** (`void:1`) であって型の語ではない (koyu ADR-0051 / muro 1.1)。
    // `Form` はその事実を `FormSpace.void` として持って届く
    if (s?.void) {
      const r = polyBounds(e.polygon);
      marks.push({ role: "space-void", ref: e.ref, polygon: e.polygon });
      marks.push({
        role: "void-hatch",
        ref: e.ref,
        lines: [
          { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 },
          { x1: r.x1, y1: r.y2, x2: r.x2, y2: r.y1 },
        ],
      });
      continue;
    }
    marks.push({
      role: "space",
      ref: e.ref,
      polygon: e.polygon,
      ...(s?.semiOutdoor ? { faint: true } : {}),
    });
  }

  // ---- 境界 ----
  // 物があるなら**開口で割られた区間**が来るので、「黒帯を紙の色で塗り潰して穴に見せる」
  // 欠き取りは要らない (koyu ADR-0040)。
  //
  // **物があるかどうかを言うのは `polygon` の有無である。**区間は足あと (厚みのある四辺形) と
  // 芯線の**両方**を持って届き、どちらで描くかは見た目の判断として消費者に残されている
  // (koyu ADR-0058)。だから `lines` を先に見てはならない — 見れば壁がすべて「物を持たない
  // 境界」の枝へ落ち、**黒帯が一本も出ないまま破線の細線になる**。実際にそうなっていた。
  for (const e of plan.entities) {
    if (e.of !== "boundary") continue;
    const b = boundaries.get(e.ref);
    if (!e.polygon) {
      // 物を持たない境界 (open) — 芯線だけが来る
      if (e.lines) marks.push({ role: "open", ref: e.ref, lines: e.lines });
      continue;
    }
    if (e.class === "above") continue; // 垂れ壁 — 切断面より上
    if (b?.air) {
      // 遮蔽しない物: 厚みではなく一本の細実線で描く (囲われていないことが図から読める)。
      // 芯線は Form が持っているので、足あとから割り戻さない
      if (e.lines) marks.push({ role: "rail", ref: e.ref, lines: e.lines });
      continue;
    }
    if (DROPPED_BOUNDARY_CLASSES.has(e.class)) continue; // 腰壁 — 開口の下
    marks.push({ role: "wall", ref: e.ref, polygon: e.polygon });
  }

  // ---- 数えない分節 (seg) — 面積にもグラフにも出ないが、位置は導出される ----
  for (const g of form.segs) {
    if (g.level !== level) continue;
    marks.push({ role: "seg", ref: g.ref, polygon: band(g.segment, g.cx, g.cy, g.w, g.t) });
  }

  // ---- 開口 ----
  for (const e of plan.entities) {
    if (e.of !== "opening") continue;
    const o = openings.get(e.ref);
    if (!o) continue;
    if (e.class === "swing") {
      if (o.sliding) {
        marks.push(...slideMarks(o));
        continue;
      }
      if (e.lines) marks.push({ role: "door-leaf", ref: e.ref, lines: e.lines });
      if (e.arc) marks.push({ role: "door-arc", ref: e.ref, arc: e.arc });
      continue;
    }
    if (o.kind !== "door" && e.lines) marks.push({ role: "window", ref: e.ref, lines: e.lines });
  }

  // ---- 柱 (位置はどこにも書かれない。通り芯の交点と床の交わりから現れる) ----
  for (const e of plan.entities) {
    if (e.of === "column" && e.polygon) marks.push({ role: "column", ref: e.ref, polygon: e.polygon });
  }

  // ---- 縦動線 — 上る走りは切断線で切れ、その先に下りる走りが見える ----
  for (const e of plan.entities) {
    if (e.of !== "run") continue;
    const below = e.class === "below";
    if (e.role === "outline" && e.lines) marks.push({ role: "run-outline", ref: e.ref, lines: e.lines, below });
    else if (e.role === "tread" && e.lines) marks.push({ role: "run-tread", ref: e.ref, lines: e.lines, below });
    else if (e.role === "break" && e.lines) marks.push({ role: "run-break", ref: e.ref, lines: e.lines });
    else if (e.role === "arrow" && e.lines) {
      marks.push({
        role: "run-arrow",
        ref: e.ref,
        lines: e.lines,
        ...(e.anchor ? { at: { x: e.anchor.x, y: e.anchor.y } } : {}),
        text: e.anchor?.up ? "UP" : "DN",
        below,
      });
    } else if (e.class === "anchor" && e.anchor) {
      const r = runs.get(e.ref);
      if (!r) continue;
      marks.push({
        role: "run-note",
        ref: e.ref,
        at: { x: e.anchor.x, y: e.anchor.y },
        text:
          r.device === "stair"
            ? `${r.risers}段 蹴上${Math.round(r.riser)}/踏面${Math.round(r.tread)}`
            : `${r.lanes > 1 ? `${r.lanes}台 ` : ""}勾配 ${slopeText(r.slope)}`,
      });
    }
  }

  // ---- 上部吹抜けの投影 — 下階の平面に上階の吹抜けが破線で落ちる ----
  for (const e of plan.entities) {
    if (e.class !== "above" || e.of !== "space" || !e.polygon) continue;
    const r = polyBounds(e.polygon);
    marks.push({
      role: "void-above",
      ref: e.ref,
      polygon: e.polygon,
      at: { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 },
      text: "上部吹抜け",
    });
  }

  return marks;
}

/** 引き戸・自動扉: 開き軌跡ではなく、吊元側の控え (戸袋側) にパネルを描く */
function slideMarks(o: FormOpening): Mark[] {
  const sw = o.swing;
  if (!sw) return [];
  const { hinge } = sw;
  const u = unit(hinge, sw.leaf, o.w); // 開く側へ
  const a = unit(hinge, sw.jamb, o.w); // 線分に沿って
  const s1 = {
    x: hinge.x - a.x * o.w + u.x * SLIDE_OFFSET,
    y: hinge.y - a.y * o.w + u.y * SLIDE_OFFSET,
  };
  const s2 = { x: hinge.x + u.x * SLIDE_OFFSET, y: hinge.y + u.y * SLIDE_OFFSET };
  return [
    { role: "slide-panel", ref: o.ref, lines: [{ x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y }] },
    { role: "slide-tail", ref: o.ref, lines: [{ x1: s2.x, y1: s2.y, x2: hinge.x, y2: hinge.y }] },
  ];
}

const unit = (from: Pt, to: Pt, len: number): Pt => ({
  x: (to.x - from.x) / (len || 1),
  y: (to.y - from.y) / (len || 1),
});

// **芯線を足あとから割り戻す関数はもう無い。**`Form` の境界エンティティが芯線を
// そのまま持って届くので (koyu ADR-0058)、四辺形の頂点から中点を取り直す必要がない。
