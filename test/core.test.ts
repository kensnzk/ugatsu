// @kensnzk/koyu が期待どおり答えること・ビューワーの集計とシーン生成の検算
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check, NEWEST_LANGUAGE_VERSION, parse, parseFiles, toCanonical } from "@kensnzk/koyu";
import { svgPlan } from "@kensnzk/koyu/draw";
import { doorsBetween, segmentsFor } from "@kensnzk/koyu/graph";
import { areaM2, isIndoor, zoneAreaM2 } from "@kensnzk/koyu/model";
import { buildColors } from "../src/lib/colors.js";
import { formOf } from "../src/lib/form.js";
import { siteReport } from "../src/lib/koyu-compat.js";
import { computeStats, statsToCsv } from "../src/lib/stats.js";
import {
  assertMuro,
  KOYU_VERSION,
  MURO_READS,
  MURO_REQUIRED,
  MURO_UNDECLARED,
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
    expect(site.hasSite).toBe(true);
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
    // 正準形が名乗る鍵は **`muro`** である — 版を持つのは言語であって実装ではない
    // (koyu ADR-0060。形式は koyu-canonical/2.0 へ上がった)。同梱例は最新版で書かれる
    expect(json.format).toBe("koyu-canonical/2.0");
    expect(json.muro).toBe(NEWEST_LANGUAGE_VERSION);
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
    expect(() => parseFiles(files, "main.muro")).toThrowError(
      /L2\.muro.*Duplicate space path.*L1\.muro/s,
    );
  });

  it("checkエラーも出所レイヤーつき (壁からのはみ出し)", () => {
    const files = loadLayers();
    files["L1.muro"] = files["L1.muro"]!.replace("at:Y2+1820", "at:Y2+3500");
    const m = parseFiles(files, "main.muro");
    const errs = check(m).errors;
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toMatch(/^L1\.muro:line \d+:.*runs off the boundary segment/);
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
    const colors = buildColors(m, "type");
    const built = buildScene(formOf(m), {
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

  // muro 1.3 が `use` を廃した (koyu ADR-0061)。集計軸は原本に書かれた名前空間つきの鍵から
  // 立ち、**バケツの合計は延べ面積に閉じる** — 鍵を持たない空間も「(未記載)」に入る。
  // かつての `byUse` は鍵の無い空間を黙って落としており、合計が合うのは偶然だった
  it("鍵別集計: どの鍵でもバケツの合計が延べ面積に一致する", () => {
    for (const name of ["office.muro", "mansion.muro"]) {
      const s = computeStats(load(name));
      expect(s.byAttr.length).toBeGreaterThan(0);
      for (const b of s.byAttr) {
        expect(b.rows.reduce((a, r) => a + r.area, 0)).toBeCloseTo(s.total, 1);
      }
    }
  });

  it("集計軸は書かれた鍵だけ — 既定の軸を持たない (koyu ADR-0061 決定6)", () => {
    // 名前空間の無い鍵 (h・daylight・name) は区分ではないので軸に立たない
    expect(computeStats(load("mansion.muro")).keys).toEqual(["lease.category"]);
    // 鍵を一つも書かない原本では、集計の表そのものが立たない
    expect(computeStats(load("two-rooms.muro")).keys).toEqual([]);
    expect(computeStats(load("two-rooms.muro")).byAttr).toEqual([]);
  });

  it("CSVに延べ面積とゾーンが載る", () => {
    const m = load("mansion.muro");
    const csv = statsToCsv(computeStats(m), "テスト");
    expect(csv).toContain("延べ面積");
    expect(csv).toContain("/L2/A");
    expect(csv).toContain("lease.category 別"); // 列も見出しも書かれた鍵から立つ
  });
});

// **ugatsu は意味を作らない** (koyu docs/reference/scope.md)。母集団の判断は koyu の isIndoor が持ち、
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

  // **型の位置から構造を読まない** (koyu ADR-0051 / muro 1.1 以降)。外部は `outside:1`、
  // 吹抜けは `void:1` という宣言であり、型は自由で、書かなくてもよいラベルである。
  // かつて ugatsu は `s.type === "exterior"` / `"void"` と書いていた — muro 1.3 で書かれた
  // `space /out name:外部 outside:1` を、その二行は静かに「屋内」と数える
  it("構造は宣言から読む — 型の語からではない (koyu ADR-0051)", () => {
    const m = parse(
      [
        "muro 1.3",
        "grid X 0 4000 8000",
        "grid Y 0 5000",
        "level L1 0 h:2400 slab:150",
        "level L2 3000 h:2400 slab:150",
        "space /L1/a room X1..X2 Y1..Y2 name:居室",
        // 型は `room` のまま、宣言だけが外部と言う — 型を読む実装はこれを算入してしまう
        "space /L1/yard room X2..X3 Y1..Y2 name:中庭 outside:1",
        // 型を一つも書かない吹抜け — 型を読む実装はこれを床として算入してしまう
        "space /L2/v X1..X2 Y1..Y2 level:L2 name:上部吹抜け void:1",
      ].join("\n"),
    );
    const s = computeStats(m);
    const rows = new Map(s.levels.flatMap((l) => l.rows).map((r) => [r.path, r]));
    expect(rows.get("/L1/yard")!.cls).toBe("exterior");
    expect(rows.get("/L2/v")!.cls).toBe("void");
    expect(rows.get("/L2/v")!.type).toBeUndefined();
    expect(rows.get("/L1/a")!.cls).toBe("indoor");
    // 延べ面積は居室の一室だけ (4000×5000 = 20㎡)。中庭は別掲、吹抜けは面を持たない
    expect(s.total).toBeCloseTo(20, 2);
    expect(s.outdoorTotal).toBeCloseTo(20, 2);
    // 型別の見出しも「書かれていない」を潰さない
    expect(s.byType.map((t) => t.type)).toEqual(["room"]);
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
    // **muro は一点ではなく幅である。**名乗るのは読める最新版で、版行の無い原本の
    // 読み方 (1.1 に凍っている) とは別の数である。かつてここは後者を「読める版」として
    // 出しており、koyu が 1.3 まで読むようになっても 1.1 と名乗り続けていた
    expect(MURO_VERSION).toBe(NEWEST_LANGUAGE_VERSION);
    expect(MURO_UNDECLARED).toBe("1.1");
    expect(MURO_VERSION).not.toBe(MURO_UNDECLARED);
    expect(MURO_READS).toBe(`0.1–${MURO_VERSION}`);
    expect(VERSION_LINE).toContain(`koyu ${KOYU_VERSION}`);
  });

  // 依存しているのは言語の版であって、パッケージの範囲ではない (koyu の `requireMuro`)。
  // 同梱の例はこの版で書かれているので、読めない koyu を掴んだビルドはここで落ちる
  it("同梱の例が名乗る muro の版を、このビルドの koyu が読む", () => {
    expect(() => assertMuro()).not.toThrow();
    const sources = readdirSync("examples")
      .filter((f) => f.endsWith(".muro"))
      .map((f) => readFileSync(`examples/${f}`, "utf8"));
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) expect(src).toContain(`muro ${MURO_REQUIRED}`);
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

// **構造化診断が一次形式である** (koyu ADR-0016)。かつて store は `check` が返した
// 文字列を受け、正規表現で出所を復元していた — コードも `related` も取れず、
// koyu が機械向け出力を英語へ揃えた時点で黙って壊れる作りだった (docs/scope.md §7)。
describe("診断はコードと出所を構造で持つ (koyu ADR-0016)", () => {
  it("エラーは code / severity / 出所レイヤー / 行 を持つ", () => {
    const files = Object.fromEntries(
      ["main.muro", "assets.muro", "site.muro", "L1.muro", "L2.muro"].map((f) => [
        f,
        readFileSync(`examples/house/${f}`, "utf8"),
      ]),
    );
    files["L1.muro"] = files["L1.muro"]!.replace("at:Y2+1820", "at:Y2+3500");
    useViewer.getState().setFiles(files, "main.muro");
    const errs = useViewer.getState().checkErrors;
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]!.severity).toBe("error");
    expect(errs[0]!.code).toMatch(/^[A-Z]{3}\d{2}$/);
    expect(errs[0]!.file).toBe("L1.muro");
    expect(errs[0]!.line).toBeGreaterThan(0);
  });

  it("整合していれば診断は空になる", () => {
    useViewer.getState().setSource(readFileSync("examples/office.muro", "utf8"), "office.muro");
    expect(useViewer.getState().checkErrors).toEqual([]);
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
    const colors = buildColors(m, "type");
    const built = buildScene(formOf(m), {
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
    const built = buildScene(formOf(m), {
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
    const colors = buildColors(m, "type");
    const built = buildScene(formOf(m), {
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
