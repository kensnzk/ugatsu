// 平面ビュー — core/plan.ts (svgPlan) と同じ作図規約のインタラクティブ版。
// 座標はmm・y反転のみ (scale=1)。壁は境界から導出される — 壁を描く操作はここにも無い。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  areaM2,
  displayName,
  isSemiOutdoor,
  placeBand,
  placeOpening,
  segmentsFor,
  type Boundary,
  type Model,
  type Opening,
  type Segment,
} from "@kensnzk/koyu";
import { buildColors, routeColor, selectColor } from "../lib/colors.js";
import { Button } from "../lib/ds.js";
import { token } from "../lib/theme.js";
import { levelsWithRooms, routePaths, useViewer } from "../state/store.js";
import { Legend } from "./Legend.js";

const M = 1680; // 余白 mm
const WALL_DEFAULT_T = 100;

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
  const select = useViewer((s) => s.select);
  const hover = useViewer((s) => s.hover);
  const setPlanLevel = useViewer((s) => s.setPlanLevel);
  const theme = useViewer((s) => s.theme);

  // 作図色は反転するセマンティックトークンから毎レンダー導出 (light/darkに追従)
  const INK = token("--text-1"); // 墨 (壁・建具・主ラベル)
  const PAPER = token("--bg-canvas"); // 図面の地 = 机 (開口の消し込みも同色)
  const GRID = token("--text-disabled"); // 通り芯
  const FAINT = token("--border-strong"); // 吹抜け・開放・分節の淡い線
  const SUBTLE = token("--text-3"); // 敷地境界・注記
  const BAND = token("--text-2"); // seg帯と表記

  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vb: { x: number; y: number; w: number; h: number }; moved: boolean } | null>(null);

  const colors = useMemo(
    () => (model ? buildColors(model, colorMode) : null),
    [model, colorMode, modelKey, theme],
  );
  const levels = useMemo(() => (model ? levelsWithRooms(model) : []), [model, modelKey]);

  const rooms = useMemo(
    () =>
      model && planLevel
        ? [...model.spaces.values()].filter((s) => s.rects.length > 0 && s.level === planLevel)
        : [],
    [model, modelKey, planLevel],
  );

  // 敷地形状 (ADR-0011) は最下階の平面 (配置図兼用) に敷地境界線として描く
  const sitePolys = useMemo(() => {
    if (!model || !planLevel) return [];
    const lowest = Object.values(model.levels).sort((a, b) => a.z - b.z)[0]?.name;
    return planLevel === lowest ? [...model.polygons.values()] : [];
  }, [model, modelKey, planLevel]);

  const extent: Extent | null = useMemo(() => {
    if (rooms.length === 0) return null;
    const rs = rooms.flatMap((s) => s.rects);
    const px = sitePolys.flatMap((p) => p.points.map((pt) => pt.x));
    const py = sitePolys.flatMap((p) => p.points.map((pt) => pt.y));
    const minX = Math.min(...rs.map((r) => r.x1), ...px);
    const maxX = Math.max(...rs.map((r) => r.x2), ...px);
    const minY = Math.min(...rs.map((r) => r.y1), ...py);
    const maxY = Math.max(...rs.map((r) => r.y2), ...py);
    return { minX, maxX, minY, maxY, W: maxX - minX + M * 2, H: maxY - minY + M * 2 };
  }, [rooms, sitePolys]);

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

  if (!model || !planLevel || !extent || !colors) {
    return <div className="empty-view">レベルに領域を持つ空間がありません</div>;
  }

  const sx = (x: number) => x - extent.minX + M;
  const sy = (y: number) => extent.maxY - y + M;
  const view = vb ?? { x: 0, y: 0, w: extent.W, h: extent.H };
  const onRoute = routePaths(route);

  const wasClick = () => !(drag.current?.moved ?? false);

  // ---- 描画要素 ----
  const roomFills: ReactNode[] = [];
  const roomLabels: ReactNode[] = [];
  const selectionMarks: ReactNode[] = []; // 壁より上の層に描く
  for (const s of rooms) {
    const isVoid = s.type === "void";
    // 半屋外 (外部にopen/air境界で接する — 導出) は淡く、屋外であることが図から読めるように
    const semi = !isVoid && isSemiOutdoor(model, s);
    const fill = isVoid ? PAPER : colors.colorOf(s);
    const isSel = s.path === selected;
    const isRoute = onRoute.has(s.path);
    for (const [i, r] of s.rects.entries()) {
      roomFills.push(
        <rect
          key={`${s.path}#${i}`}
          x={sx(r.x1)}
          y={sy(r.y2)}
          width={r.x2 - r.x1}
          height={r.y2 - r.y1}
          fill={fill}
          fillOpacity={isVoid ? 1 : s.path === hovered ? (semi ? 0.4 : 0.62) : semi ? 0.18 : 0.42}
          style={{ cursor: "pointer" }}
          onPointerUp={() => {
            if (wasClick()) select(s.path === selected ? null : s.path);
          }}
          onPointerEnter={() => hover(s.path)}
          onPointerLeave={() => hover(null)}
        />,
      );
      if (isVoid) {
        roomFills.push(
          <g key={`${s.path}#${i}v`} stroke={FAINT} strokeWidth={16} strokeDasharray="120 80" pointerEvents="none">
            <line x1={sx(r.x1)} y1={sy(r.y1)} x2={sx(r.x2)} y2={sy(r.y2)} />
            <line x1={sx(r.x1)} y1={sy(r.y2)} x2={sx(r.x2)} y2={sy(r.y1)} />
          </g>,
        );
      }
    }
    // 選択・経路の輪郭 (合併の各矩形へ)
    if (isSel || isRoute) {
      for (const [i, r] of s.rects.entries()) {
        selectionMarks.push(
          <rect
            key={`${s.path}#${i}sel`}
            x={sx(r.x1)}
            y={sy(r.y2)}
            width={r.x2 - r.x1}
            height={r.y2 - r.y1}
            fill="none"
            stroke={isSel ? selectColor() : routeColor()}
            strokeWidth={isSel ? 70 : 50}
            pointerEvents="none"
          />,
        );
      }
    }
    // ラベル (最大矩形の中心)
    const r = [...s.rects].sort(
      (a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1),
    )[0]!;
    const cx = sx((r.x1 + r.x2) / 2);
    const cy = sy((r.y1 + r.y2) / 2);
    const a = areaM2(s);
    const small = (r.x2 - r.x1) * (r.y2 - r.y1) < 6e6; // 6㎡未満は控えめに
    roomLabels.push(
      <g key={s.path} pointerEvents="none" textAnchor="middle">
        <text x={cx} y={cy - 80} fontSize={280} fill={INK}>
          {displayName(s)}
        </text>
        {!small && (
          <text x={cx} y={cy + 260} fontSize={200} fill={SUBTLE}>
            {s.type === "void" ? "吹抜け" : `${s.type}${semi ? " ・ 半屋外" : ""} ・ ${a?.toFixed(1)}㎡`}
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

  // 数えない分節 (area)
  const areaMarks: ReactNode[] = [];
  for (const s of rooms) {
    for (const [i, a] of s.areas.entries()) {
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
            fill={token("--bg-active")}
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

  // 敷地境界線 (一点二点鎖線 — 作図慣習)
  const siteMarks: ReactNode[] = [];
  for (const [i, poly] of sitePolys.entries()) {
    const d = poly.points.map((pt, k) => `${k === 0 ? "M" : "L"} ${sx(pt.x)} ${sy(pt.y)}`).join(" ");
    siteMarks.push(
      <path
        key={`site${i}`}
        d={`${d} Z`}
        fill="none"
        stroke={SUBTLE}
        strokeWidth={22}
        strokeDasharray="280 60 50 60 50 60"
        pointerEvents="none"
      />,
    );
  }

  // 通り芯
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

  // 壁・開放分節・seg・開口 (境界から生成)
  const wallMarks: ReactNode[] = [];
  const openingMarks: ReactNode[] = [];
  const placedOpenings: Array<{ b: Boundary; o: Opening; seg: Segment; cx: number; cy: number }> = [];
  for (const b of model.boundaries) {
    const onLevel = [b.a, b.b].some((p) => model.spaces.get(p)?.level === planLevel);
    if (!onLevel) continue;
    if (b.kind === "open") {
      for (const [i, seg] of segmentsFor(model, b).entries()) {
        wallMarks.push(
          <line
            key={`o${b.line}#${i}`}
            x1={sx(seg.x1)}
            y1={sy(seg.y1)}
            x2={sx(seg.x2)}
            y2={sy(seg.y2)}
            stroke={FAINT}
            strokeWidth={20}
            strokeDasharray="120 80"
          />,
        );
      }
      continue;
    }
    if (b.kind !== "wall") continue;
    if (b.air) {
      // 遮蔽しない物 (手すり・柵 = spec語彙): 細実線 — 黒帯と描き分ける (ADR-0007)
      for (const [i, seg] of segmentsFor(model, b).entries()) {
        wallMarks.push(
          <line
            key={`air${b.line}#${i}`}
            x1={sx(seg.x1)}
            y1={sy(seg.y1)}
            x2={sx(seg.x2)}
            y2={sy(seg.y2)}
            stroke={INK}
            strokeWidth={28}
          />,
        );
      }
      // 柵の扉 (門扉など): 線を切って軌跡を描く
      for (const [i, o] of b.openings.entries()) {
        if (o.kind !== "door") continue;
        const placed = placeOpening(model, b, o);
        if ("error" in placed) continue;
        openingMarks.push(
          <rect key={`aircut${b.line}#${i}`} {...bandRect(placed.segment, o.w, placed.cx, placed.cy, 120, sx, sy)} fill={PAPER} />,
          <g key={`airdoor${b.line}#${i}`}>{doorSwing(model, b, o, placed.segment, placed.cx, placed.cy, sx, sy)}</g>,
        );
      }
      continue;
    }
    const t = b.t ?? WALL_DEFAULT_T;
    for (const [i, seg] of segmentsFor(model, b).entries()) {
      wallMarks.push(
        <rect key={`w${b.line}#${i}`} {...wallRect(seg, t, sx, sy)} fill={INK} />,
      );
    }
    for (const [i, g] of b.segs.entries()) {
      const placed = placeBand(model, b, g, "seg");
      if ("error" in placed) continue;
      wallMarks.push(
        <rect key={`s${b.line}#${i}`} {...bandRect(placed.segment, g.w, placed.cx, placed.cy, t, sx, sy)} fill={BAND} />,
      );
      const spec = g.attrs["spec"];
      if (typeof spec === "string") {
        const h = placed.segment.horizontal;
        wallMarks.push(
          <text
            key={`sl${b.line}#${i}`}
            x={sx(placed.cx) + (h ? 0 : 160)}
            y={sy(placed.cy) + (h ? -140 : 60)}
            textAnchor={h ? "middle" : "start"}
            fontSize={160}
            fill={BAND}
          >
            {spec}
          </text>,
        );
      }
    }
    for (const o of b.openings) {
      const placed = placeOpening(model, b, o);
      if (!("error" in placed)) placedOpenings.push({ b, o, seg: placed.segment, cx: placed.cx, cy: placed.cy });
    }
  }
  for (const [i, { b, o, seg, cx, cy }] of placedOpenings.entries()) {
    const t = (b.t ?? WALL_DEFAULT_T) + 40;
    openingMarks.push(
      <rect key={`cut${i}`} {...bandRect(seg, o.w, cx, cy, t, sx, sy)} fill={PAPER} />,
    );
    if (o.kind === "door") {
      openingMarks.push(<g key={`door${i}`}>{doorSwing(model, b, o, seg, cx, cy, sx, sy)}</g>);
    } else {
      const half = o.w / 2;
      openingMarks.push(
        seg.horizontal ? (
          <line key={`win${i}`} x1={sx(cx - half)} y1={sy(cy)} x2={sx(cx + half)} y2={sy(cy)} stroke={INK} strokeWidth={20} />
        ) : (
          <line key={`win${i}`} x1={sx(cx)} y1={sy(cy - half)} x2={sx(cx)} y2={sy(cy + half)} stroke={INK} strokeWidth={20} />
        ),
      );
    }
  }

  return (
    <div className="plan-view">
      <div className="plan-toolbar">
        {levels.map((l) => (
          <button
            key={l}
            className={`chip ${l === planLevel ? "chip-on" : ""}`}
            onClick={() => setPlanLevel(l)}
          >
            {l}
          </button>
        ))}
        <span className="hint">ホイールで拡大 ・ ドラッグで移動</span>
        {vb && (
          <Button size="sm" variant="ghost" onClick={() => setVb(null)}>
            全体
          </Button>
        )}
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
        {gridMarks}
        <g pointerEvents="none">{wallMarks}</g>
        <g pointerEvents="none">{openingMarks}</g>
        <g pointerEvents="none">{selectionMarks}</g>
        {roomLabels}
        <g pointerEvents="none">
          <text x={M - 1240} y={extent.H - 360} fontSize={240} fill={INK}>
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

function wallRect(
  seg: Segment,
  t: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
): { x: number; y: number; width: number; height: number } {
  if (seg.horizontal) {
    return { x: sx(seg.x1), y: sy(seg.y1 + t / 2), width: seg.x2 - seg.x1, height: t };
  }
  return { x: sx(seg.x1 - t / 2), y: sy(seg.y2), width: t, height: seg.y2 - seg.y1 };
}

function bandRect(
  seg: Segment,
  w: number,
  cx: number,
  cy: number,
  t: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
): { x: number; y: number; width: number; height: number } {
  if (seg.horizontal) {
    return { x: sx(cx - w / 2), y: sy(cy + t / 2), width: w, height: t };
  }
  return { x: sx(cx - t / 2), y: sy(cy + w / 2), width: t, height: w };
}

/** 扉の吊元と軌跡 (koyu plan.ts の doorSwing の移植 — hinge/swing 対応, ADR-0007) */
function doorSwing(
  model: Model,
  b: Boundary,
  o: Opening,
  seg: Segment,
  cx: number,
  cy: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
): ReactNode {
  const INK = token("--text-1"); // 呼出時に読む (テーマ追従)
  // 開く側の空間: swing:a/b の指定、既定はa側 (領域を持つ方)。合併なら扉に最も近い矩形へ開く
  const sa = model.spaces.get(b.a);
  const sb = model.spaces.get(b.b);
  let into: typeof sa;
  if (o.swing === "a") into = sa;
  else if (o.swing === "b") into = sb;
  else into = sa && sa.rects.length > 0 ? sa : sb;
  if (!into || into.rects.length === 0) return null;
  const dist = (rc: { x1: number; y1: number; x2: number; y2: number }) =>
    ((rc.x1 + rc.x2) / 2 - cx) ** 2 + ((rc.y1 + rc.y2) / 2 - cy) ** 2;
  const r = [...into.rects].sort((p, q) => dist(p) - dist(q))[0]!;
  const c = { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 };

  // 吊元 hinge (hinge:W/E/S/N — 既定は始端側)、軌跡は hinge を中心とする1/4円
  let hinge: { x: number; y: number };
  let along: { x: number; y: number };
  let inward: { x: number; y: number };
  if (seg.horizontal) {
    const fromEast = o.hinge === "E";
    hinge = { x: fromEast ? cx + o.w / 2 : cx - o.w / 2, y: cy };
    along = { x: fromEast ? -1 : 1, y: 0 };
    inward = { x: 0, y: c.y > cy ? 1 : -1 };
  } else {
    const fromNorth = o.hinge === "N";
    hinge = { x: cx, y: fromNorth ? cy + o.w / 2 : cy - o.w / 2 };
    along = { x: 0, y: fromNorth ? -1 : 1 };
    inward = { x: c.x > cx ? 1 : -1, y: 0 };
  }
  // 引き戸・自動ドア (style:sliding / style:auto — 建具アセットの語彙, koyu ADR-0010):
  // 開き軌跡ではなく、吊元側の控え (戸袋側) にパネルを描く — koyu plan.ts と同じ規約
  const style = o.attrs["style"];
  if (style === "sliding" || style === "auto") {
    const off = 110; // 壁面からの控え mm
    const s1 = {
      x: hinge.x - along.x * o.w + inward.x * off,
      y: hinge.y - along.y * o.w + inward.y * off,
    };
    const s2 = { x: hinge.x + inward.x * off, y: hinge.y + inward.y * off };
    return (
      <>
        <line x1={sx(s1.x)} y1={sy(s1.y)} x2={sx(s2.x)} y2={sy(s2.y)} stroke={INK} strokeWidth={40} />
        <line x1={sx(s2.x)} y1={sy(s2.y)} x2={sx(hinge.x)} y2={sy(hinge.y)} stroke={INK} strokeWidth={14} />
      </>
    );
  }

  const leafEnd = { x: hinge.x + inward.x * o.w, y: hinge.y + inward.y * o.w };
  const gapEnd = { x: hinge.x + along.x * o.w, y: hinge.y + along.y * o.w };
  const p1 = { x: sx(leafEnd.x), y: sy(leafEnd.y) };
  const p2 = { x: sx(gapEnd.x), y: sy(gapEnd.y) };
  const ph = { x: sx(hinge.x), y: sy(hinge.y) };
  const crossZ = (p1.x - ph.x) * (p2.y - ph.y) - (p1.y - ph.y) * (p2.x - ph.x);
  const sweep = crossZ > 0 ? 1 : 0;
  return (
    <>
      <line x1={ph.x} y1={ph.y} x2={p1.x} y2={p1.y} stroke={INK} strokeWidth={28} />
      <path
        d={`M ${p1.x} ${p1.y} A ${o.w} ${o.w} 0 0 ${sweep} ${p2.x} ${p2.y}`}
        fill="none"
        stroke={INK}
        strokeWidth={14}
        strokeDasharray="60 50"
      />
    </>
  );
}
