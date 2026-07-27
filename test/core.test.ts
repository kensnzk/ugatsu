// @kensnzk/koyu が期待どおり答えること・ビューワーの集計とシーン生成の検算
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  areaM2,
  check,
  DEFAULT_LANGUAGE_VERSION,
  doorsBetween,
  isIndoor,
  parse,
  parseFiles,
  segmentsFor,
  siteReport,
  svgPlan,
  toCanonical,
  zoneAreaM2,
} from "@kensnzk/koyu";
import { buildColors } from "../src/lib/colors.js";
import { computeStats, statsToCsv } from "../src/lib/stats.js";
import {
  KOYU_VERSION,
  MURO_VERSION,
  UGATSU_VERSION,
  VERSION_LINE,
} from "../src/lib/versions.js";
import { useViewer } from "../src/state/store.js";
import { buildScene } from "../src/three/buildScene.js";

const load = (name: string) => parse(readFileSync(`examples/${name}`, "utf8"));

describe("koyuパッケージ", () => {
  it("二室一扉: 3空間・3境界・面積16.2㎡", () => {
    const m = load("two-rooms.muro");
    expect(m.spaces.size).toBe(3);
    expect(m.boundaries.length).toBe(3);
    expect(areaM2(m.spaces.get("/L1/a")!)).toBeCloseTo(16.2, 2);
    expect(check(m).errors).toEqual([]);
  });

  it("オフィス: checkが整合し、hall|officeの境界はX2の一本の壁芯", () => {
    const m = load("office.muro");
    expect(check(m).errors).toEqual([]);
    const b = m.boundaries.find((x) => x.a === "/L1/hall" && x.b === "/L1/office")!;
    const segs = segmentsFor(m, b);
    expect(segs.length).toBe(1);
    expect(segs[0]!.horizontal).toBe(false);
    expect(segs[0]!.x1).toBe(6400);
  });

  it("集合住宅: 基準階の展開で122空間・332境界 (v0.5)", () => {
    const m = load("mansion.muro");
    expect(m.spaces.size).toBe(122);
    expect(m.boundaries.length).toBe(332);
    expect(check(m).errors).toEqual([]);
  });

  it("戸建住宅: 敷地の問い — 導出面積が宣言と一致し、接道が読める (v0.5)", () => {
    const m = load("house.muro");
    expect(check(m).errors).toEqual([]);
    const site = siteReport(m);
    expect(site.siteZone).toBeDefined();
    expect(site.derivedArea).toBeCloseTo(site.declaredArea!, 2);
    expect(site.roads.length).toBe(1);
    expect(m.boundaries.some((b) => b.air)).toBe(true); // 手すり・柵 (air) を含む
  });

  it("ゾーン: Aタイプの専有面積は34.8㎡ (間取りに割っても言葉は壊れない)", () => {
    const m = load("mansion.muro");
    expect(m.zones.size).toBe(8);
    expect(zoneAreaM2(m, "/L2/A")).toBeCloseTo(34.8, 2);
  });

  it("グラフ: 吹抜け(void)は空間として連続するが通行できない", () => {
    const m = load("office.muro");
    expect(doorsBetween(m, "/L1/hall", "/L2/void")).toBeUndefined();
    const route = doorsBetween(m, "/L2/office", "/out");
    expect(route).toBeDefined();
    expect(route!.doors).toBeGreaterThan(0);
  });

  it("正準JSONと平面SVGがそのまま出せる", () => {
    const m = load("office.muro");
    const json = JSON.parse(toCanonical(m));
    // 言語版は直書きしない — koyu の台帳 (ADR-0017) を参照し、版が上がれば追随する
    expect(json.koyu).toBe(DEFAULT_LANGUAGE_VERSION);
    expect(Object.keys(json.spaces).length).toBe(m.spaces.size);
    expect(svgPlan(m, { level: "L1" })).toContain("</svg>");
  });
});

describe("合成 (koyu ADR-0010 — v0.6)", () => {
  const HOUSE_LAYERS = [
    "main.muro",
    "assets.muro",
    "site.muro",
    "L1.muro",
    "L2.muro",
  ] as const;
  const loadLayers = () =>
    Object.fromEntries(
      HOUSE_LAYERS.map((f) => [f, readFileSync(`examples/house/${f}`, "utf8")]),
    );

  it("5レイヤーの戸建がブラウザと同じ経路 (parseFiles) で合成され整合する", () => {
    const m = parseFiles(loadLayers(), "main.muro");
    expect(check(m).errors).toEqual([]);
    expect(m.spaces.size).toBe(13);
    expect(zoneAreaM2(m, "/home")).toBeCloseTo(92.75, 2); // 単一ファイル版と同じ答え
    expect(m.spaces.get("/home/ldk")!.file).toBe("L1.muro"); // 出所レイヤー
  });

  it("建具アセット: 引き戸SD1の参照がstyleと寸法を運ぶ", () => {
    const m = parseFiles(loadLayers(), "main.muro");
    const b = m.boundaries.find((x) => x.a === "/home/ldk" && x.b === "/home/hall1")!;
    expect(b.openings[0]!.ref).toBe("SD1");
    expect(b.openings[0]!.attrs["style"]).toBe("sliding");
    expect(b.openings[0]!.w).toBe(800);
  });

  it("コンフリクト: 別レイヤーの空間パス重複は出所つきで落ちる", () => {
    const files = loadLayers();
    files["L2.muro"] += "\nspace /home/ldk room X1..X2 Y1..Y3 level:L2\n";
    expect(() => parseFiles(files, "main.muro")).toThrowError(/L2\.muro.*空間パスが重複.*L1\.muro/s);
  });

  it("checkエラーも出所レイヤーつき (壁からのはみ出し)", () => {
    const files = loadLayers();
    files["L1.muro"] = files["L1.muro"]!.replace("at:Y2+1820", "at:Y2+3500");
    const m = parseFiles(files, "main.muro");
    const errs = check(m).errors;
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toMatch(/^L1\.muro:\d+行目.*はみ出します/);
  });
});

describe("ショーケース (tower — 9レイヤー合成 + polygon敷地)", () => {
  const TOWER_LAYERS = [
    "main.muro",
    "site-geometry.muro",
    "site.muro",
    "assets.muro",
    "L1.muro",
    "L2.muro",
    "typical.muro",
    "L3.muro",
    "L11.muro",
  ] as const;
  const loadTower = () =>
    Object.fromEntries(
      TOWER_LAYERS.map((f) => [f, readFileSync(`examples/tower/${f}`, "utf8")]),
    );

  it("178空間・542境界が警告ゼロで合成される (ブラウザと同じ経路)", () => {
    const m = parseFiles(loadTower(), "main.muro");
    const r = check(m);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(m.spaces.size).toBe(178);
  });

  it("敷地形状: polygonが5頂点で、siteの導出面積が測量宣言と一致", () => {
    const m = parseFiles(loadTower(), "main.muro");
    expect(m.polygons.get("/site")?.points.length).toBe(5);
    const site = siteReport(m);
    expect(site.derivedArea).toBeCloseTo(site.declaredArea!, 2);
  });

  it("3D: 壁は階高いっぱいに立ち上がる (天井高で止まらない)", () => {
    const m = parseFiles(loadTower(), "main.muro");
    const colors = buildColors(m, "use");
    const built = buildScene(m, {
      colors,
      stackMode: false,
      spread: 1,
      showWalls: true,
      showOpenings: false,
      hiddenLevels: {},
    });
    // L5 (z=14000, 階高3000) の壁ボックスを拾う: 中心高さ = 14000 + 3000/2
    const boxes = built.group.children.filter(
      (o): o is import("three").Mesh =>
        (o as import("three").Mesh).isMesh === true &&
        ((o as import("three").Mesh).geometry as { type?: string }).type === "BoxGeometry" &&
        !(o as import("three").Mesh).userData.path,
    );
    const l5walls = boxes.filter((b) => Math.abs(b.position.y - (14000 + 1500)) < 1);
    expect(l5walls.length).toBeGreaterThan(0);
    // 手すり (air:1 h:1200) は自身の高さのまま
    const rails = boxes.filter((b) => Math.abs(b.position.y - (14000 + 600)) < 1);
    expect(rails.length).toBeGreaterThan(0);
  });
});

describe("面積表 (MUN-144)", () => {
  it("レベル小計の和が合計に一致し、吹抜けは不算入", () => {
    const m = load("office.muro");
    const s = computeStats(m);
    const sum = s.levels.reduce((a, l) => a + l.subtotal, 0);
    expect(s.total).toBeCloseTo(sum, 1);
    const voidRow = s.levels.flatMap((l) => l.rows).find((r) => r.cls === "void");
    expect(voidRow).toBeDefined();
    expect(voidRow!.area).toBeUndefined();
  });

  it("use別集計: オフィスのrentable+commonが全体を覆う", () => {
    const m = load("office.muro");
    const s = computeStats(m);
    const covered = s.byUse.reduce((a, u) => a + u.area, 0);
    expect(covered).toBeCloseTo(s.total, 1);
  });

  it("CSVに延べ面積とゾーンが載る", () => {
    const m = load("mansion.muro");
    const csv = statsToCsv(computeStats(m), "テスト");
    expect(csv).toContain("延べ面積");
    expect(csv).toContain("/L2/A");
  });
});

// **ugatsu は意味を作らない** (koyu spec/scope.md §1)。母集団の判断は koyu の isIndoor が持ち、
// ここは「同じ答えになること」だけを縛る。かつて ugatsu は「吹抜け以外はすべて床」と数え、
// 外部と半屋外を延べ面積へ算入していた (ADR-0006)。
describe("面積の母集団は koyu が決める (ADR-0006)", () => {
  const layered = (dir: string, entry = "main.muro") => {
    const files = Object.fromEntries(
      readdirSync(`examples/${dir}`)
        .filter((f) => f.endsWith(".muro"))
        .map((f) => [f, readFileSync(`examples/${dir}/${f}`, "utf8")]),
    );
    return parseFiles(files, entry);
  };

  /** koyu の isIndoor だけで数え直した延べ面積 — 表を通さない対照 */
  const indoorSum = (m: ReturnType<typeof parse>) => {
    let t = 0;
    for (const s of m.spaces.values()) if (isIndoor(m, s)) t += areaM2(s) ?? 0;
    return Math.round(t * 100) / 100;
  };

  for (const dir of ["complex", "twin", "tower", "house"]) {
    it(`${dir}: 表の合計が isIndoor の合計と一致する`, () => {
      const m = layered(dir);
      expect(computeStats(m).total).toBeCloseTo(indoorSum(m), 2);
    });
  }

  it("complex: 延べ 31,606.24㎡ / 屋外 736.00㎡ が別に立つ (koyu stats と同値)", () => {
    const s = computeStats(layered("complex"));
    expect(s.total).toBeCloseTo(31606.24, 2);
    expect(s.outdoorTotal).toBeCloseTo(736.0, 2);
    expect(s.semiTotal).toBeCloseTo(0, 2);
  });

  it("twin: 半屋外 6,534.08㎡ は延べ面積に入らず別掲される", () => {
    const s = computeStats(layered("twin"));
    expect(s.total).toBeCloseTo(141448.56, 2);
    expect(s.outdoorTotal).toBeCloseTo(24911.04, 2);
    expect(s.semiTotal).toBeCloseTo(6534.08, 2);
  });

  it("区分は isIndoor と厳密に一致する (行の分け方が母集団を作らない)", () => {
    const m = layered("twin");
    const rows = new Map(computeStats(m).levels.flatMap((l) => l.rows).map((r) => [r.path, r]));
    for (const s of m.spaces.values()) {
      if (s.rects.length === 0 || !s.level) continue;
      const row = rows.get(s.path);
      if (!row) continue;
      expect(row.cls === "indoor").toBe(isIndoor(m, s));
    }
  });

  it("敷地ゾーン (site:1) は建物の集約ではないので出さない", () => {
    const s = computeStats(layered("complex"));
    expect(s.zones.some((z) => z.path === "/site")).toBe(false);
  });

  it("延べ面積は siteReport の totalFloor と一致する (同じ問いに二つの答えを持たない)", () => {
    const m = layered("complex");
    expect(computeStats(m).total).toBeCloseTo(siteReport(m).totalFloor, 2);
  });
});

describe("版の埋め込み (ADR-0006)", () => {
  it("三本の版がすべて名乗られる", () => {
    expect(UGATSU_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(KOYU_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(MURO_VERSION).toBe(DEFAULT_LANGUAGE_VERSION);
    expect(VERSION_LINE).toContain(`koyu ${KOYU_VERSION}`);
  });

  it("焼き込まれた koyu の版が、実際に解決された実体と一致する", () => {
    const resolved = JSON.parse(
      readFileSync("node_modules/@kensnzk/koyu/package.json", "utf8"),
    ) as { version: string };
    expect(KOYU_VERSION).toBe(resolved.version);
  });
});

describe("動線UIは到達可能である (ADR-0006)", () => {
  it("setRouteTarget が経路を立て、選択を外すと消える", () => {
    const m = load("office.muro");
    const st = useViewer.getState();
    st.setSource(readFileSync("examples/office.muro", "utf8"), "office.muro");
    useViewer.getState().select("/L2/office");
    useViewer.getState().setRouteTarget("/out");
    const route = useViewer.getState().route;
    expect(route).not.toBeNull();
    expect(route).not.toBe("unreachable");
    expect((route as { doors: number }).doors).toBe(doorsBetween(m, "/L2/office", "/out")!.doors);
    useViewer.getState().setRouteTarget(null);
    expect(useViewer.getState().route).toBeNull();
  });
});

describe("シーン生成", () => {
  it("Cartesian grid は既定で非表示にし、検査時だけ明示的に有効化する", () => {
    expect(useViewer.getState().showGrid).toBe(false);
    useViewer.getState().setShowGrid(true);
    expect(useViewer.getState().showGrid).toBe(true);
    useViewer.getState().setShowGrid(false);
  });

  it("3D: 領域を持つ空間がすべてピック対象になり、壁メッシュが生まれる", () => {
    const m = load("office.muro");
    const colors = buildColors(m, "use");
    const built = buildScene(m, {
      colors,
      stackMode: false,
      spread: 1,
      showWalls: true,
      showOpenings: true,
      hiddenLevels: {},
    });
    const rectCount = [...m.spaces.values()]
      .filter((s) => s.rects.length > 0 && s.level)
      .reduce((a, s) => a + s.rects.length, 0);
    expect(built.pickables.length).toBe(rectCount);
    expect(built.group.children.length).toBeGreaterThan(rectCount);
  });

  it("2.5D: 吹抜けにはプレートを置かない (床の不在)", () => {
    const m = load("office.muro");
    const colors = buildColors(m, "level");
    const built = buildScene(m, {
      colors,
      stackMode: true,
      spread: 2,
      showWalls: true,
      showOpenings: true,
      hiddenLevels: {},
    });
    const voidPicked = built.pickables.some((p) => (p.userData.path as string).includes("void"));
    expect(voidPicked).toBe(false);
  });

  it("レベルを隠すとそのレベルの空間が消える", () => {
    const m = load("office.muro");
    const colors = buildColors(m, "use");
    const built = buildScene(m, {
      colors,
      stackMode: false,
      spread: 1,
      showWalls: true,
      showOpenings: true,
      hiddenLevels: { L2: true },
    });
    const hasL2 = built.pickables.some((p) => (p.userData.path as string).startsWith("/L2/"));
    expect(hasL2).toBe(false);
  });
});
