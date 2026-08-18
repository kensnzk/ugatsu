// 図面 — **紙に出す前提の面。**平面・断面・立面を一組にして並べる。
//
// 画面の平面 (`PlanView`) と何が違うのか。あちらは触れる図であり、選択も経路も当たり判定も
// 持ち、見る人の操作に応じて変わる。こちらは**動かない**。koyu が出す SVG をそのまま貼り、
// 一枚を一頁として印刷にかける。PDF にするのはブラウザの印刷であり、ugatsu は版面を作らない。
//
// **図面は koyu のものである。**線の太さも記号も注記の言葉も、`svgPlan` / `svgSection` /
// `svgElevation` が既に決めている。ugatsu がここで足すのは、どの図を何枚組むかという**編成**と、
// 紙の縁だけである。同じモデルから koyu の CLI が出す図と、この頁に出る図は同じものになる —
// 別々に描いていれば必ず食い違う。
import { useMemo } from "react";
import { svgElevation, svgPlan, svgSection } from "@kensnzk/koyu/draw";
import type { Edge, Model } from "@kensnzk/koyu/model";
import { Button } from "../lib/ds.js";
import { downloadText } from "../lib/download.js";
import { levelsWithRooms, useViewer } from "../state/store.js";

interface Sheet {
  id: string;
  title: string;
  svg: string;
  /** 図がこの紙に載っている縮尺の分母 (1/100 なら 100) */
  denom: number;
  /** koyu が出した紙の実寸 px。A3 の px 幅に対する比が、そのまま頁上の占有率になる */
  w: number;
  h: number;
}

// ---- 紙 ----
//
// **紙は一定で、図の縮尺が紙に合わせて変わる。**逆ではない。図面が縮尺を持つのは、
// 紙の上で寸法が読めるためであり、図ごとに紙が伸び縮みしたら読めない。
//
// A3 横。紙の px 密度を決めるのは、koyu の余白が **px で固定** (84px) だからである。
// 4 px/mm なら 84px = 21mm の縁になり、どの図でも同じ幅の縁が付く。既定の 0.05 px/mm で
// 描くと同じ 84px が世界の 1680mm を意味してしまい、小さい建物ほど余白に食われる。
const PAPER_MM = { w: 420, h: 297 };
const PX_PER_PAPER_MM = 4;
/** koyu の余白 84px が、この密度で 21mm になる */
const BORDER_MM = 21;
const USABLE_MM = { w: PAPER_MM.w - BORDER_MM * 2, h: PAPER_MM.h - BORDER_MM * 2 };

/** 図面の縮尺は連続量ではない。**建築の目盛りから選ぶ** */
const SCALES = [20, 30, 50, 100, 150, 200, 250, 300, 500, 1000, 2000, 5000];

/** 試し描きの縮尺。ここから図の実寸 (mm) を割り出す */
const PROBE = 0.05;
/** koyu の余白 px (通り芯記号ぶん) — 試し描きの寸法から図の実寸を引くのに要る */
const KOYU_MARGIN_PX = 84;

const sizeOf = (svg: string): { w: number; h: number } => ({
  w: Number(/width="(\d+(?:\.\d+)?)"/.exec(svg)?.[1] ?? 0),
  h: Number(/height="(\d+(?:\.\d+)?)"/.exec(svg)?.[1] ?? 0),
});

/** 紙に収まる最大の (= 分母が最小の) 標準縮尺。どれにも収まらなければ一番小さいものを返す */
function fitScale(contentMm: { w: number; h: number }): number {
  for (const n of SCALES) {
    if (contentMm.w / n <= USABLE_MM.w && contentMm.h / n <= USABLE_MM.h) return n;
  }
  return SCALES[SCALES.length - 1]!;
}

/** 立面の向きは方位である。綴りは日本語 — **言葉は koyu が持たない** */
const FACE_LABEL: Record<Edge, string> = { N: "北", E: "東", S: "南", W: "西" };

/**
 * 断面を切る位置。**通り芯の上で切る** — 図面には「どこを切ったか」が要るので、
 * 座標ではなく通り芯の名で言えるところを選ぶ。
 *
 * 端の通り芯で切っても何も当たらないので、内側の芯のうち中央に近いものを取る。
 * 内側の芯が無い (二本しかない) モデルでは中間を切り、名は付けない。
 */
function cutAt(model: Model, axis: "X" | "Y"): { at: number; atRef?: string } {
  const g = model.grid[axis];
  const n = g.coords.length;
  if (n >= 3) {
    const i = Math.min(n - 2, Math.max(1, Math.round(n / 2) - 1));
    return { at: g.coords[i]!, atRef: g.names[i]! };
  }
  return { at: ((g.coords[0] ?? 0) + (g.coords[n - 1] ?? 0)) / 2 };
}

/**
 * 一組の図面。**平面が先、断面、立面の順**である — 建物を上から見て、切って、外から見る。
 *
 * 図が一枚も作れないモデル (レベルに空間が無い、など) では koyu が例外を投げるので、
 * 投げた図は組に入れない。**描けなかったことを黙って白紙で埋めない。**
 */
function sheetsOf(model: Model): Sheet[] {
  const out: Sheet[] = [];
  // 二度描く。一度目は図の実寸を知るためだけの試し描きで、それが分かって初めて
  // 「この紙にどの縮尺なら載るか」が決まる。koyu は紙の大きさを引数に取らない —
  // 縮尺を渡すと紙がそれに従って決まる側なので、逆から解く
  const push = (id: string, title: string, make: (scale: number) => string): void => {
    try {
      const probe = sizeOf(make(PROBE));
      const contentMm = {
        w: (probe.w - KOYU_MARGIN_PX * 2) / PROBE,
        h: (probe.h - KOYU_MARGIN_PX * 2) / PROBE,
      };
      const denom = fitScale(contentMm);
      const svg = make(PX_PER_PAPER_MM / denom);
      out.push({ id, title, svg, denom, ...sizeOf(svg) });
    } catch {
      // 描けない図は組に入らない。理由はモデル側にあり、check / validate が言う
    }
  };

  for (const level of levelsWithRooms(model)) {
    push(`plan-${level}`, `${level} 平面図`, (scale) => svgPlan(model, { level, scale }));
  }

  const x = cutAt(model, "X");
  const y = cutAt(model, "Y");
  push("section-x", `断面図 ${x.atRef ?? "X中央"} 西を見る`, (scale) =>
    svgSection(model, { axis: "X", at: x.at, ...(x.atRef ? { atRef: x.atRef } : {}), look: "W", scale }),
  );
  push("section-y", `断面図 ${y.atRef ?? "Y中央"} 北を見る`, (scale) =>
    svgSection(model, { axis: "Y", at: y.at, ...(y.atRef ? { atRef: y.atRef } : {}), look: "N", scale }),
  );

  for (const face of ["S", "E", "N", "W"] as const) {
    push(`elevation-${face}`, `${FACE_LABEL[face]}立面図`, (scale) =>
      svgElevation(model, { face, scale }),
    );
  }

  return out;
}

export function DrawingSheets() {
  const model = useViewer((s) => s.model);
  const modelKey = useViewer((s) => s.modelKey);
  const entry = useViewer((s) => s.entry);

  const sheets = useMemo(() => (model ? sheetsOf(model) : []), [model, modelKey]);

  if (!model) return <div className="empty-view">モデルがありません</div>;
  if (sheets.length === 0) {
    return <div className="empty-view">図にできる階がありません — check が理由を言います</div>;
  }

  const base = entry?.replace(/\.muro$/, "") ?? "model";
  const modelName = model.name ?? base;

  return (
    <div className="drawing-sheets">
      <div className="drawing-bar">
        <span className="drawing-count">{sheets.length} 枚</span>
        <div className="drawing-bar-actions">
          <Button size="sm" variant="ghost" onClick={() => window.print()}>
            印刷 / PDF
          </Button>
        </div>
      </div>
      <div className="drawing-scroll">
        {sheets.map((s) => (
          <figure key={s.id} className="sheet">
            {/* 紙は A3 固定。koyu の SVG は既に「紙 mm × 4px」で出ているので、
                A3 の px 幅に対する比でそのまま置けば、頁上の実寸になる */}
            <div className="sheet-paper">
              <div
                className="sheet-ink"
                style={{ width: `${((s.w / (PAPER_MM.w * PX_PER_PAPER_MM)) * 100).toFixed(3)}%` }}
                dangerouslySetInnerHTML={{ __html: s.svg }}
              />
              {/* 表題欄 — **縮尺は紙に載っていなければならない。**刷った図が縮尺を
                  言えないなら寸法は読めず、図面ではなくなる。位置は頁に固定で、
                  koyu の縁 (21mm) に合わせて置く */}
              <div className="sheet-titleblock">
                <span className="tb-name">{modelName}</span>
                <span className="tb-title">{s.title}</span>
                <span className="tb-scale">S = 1 / {s.denom}</span>
              </div>
            </div>
            <figcaption className="sheet-caption">
              <span>{s.title}</span>
              <button
                type="button"
                className="sheet-download"
                onClick={() => downloadText(`${base}-${s.id}.svg`, s.svg, "image/svg+xml")}
              >
                SVG
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
