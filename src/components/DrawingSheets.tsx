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
  const push = (id: string, title: string, make: () => string): void => {
    try {
      out.push({ id, title, svg: make() });
    } catch {
      // 描けない図は組に入らない。理由はモデル側にあり、check / validate が言う
    }
  };

  for (const level of levelsWithRooms(model)) {
    push(`plan-${level}`, `${level} 平面図`, () => svgPlan(model, { level }));
  }

  const x = cutAt(model, "X");
  const y = cutAt(model, "Y");
  push("section-x", `断面図 ${x.atRef ?? "X中央"} 西を見る`, () =>
    svgSection(model, { axis: "X", at: x.at, ...(x.atRef ? { atRef: x.atRef } : {}), look: "W" }),
  );
  push("section-y", `断面図 ${y.atRef ?? "Y中央"} 北を見る`, () =>
    svgSection(model, { axis: "Y", at: y.at, ...(y.atRef ? { atRef: y.atRef } : {}), look: "N" }),
  );

  for (const face of ["S", "E", "N", "W"] as const) {
    push(`elevation-${face}`, `${FACE_LABEL[face]}立面図`, () => svgElevation(model, { face }));
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
            {/* SVG は viewBox を持つので、幅を紙に合わせれば高さは追従する */}
            <div className="sheet-paper" dangerouslySetInnerHTML={{ __html: s.svg }} />
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
