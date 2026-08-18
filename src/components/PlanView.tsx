// 平面ビュー — **`Form` を描くだけ**である。
//
// 形の規則はここに一つも無い (koyu ADR-0040)。壁の厚みも、開口で割られた区間も、扉の
// 吊元と軌跡も、階段がどこで切れるかも、上部吹抜けの投影も、`formOf(model)` が返す `Form`
// に既に入っている。ここが持つのは色・線幅・線種・文字寸・記号・余白 — すべて見た目である。
//
// 座標はmm・y反転のみ (scale=1)。壁は境界から導出される — 壁を描く操作はここにも無い。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { displayName, type Pt } from "@kensnzk/koyu/model";
import { buildColors, routeColor, selectColor } from "../lib/colors.js";
import { Radio } from "../lib/ds.js";
import { formOf } from "../lib/form.js";
import { polyBounds, polygonAreaM2 } from "../lib/koyu-compat.js";
import { planMarks, sceneOf, type Mark, type MarkRole } from "@kensnzk/koyu/draw";
import { planWords } from "../lib/planWords.js";
import { token } from "../lib/theme.js";
import { writtenOf } from "@kensnzk/koyu/draw";
import { levelsWithRooms, routePaths, useViewer } from "../state/store.js";
import { Dropdown } from "./Dropdown.js";
import { Legend } from "./Legend.js";
import { ToolIcon } from "./ui.js";

const M = 1680; // 余白 mm

interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  W: number;
  H: number;
}

export function PlanView() {
  const model = useViewer((s) => s.model);
  const modelKey = useViewer((s) => s.modelKey);
  const fitKey = useViewer((s) => s.fitKey);
  const planLevel = useViewer((s) => s.planLevel);
  const colorMode = useViewer((s) => s.colorMode);
  const selected = useViewer((s) => s.selected);
  const hovered = useViewer((s) => s.hovered);
  const route = useViewer((s) => s.route);
  const showGrid = useViewer((s) => s.showGrid);
  const select = useViewer((s) => s.select);
  const hover = useViewer((s) => s.hover);
  const setPlanLevel = useViewer((s) => s.setPlanLevel);
  const setShowGrid = useViewer((s) => s.setShowGrid);
  const theme = useViewer((s) => s.theme);

  // structure=line / state=wash / space=blank を作図セマンティックから毎回導出する。
  const DRAWING = token("--drawing-line"); // 壁・建具
  const PAPER = token("--bg-canvas"); // 図面の地
  const GRID = token("--drawing-line-muted"); // 任意表示の通り芯
  const FAINT = token("--drawing-line-muted"); // 吹抜け・開放・分節
  const LABEL = token("--ink"); // 主ラベル
  const SUBTLE = token("--ink-3"); // 敷地境界・注記
  const DERIVED = token("--drawing-derived"); // seg帯と導出表記

  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vb: { x: number; y: number; w: number; h: number }; moved: boolean } | null>(null);

  const colors = useMemo(
    () => (model ? buildColors(model, colorMode) : null),
    [model, colorMode, modelKey, theme],
  );
  const levels = useMemo(() => (model ? levelsWithRooms(model) : []), [model, modelKey]);

  // **形はここで一度だけ導く。**立体ビューと同じ `Form` を見る (src/lib/form.ts)
  const form = useMemo(() => (model ? formOf(model) : null), [model, modelKey]);

  /** そのレベルに引く印。Form の 2Dエンティティを写しただけのもの */
  const marks = useMemo(
    () => (form && planLevel ? planMarks(form, planLevel) : []),
    [form, planLevel],
  );
  const byRole = useMemo(() => {
    const m = new Map<MarkRole, Mark[]>();
    for (const k of marks) {
      const bucket = m.get(k.role);
      if (bucket) bucket.push(k);
      else m.set(k.role, [k]);
    }
    return m;
  }, [marks]);
  const of = (role: MarkRole): Mark[] => byRole.get(role) ?? [];

  const rooms = useMemo(
    () => (form && planLevel ? form.spaces.filter((s) => s.level === planLevel) : []),
    [form, planLevel],
  );

  // 敷地形状 (ADR-0011) は**地面に接する階**の平面 (配置図兼用) に敷地境界線として描く。
  // 「最下階」ではない — 地下のある建物ではそれが地下二階になり、敷地が地下の平面に載る。
  // どの階が地面に接するかは koyu が言う (`sceneOf(form).ground`)
  const ground = useMemo(() => (form ? sceneOf(form).ground : undefined), [form]);
  const sitePolys = useMemo(() => {
    if (!form || !planLevel) return [];
    return planLevel === ground ? form.site : [];
  }, [form, planLevel, ground]);

  const extent: Extent | null = useMemo(() => {
    if (rooms.length === 0) return null;
    // 上部吹抜けの投影は下階の輪郭の外へ出うるので、紙面の範囲に含める
    const pts: Pt[] = [
      ...rooms.flatMap((s) => s.outline.flat()),
      ...marks.filter((k) => k.role === "void-above").flatMap((k) => k.polygon ?? []),
      ...sitePolys.flatMap((p) => p.points),
    ];
    if (pts.length === 0) return null;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    return { minX, maxX, minY, maxY, W: maxX - minX + M * 2, H: maxY - minY + M * 2 };
  }, [rooms, marks, sitePolys]);

  // ズームのリセット (レベル・ファイル切替)
  useEffect(() => setVb(null), [planLevel, fitKey]);

  // ホイールズーム (native: Reactのwheelはpassiveのため)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !extent) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      setVb((prev) => {
        const cur = prev ?? { x: 0, y: 0, w: extent.W, h: extent.H };
        const px = cur.x + ((e.clientX - rect.left) / rect.width) * cur.w;
        const py = cur.y + ((e.clientY - rect.top) / rect.height) * cur.h;
        const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
        const w = Math.min(Math.max(cur.w * k, extent.W / 40), extent.W * 3);
        const h = (w / cur.w) * cur.h;
        return { x: px - ((px - cur.x) / cur.w) * w, y: py - ((py - cur.y) / cur.h) * h, w, h };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [extent]);

  if (!model || !form || !planLevel || !extent || !colors) {
    return <div className="empty-view">レベルに領域を持つ空間がありません</div>;
  }

  const sx = (x: number) => x - extent.minX + M;
  const sy = (y: number) => extent.maxY - y + M;
  const view = vb ?? { x: 0, y: 0, w: extent.W, h: extent.H };
  const onRoute = routePaths(route);

  const wasClick = () => !(drag.current?.moved ?? false);
  const d2 = (poly: Pt[]): string =>
    poly.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`).join(" ") + " Z";
  const lines = (k: Mark, key: string, stroke: string, w: number, dash?: string): ReactNode => (
    <g key={key} stroke={stroke} strokeWidth={w} {...(dash ? { strokeDasharray: dash } : {})}>
      {(k.lines ?? []).map((g, i) => (
        <line key={i} x1={sx(g.x1)} y1={sy(g.y1)} x2={sx(g.x2)} y2={sy(g.y2)} />
      ))}
    </g>
  );

  // ---- 空間の面 (Form の class:cut / of:space) ----
  const roomFills: ReactNode[] = [];
  const selectionMarks: ReactNode[] = []; // 壁より上の層に描く
  for (const [i, k] of [...of("space"), ...of("space-semi-outdoor")].entries()) {
    const faint = k.role === "space-semi-outdoor";
    const isSel = k.ref === selected;
    roomFills.push(
      <path
        key={`sp${i}`}
        d={d2(k.polygon!)}
        fill={isSel ? token("--selection-bg") : colors.byPath(k.ref)}
        fillOpacity={
          isSel ? 1 : k.ref === hovered ? (faint ? 0.4 : 0.62) : faint ? 0.18 : 0.42
        }
        style={{ cursor: "pointer" }}
        onPointerUp={() => {
          if (wasClick()) select(k.ref === selected ? null : k.ref);
        }}
        onPointerEnter={() => hover(k.ref)}
        onPointerLeave={() => hover(null)}
      />,
    );
  }
  for (const [i, k] of of("space-void").entries()) {
    roomFills.push(
      <path
        key={`vd${i}`}
        d={d2(k.polygon!)}
        fill={k.ref === selected ? token("--selection-bg") : PAPER}
        style={{ cursor: "pointer" }}
        onPointerUp={() => {
          if (wasClick()) select(k.ref === selected ? null : k.ref);
        }}
        onPointerEnter={() => hover(k.ref)}
        onPointerLeave={() => hover(null)}
      />,
    );
  }
  for (const [i, k] of of("void-hatch").entries()) {
    roomFills.push(
      <g key={`vh${i}`} pointerEvents="none">
        {lines(k, `vh${i}l`, FAINT, 16, "120 80")}
      </g>,
    );
  }
  // 選択・経路の輪郭 (導出された凸片ごとに)
  for (const [i, k] of marks.entries()) {
    if (k.role !== "space" && k.role !== "space-semi-outdoor" && k.role !== "space-void") continue;
    const isSel = k.ref === selected;
    if (!isSel && !onRoute.has(k.ref)) continue;
    selectionMarks.push(
      <path
        key={`sel${i}`}
        d={d2(k.polygon!)}
        fill="none"
        stroke={isSel ? selectColor() : routeColor()}
        strokeWidth={isSel ? 70 : 50}
        pointerEvents="none"
      />,
    );
  }

  // ---- 空間のラベル (最大の凸片の中心に置く — 紙面の判断) ----
  const roomLabels: ReactNode[] = [];
  for (const s of rooms) {
    const space = model.spaces.get(s.path);
    if (!space || s.outline.length === 0) continue;
    const poly = [...s.outline].sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a))[0]!;
    const r = polyBounds(poly);
    const cx = sx((r.x1 + r.x2) / 2);
    const cy = sy((r.y1 + r.y2) / 2);
    const small = (r.x2 - r.x1) * (r.y2 - r.y1) < 6e6; // 6㎡未満は控えめに
    roomLabels.push(
      <g key={s.path} pointerEvents="none" textAnchor="middle">
        <text x={cx} y={cy - 80} fontSize={280} fill={LABEL}>
          {displayName(space)}
        </text>
        {!small && (
          <text x={cx} y={cy + 260} fontSize={200} fill={SUBTLE}>
            {/* 吹抜けは宣言 (`void:1`)、型は書かなくてよい自由なラベル (koyu ADR-0051) */}
            {s.void
              ? "吹抜け"
              : [s.type, s.semiOutdoor ? "半屋外" : null, `${s.areaM2?.toFixed(1)}㎡`]
                  .filter(Boolean)
                  .join(" ・ ")}
          </text>
        )}
        {!small && (
          <text x={cx} y={cy + 540} fontSize={170} fill={FAINT}>
            {s.path}
          </text>
        )}
      </g>,
    );
  }

  // ---- 数えない分節 (area) — **書かれた与件**であって導出ではない ----
  const areaMarks: ReactNode[] = [];
  for (const s of rooms) {
    const space = model.spaces.get(s.path);
    for (const [i, a] of (space?.areas ?? []).entries()) {
      const r = a.rect;
      const label = [a.attrs["name"], a.attrs["floor"]]
        .filter((v): v is string => typeof v === "string")
        .join(" ・ ");
      areaMarks.push(
        <g key={`${s.path}#a${i}`} pointerEvents="none">
          <rect
            x={sx(r.x1)}
            y={sy(r.y2)}
            width={r.x2 - r.x1}
            height={r.y2 - r.y1}
            fill={token("--wash-2")}
            fillOpacity={0.55}
            stroke={FAINT}
            strokeWidth={16}
            strokeDasharray="80 60"
          />
          {label && (
            <text x={sx(r.x1) + 120} y={sy(r.y2) + 260} fontSize={170} fill={SUBTLE}>
              {label}
            </text>
          )}
        </g>,
      );
    }
  }

  // ---- 敷地境界線 (一点二点鎖線 — 作図慣習) ----
  const siteMarks: ReactNode[] = sitePolys.map((poly, i) => (
    <path
      key={`site${i}`}
      d={d2(poly.points)}
      fill="none"
      stroke={SUBTLE}
      strokeWidth={22}
      strokeDasharray="280 60 50 60 50 60"
      pointerEvents="none"
    />
  ));

  // ---- 通り芯 (書かれた与件) ----
  const gridMarks: ReactNode[] = [];
  for (const [i, x] of model.grid.X.coords.entries()) {
    if (x < extent.minX - 1 || x > extent.maxX + 1) continue;
    const name = model.grid.X.names[i]!;
    gridMarks.push(
      <g key={`gx${name}`} pointerEvents="none">
        <line x1={sx(x)} y1={M - 520} x2={sx(x)} y2={extent.H - M + 520} stroke={GRID} strokeWidth={16} strokeDasharray="140 60 30 60" />
        <circle cx={sx(x)} cy={M - 800} r={220} fill="none" stroke={GRID} strokeWidth={20} />
        <text x={sx(x)} y={M - 730} textAnchor="middle" fontSize={200} fill={GRID}>
          {name}
        </text>
      </g>,
    );
  }
  for (const [i, y] of model.grid.Y.coords.entries()) {
    if (y < extent.minY - 1 || y > extent.maxY + 1) continue;
    const name = model.grid.Y.names[i]!;
    gridMarks.push(
      <g key={`gy${name}`} pointerEvents="none">
        <line x1={M - 520} y1={sy(y)} x2={extent.W - M + 520} y2={sy(y)} stroke={GRID} strokeWidth={16} strokeDasharray="140 60 30 60" />
        <circle cx={M - 800} cy={sy(y)} r={220} fill="none" stroke={GRID} strokeWidth={20} />
        <text x={M - 800} y={sy(y) + 70} textAnchor="middle" fontSize={200} fill={GRID}>
          {name}
        </text>
      </g>,
    );
  }

  // ---- 壁・開放・手すり・seg ----
  // **欠き取り (壁の黒帯を紙の色で塗り潰して穴に見せる手) は無い。**Form の壁は最初から
  // 開口で割られた区間の列であり、切断面が切ったものだけがここへ来る
  const wallMarks: ReactNode[] = [];
  for (const [i, k] of of("wall").entries()) {
    wallMarks.push(<path key={`w${i}`} d={d2(k.polygon!)} fill={DRAWING} />);
  }
  for (const [i, k] of of("rail").entries()) wallMarks.push(lines(k, `air${i}`, DRAWING, 28));
  for (const [i, k] of of("open").entries()) wallMarks.push(lines(k, `o${i}`, FAINT, 20, "120 80"));
  for (const [i, k] of of("seg").entries()) {
    wallMarks.push(<path key={`s${i}`} d={d2(k.polygon!)} fill={DERIVED} />);
  }
  // seg の仕様は書かれた自由語 — 帯の位置は Form が、言葉はモデルが持つ。
  // 索引から原本へ戻る道は `written.ts` の一本だけである (正準順の並べ替えは一度きり)
  const written = writtenOf(model);
  for (const [i, g] of form.segs.entries()) {
    if (g.level !== planLevel) continue;
    const spec = written.segSpec(g.boundary, g.index);
    if (spec === undefined) continue;
    const h = g.segment.horizontal;
    wallMarks.push(
      <text
        key={`sl${i}`}
        x={sx(g.cx) + (h ? 0 : 160)}
        y={sy(g.cy) + (h ? -140 : 60)}
        textAnchor={h ? "middle" : "start"}
        fontSize={160}
        fill={DERIVED}
      >
        {spec}
      </text>,
    );
  }

  // ---- 開口 (窓の芯線・扉の葉と軌跡・引き戸の戸袋) ----
  const openingMarks: ReactNode[] = [];
  for (const [i, k] of of("window").entries()) openingMarks.push(lines(k, `win${i}`, DRAWING, 20));
  for (const [i, k] of of("door-leaf").entries()) openingMarks.push(lines(k, `dl${i}`, DRAWING, 28));
  for (const [i, k] of of("door-arc").entries()) {
    const a = k.arc!;
    // 掃引方向: 世界の反時計回りは、y を反転した紙の上では時計回りになる
    openingMarks.push(
      <path
        key={`da${i}`}
        d={`M ${sx(a.from.x)} ${sy(a.from.y)} A ${a.r} ${a.r} 0 0 ${a.ccw ? 0 : 1} ${sx(a.to.x)} ${sy(a.to.y)}`}
        fill="none"
        stroke={DRAWING}
        strokeWidth={14}
        strokeDasharray="60 50"
      />,
    );
  }
  for (const [i, k] of of("slide-panel").entries()) openingMarks.push(lines(k, `sp${i}`, DRAWING, 40));
  for (const [i, k] of of("slide-tail").entries()) openingMarks.push(lines(k, `st${i}`, DRAWING, 14));

  // ---- 柱 (位置はどこにも書かれない — 通り芯の交点と床の交わりから現れる) ----
  const columnMarks: ReactNode[] = of("column").map((k, i) => (
    <rect key={`col${i}`} {...rectOf(k.polygon!, sx, sy)} fill={DRAWING} pointerEvents="none" />
  ));

  // ---- 縦動線 — 上る走りは切断線で切れ、その先に下りる走りが見える ----
  const runMarks: ReactNode[] = [];
  for (const [i, k] of of("run-outline").entries()) runMarks.push(lines(k, `ro${i}`, DRAWING, 24));
  for (const [i, k] of of("run-tread").entries()) runMarks.push(lines(k, `rt${i}`, DRAWING, 14));
  for (const [i, k] of of("run-break").entries()) {
    // 切断線 — 作図慣習の平行な二本の斜線。Form が持つのは横切る位置だけである
    for (const [j, g] of (k.lines ?? []).entries()) {
      const dx = g.x2 - g.x1;
      const dy = g.y2 - g.y1;
      const w = Math.hypot(dx, dy) || 1;
      const ux = dy / w;
      const uy = -dx / w;
      const s = Math.min(300, w / 4);
      const off = Math.min(220, s);
      const at = (p: number, q: number) => (
        <line
          key={`${p}`}
          x1={sx(g.x1 + ux * p)}
          y1={sy(g.y1 + uy * p)}
          x2={sx(g.x2 + ux * q)}
          y2={sy(g.y2 + uy * q)}
          strokeWidth={32}
        />
      );
      runMarks.push(
        <g key={`rb${i}#${j}`} stroke={DRAWING}>
          {at(-s - off, s - off)}
          {at(-s + off, s + off)}
        </g>,
      );
    }
  }
  for (const [i, k] of of("run-arrow").entries()) {
    const g = k.lines?.[0];
    if (!g) continue;
    const dx = g.x2 - g.x1;
    const dy = g.y2 - g.y1;
    const len = Math.hypot(dx, dy) || 1;
    const hx = (dx / len) * 420;
    const hy = (dy / len) * 420;
    const px = (-dy / len) * 200;
    const py = (dx / len) * 200;
    runMarks.push(
      <g key={`ra${i}`} stroke={DRAWING} pointerEvents="none">
        <line x1={sx(g.x1)} y1={sy(g.y1)} x2={sx(g.x2)} y2={sy(g.y2)} strokeWidth={20} />
        <path
          d={`M ${sx(g.x2)} ${sy(g.y2)} L ${sx(g.x2 - hx + px)} ${sy(g.y2 - hy + py)} L ${sx(g.x2 - hx - px)} ${sy(g.y2 - hy - py)} Z`}
          fill={DRAWING}
          stroke="none"
        />
        {k.at && (
          <text x={sx(k.at.x) + 90} y={sy(k.at.y) + 90} fontSize={220} fill={DRAWING} stroke="none">
            {planWords(k)}
          </text>
        )}
      </g>,
    );
  }
  for (const [i, k] of of("run-note").entries()) {
    if (!k.at) continue;
    runMarks.push(
      <text key={`rn${i}`} x={sx(k.at.x)} y={sy(k.at.y) + 700} fontSize={200} fill={FAINT} textAnchor="middle" pointerEvents="none">
        {planWords(k)}
      </text>,
    );
  }

  // ---- 上部吹抜けの投影 — 切断面より上のものが下階の平面に落ちる (作図慣習) ----
  const aboveMarks: ReactNode[] = [];
  for (const [i, k] of of("void-above").entries()) {
    aboveMarks.push(
      <g key={`va${i}`} pointerEvents="none">
        <path d={d2(k.polygon!)} fill="none" stroke={FAINT} strokeWidth={20} strokeDasharray="160 100" />
        {k.at && (
          <text x={sx(k.at.x)} y={sy(k.at.y) + 800} textAnchor="middle" fontSize={200} fill={FAINT}>
            {planWords(k)}
          </text>
        )}
      </g>,
    );
  }

  return (
    <div className="plan-view">
      <div className="plan-toolbar">
        <Dropdown icon="layers" label={`レベル切替 (${planLevel})`}>
          {levels.map((l) => (
            <Radio
              key={l}
              name="plan-level"
              value={l}
              checked={l === planLevel}
              onChange={() => setPlanLevel(l)}
              label={l}
            />
          ))}
        </Dropdown>
        <span className="plan-level-now">{planLevel}</span>
        <ToolIcon
          icon="grid"
          label={showGrid ? "通り芯を隠す" : "通り芯を表示"}
          selected={showGrid}
          onClick={() => setShowGrid(!showGrid)}
        />
        {vb && <ToolIcon icon="frame" label="全体" variant="outline" onClick={() => setVb(null)} />}
      </div>
      <svg
        ref={svgRef}
        className="plan-svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        fontFamily={token("--font-sans")}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vb: view, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) > 4) {
            d.moved = true;
            // パンが始まってからキャプチャする (クリックは室側の pointerup に届かせる)
            try {
              (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            } catch {
              /* no-op */
            }
          }
          if (!d.moved) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const k = d.vb.w / rect.width;
          setVb({ x: d.vb.x - dx * k, y: d.vb.y - dy * k, w: d.vb.w, h: d.vb.h });
        }}
        onPointerUp={(e) => {
          const wasDrag = drag.current?.moved ?? false;
          drag.current = null;
          if (!wasDrag && e.target === e.currentTarget) select(null);
        }}
      >
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={PAPER} pointerEvents="none" />
        {roomFills}
        {areaMarks}
        {siteMarks}
        {showGrid && gridMarks}
        <g pointerEvents="none">{columnMarks}</g>
        <g pointerEvents="none">{runMarks}</g>
        <g pointerEvents="none">{wallMarks}</g>
        <g pointerEvents="none">{openingMarks}</g>
        <g pointerEvents="none">{aboveMarks}</g>
        <g pointerEvents="none">{selectionMarks}</g>
        {roomLabels}
        <g pointerEvents="none">
          <text x={M - 1240} y={extent.H - 360} fontSize={240} fill={LABEL}>
            {`${model.name ?? "無題"} — ${planLevel} 平面`}
          </text>
          <text x={extent.W - M + 1240} y={extent.H - 360} textAnchor="end" fontSize={180} fill={GRID}>
            koyu — 空間から生成 (壁芯・mm)
          </text>
        </g>
      </svg>
      <Legend colors={colors} />
    </div>
  );
}

/** 軸に沿った四辺形 (柱) を SVG の rect へ */
function rectOf(
  poly: Pt[],
  sx: (x: number) => number,
  sy: (y: number) => number,
): { x: number; y: number; width: number; height: number } {
  const r = polyBounds(poly);
  return { x: sx(r.x1), y: sy(r.y2), width: r.x2 - r.x1, height: r.y2 - r.y1 };
}
