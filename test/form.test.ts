// **凍結面「導出の一致」の実体** (docs/scope.md §1)。
//
// ugatsu は参照実装と同じ形を作る。見た目の質はここに足すが、形は変えない。
// その約束を機械が縛れるようになったのは koyu が `derive(model): Form` を立ててからで
// ある (koyu ADR-0040 / docs/reference/form)。ここが縛るのは五つ。
//
//   1. **形の出所が一つ** — 描画する頁が koyu の形の部品を直に呼ばない (import で縛る)
//   2. **立体が Form と一致する** — 壁の区間・建具・柱・段板が、Form から組み直した
//      期待値と座標まで一致する。捏造された既定値 (かつての 2400mm) はここで落ちる
//   3. **平面が Form を取りこぼさない** — そのレベルの 2Dエンティティが役ごとに全て印になる。
//      省くのは垂れ壁と腰壁の二つだけで、それも数として現れる
//   4. **上部吹抜けの投影が出る** — 同梱例に 11 件。かつては一つも描かれていなかった
//   5. **天井高が決まらなければ立体を作らない** — koyu が形を作らない場面で描かない
//   6. **壁の実体が Form の足あとである** — 芯線に厚みを振り直さない。取合いは既に閉じている
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { parse, parseFiles } from "@kensnzk/koyu";
import { derive, type Form } from "@kensnzk/koyu/form";
import type { Model, Pt } from "@kensnzk/koyu/model";
import { buildColors } from "../src/lib/colors.js";
import { formOf } from "../src/lib/form.js";
import { planMarks, type Mark, type MarkRole } from "@kensnzk/koyu/draw";
import { buildScene } from "../src/three/buildScene.js";

const layered = (dir: string, entry = "main.muro"): Model =>
  parseFiles(
    Object.fromEntries(
      readdirSync(`examples/${dir}`)
        .filter((f) => f.endsWith(".muro"))
        .map((f) => [f, readFileSync(`examples/${dir}/${f}`, "utf8")]),
    ),
    entry,
  );
const single = (f: string): Model => parse(readFileSync(`examples/${f}`, "utf8"));

const CASES: Record<string, () => Model> = {
  "two-rooms.muro": () => single("two-rooms.muro"),
  "office.muro": () => single("office.muro"),
  "mansion.muro": () => single("mansion.muro"),
  basement: () => layered("basement"),
  house: () => layered("house"),
  tower: () => layered("tower"),
  complex: () => layered("complex"),
  twin: () => layered("twin"),
};

// ---- 1. 形の出所が一つ -----------------------------------------------------

/**
 * 形を**組み立てる** koyu の部品。**描く頁がこれを直に呼ぶと、同じ部品から違う形が出る余地が
 * 戻ってくる。**形は `formOf(model)` (= `derive`) からのみ来る。
 *
 * **実体の構成子はこの列に入らない。**`band` / `bandLine` / `thicken` / `columnRect` /
 * `runPrism` は「芯線と厚みと z から実体を起こす」規則であり、koyu が唯一の実装として
 * 公開している (koyu ADR-0058)。取り込まないことではなく、**書き写さないこと**が規律である —
 * 下の「構成子は書き写さない」がそれを縛る
 */
const SHAPE_PARTS = [
  "segmentsFor",
  "placeOpening",
  "placeBand",
  "slabs",
  "columnsFor",
  "runSolids",
  "runDrawsForLevel",
  "verticalRuns",
  "heff",
  "rectToPoly",
  "isSemiOutdoor",
  "isCoveredAbove",
  "deriveDefaultBoundaries",
  "envelopeGaps",
];

/** 描画の頁 — ここが koyu から取ってよいのは形ではなく、書かれた与件と型だけである */
const DRAWING_PAGES = [
  "src/components/PlanView.tsx",
  "src/three/buildScene.ts",
];

/**
 * そのファイルが `@kensnzk/koyu` から取り込んでいる名 (値も型も)。
 *
 * **入口はもう一つではない。**koyu 0.21.0 で公開面は 12 のサブパスへ割れた (koyu ADR-0053)
 * ので、`@kensnzk/koyu/form` も `/model` も同じように見る — 見なければ、形の部品が
 * サブパス経由で描画の頁へ戻ってきても、この検査は黙って通る
 */
function koyuImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"@kensnzk\/koyu(?:\/[\w/]+)?"/g,
  )) {
    for (const raw of m[1]!.split(",")) {
      const n = raw.replace(/^\s*type\s+/, "").trim().split(/\s+as\s+/)[0]!.trim();
      if (n) out.push(n);
    }
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
}

describe("形の出所は一つである (koyu ADR-0040)", () => {
  for (const page of DRAWING_PAGES) {
    it(`${page} は koyu の形の部品を取り込まない`, () => {
      expect(koyuImports(page).filter((n) => SHAPE_PARTS.includes(n))).toEqual([]);
    });
  }

  // koyu ADR-0058 — 構成子を書き写せば、同じ Form から違う形が出る余地がまた開く。
  // 実際に開いていた: 平面は `band` を、立体は `bandLine` と `runPrism` を書き写していた。
  //
  // **描く頁はもう構成子を呼びもしない。**平面は `planMarks(form, level)` を、立体は
  // `sceneOf(form)` を歩くだけで、起きた実体は印と節に入って届く (koyu 0.24)。だから
  // 「取り込んでいること」は縛りにならない — 残るのは**書き写していないこと**である
  const CONSTRUCTORS = ["thicken", "band", "bandLine", "columnRect", "runPrism"];
  for (const page of DRAWING_PAGES) {
    it(`${page} は実体の構成子を書き写さない (${CONSTRUCTORS.join(" / ")})`, () => {
      const src = readFileSync(page, "utf8");
      for (const n of CONSTRUCTORS) {
        expect(src).not.toMatch(new RegExp(`function\\s+${n}\\s*\\(`));
      }
    });
  }

  // 立体の数え上げは koyu のものである。`form.spaces` `form.columns` `form.runs`
  // `form.slabs` `form.site` `form.boundaries` を別々に歩けば、koyu が形に何かを足した日に
  // 「平面には出て立体には出ない」が黙って起こる — かつてそう作られていた
  it("src/three/buildScene.ts は立体の数え上げを `sceneOf` から取る", () => {
    expect(koyuImports("src/three/buildScene.ts")).toContain("sceneOf");
  });

  // **アプリの側で `derive` を呼ぶ頁は一つだけ**である。テストは `derive` を「答え合わせの
  // 相手」として呼ぶので数に入らない — 入れれば、検算を足すたびにこの縛りを緩める羽目になる
  it("`derive` を取り込むのは src/lib/form.ts だけ (平面と立体が別の形を見ない)", () => {
    const callers = walk("src")
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => koyuImports(f).includes("derive"));
    expect(callers.sort()).toEqual(["src/lib/form.ts"]);
  });

  it("同じモデルからは同じ Form が返る (平面と立体が同じ実体を見る)", () => {
    const m = single("office.muro");
    expect(formOf(m)).toBe(formOf(m));
    expect(JSON.stringify(formOf(m))).toBe(JSON.stringify(derive(m)));
  });
});

// ---- 2. 立体が Form と一致する ---------------------------------------------

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** 箱の同一性 — 位置・寸法・向き。**Form から組み直した期待値と突き合わせる** */
const boxKey = (
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  rot: number,
): string => [r3(cx), r3(cy), r3(cz), r3(w), r3(h), r3(d), r3(rot)].join(" ");

/** 芯線分に沿った箱 (buildScene の segBox と同じ幾何) */
function segKey(
  s: { x1: number; y1: number; x2: number; y2: number },
  z0: number,
  z1: number,
  t: number,
): string | null {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len = Math.hypot(dx, dy);
  const h = z1 - z0;
  if (len < 1 || h < 1) return null;
  return boxKey(
    (s.x1 + s.x2) / 2,
    z0 + h / 2,
    -(s.y1 + s.y2) / 2,
    len,
    h,
    t,
    Math.atan2(dy, dx),
  );
}

/**
 * `Form` だけから、3Dシーンに立つべき箱の集合を組む。
 *
 * **壁はここに居ない。**壁の一区間は箱ではなく足あとの押し出しであり (koyu ADR-0063)、
 * `expectedPrisms` が受け持つ。芯線と厚みから箱を組み直せば、取合いの開いた壁を
 * 期待値の側にも書くことになり、**実装と一緒に壊れて通る**
 */
function expectedBoxes(form: Form): string[] {
  const out: string[] = [];
  for (const o of form.openings) {
    const half = o.w / 2;
    const len = Math.hypot(o.segment.x2 - o.segment.x1, o.segment.y2 - o.segment.y1) || 1;
    const ux = ((o.segment.x2 - o.segment.x1) / len) * half;
    const uy = ((o.segment.y2 - o.segment.y1) / len) * half;
    const k = segKey(
      { x1: o.cx - ux, y1: o.cy - uy, x2: o.cx + ux, y2: o.cy + uy },
      o.z0,
      o.z1,
      o.t + 60, // 建具の見付け厚 (見た目)
    );
    if (k) out.push(k);
  }
  for (const c of form.columns) {
    const h = c.z1 - c.z0;
    out.push(boxKey(c.x, c.z0 + h / 2, -c.y, c.w, h, c.d, 0));
  }
  for (const run of form.runs) {
    for (const s of run.solids) {
      if (s.kind !== "box") continue;
      out.push(
        boxKey(
          (s.rect.x1 + s.rect.x2) / 2,
          (s.z0 + s.z1) / 2,
          -(s.rect.y1 + s.rect.y2) / 2,
          s.rect.x2 - s.rect.x1,
          Math.max(1, s.z1 - s.z0),
          s.rect.y2 - s.rect.y1,
          0,
        ),
      );
    }
  }
  return out.sort();
}

/** シーンに実際に立った箱 */
function actualBoxes(group: THREE.Group): string[] {
  const out: string[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry as THREE.BoxGeometry;
    if (g.type !== "BoxGeometry") return;
    const p = g.parameters;
    out.push(
      boxKey(m.position.x, m.position.y, m.position.z, p.width, p.height, p.depth, m.rotation.y),
    );
  });
  return out.sort();
}

/** 押し出しの同一性 — 輪郭の頂点列 (順序込み) と z 範囲 */
const prismKey = (poly: Pt[], z0: number, z1: number): string =>
  `${poly.map((p) => `${r3(p.x)},${r3(p.y)}`).join(" ")} @ ${r3(z0)}..${r3(z1)}`;

/** `Form` だけから、3Dシーンに立つべき押し出しの集合を組む — 壁・気積・面 */
function expectedPrisms(form: Form): string[] {
  const out: string[] = [];
  const levelZ = new Map(form.levels.map((l) => [l.name, l.z]));
  // **壁は足あとをそのまま押し出す。**芯線に厚みを振った箱ではない (koyu ADR-0063) —
  // 取合いの決まった実体は芯線と厚みの関数ではないので、ここから組み直すことができない
  for (const b of form.boundaries) {
    if (!b.material) continue;
    for (const p of b.material.panels) out.push(prismKey(p.footprint, p.z0, p.z1));
  }
  for (const s of form.spaces) {
    if (!s.level) continue;
    if (s.semiOutdoor) {
      // 半屋外は気積ではなく地面の板 (150mm — 原本に対応物を持たない見た目)
      const z = levelZ.get(s.level) ?? 0;
      for (const poly of s.outline) out.push(prismKey(poly, z, z + 150));
      continue;
    }
    if (s.z0 === undefined || s.z1 === undefined) continue;
    for (const poly of s.outline) out.push(prismKey(poly, s.z0, s.z1));
  }
  for (const sl of form.slabs) out.push(prismKey(sl.outline, sl.z0, sl.z1));
  return out.sort();
}

/** 押し出しの輪郭を三次元の網から読み戻さずに、作った `Shape` から読む */
const shapeOf = (g: THREE.ExtrudeGeometry): Pt[] =>
  (g.parameters.shapes as THREE.Shape).getPoints().map((v) => ({ x: v.x, y: v.y }));

/** シーンに実際に立った押し出し */
function actualPrisms(group: THREE.Group): string[] {
  const out: string[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry as THREE.ExtrudeGeometry;
    if (g.type !== "ExtrudeGeometry") return;
    const z0 = m.position.y;
    out.push(prismKey(shapeOf(g), z0, z0 + (g.parameters.options.depth as number)));
  });
  return out.sort();
}

const build = (m: Model, over: Partial<Parameters<typeof buildScene>[1]> = {}) =>
  buildScene(formOf(m), {
    colors: buildColors(m, "type"),
    stackMode: false,
    spread: 1,
    showWalls: true,
    showOpenings: true,
    hiddenLevels: {},
    ...over,
  });

describe("立体は Form と一致する", () => {
  for (const [name, load] of Object.entries(CASES)) {
    it(`${name}: 建具・柱・段板が Form の座標のまま立つ`, () => {
      const m = load();
      expect(actualBoxes(build(m).group)).toEqual(expectedBoxes(formOf(m)));
    });
  }

  // **押し出しは Form の輪郭そのものである。**壁の足あと・空間の気積・面 (床・天井・屋根) の
  // どれも `Form` に入って届き、シーンはそれを z へ伸ばすだけである。数ではなく集合で
  // 突き合わせるので、輪郭が一つでも捏造されれば落ちる (koyu ADR-0063)
  for (const [name, load] of Object.entries(CASES)) {
    it(`${name}: 壁の足あと・気積・面が Form の輪郭のまま押し出される`, () => {
      const m = load();
      expect(actualPrisms(build(m).group)).toEqual(expectedPrisms(formOf(m)));
    });
  }

  it("押し出しは Form が z を持つ空間と面にだけ立つ (捏造した階高は無い)", () => {
    const m = layered("tower");
    const form = formOf(m);
    const built = build(m);
    // 立体はレベルごとの入れ物に入る (2.5D の展開がその変位である) ので、木を辿って数える
    let prisms = 0;
    built.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.geometry as { type?: string }).type === "ExtrudeGeometry") prisms++;
    });
    const volumes = form.spaces.filter((s) => s.level && (s.semiOutdoor || s.z1 !== undefined));
    const panels = form.boundaries.reduce((a, b) => a + (b.material?.panels.length ?? 0), 0);
    const expected =
      volumes.reduce((a, s) => a + s.outline.length, 0) + form.slabs.length + panels;
    // 敷地の地盤面は ShapeGeometry なので prisms には入らない
    expect(prisms).toBe(expected);
  });

  it("領域を持つ空間はすべてピック対象になる", () => {
    const m = single("office.muro");
    const form = formOf(m);
    const pickable = form.spaces
      .filter((s) => s.level && (s.semiOutdoor || s.z1 !== undefined))
      .reduce((a, s) => a + s.outline.length, 0);
    expect(build(m).pickables.length).toBe(pickable);
  });
});

// ---- 2.1 壁の取合いが閉じている (koyu ADR-0063) ----------------------------
//
// 芯線に厚みを振るだけだと、直角に交わる二枚の壁が共有する点の外側に t/2 × t/2 の升が残り、
// **どちらの壁にも属さない。**koyu ADR-0063 がその穴を数えている — two-rooms 4・office 9・
// house 13・basement 17・mansion 85・complex 206。**ugatsu はまさにその作り方をしていた**
// ので、同じ穴が 3D の隅という隅に開いていた。
//
// 0.22.0 の `derive` が取合いを決め、区間は `footprint` を持って届く。ここはその穴の数え方を
// **描かれた立体に対して**行う: 端点を共有する二枚の壁の外側の升の中心を取り、シーンに立った
// 壁のどれかがそこを覆っていることを言う。芯線から箱を起こす実装では、この点はどの壁にも
// 入らない。

const near = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

/** 多角形の内側か (射線法)。標本は升の中心なので、辺の上に乗ることはない */
function covers(poly: Pt[], q: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * そのレベルの平面に落ちた**壁の**足あと。
 * 空間の気積は `userData.path` を持ち、面は `showFabric:false` で出ない — 残るのが壁である
 */
function wallOutlines(m: Model, form: Form, level: string): Pt[][] {
  const hiddenLevels = Object.fromEntries(
    form.levels.filter((l) => l.name !== level).map((l) => [l.name, true as const]),
  );
  const built = build(m, { hiddenLevels, showFabric: false, showOpenings: false });
  const out: Pt[][] = [];
  built.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.path) return;
    const g = mesh.geometry as THREE.ExtrudeGeometry;
    if (g.type === "ExtrudeGeometry") out.push(shapeOf(g));
  });
  return out;
}

/** 端点を共有する二枚の壁が作る隅の、外側の升の中心 */
function cornerSamples(form: Form, level: string): Pt[] {
  const bodies = form.boundaries
    .filter((b) => b.level === level && b.material && b.material.panels.length > 0)
    .map((b) => {
      const s = b.segment;
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
      return {
        ends: [
          { x: s.x1, y: s.y1 },
          { x: s.x2, y: s.y2 },
        ] as [Pt, Pt],
        u: { x: (s.x2 - s.x1) / len, y: (s.y2 - s.y1) / len },
        half: b.material!.t / 2,
        panels: b.material!.panels,
      };
    });
  // 端が実体を持たない (開口が壁の端まで届いている) 場合、そこに閉じるべき隅は無い
  const bodied = (b: (typeof bodies)[number], p: Pt): boolean =>
    b.panels.some((q) => near({ x: q.x1, y: q.y1 }, p) || near({ x: q.x2, y: q.y2 }, p));
  const out: Pt[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      if (Math.abs(a.u.x * b.u.y - a.u.y * b.u.x) < 1e-9) continue; // 平行 — 突き付けであって隅ではない
      for (const ea of [0, 1] as const) {
        for (const eb of [0, 1] as const) {
          const n = a.ends[ea];
          if (!near(n, b.ends[eb]) || !bodied(a, n) || !bodied(b, n)) continue;
          // それぞれが節点の先へ伸びる向き。升はその二つの向きの側にある
          const wa = ea === 1 ? a.u : { x: -a.u.x, y: -a.u.y };
          const wb = eb === 1 ? b.u : { x: -b.u.x, y: -b.u.y };
          out.push({
            x: n.x + wa.x * (b.half / 2) + wb.x * (a.half / 2),
            y: n.y + wa.y * (b.half / 2) + wb.y * (a.half / 2),
          });
        }
      }
    }
  }
  return out;
}

describe("壁の取合いは閉じている (koyu ADR-0063)", () => {
  for (const [name, load] of Object.entries(CASES)) {
    it(`${name}: 端点を共有する壁の隅に穴が無い`, () => {
      const m = load();
      const form = formOf(m);
      let sampled = 0;
      const open: string[] = [];
      for (const l of form.levels) {
        const samples = cornerSamples(form, l.name);
        if (samples.length === 0) continue;
        const walls = wallOutlines(m, form, l.name);
        for (const q of samples) {
          sampled++;
          if (!walls.some((poly) => covers(poly, q))) open.push(`${l.name} ${q.x},${q.y}`);
        }
      }
      // 母集団が空なら上の一致は何も言っていない
      expect(sampled).toBeGreaterThan(0);
      expect(open).toEqual([]);
    });
  }
});

// ---- 3. 平面が Form を取りこぼさない ---------------------------------------

/**
 * そのレベルの 2Dエンティティから、印の役ごとの期待数を組む。
 * **省くのは二つだけ** — 垂れ壁 (切断面より上の壁) と腰壁 (開口の下の壁)。
 */
function expectedMarks(form: Form, level: string): Record<string, number> {
  const plan = form.plans.find((p) => p.level === level);
  const out: Record<string, number> = {};
  const bump = (role: MarkRole, n = 1) => {
    out[role] = (out[role] ?? 0) + n;
  };
  const spaces = new Map(form.spaces.map((s) => [s.path, s]));
  const boundaries = new Map(form.boundaries.map((b) => [b.ref, b]));
  const openings = new Map(form.openings.map((o) => [o.ref, o]));
  for (const e of plan?.entities ?? []) {
    if (e.of === "space" && e.class === "cut" && e.polygon) {
      if (spaces.get(e.ref)?.void) {
        bump("space-void");
        bump("void-hatch");
      } else if (spaces.get(e.ref)?.semiOutdoor) bump("space-semi-outdoor");
      // 半屋外は**役**であって塗りの薄さではない (koyu 0.24) — 淡さの意味は消費者ごとに違う
      else bump("space");
    } else if (e.of === "space" && e.class === "above" && e.polygon) bump("void-above");
    // **物があるかどうかを言うのは `polygon` の有無である。**区間は足あとと芯線の両方を
    // 持って届くので (koyu ADR-0058)、`lines` の有無で分けるとすべての壁が「物を持たない
    // 境界」に落ちる。かつてここは実装と同じ順で枝を書いており、**実装が壊れたときに
    // 一緒に壊れて通った** — 期待値は Form の意味から書く
    else if (e.of === "boundary" && !e.polygon) {
      if (e.lines) bump("open");
    } else if (e.of === "boundary") {
      if (e.class === "above") continue; // 垂れ壁 — 描かない
      if (boundaries.get(e.ref)?.air) bump("rail");
      else if (e.class === "cut") bump("wall");
      // class:"below" の壁 = 腰壁 — 描かない
    } else if (e.of === "opening") {
      const o = openings.get(e.ref)!;
      if (e.class === "swing") {
        if (o.sliding) {
          bump("slide-panel");
          bump("slide-tail");
        } else {
          if (e.lines) bump("door-leaf");
          if (e.arc) bump("door-arc");
        }
      } else if (o.kind !== "door" && e.lines) bump("window");
    } else if (e.of === "column" && e.polygon) bump("column");
    else if (e.of === "run") {
      if (e.role === "outline" && e.lines) bump("run-outline");
      else if (e.role === "tread" && e.lines) bump("run-tread");
      else if (e.role === "break" && e.lines) bump("run-break");
      else if (e.role === "arrow" && e.lines) bump("run-arrow");
      else if (e.class === "anchor" && e.anchor) bump("run-note");
    }
  }
  bump("seg", form.segs.filter((g) => g.level === level).length);
  if (out["seg"] === 0) delete out["seg"];
  return out;
}

function actualMarks(form: Form, level: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of planMarks(form, level)) out[k.role] = (out[k.role] ?? 0) + 1;
  return out;
}

describe("平面は Form の 2Dエンティティを取りこぼさない", () => {
  for (const [name, load] of Object.entries(CASES)) {
    it(`${name}: 全レベルで印の数が Form と一致する`, () => {
      const form = formOf(load());
      for (const l of form.levels) {
        expect({ [l.name]: actualMarks(form, l.name) }).toEqual({
          [l.name]: expectedMarks(form, l.name),
        });
      }
    });
  }

  // **数の一致だけでは足りなかった。**壁が一本残らず「開放的な分節」の破線として描かれても、
  // 期待値が実装と同じ枝を書いていれば数は合う (実際に合っていた — koyu ADR-0058 で境界の
  // エンティティが足あとと芯線の両方を持つようになったとき、平面から黒帯が全部消えた)。
  // だからここは数ではなく、**物のある境界が物として描かれること**そのものを言う。
  describe("材を持つ境界は帯として描かれる (破線に落ちない)", () => {
    for (const [name, load] of Object.entries(CASES)) {
      it(`${name}: 破線になるのは材を持たない境界だけである`, () => {
        const form = formOf(load());
        const air = new Map(form.boundaries.map((b) => [b.ref, b.air]));
        let walls = 0;
        for (const l of form.levels) {
          const plan = form.plans.find((p) => p.level === l.name);
          if (!plan) continue;
          const bs = plan.entities.filter((e) => e.of === "boundary");
          const n = (f: (e: (typeof bs)[number]) => boolean) => bs.filter(f).length;
          const marks: Mark[] = planMarks(form, l.name);
          const role = (r: MarkRole) => marks.filter((k) => k.role === r).length;

          // **破線になるのは材を持たない境界だけ。**足あとを持つエンティティが一つでも
          // ここへ落ちれば数が合わない — 壁が全部破線になっていたのがまさにこれである
          expect(role("open")).toBe(n((e) => !e.polygon && !!e.lines));
          // 黒帯 = 切断面が切った材 (遮蔽するもの)
          expect(role("wall")).toBe(n((e) => e.class === "cut" && !!e.polygon && !air.get(e.ref)));
          // 柵の線 = 遮蔽しない材。切断面より下でも見えがかりとして引く
          expect(role("rail")).toBe(n((e) => e.class !== "above" && !!e.polygon && !!air.get(e.ref)));
          walls += role("wall");
        }
        // 同梱例はどれも壁のある建物である — 母集団が空なら上の一致は何も言っていない
        expect(walls).toBeGreaterThan(0);
      });
    }
  });

  it("印は必ず Form の対象の同一性を持つ (どの空間・境界・開口の線かが言える)", () => {
    const form = formOf(layered("complex"));
    for (const l of form.levels) {
      for (const k of planMarks(form, l.name)) expect(k.ref).not.toBe("");
    }
  });
});

// ---- 4. 上部吹抜けの投影 ---------------------------------------------------

// 下階の平面に上階の吹抜けを破線で落とす作図慣習。**かつては一つも描かれていなかった** —
// 平面が `wall` と `open` 以外の境界を捨てていたためである (docs/scope.md §3.1)。
// 母集団は「階をまたぐ `boundary type:void` の宣言」で、同梱例に 11 件ある
const VOID_ABOVE: Record<string, number> = {
  complex: 4,
  twin: 4,
  tower: 1,
  house: 1,
  "office.muro": 1,
};

describe("上部吹抜けの投影が平面に落ちる", () => {
  for (const [name, n] of Object.entries(VOID_ABOVE)) {
    it(`${name}: ${n} 件の吹抜けが下階に現れる`, () => {
      const form = formOf(CASES[name]!());
      const drawn = new Set<string>();
      for (const l of form.levels) {
        for (const k of planMarks(form, l.name)) {
          if (k.role === "void-above") drawn.add(`${l.name}:${k.ref}`);
        }
      }
      expect(drawn.size).toBe(n);
    });
  }

  it("同梱例あわせて 11 件 — 一つも落ちない", () => {
    const total = Object.keys(VOID_ABOVE).reduce((a, name) => {
      const form = formOf(CASES[name]!());
      const drawn = new Set<string>();
      for (const l of form.levels) {
        for (const k of planMarks(form, l.name)) {
          if (k.role === "void-above") drawn.add(`${l.name}:${k.ref}`);
        }
      }
      return a + drawn.size;
    }, 0);
    expect(total).toBe(11);
  });
});

// 斜めの線分 (koyu ADR-0022 の描かれた線) の上の開口。かつては平面の帯も扉の軌跡も
// 軸に沿った形で描かれ、3D の壁割りは斜めでは開口を抜かなかった (docs/scope.md §3.1)。
// **同梱例には斜めの線分に書かれた開口が一件も無い**ので、ここで最小の例を立てる
const DIAGONAL = `muro 1.3
grid X 0 8000
grid Y 0 8000
level L1 0 h:2700 slab:300
space /L1/a room X1..X2 Y1..Y2
space /out name:外部 outside:1
boundary /L1/a /out t:200
  line X1,Y1+3000 X2,Y2
  door w:900
`;

describe("斜め線分の上の開口も形になる", () => {
  it("壁は斜めのまま開口で割れ、軌跡は法線から決まる", () => {
    const m = parse(DIAGONAL);
    const form = formOf(m);
    const o = form.openings[0]!;
    expect(o.segment.diagonal).toBe(true);
    expect(o.swing).toBeDefined();
    // 全高 — 開口の上 — 全高 の三区間。軸に沿った矩形ではなく芯線に沿った四辺形である
    const panels = form.boundaries.find((b) => b.material && b.segment.diagonal)!.material!.panels;
    expect(panels.length).toBe(3);
    expect(panels[1]!.z0).toBe(o.z1); // 扉の上の垂れ壁
    // 平面にも立体にも、Form の形がそのまま出る
    const marks = planMarks(form, "L1").map((k: Mark) => k.role);
    expect(marks).toContain("door-leaf");
    expect(marks).toContain("door-arc");
    expect(actualBoxes(build(m).group)).toEqual(expectedBoxes(form));
    expect(actualPrisms(build(m).group)).toEqual(expectedPrisms(form));
  });
});

// ---- 5. 決まらなければ形を作らない -----------------------------------------

const UNDETERMINED = `muro 1.3
grid X 0 4000
grid Y 0 5000
level L1 0 slab:300
space /L1/a room X1..X2 Y1..Y2
space /out name:外部 outside:1
boundary /L1/a /out
`;

describe("天井高が決まらなければ立体を作らない (docs/scope.md §5.2)", () => {
  it("koyu が階高を返さないレベルには、壁も柱も気積も立たない", () => {
    const m = parse(UNDETERMINED);
    const form = formOf(m);
    // koyu 側の答え — 階高は決まらず、壁は材を持たない (SUF01 が error として言う)
    expect(form.levels.map((l) => l.pitch)).toEqual([undefined]);
    expect(form.boundaries.filter((b) => b.material)).toEqual([]);
    // ugatsu 側 — かつては 2400mm で描いてしまい、check が赤いのに立体が完成して見えた
    const built = build(m);
    expect(actualBoxes(built.group)).toEqual([]);
    // 押し出しに残るのは koyu が返した面 (床版) だけ — 壁の足あても気積も一つも無い
    expect(actualPrisms(built.group)).toEqual(expectedPrisms(form));
    expect(expectedPrisms(form).length).toBe(form.slabs.length);
    expect(built.pickables).toEqual([]);
  });
});
