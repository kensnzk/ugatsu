// vendorしたコアが本体と同じ答えを出すこと・ビューワーの集計とシーン生成の検算
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  areaM2,
  check,
  doorsBetween,
  parse,
  segmentsFor,
  svgPlan,
  toCanonical,
  zoneAreaM2,
} from "../src/core/index.js";
import { buildColors } from "../src/lib/colors.js";
import { computeStats, statsToCsv } from "../src/lib/stats.js";
import { buildScene } from "../src/three/buildScene.js";

const load = (name: string) => parse(readFileSync(`examples/${name}`, "utf8"));

describe("vendorコア", () => {
  it("二室一扉: 3空間・3境界・面積16.2㎡", () => {
    const m = load("two-rooms.ifcxs");
    expect(m.spaces.size).toBe(3);
    expect(m.boundaries.length).toBe(3);
    expect(areaM2(m.spaces.get("/L1/a")!)).toBeCloseTo(16.2, 2);
    expect(check(m).errors).toEqual([]);
  });

  it("オフィス: checkが整合し、hall|officeの境界はX2の一本の壁芯", () => {
    const m = load("office.ifcxs");
    expect(check(m).errors).toEqual([]);
    const b = m.boundaries.find((x) => x.a === "/L1/hall" && x.b === "/L1/office")!;
    const segs = segmentsFor(m, b);
    expect(segs.length).toBe(1);
    expect(segs[0]!.horizontal).toBe(false);
    expect(segs[0]!.x1).toBe(6400);
  });

  it("集合住宅: 基準階の展開で114空間・316境界", () => {
    const m = load("mansion.ifcxs");
    expect(m.spaces.size).toBe(114);
    expect(m.boundaries.length).toBe(316);
    expect(check(m).errors).toEqual([]);
  });

  it("ゾーン: Aタイプの専有面積は34.8㎡ (間取りに割っても言葉は壊れない)", () => {
    const m = load("mansion.ifcxs");
    expect(m.zones.size).toBe(8);
    expect(zoneAreaM2(m, "/L2/A")).toBeCloseTo(34.8, 2);
  });

  it("グラフ: 吹抜け(void)は空間として連続するが通行できない", () => {
    const m = load("office.ifcxs");
    expect(doorsBetween(m, "/L1/hall", "/L2/void")).toBeUndefined();
    const route = doorsBetween(m, "/L2/office", "/out");
    expect(route).toBeDefined();
    expect(route!.doors).toBeGreaterThan(0);
  });

  it("正準JSONと平面SVGがそのまま出せる", () => {
    const m = load("office.ifcxs");
    const json = JSON.parse(toCanonical(m));
    expect(json.ifcxs).toBe("0.1");
    expect(Object.keys(json.spaces).length).toBe(m.spaces.size);
    expect(svgPlan(m, { level: "L1" })).toContain("</svg>");
  });
});

describe("面積表 (MUN-144)", () => {
  it("レベル小計の和が合計に一致し、吹抜けは不算入", () => {
    const m = load("office.ifcxs");
    const s = computeStats(m);
    const sum = s.levels.reduce((a, l) => a + l.subtotal, 0);
    expect(s.total).toBeCloseTo(sum, 1);
    const voidRow = s.levels.flatMap((l) => l.rows).find((r) => r.isVoid);
    expect(voidRow).toBeDefined();
    expect(voidRow!.area).toBeUndefined();
  });

  it("use別集計: オフィスのrentable+commonが全体を覆う", () => {
    const m = load("office.ifcxs");
    const s = computeStats(m);
    const covered = s.byUse.reduce((a, u) => a + u.area, 0);
    expect(covered).toBeCloseTo(s.total, 1);
  });

  it("CSVに合計とゾーンが載る", () => {
    const m = load("mansion.ifcxs");
    const csv = statsToCsv(computeStats(m), "テスト");
    expect(csv).toContain("合計");
    expect(csv).toContain("/L2/A");
  });
});

describe("シーン生成", () => {
  it("3D: 領域を持つ空間がすべてピック対象になり、壁メッシュが生まれる", () => {
    const m = load("office.ifcxs");
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
    const m = load("office.ifcxs");
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
    const m = load("office.ifcxs");
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
