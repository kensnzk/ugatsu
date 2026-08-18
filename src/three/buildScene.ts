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
// **数え上げも koyu が持つ。**「その形に何が立つか」は `sceneOf(form)` が一列の節として
// 返す (koyu 0.24 / `@kensnzk/koyu/draw`)。かつてここは `form.spaces` `form.columns`
// `form.runs` `form.slabs` `form.site` `form.boundaries` を**六つの別々の巡回**で歩いており、
// 巡回を一つ書き忘れれば、その主題は黙って立体から消えた。いま歩くのは `scene.nodes` の
// 一列だけで、枝分かれは `of` (何の) と `role` (どういう扱いの) の二語で足りる。
// 実体の構成子 (`band` `bandLine` `columnRect` `runPrism`) をここが呼ぶことも、もう無い —
// 起きた実体が節の `solid` に入って届く (koyu ADR-0058 / ADR-0063)。
//
// **壁の実体は起こすものですらない。**区間は取合いが既に決まった足あととして届く
// (koyu ADR-0063)。芯線に厚みを振って箱を立てると、直角に交わる二枚の壁の外側に
// t/2 × t/2 の隙が残る — かつてここはそうしていた (two-rooms で 4 箇所、complex で 206 箇所)。
//
// **節の z は常に真の世界 z である。**2.5D の展開 (`spread`) は立体の座標ではなく
// **レベルごとの入れ物の変位**として掛かる。かつては z に係数を掛けて焼き込んでおり、
// 「Form の座標のまま立っているか」を問うことができなかった。
//
// 3Dモード: 気積・壁の区間・開口・柱・縦動線・面をそのまま立体へ写す。
// 2.5Dモード: 各レベルの床プレートを重ね、入れ物ごと持ち上げる (吹抜けは床の不在=穴)。
import * as THREE from "three";
import { sceneOf, type ScenePrism } from "@kensnzk/koyu/draw";
import type { Form } from "@kensnzk/koyu/form";
import type { Pt } from "@kensnzk/koyu/model";
import type { ModelColors } from "../lib/colors.js";
import { polyBounds } from "../lib/koyu-compat.js";
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
  const scene = sceneOf(form);

  // ---- レベルごとの入れ物 ----
  // 節の z は真の世界 z なので、**展開が掛かるのはここだけ**である。z*spread の位置へ
  // 持ち上げるには差 (spread-1) を足せばよい — 中の物は既に z に居る
  const holders = new Map<string, THREE.Group>();
  for (const l of scene.levels) {
    const g = new THREE.Group();
    g.position.y = stackMode ? ty(l.z) * (spread - 1) : 0;
    holders.set(l.name, g);
    group.add(g);
  }
  /** レベルに属さない節の置き場。展開は掛からない */
  const loose = new THREE.Group();
  group.add(loose);
  const at = (level: string | undefined): THREE.Group =>
    (level !== undefined ? holders.get(level) : undefined) ?? loose;
  const levelHidden = (level: string | undefined): boolean => !!(level && hiddenLevels[level]);

  const wallMat = new THREE.MeshLambertMaterial({ color: INK() });
  const doorMat = new THREE.MeshLambertMaterial({ color: DOOR() });
  const glassMat = new THREE.MeshLambertMaterial({ color: GLASS(), transparent: true, opacity: 0.3 });
  // ガラスの外皮 (カーテンウォール・サッシ) は壁ごと透かす — 外から中の見える建ち方
  const glassWallMat = new THREE.MeshLambertMaterial({
    color: GLASS(),
    transparent: true,
    opacity: 0.28,
  });
  const railMat = new THREE.MeshLambertMaterial({ color: GHOST(), transparent: true, opacity: 0.75 });
  const colMat = new THREE.MeshLambertMaterial({ color: INK() });
  const runMat = new THREE.MeshLambertMaterial({ color: tokenColor("--drawing-derived") });
  const slabMats: Record<string, THREE.Material> = {
    floor: new THREE.MeshLambertMaterial({ color: tokenColor("--wash-2") }),
    ceiling: new THREE.MeshLambertMaterial({
      color: tokenColor("--wash-1"),
      transparent: true,
      opacity: 0.45,
    }),
    roof: new THREE.MeshLambertMaterial({ color: INK() }),
  };
  const isGlass = opts.glass ?? (() => false);

  /** 2.5D のプレート上の壁線 — レベルごとに一本の LineSegments へまとめる */
  const strokes = new Map<string, { walls: number[]; opens: number[]; airs: number[] }>();

  for (const node of scene.nodes) {
    if (levelHidden(node.level)) continue;
    const parent = at(node.level);

    switch (node.of) {
      // ---- 空間 ----
      // **天井高が決まらない空間には立体を作らない。**koyu は決まらなければ形を作らず
      // (SUF01 は error)、気積の節そのものが来ない。ここで既定値を捏造すると
      // 「check が赤いのに立体は完成して見える」ことになる (docs/scope.md §5.2)
      case "space": {
        const solid = node.solid;
        if (!solid || node.level === undefined) continue;
        const color = new THREE.Color(colors.byPath(node.ref));
        const z0 = solid.bottom[0]!;
        if (node.role === "plate") {
          // 階を面として読んだ節。**厚みは koyu に無い** — 紙の都合であって形ではないので、
          // 板にするのはここである
          if (stackMode) {
            // 吹抜けかどうかは**宣言** (`void:1`) であって型の語ではない (koyu ADR-0051 / muro 1.1)
            if (node.facts.hollow) continue; // 床の不在 — プレートを置かないことが吹抜けの表現
            const m = prismMesh(solid.ring, z0, z0 + PLATE_T, new THREE.MeshLambertMaterial({ color }));
            m.userData.path = node.ref;
            parent.add(m, edgeLines(m, EDGE(), 0.35));
            pickables.push(m);
            continue;
          }
          // 半屋外 (庭・テラス・バルコニー — 導出) は気積でなく地面: 薄い板で描く
          if (!node.facts.semiOutdoor) continue;
          const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 });
          const m = prismMesh(solid.ring, z0, z0 + GROUND_T, mat);
          m.userData.path = node.ref;
          parent.add(m, edgeLines(m, EDGE(), 0.45));
          pickables.push(m);
          continue;
        }
        // 気積
        if (stackMode || node.facts.semiOutdoor) continue; // 半屋外は上で地面として描いた
        const hollow = !!node.facts.hollow;
        // 吹抜け: 実体を持たない気積 — 輪郭線だけの幽霊
        const mat = hollow
          ? new THREE.MeshBasicMaterial({ visible: false })
          : new THREE.MeshLambertMaterial({
              color,
              transparent: true,
              opacity: 0.5,
              depthWrite: false,
            });
        const m = prismMesh(solid.ring, z0, solid.top[0]!, mat);
        m.userData.path = node.ref;
        parent.add(m, edgeLines(m, hollow ? GHOST() : EDGE(), hollow ? 0.55 : 0.45));
        pickables.push(m);
        break;
      }

      case "boundary": {
        // 壁 — **開口で割られた区間として立つ。**窓の裏に壁の箱が残ると、ガラスをいくら
        // 透かしても中は見えない。割るのも取合いを閉じるのも Form であり、ここではない
        if (node.role === "body") {
          if (stackMode || !opts.showWalls || !node.solid) continue;
          // `written.boundary` は**正準順**の索引である (koyu ADR-0041)
          const glassy = node.written !== undefined && isGlass(node.written);
          const mat = node.facts.air ? railMat : glassy ? glassWallMat : wallMat;
          parent.add(prismMesh(node.solid.ring, node.solid.bottom[0]!, node.solid.top[0]!, mat));
          continue;
        }
        // 芯線 — 2.5D のプレート上の壁線としてだけ引く
        if (!stackMode || !node.line || node.level === undefined) continue;
        if (node.kind !== "wall" && node.kind !== "open") continue;
        const bucket = strokes.get(node.level) ?? { walls: [], opens: [], airs: [] };
        strokes.set(node.level, bucket);
        const arr = node.kind === "open" ? bucket.opens : node.facts.air ? bucket.airs : bucket.walls;
        const zTop = node.line.z + PLATE_T + 20;
        const pts = node.line.points;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i]!;
          const b = pts[i + 1]!;
          arr.push(tx(a.x), zTop, tz(a.y), tx(b.x), zTop, tz(b.y));
        }
        break;
      }

      // 建具 (扉・ガラス) — 帯が線分上で占める区間 (`centre`) も見付け厚も z 範囲も節が持つ。
      // 足しているのは見付け厚の増しだけで、それは見た目である。窓台 (sill) は発明しない
      case "opening": {
        if (stackMode || !opts.showWalls || !opts.showOpenings) continue;
        if (!node.solid || !node.centre || node.t === undefined) continue;
        const m = segBox(
          node.centre,
          node.solid.bottom[0]!,
          node.solid.top[0]!,
          node.t + JOINERY_T,
          node.kind === "door" ? doorMat : glassMat,
        );
        if (m) parent.add(m);
        break;
      }

      // 柱 (koyu ADR-0023) — 通り芯の交点と床の交わりから現れる
      case "column": {
        if (stackMode || !node.solid) continue;
        parent.add(solidMesh(node.solid, colMat));
        break;
      }

      // 縦動線 (koyu ADR-0021) — 段は段として、斜路は傾いた版として立ち上がる。
      // 段割りも勾配もここでは決めない。koyu が返した立体を幾何に写すだけである
      case "run": {
        if (stackMode || !node.solid) continue;
        parent.add(solidMesh(node.solid, runMat));
        break;
      }

      // 面の要素 (koyu ADR-0024): 床・天井・屋根
      case "slab": {
        if (stackMode || opts.showFabric === false || !node.solid) continue;
        if (levelHidden(node.level)) continue;
        // **知らない種別を黙って落とさない。**koyu が SlabKind を増やした日、`continue` すると
        // その版だけが立体から消え、何も言わない — この頁が無くそうとしている失敗そのものである。
        // 既定の材で立てておけば、見た目で気づける
        const mat = slabMats[node.kind ?? ""] ?? slabMats["floor"]!;
        at(node.level).add(prismMesh(node.solid.ring, node.solid.bottom[0]!, node.solid.top[0]!, mat));
        break;
      }

      // 敷地形状 (ADR-0011): 所与の多角形を地盤面として描き、境界線を引く。
      // **地面に接する階に属す** — 最下階ではない。地下があると最下階はそこであり、
      // 敷地が地下の階と一緒に沈む (koyu 0.24 の `scene.ground`)
      case "site": {
        const home = at(scene.ground);
        if (node.role === "plate") {
          if (!node.solid) continue;
          const shape = new THREE.Shape(node.solid.ring.map((p) => new THREE.Vector2(p.x, p.y)));
          const g = new THREE.ShapeGeometry(shape);
          g.rotateX(-Math.PI / 2); // (x, y, 0) → (x, 0, -y) = 世界座標の地面
          const plate = new THREE.Mesh(
            g,
            new THREE.MeshLambertMaterial({ color: tokenColor("--wash-1"), side: THREE.DoubleSide }),
          );
          plate.position.y = -30;
          home.add(plate);
          continue;
        }
        if (!node.line || node.line.points.length === 0) continue;
        const ring = node.line.closed
          ? [...node.line.points, node.line.points[0]!]
          : node.line.points;
        home.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(
              ring.map((p) => new THREE.Vector3(tx(p.x), 25, tz(p.y))),
            ),
            new THREE.LineBasicMaterial({ color: tokenColor("--drawing-derived") }),
          ),
        );
        break;
      }

      // レベルラベル (2.5D)。**座は koyu が返し、言葉は消費者が決める** — 節は文字を持たない
      case "level": {
        if (!stackMode || !node.mark || typeof document === "undefined") continue;
        const sp = textSprite(node.ref, 900);
        sp.position.set(tx(node.mark.x) - 1500, ty(node.mark.z) + 400, tz(node.mark.y));
        parent.add(sp);
        break;
      }
    }
  }

  for (const [level, bucket] of strokes) {
    const parent = at(level);
    for (const [arr, mat] of [
      [bucket.walls, new THREE.LineBasicMaterial({ color: LINE() })],
      [bucket.airs, new THREE.LineBasicMaterial({ color: GHOST(), transparent: true, opacity: 0.8 })],
      [bucket.opens, new THREE.LineDashedMaterial({ color: GHOST(), dashSize: 240, gapSize: 160 })],
    ] as const) {
      if (arr.length === 0) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      const lines = new THREE.LineSegments(g, mat);
      lines.computeLineDistances();
      parent.add(lines);
    }
  }

  // mm → m
  group.scale.setScalar(0.001);
  return { group, pickables };
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

/**
 * koyu が返した素の立体を three の網へ。判断は一切持たず、形を写すだけである。
 *
 * `solid.level` は「頂点ごとの下端も上端も一つの数か」という**数についての事実**であって
 * 材の示唆ではない (koyu の `ScenePrism`)。揃っていれば直角柱で、ここへ来るそれは柱の断面か
 * 段板 — どちらも軸に沿った矩形の上に立つので箱で足りる。揃っていなければ (斜路・
 * エスカレーターの傾いた版) 頂点ごとの z を持つ帯を張るしかない。
 * **四隅の高さの振り方は koyu が決めている** — ここが持つのは world → three の付け替えだけ
 */
function solidMesh(solid: ScenePrism, mat: THREE.Material): THREE.Mesh {
  const n = solid.ring.length;
  if (solid.level) {
    const r = polyBounds(solid.ring);
    const z0 = solid.bottom[0]!;
    const z1 = solid.top[0]!;
    return boxMesh(
      r.x2 - r.x1,
      Math.max(1, z1 - z0),
      r.y2 - r.y1,
      tx((r.x1 + r.x2) / 2),
      ty((z0 + z1) / 2),
      tz((r.y1 + r.y2) / 2),
      mat,
    );
  }
  // 上面 0..n-1 / 下面 n..2n-1 (上から見て同じ並び) を張る
  const v: number[] = [];
  for (const [i, p] of solid.ring.entries()) v.push(tx(p.x), ty(solid.top[i]!), tz(p.y));
  for (const [i, p] of solid.ring.entries()) v.push(tx(p.x), ty(solid.bottom[i]!), tz(p.y));
  const idx: number[] = [];
  for (let i = 1; i + 1 < n; i++) idx.push(0, i, i + 1); // 上
  for (let i = 1; i + 1 < n; i++) idx.push(n + i + 1, n + i, n); // 下 (裏返し)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, i + n, j + n, i, j + n, j); // 側
  }
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
