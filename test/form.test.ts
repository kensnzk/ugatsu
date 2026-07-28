// **凍結面「導出の一致」の実体** (docs/scope.md §1)。
//
// ugatsu は参照実装と同じ形を作る。見た目の質はここに足すが、形は変えない。
// その約束を機械が縛れるようになったのは koyu が `derive(model): Form` を立ててからで
// ある (koyu ADR-0040 / spec/derivation.md)。ここが縛るのは五つ。
//
//   1. **形の出所が一つ** — 描画する頁が koyu の形の部品を直に呼ばない (import で縛る)
//   2. **立体が Form と一致する** — 壁の区間・建具・柱・段板が、Form から組み直した
//      期待値と座標まで一致する。捏造された既定値 (かつての 2400mm) はここで落ちる
//   3. **平面が Form を取りこぼさない** — そのレベルの 2Dエンティティが役ごとに全て印になる。
//      省くのは垂れ壁と腰壁の二つだけで、それも数として現れる
//   4. **上部吹抜けの投影が出る** — 同梱例に 11 件。かつては一つも描かれていなかった
//   5. **天井高が決まらなければ立体を作らない** — koyu が形を作らない場面で描かない
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { derive, parse, parseFiles, type Form, type Model } from "@kensnzk/koyu";
import { buildColors } from "../src/lib/colors.js";
import { formOf } from "../src/lib/form.js";
import { planFigure, type MarkRole } from "../src/lib/planFigure.js";
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
 * 形を組み立てる koyu の部品。**描く頁がこれを直に呼ぶと、同じ部品から違う形が出る余地が
 * 戻ってくる。**形は `formOf(model)` (= `derive`) からのみ来る
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
  "src/lib/planFigure.ts",
];

/** そのファイルが `@kensnzk/koyu` から取り込んでいる名 (値も型も) */
function koyuImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"@kensnzk\/koyu"/g)) {
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

  it("`derive` を取り込むのは src/lib/form.ts だけ (平面と立体が別の形を見ない)", () => {
    const callers = ["src", "test"]
      .flatMap((dir) => walk(dir))
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => koyuImports(f).includes("derive"));
    expect(callers.sort()).toEqual(["src/lib/form.ts", "test/form.test.ts"]);
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

/** `Form` だけから、3Dシーンに立つべき箱の集合を組む */
function expectedBoxes(form: Form): string[] {
  const out: string[] = [];
  for (const b of form.boundaries) {
    if (!b.material) continue;
    for (const p of b.material.panels) {
      const k = segKey(p, p.z0, p.z1, b.material.t);
      if (k) out.push(k);
    }
  }
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

const build = (m: Model, over: Partial<Parameters<typeof buildScene>[1]> = {}) =>
  buildScene(formOf(m), {
    colors: buildColors(m, "use"),
    stackMode: false,
    spread: 1,
    showWalls: true,
    showOpenings: true,
    hiddenLevels: {},
    ...over,
  });

describe("立体は Form と一致する", () => {
  for (const [name, load] of Object.entries(CASES)) {
    it(`${name}: 壁の区間・建具・柱・段板が Form の座標のまま立つ`, () => {
      const m = load();
      expect(actualBoxes(build(m).group)).toEqual(expectedBoxes(formOf(m)));
    });
  }

  it("押し出しは Form が z を持つ空間と面にだけ立つ (捏造した階高は無い)", () => {
    const m = layered("tower");
    const form = formOf(m);
    const built = build(m);
    const prisms = built.group.children.filter(
      (o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).geometry as { type?: string }).type === "ExtrudeGeometry",
    ).length;
    const volumes = form.spaces.filter((s) => s.level && (s.semiOutdoor || s.z1 !== undefined));
    const expected =
      volumes.reduce((a, s) => a + s.outline.length, 0) + form.slabs.length + form.site.length;
    // 敷地の地盤面は ShapeGeometry なので prisms には入らない
    expect(prisms).toBe(expected - form.site.length);
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
      if (spaces.get(e.ref)?.type === "void") {
        bump("space-void");
        bump("void-hatch");
      } else bump("space");
    } else if (e.of === "space" && e.class === "above" && e.polygon) bump("void-above");
    else if (e.of === "boundary" && e.lines) bump("open");
    else if (e.of === "boundary" && e.polygon) {
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
  for (const k of planFigure(form, level)) out[k.role] = (out[k.role] ?? 0) + 1;
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

  it("印は必ず Form の対象の同一性を持つ (どの空間・境界・開口の線かが言える)", () => {
    const form = formOf(layered("complex"));
    for (const l of form.levels) {
      for (const k of planFigure(form, l.name)) expect(k.ref).not.toBe("");
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
        for (const k of planFigure(form, l.name)) {
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
        for (const k of planFigure(form, l.name)) {
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
const DIAGONAL = `koyu 1.0
grid X 0 8000
grid Y 0 8000
level L1 0 h:2700 slab:300
space /L1/a room X1..X2 Y1..Y2
space /out exterior
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
    const marks = planFigure(form, "L1").map((k) => k.role);
    expect(marks).toContain("door-leaf");
    expect(marks).toContain("door-arc");
    expect(actualBoxes(build(m).group)).toEqual(expectedBoxes(form));
  });
});

// ---- 5. 決まらなければ形を作らない -----------------------------------------

const UNDETERMINED = `koyu 1.0
grid X 0 4000
grid Y 0 5000
level L1 0 slab:300
space /L1/a room X1..X2 Y1..Y2
space /out exterior
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
    expect(built.pickables).toEqual([]);
  });
});
