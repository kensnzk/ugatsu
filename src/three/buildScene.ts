// `Form` → three.js シーン。**形はここで生まれない。**
//
// 空間の気積も、壁が開口で割られた区間も、柱の z 範囲も、段板の立体も、床・天井・屋根も、
// koyu の `derive(model)` が返す `Form` に既に入っている (koyu ADR-0040 / docs/reference/form)。
// ここが持つのは材質・透過・色・見付け厚・地面の板 — すべて見た目である。
//
// かつてここは `segmentsFor` `placeOpening` `slabs` `columnsFor` `runSolids` を個別に呼び、
// 壁を開口で割る手も、開口の高さも窓台も、階高の近似 (2400mm) も**自前で持っていた**。
// koyu 側の同じ規則と食い違う余地が構造的に残り、実際に食い違っていた。
//
// 3Dモード: `Form` の気積・壁の区間・開口・柱・縦動線・面をそのまま立体へ写す。
// 2.5Dモード: 各レベルの床プレートを重ね、展開係数で持ち上げる (吹抜けは床の不在=穴)。
//
// **立体の構成子も koyu が持つ。**開口の帯 (`bandLine`) も斜路の角柱 (`runPrism`) も、
// 芯線と厚みと z から実体を起こす規則であり、それは導出の一部である (koyu ADR-0058)。
// かつてこの頁は両方を書き写しており、同じ `Form` から違う形が出る余地が残っていた。
//
// **壁の実体は起こすものですらない。**区間は `footprint` — 両端の取合いが既に決まった
// 足あと — を持って届く (koyu ADR-0063)。芯線に厚みを振って箱を立てると、取合いは
// 開いたままになる。かつてここはそうしており、直角に交わる二枚の壁の外側に
// t/2 × t/2 の隙が残っていた (two-rooms で 4 箇所、complex で 206 箇所)。
// **芯線は足あとの軸ではない**ので、足あとは芯線からは戻らない。
import * as THREE from "three";
import { bandLine, runPrism, type Form, type FormPanel, type RunSolid, type Slab } from "@kensnzk/koyu/form";
import type { Pt } from "@kensnzk/koyu/model";
import type { ModelColors } from "../lib/colors.js";
import { token, tokenColor } from "../lib/theme.js";

export interface SceneOptions {
  colors: ModelColors;
  stackMode: boolean;
  spread: number;
  showWalls: boolean;
  /** 建具 (扉・ガラス) を置くか。**壁が開口で割られること自体は形なので消せない** */
  showOpenings: boolean;
  /** 床・天井・屋根を描くか (既定 true) */
  showFabric?: boolean;
  hiddenLevels: Record<string, true>;
  /**
   * 境界を透過で描くか。`spec` は**書かれた自由語**であり koyu は解釈しない —
   * 語の意味を決めるのは ugatsu なので、判断は外から渡す (docs/scope.md §5.2)。
   * 述語は `src/lib/written.ts` の `glassSpec(model)` が組む
   */
  glass?: (b: { boundary: number }) => boolean;
}

// 描画色は drawing セマンティックから遅延導出し、製品クロームとデータを分離する。
const INK = () => tokenColor("--drawing-line-muted"); // 壁面 (空間の色を主役にする)
const LINE = () => tokenColor("--drawing-line"); // 2.5Dの壁線
const EDGE = () => tokenColor("--drawing-derived");
const DOOR = () => tokenColor("--drawing-line");
const GLASS = () => tokenColor("--drawing-line-muted");
const GHOST = () => tokenColor("--drawing-line-muted"); // 吹抜け・開放・柵

/** 2.5D の床プレート厚 mm (図の体裁) */
const PLATE_T = 120;
/** 半屋外を気積ではなく地面として描くときの板厚 mm (原本に対応物は無い) */
const GROUND_T = 150;
/** 建具の見付け厚の増し mm (壁厚に足す — 面から少し出して見えるようにする) */
const JOINERY_T = 60;

/** 世界座標 (x東+, y北+, z上+, mm) → three (x, y=z, z=-y) */
const tx = (x: number) => x;
const ty = (z: number) => z;
const tz = (y: number) => -y;

export interface BuiltScene {
  group: THREE.Group;
  /** 空間選択の対象 (userData.path を持つ) */
  pickables: THREE.Mesh[];
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

/**
 * 芯線分 (x1,y1)-(x2,y2) に沿った厚み t・高さ z0..z1 の箱。
 * three は (x, z, -y) なので、+X を (dx, 0, -dy) へ向ける角は atan2(dy, dx)。
 * **斜めの線分もそのまま立つ** — 軸に沿っているかどうかで分岐しない
 */
function segBox(
  s: { x1: number; y1: number; x2: number; y2: number },
  z0: number,
  z1: number,
  t: number,
  mat: THREE.Material,
): THREE.Mesh | null {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len = Math.hypot(dx, dy);
  const h = z1 - z0;
  if (len < 1 || h < 1) return null;
  const m = boxMesh(len, h, t, tx((s.x1 + s.x2) / 2), ty(z0) + h / 2, tz((s.y1 + s.y2) / 2), mat);
  m.rotation.y = Math.atan2(dy, dx);
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

export function buildScene(form: Form, opts: SceneOptions): BuiltScene {
  const group = new THREE.Group();
  const pickables: THREE.Mesh[] = [];
  const { colors, stackMode, spread, hiddenLevels } = opts;

  const levelZ = new Map(form.levels.map((l) => [l.name, l.z]));
  const zOf = (level: string | undefined): number =>
    (level ? (levelZ.get(level) ?? 0) : 0) * (stackMode ? spread : 1);
  const levelHidden = (level: string | undefined): boolean => !!(level && hiddenLevels[level]);

  // ---- 空間 ----
  // **天井高が決まらない空間には立体を作らない。**koyu は決まらなければ形を作らず
  // (SUF01 は error)、`Form` はその空間に z を持たない。ここで既定値を捏造すると
  // 「check が赤いのに立体は完成して見える」ことになる (docs/scope.md §5.2)
  for (const s of form.spaces) {
    if (!s.level || levelHidden(s.level)) continue;
    const base = zOf(s.level);
    // 吹抜けかどうかは**宣言** (`void:1`) であって型の語ではない (koyu ADR-0051 / muro 1.1)
    const isVoid = s.void;
    const color = new THREE.Color(colors.byPath(s.path));

    if (stackMode) {
      if (isVoid) continue; // 床の不在 — プレートを置かないことが吹抜けの表現
      const mat = new THREE.MeshLambertMaterial({ color });
      for (const poly of s.outline) {
        const m = prismMesh(poly, base, base + PLATE_T, mat);
        m.userData.path = s.path;
        group.add(m, edgeLines(m, EDGE(), 0.35));
        pickables.push(m);
      }
      continue;
    }

    // 半屋外 (庭・テラス・バルコニー — 導出) は気積でなく地面: 薄い板で描く
    if (s.semiOutdoor) {
      const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 });
      for (const poly of s.outline) {
        const m = prismMesh(poly, base, base + GROUND_T, mat);
        m.userData.path = s.path;
        group.add(m, edgeLines(m, EDGE(), 0.45));
        pickables.push(m);
      }
      continue;
    }
    if (s.z0 === undefined || s.z1 === undefined) continue;
    if (isVoid) {
      // 吹抜け: 実体を持たない気積 — 輪郭線だけの幽霊
      for (const poly of s.outline) {
        const m = prismMesh(poly, s.z0, s.z1, new THREE.MeshBasicMaterial({ visible: false }));
        m.userData.path = s.path;
        group.add(m, edgeLines(m, GHOST(), 0.55));
        pickables.push(m);
      }
      continue;
    }
    const mat = new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    for (const poly of s.outline) {
      const m = prismMesh(poly, s.z0, s.z1, mat);
      m.userData.path = s.path;
      group.add(m, edgeLines(m, EDGE(), 0.45));
      pickables.push(m);
    }
  }

  // ---- 柱 (koyu ADR-0023) — 通り芯の交点と床の交わりから現れる ----
  if (!stackMode) {
    const colMat = new THREE.MeshLambertMaterial({ color: INK() });
    for (const c of form.columns) {
      if (levelHidden(c.level)) continue;
      const h = c.z1 - c.z0;
      group.add(boxMesh(c.w, h, c.d, tx(c.x), ty(c.z0) + h / 2, tz(c.y), colMat));
    }
  }

  // ---- 縦動線 (koyu ADR-0021) — 段は段として、斜路は傾いた版として立ち上がる ----
  // 段割りも勾配もここでは決めない。koyu が返した立体を幾何に写すだけである
  if (!stackMode) {
    const runMat = new THREE.MeshLambertMaterial({ color: tokenColor("--drawing-derived") });
    for (const run of form.runs) {
      if (levelHidden(run.level)) continue;
      for (const solid of run.solids) group.add(solidMesh(solid, runMat));
    }
  }

  // ---- 面の要素 (koyu ADR-0024): 床・天井・屋根 ----
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
    for (const sl of form.slabs) {
      if (levelHidden(sl.level)) continue;
      group.add(slabMesh(sl, mats[sl.kind]!));
    }
  }

  // ---- 敷地形状 (ADR-0011): 所与の多角形を地盤面として描き、境界線を引く ----
  for (const poly of form.site) {
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

  // ---- 壁と開口 ----
  if (stackMode) {
    // プレート上の壁線 (レベルごとに一本のLineSegmentsへまとめる)
    const byLevel = new Map<string, { walls: number[]; opens: number[]; airs: number[] }>();
    for (const b of form.boundaries) {
      if (b.kind !== "wall" && b.kind !== "open") continue;
      if (!b.level || levelHidden(b.level)) continue;
      const zTop = zOf(b.level) + PLATE_T + 20;
      const bucket = byLevel.get(b.level) ?? { walls: [], opens: [], airs: [] };
      byLevel.set(b.level, bucket);
      const arr = b.kind === "open" ? bucket.opens : b.air ? bucket.airs : bucket.walls;
      const s = b.segment;
      arr.push(tx(s.x1), zTop, tz(s.y1), tx(s.x2), zTop, tz(s.y2));
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
      const pts = form.spaces.filter((s) => s.level === level).flatMap((s) => s.outline.flat());
      if (pts.length > 0 && typeof document !== "undefined") {
        const minX = Math.min(...pts.map((p) => p.x));
        const minY = Math.min(...pts.map((p) => p.y));
        const maxY = Math.max(...pts.map((p) => p.y));
        const sp = textSprite(level, 900);
        sp.position.set(tx(minX) - 1500, ty(zOf(level)) + 400, tz((minY + maxY) / 2));
        group.add(sp);
      }
    }
  } else if (opts.showWalls) {
    const wallMat = new THREE.MeshLambertMaterial({ color: INK() });
    const doorMat = new THREE.MeshLambertMaterial({ color: DOOR() });
    const glassMat = new THREE.MeshLambertMaterial({
      color: GLASS(),
      transparent: true,
      opacity: 0.3,
    });
    // ガラスの外皮 (カーテンウォール・サッシ) は壁ごと透かす — 外から中の見える建ち方
    const glassWallMat = new THREE.MeshLambertMaterial({
      color: GLASS(),
      transparent: true,
      opacity: 0.28,
    });
    const railMat = new THREE.MeshLambertMaterial({
      color: GHOST(),
      transparent: true,
      opacity: 0.75,
    });
    const isGlass = opts.glass ?? (() => false);

    // 壁 — **開口で割られた区間として立つ。**窓の裏に壁の箱が残ると、
    // ガラスをいくら透かしても中は見えない。割るのは Form であり、ここではない。
    // 取合いを閉じるのも Form である — ここには直すべき隅が無い (koyu ADR-0063)
    for (const b of form.boundaries) {
      if (!b.material || levelHidden(b.level)) continue;
      const mat = b.air ? railMat : isGlass(b) ? glassWallMat : wallMat;
      for (const p of b.material.panels) group.add(panelMesh(p, mat));
    }

    // 建具 (扉・ガラス) — 開口の z 範囲も幅も Form が持つ。
    // 窓台 (sill) を発明しない: 頭がまぐさ高に揃うことで下端は既に決まっている
    if (opts.showOpenings) {
      for (const o of form.openings) {
        if (levelHidden(o.level)) continue;
        // 帯が線分上で占める区間は koyu の構成子が決める (ADR-0058)。
        // 足しているのは見付け厚の増しだけで、それは見た目である
        const m = segBox(
          bandLine(o.segment, o.cx, o.cy, o.w),
          o.z0,
          o.z1,
          o.t + JOINERY_T,
          o.kind === "door" ? doorMat : glassMat,
        );
        if (m) group.add(m);
      }
    }
  }

  // mm → m
  group.scale.setScalar(0.001);
  return { group, pickables };
}

/**
 * 壁の一区間を立体へ。**`Form` が持つ足あとをそのまま押し出す** (koyu ADR-0063)。
 *
 * 厚みを受け取らないのは、受け取っても使い道が無いからである。取合いの決まった壁の実体は
 * 芯線と厚みの関数ではない — 勝った壁は節点を越えて伸び、負けた壁はその面で切られる。
 */
function panelMesh(p: FormPanel, mat: THREE.Material): THREE.Mesh {
  return prismMesh(p.footprint, p.z0, p.z1, mat);
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
  // 傾いた版: 四隅の高さの振り方は koyu の `runPrism` が決める (ADR-0058)。
  // ここが持つのは world → three の座標の付け替えだけである
  const prism = runPrism(solid);
  const top = prism.poly.map((p, i) => [tx(p.x), ty(prism.top[i]!), tz(p.y)] as const);
  const bot = prism.poly.map((p, i) => [tx(p.x), ty(prism.bottom[i]!), tz(p.y)] as const);
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
