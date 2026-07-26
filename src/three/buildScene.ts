// モデル → three.js シーン。形はここで初めて生まれる — ソースに形は無い。
// 3Dモード: 空間を天井高で押し出し、壁境界を厚み付きで生成、開口を壁面に置く。
// 2.5Dモード: 各レベルの床プレートを重ね、展開係数で持ち上げる (吹抜けは床の不在=穴)。
import * as THREE from "three";
import {
  columnsFor,
  heff,
  isSemiOutdoor,
  placeOpening,
  polyBounds,
  rectToPoly,
  runSolids,
  slabs,
  segmentsFor,
  verticalRuns,
  type Boundary,
  type Model,
  type Pt,
  type RunSolid,
  type Slab,
  type Space,
} from "@kensnzk/koyu";
import type { ModelColors } from "../lib/colors.js";
import { token, tokenColor } from "../lib/theme.js";

export interface SceneOptions {
  colors: ModelColors;
  stackMode: boolean;
  spread: number;
  showWalls: boolean;
  showOpenings: boolean;
  /** 床・天井・屋根を描くか (既定 true) */
  showFabric?: boolean;
  hiddenLevels: Record<string, true>;
}

// 描画色は drawing セマンティックから遅延導出し、製品クロームとデータを分離する。
const INK = () => tokenColor("--drawing-line-muted"); // 壁面 (空間の色を主役にする)
const LINE = () => tokenColor("--drawing-line"); // 2.5Dの壁線
const EDGE = () => tokenColor("--drawing-derived");
const DOOR = () => tokenColor("--drawing-line");
const GLASS = () => tokenColor("--drawing-line-muted");
const GHOST = () => tokenColor("--drawing-line-muted"); // 吹抜け・開放・柵
const DEFAULT_H = 2400;
const PLATE_T = 120;

/** 世界座標 (x東+, y北+, z上+, mm) → three (x, y=z, z=-y) */
const tx = (x: number) => x;
const ty = (z: number) => z;
const tz = (y: number) => -y;

export interface BuiltScene {
  group: THREE.Group;
  /** 空間選択の対象 (userData.path を持つ) */
  pickables: THREE.Mesh[];
}

function spaceHeight(model: Model, s: Space): number {
  return heff(model, s) ?? DEFAULT_H;
}

/** レベルの階高 (次のレベルのzまで)。最上階は 天井高+slab で近似 */
function levelPitch(model: Model, levelName: string): number | undefined {
  const level = model.levels[levelName];
  if (!level) return undefined;
  const above = Object.values(model.levels)
    .filter((l) => l.z > level.z)
    .sort((a, b) => a.z - b.z)[0];
  if (above) return above.z - level.z;
  return level.h !== undefined ? level.h + (level.slab ?? 0) : undefined;
}

function wallLevelAndHeight(model: Model, b: Boundary): { level?: string; z: number; h: number } {
  const sa = model.spaces.get(b.a);
  const sb = model.spaces.get(b.b);
  const roomA = sa && sa.rects.length > 0 ? sa : undefined;
  const roomB = sb && sb.rects.length > 0 ? sb : undefined;
  const room = roomA ?? roomB;
  if (!room?.level) return { z: 0, h: DEFAULT_H };
  const z = model.levels[room.level]?.z ?? 0;
  // 壁は階高いっぱいに立ち上がる (躯体の連続 — 天井高は内装の面)。
  // 天井高で止めると次の床プレートとの間にスラブ+懐分の隙間が見えてしまう。
  // 吹抜け上部の壁は上階のvoid空間側の境界が担うので、ここは常に自レベルの階高でよい。
  const hs = [roomA, roomB].filter((r): r is Space => !!r).map((r) => spaceHeight(model, r));
  const ceil = Math.max(...(hs.length ? hs : [DEFAULT_H]));
  return { level: room.level, z, h: levelPitch(model, room.level) ?? ceil };
}

function boxMesh(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  material: THREE.Material,
): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, material);
  m.position.set(cx, cy, cz);
  return m;
}

function edgeLines(mesh: THREE.Mesh, color: number, opacity = 0.5): THREE.LineSegments {
  const eg = new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry);
  const lines = new THREE.LineSegments(
    eg,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  lines.position.copy(mesh.position);
  return lines;
}

function textSprite(text: string, sizeMm: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `56px ${token("--font-sans")}`; // ds:allow 紋理内キャンバスの寸法 (UIのpxではない)
  ctx.fillStyle = token("--ink-2");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  sp.scale.set(sizeMm * 2, sizeMm, 1);
  return sp;
}

export function buildScene(model: Model, opts: SceneOptions): BuiltScene {
  const group = new THREE.Group();
  const pickables: THREE.Mesh[] = [];
  const { colors, stackMode, spread, hiddenLevels } = opts;

  const zOf = (level: string | undefined): number => {
    const z = level ? (model.levels[level]?.z ?? 0) : 0;
    return z * (stackMode ? spread : 1);
  };
  const levelHidden = (level: string | undefined): boolean => !!(level && hiddenLevels[level]);

  // ---- 空間 ----
  for (const s of model.spaces.values()) {
    if (s.rects.length === 0 || !s.level || levelHidden(s.level)) continue;
    const z0 = zOf(s.level);
    const isVoid = s.type === "void";
    const color = new THREE.Color(colors.colorOf(s));

    if (stackMode) {
      if (isVoid) continue; // 床の不在 — プレートを置かないことが吹抜けの表現
      const mat = new THREE.MeshLambertMaterial({ color });
      for (const poly of piecesOf(s)) {
        const m = prismMesh(poly, z0, z0 + PLATE_T, mat);
        m.userData.path = s.path;
        group.add(m, edgeLines(m, EDGE(), 0.35));
        pickables.push(m);
      }
      continue;
    }

    // 半屋外 (庭・テラス・バルコニー — 導出) は気積でなく地面: 薄いプレートで描く
    const semi = isSemiOutdoor(model, s);
    const h = semi ? 150 : spaceHeight(model, s);
    if (isVoid) {
      // 吹抜け: 実体を持たない気積 — 輪郭線だけの幽霊
      for (const poly of piecesOf(s)) {
        const m = prismMesh(poly, z0, z0 + h, new THREE.MeshBasicMaterial({ visible: false }));
        m.userData.path = s.path;
        group.add(m, edgeLines(m, GHOST(), 0.55));
        pickables.push(m);
      }
      continue;
    }
    const mat = semi
      ? new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 })
      : new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
    for (const poly of piecesOf(s)) {
      const m = prismMesh(poly, z0, z0 + h, mat);
      m.userData.path = s.path;
      group.add(m, edgeLines(m, EDGE(), 0.45));
      pickables.push(m);
    }
  }

  // ---- 柱 (koyu ADR-0023) — 通り芯の交点と床の交わりから現れる ----
  if (!stackMode) {
    const colMat = new THREE.MeshLambertMaterial({ color: INK() });
    for (const level of Object.keys(model.levels)) {
      if (levelHidden(level)) continue;
      const z = zOf(level);
      const h = levelPitch(model, level) ?? DEFAULT_H;
      for (const c of columnsFor(model, level)) {
        group.add(boxMesh(c.w, h, c.d, tx(c.x), ty(z) + h / 2, tz(c.y), colMat));
      }
    }
  }

  // ---- 縦動線 (koyu ADR-0021) — 段は段として、斜路は傾いた版として立ち上がる ----
  // 段割りも勾配もここでは決めない。koyu が返した立体を幾何に写すだけである
  if (!stackMode) {
    const runMat = new THREE.MeshLambertMaterial({ color: tokenColor("--drawing-derived") });
    for (const run of verticalRuns(model)) {
      if (levelHidden(run.level)) continue;
      for (const solid of runSolids(run)) group.add(solidMesh(solid, runMat));
    }
  }

  // ---- 面の要素 (koyu ADR-0024): 床・天井・屋根 ----
  // どれも語彙を持たない — level の slab と space の h が既に宣言しているものを、
  // koyu が面として返す。ここは押し出すだけである
  if (!stackMode && opts.showFabric !== false) {
    const mats: Record<string, THREE.Material> = {
      floor: new THREE.MeshLambertMaterial({ color: tokenColor("--wash-2") }),
      ceiling: new THREE.MeshLambertMaterial({
        color: tokenColor("--wash-1"),
        transparent: true,
        opacity: 0.45,
      }),
      roof: new THREE.MeshLambertMaterial({ color: INK() }),
    };
    for (const sl of slabs(model)) {
      if (levelHidden(sl.level)) continue;
      group.add(slabMesh(sl, mats[sl.kind]!));
    }
  }

  // ---- 敷地形状 (ADR-0011): 所与の多角形を地盤面として描き、境界線を引く ----
  for (const poly of model.polygons.values()) {
    const shape = new THREE.Shape(poly.points.map((p) => new THREE.Vector2(p.x, p.y)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2); // (x, y, 0) → (x, 0, -y) = 世界座標の地面
    const plate = new THREE.Mesh(
      g,
      new THREE.MeshLambertMaterial({ color: tokenColor("--wash-1"), side: THREE.DoubleSide }),
    );
    plate.position.y = -30;
    group.add(plate);
    const linePts = [...poly.points, poly.points[0]!].map(
      (p) => new THREE.Vector3(tx(p.x), 25, tz(p.y)),
    );
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePts),
        new THREE.LineBasicMaterial({ color: tokenColor("--drawing-derived") }),
      ),
    );
  }

  // ---- 壁 (境界から生成) と開口 ----
  if (stackMode) {
    // プレート上の壁線 (レベルごとに一本のLineSegmentsへまとめる)
    const byLevel = new Map<string, { walls: number[]; opens: number[]; airs: number[] }>();
    for (const b of model.boundaries) {
      if (b.kind !== "wall" && b.kind !== "open") continue;
      const { level, z } = wallLevelAndHeight(model, b);
      if (!level || levelHidden(level)) continue;
      const zTop = z * spread + PLATE_T + 20;
      const bucket = byLevel.get(level) ?? { walls: [], opens: [], airs: [] };
      byLevel.set(level, bucket);
      const arr = b.kind === "open" ? bucket.opens : b.air ? bucket.airs : bucket.walls;
      for (const seg of segmentsFor(model, b)) {
        arr.push(tx(seg.x1), zTop, tz(seg.y1), tx(seg.x2), zTop, tz(seg.y2));
      }
    }
    for (const [level, bucket] of byLevel) {
      for (const [arr, mat] of [
        [bucket.walls, new THREE.LineBasicMaterial({ color: LINE() })],
        [bucket.airs, new THREE.LineBasicMaterial({ color: GHOST(), transparent: true, opacity: 0.8 })],
        [
          bucket.opens,
          new THREE.LineDashedMaterial({ color: GHOST(), dashSize: 240, gapSize: 160 }),
        ],
      ] as const) {
        if (arr.length === 0) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
        const lines = new THREE.LineSegments(g, mat);
        lines.computeLineDistances();
        group.add(lines);
      }
      // レベルラベル
      const z = (model.levels[level]?.z ?? 0) * spread;
      const rects = [...model.spaces.values()]
        .filter((s) => s.level === level)
        .flatMap((s) => s.rects);
      if (rects.length && typeof document !== "undefined") {
        const minX = Math.min(...rects.map((r) => r.x1));
        const minY = Math.min(...rects.map((r) => r.y1));
        const maxY = Math.max(...rects.map((r) => r.y2));
        const sp = textSprite(level, 900);
        sp.position.set(tx(minX) - 1500, ty(z) + 400, tz((minY + maxY) / 2));
        group.add(sp);
      }
    }
  } else if (opts.showWalls) {
    const wallMat = new THREE.MeshLambertMaterial({ color: INK() });
    const doorMat = new THREE.MeshLambertMaterial({ color: DOOR() });
    const glassMat = new THREE.MeshLambertMaterial({
      color: GLASS(),
      transparent: true,
      opacity: 0.55,
    });
    const railMat = new THREE.MeshLambertMaterial({
      color: GHOST(),
      transparent: true,
      opacity: 0.75,
    });
    for (const b of model.boundaries) {
      if (b.kind !== "wall") continue;
      const { level, z, h: wallH } = wallLevelAndHeight(model, b);
      if (!level || levelHidden(level)) continue;
      const z0 = z;
      // 遮蔽しない物 (air:1 — 手すり・柵): 腰の高さの薄い板 (ADR-0007)
      const isAir = !!b.air;
      const railH = typeof b.attrs["h"] === "number" ? (b.attrs["h"] as number) : 1100;
      const h = isAir ? railH : wallH;
      const t = isAir ? Math.min(b.t ?? 60, 80) : (b.t ?? 100);
      const mat = isAir ? railMat : wallMat;
      for (const seg of segmentsFor(model, b)) {
        const m = seg.horizontal
          ? boxMesh(seg.x2 - seg.x1, h, t, tx((seg.x1 + seg.x2) / 2), ty(z0) + h / 2, tz(seg.y1), mat)
          : boxMesh(t, h, seg.y2 - seg.y1, tx(seg.x1), ty(z0) + h / 2, tz((seg.y1 + seg.y2) / 2), mat);
        group.add(m);
      }
      if (isAir || !opts.showOpenings) continue;
      for (const o of b.openings) {
        const placed = placeOpening(model, b, o);
        if ("error" in placed) continue;
        const isDoor = o.kind === "door";
        const oh = o.h ?? (isDoor ? 2000 : 1200);
        const sill = isDoor ? 0 : typeof o.attrs["sill"] === "number" ? (o.attrs["sill"] as number) : 800;
        const thick = t + 60;
        const { segment, cx, cy } = placed;
        const m = segment.horizontal
          ? boxMesh(o.w, oh, thick, tx(cx), ty(z0 + sill) + oh / 2, tz(cy), isDoor ? doorMat : glassMat)
          : boxMesh(thick, oh, o.w, tx(cx), ty(z0 + sill) + oh / 2, tz(cy), isDoor ? doorMat : glassMat);
        group.add(m);
      }
    }
  }

  // mm → m
  group.scale.setScalar(0.001);
  return { group, pickables };
}

/** 導出された領域 (凸片)。描かれた線 (koyu ADR-0022) で切られていれば斜めになる */
function piecesOf(s: Space): Pt[][] {
  return s.pieces.length > 0 ? s.pieces : s.rects.map(rectToPoly);
}

/**
 * 平面の輪郭を z0..z1 へ押し出す。
 * ExtrudeGeometry は XY 平面に作って +Z へ伸ばすので、rotateX(-90°) で
 * (u, v, d) → (u, d, -v) となり、v=世界のy がそのまま three の -z になる
 */
function prismMesh(outline: Pt[], z0: number, z1: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1, z1 - z0), bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = ty(z0);
  return m;
}

/** 面 (床・天井・屋根) を厚みのある版へ押し出す */
function slabMesh(sl: Slab, mat: THREE.Material): THREE.Mesh {
  return prismMesh(sl.outline, sl.z0, sl.z1, mat);
}

/** koyu が返した素の立体を three の網へ。判断は一切持たず、形を写すだけである */
function solidMesh(solid: RunSolid, mat: THREE.Material): THREE.Mesh {
  const r = solid.rect;
  if (solid.kind === "box") {
    return boxMesh(
      r.x2 - r.x1,
      Math.max(1, solid.z1 - solid.z0),
      r.y2 - r.y1,
      tx((r.x1 + r.x2) / 2),
      ty((solid.z0 + solid.z1) / 2),
      tz((r.y1 + r.y2) / 2),
      mat,
    );
  }
  // 傾いた版: up 側へ z0→z1 で上がる。矩形の四隅の高さを線形に決め、厚み t ぶん下へ落とす
  const zAt = (x: number, y: number): number => {
    const f =
      solid.up === "E"
        ? (x - r.x1) / Math.max(1, r.x2 - r.x1)
        : solid.up === "W"
          ? (r.x2 - x) / Math.max(1, r.x2 - r.x1)
          : solid.up === "N"
            ? (y - r.y1) / Math.max(1, r.y2 - r.y1)
            : (r.y2 - y) / Math.max(1, r.y2 - r.y1);
    return solid.z0 + f * (solid.z1 - solid.z0);
  };
  const corners: Array<[number, number]> = [
    [r.x1, r.y1],
    [r.x2, r.y1],
    [r.x2, r.y2],
    [r.x1, r.y2],
  ];
  const top = corners.map(([x, y]) => [tx(x), ty(zAt(x, y)), tz(y)] as const);
  const bot = corners.map(([x, y]) => [tx(x), ty(zAt(x, y) - solid.t), tz(y)] as const);
  const v = [...top, ...bot].flat();
  // 上面 0-1-2-3 / 下面 4-5-6-7 (上から見て同じ並び) の側面を張る
  const idx = [
    0, 1, 2, 0, 2, 3, // 上
    6, 5, 4, 7, 6, 4, // 下
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((obj) => {
    const any = obj as THREE.Mesh & THREE.Sprite;
    if (any.geometry) any.geometry.dispose();
    const mat = any.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) {
      const tex = (mat as THREE.SpriteMaterial).map;
      if (tex) tex.dispose();
      mat.dispose();
    }
  });
}
