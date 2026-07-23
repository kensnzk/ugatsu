// モデル → three.js シーン。形はここで初めて生まれる — ソースに形は無い。
// 3Dモード: 空間を天井高で押し出し、壁境界を厚み付きで生成、開口を壁面に置く。
// 2.5Dモード: 各レベルの床プレートを重ね、展開係数で持ち上げる (吹抜けは床の不在=穴)。
import * as THREE from "three";
import {
  heff,
  isSemiOutdoor,
  placeOpening,
  segmentsFor,
  type Boundary,
  type Model,
  type Space,
} from "@kensnzk/koyu";
import type { ModelColors } from "../lib/colors.js";

export interface SceneOptions {
  colors: ModelColors;
  stackMode: boolean;
  spread: number;
  showWalls: boolean;
  showOpenings: boolean;
  hiddenLevels: Record<string, true>;
}

const INK = 0x8d8578; // 壁 (立体では紙面より明るく — 空間の色が主役)
const LINE = 0x4a4640; // 2.5Dの壁線
const EDGE = 0x6b665e;
const DOOR = 0xa87848;
const GLASS = 0x88b0c8;
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
  ctx.font = "56px 'Hiragino Sans','Noto Sans JP',sans-serif";
  ctx.fillStyle = "#5a554c";
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
      for (const r of s.rects) {
        const m = boxMesh(
          r.x2 - r.x1,
          PLATE_T,
          r.y2 - r.y1,
          tx((r.x1 + r.x2) / 2),
          ty(z0) + PLATE_T / 2,
          tz((r.y1 + r.y2) / 2),
          mat,
        );
        m.userData.path = s.path;
        group.add(m, edgeLines(m, EDGE, 0.35));
        pickables.push(m);
      }
      continue;
    }

    // 半屋外 (庭・テラス・バルコニー — 導出) は気積でなく地面: 薄いプレートで描く
    const semi = isSemiOutdoor(model, s);
    const h = semi ? 150 : spaceHeight(model, s);
    if (isVoid) {
      // 吹抜け: 実体を持たない気積 — 輪郭線だけの幽霊
      for (const r of s.rects) {
        const m = boxMesh(
          r.x2 - r.x1,
          h,
          r.y2 - r.y1,
          tx((r.x1 + r.x2) / 2),
          ty(z0) + h / 2,
          tz((r.y1 + r.y2) / 2),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        m.userData.path = s.path;
        group.add(m, edgeLines(m, 0x9a9384, 0.55));
        pickables.push(m);
      }
      continue;
    }
    const mat = semi
      ? new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 })
      : new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
    for (const r of s.rects) {
      const m = boxMesh(
        r.x2 - r.x1,
        h,
        r.y2 - r.y1,
        tx((r.x1 + r.x2) / 2),
        ty(z0) + h / 2,
        tz((r.y1 + r.y2) / 2),
        mat,
      );
      m.userData.path = s.path;
      group.add(m, edgeLines(m, EDGE, 0.45));
      pickables.push(m);
    }
  }

  // ---- 敷地形状 (ADR-0011): 所与の多角形を地盤面として描き、境界線を引く ----
  for (const poly of model.polygons.values()) {
    const shape = new THREE.Shape(poly.points.map((p) => new THREE.Vector2(p.x, p.y)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2); // (x, y, 0) → (x, 0, -y) = 世界座標の地面
    const plate = new THREE.Mesh(
      g,
      new THREE.MeshLambertMaterial({ color: 0xe7e1d2, side: THREE.DoubleSide }),
    );
    plate.position.y = -30;
    group.add(plate);
    const linePts = [...poly.points, poly.points[0]!].map(
      (p) => new THREE.Vector3(tx(p.x), 25, tz(p.y)),
    );
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePts),
        new THREE.LineBasicMaterial({ color: 0x8a8171 }),
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
        [bucket.walls, new THREE.LineBasicMaterial({ color: LINE })],
        [bucket.airs, new THREE.LineBasicMaterial({ color: 0x8d8578, transparent: true, opacity: 0.8 })],
        [
          bucket.opens,
          new THREE.LineDashedMaterial({ color: 0x9a9384, dashSize: 240, gapSize: 160 }),
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
    const wallMat = new THREE.MeshLambertMaterial({ color: INK });
    const doorMat = new THREE.MeshLambertMaterial({ color: DOOR });
    const glassMat = new THREE.MeshLambertMaterial({
      color: GLASS,
      transparent: true,
      opacity: 0.55,
    });
    const railMat = new THREE.MeshLambertMaterial({
      color: 0x9a9184,
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
