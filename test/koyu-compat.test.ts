// **移植したものを、koyu に対して縛る。**
//
// `src/lib/koyu-compat.ts` は koyu が公開面から取り下げた名を持つ (koyu ADR-0053)。移植の
// 危険は落ちないことである — `canonicalBoundaryOrder` の並びが一つずれても例外は出ず、
// **別の壁の `spec` を読んで違う色のガラスが立つ**だけになる。だから koyu の出力に
// 突き合わせる: 正準JSON (`toCanonical`) の並びと、`derive` が振った索引の両方に対して。
//
// ここが落ちたら移植が古びた合図である。koyu がこれらを出し直したら、この頁ごと消える。
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkDiagnostics, parse, parseFiles, toCanonical } from "@kensnzk/koyu";
import { derive } from "@kensnzk/koyu/form";
import type { Model } from "@kensnzk/koyu/model";
import { writtenOf } from "@kensnzk/koyu/draw";
import { glassSpec } from "../src/lib/written.js";
import { polyBounds, polygonAreaM2, siteReport } from "../src/lib/koyu-compat.js";
import { slopeText } from "../src/lib/planWords.js";

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

describe("自由語の意味を決める一点 — glassSpec (docs/scope.md §5.2)", () => {
  // 索引から原本へ戻る道そのものは koyu 0.24 の `writtenOf` が持つ。並びが一つずれても
  // 例外は出ず別の壁の語を読むだけなので、koyu 側に試験がある (test/marks.test.ts)。
  // ここが確かめるのは ugatsu にしか無いもの — **語を読んで透過に落とす判断**が端から端で
  // 効くことである
  it("complex: カーテンウォールと書かれた境界だけが透過になる", () => {
    const m = layered("complex");
    const form = derive(m);
    const isGlass = glassSpec(m);
    const glass = form.boundaries.filter((b) => isGlass(b));
    expect(glass.length).toBeGreaterThan(0);
    // 透過になった境界の語は、実際に硝子を言う語である
    const written = writtenOf(m);
    for (const b of glass) {
      expect(written.boundarySpec(b.boundary)).toMatch(/カーテンウォール|ガラス|サッシ|glass/i);
    }
    // 硝子でない語 (RC など) を透過にしていない
    const opaque = form.boundaries.filter((b) => !isGlass(b));
    expect(opaque.length).toBeGreaterThan(0);
    for (const b of opaque) {
      const v = written.boundarySpec(b.boundary);
      if (v !== undefined) expect(v).not.toMatch(/カーテンウォール|ガラス|サッシ|glass/i);
    }
  });
});

describe("小さな幾何が koyu の導出と同じ数を返す", () => {
  it("polygonAreaM2: 敷地形状の面積が Form の答えと一致する", () => {
    const form = derive(layered("tower"));
    expect(form.site.length).toBeGreaterThan(0);
    for (const s of form.site) {
      expect(polygonAreaM2(s.points)).toBeCloseTo(s.areaM2, 2);
    }
  });

  it("polyBounds: 頂点列の外接矩形", () => {
    expect(
      polyBounds([
        { x: 3, y: -1 },
        { x: -2, y: 5 },
        { x: 1, y: 2 },
      ]),
    ).toEqual({ x1: -2, y1: -1, x2: 3, y2: 5 });
  });

  // 図面が勾配を言う綴り。**これは注記の言葉であって形ではない** (docs/scope.md §5.3)
  it("slopeText: 勾配を 1/n の綴りへ", () => {
    expect(slopeText(1 / 8)).toBe("1/8");
    expect(slopeText(1 / 12)).toBe("1/12");
    expect(slopeText(0)).toBe("—");
  });
});

describe("敷地の問いは koyu の分析が答える (siteReport の後身)", () => {
  it("house: 導出面積が宣言と一致し、接道が一本読める", () => {
    const site = siteReport(single("house.muro"));
    expect(site.hasSite).toBe(true);
    expect(site.declaredArea).toBeDefined();
    expect(site.derivedArea).toBeCloseTo(site.declaredArea!, 2);
    expect(site.roads.length).toBe(1);
    expect(site.roads[0]!.width).toBeGreaterThan(0);
    expect(site.roads[0]!.frontage).toBeGreaterThan(0);
  });

  it("同じモデルには同じ答えを返す (分析はモデル一つにつき一度)", () => {
    const m = layered("tower");
    expect(siteReport(m)).toBe(siteReport(m));
  });

  // **0 ㎡ と表示するのは嘘である。**敷地の無いモデルは「敷地が無い」と言い、
  // 比率の表そのものを出さない
  it("敷地の無いモデルでは hasSite が偽になる", () => {
    const site = siteReport(single("two-rooms.muro"));
    expect(site.hasSite).toBe(false);
    expect(site.roads).toEqual([]);
  });

  // 構造が矛盾していると分析は走らない (`unavailable`)。数を捏造せず、表を出さない
  it("整合しないモデルには数を返さない", () => {
    const src = [
      "muro 1.3",
      "grid X 0 4000",
      "grid Y 0 5000",
      "level L1 0 h:2400 slab:150",
      "space /L1/a room X1..X2 Y1..Y2",
      "space /L1/b room X1..X2 Y1..Y2", // 完全に重なる二室 — GEO02 (error)
      "space /out name:外部 outside:1",
      "zone /L1 site:1 area:200",
    ].join("\n");
    const broken = parse(src);
    expect(checkDiagnostics(broken).some((d) => d.severity === "error")).toBe(true);
    // 敷地ゾーンも屋内の床もあるのに、分析が走らないので数は一つも出ない
    const site = siteReport(broken);
    expect(site.hasSite).toBe(false);
    expect(site.totalFloor).toBe(0);
    // 同じ原本から矛盾を取り除けば、同じ問いに数が返る (出ないのが「敷地が無いから」ではない)
    const fixed = parse(src.replace("space /L1/b room X1..X2 Y1..Y2", ""));
    expect(checkDiagnostics(fixed).some((d) => d.severity === "error")).toBe(false);
    expect(siteReport(fixed).hasSite).toBe(true);
    expect(siteReport(fixed).totalFloor).toBeGreaterThan(0);
  });
});
