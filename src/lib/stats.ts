// 面積表 — 母集団の判断は koyu が持つ。ここは koyu の `isIndoor` が返した答えを表に写すだけである。
//
// **かつてここは自前で数えていた。**「吹抜け以外はすべて床」という一行が、外部 (広場・空地) と
// 半屋外 (バルコニー・屋外階段) を延べ面積へ算入し、同じモデルに対して koyu の stats と
// 違う答えを返していた (complex で 32,342.24 対 31,606.24 — 736.00㎡)。
// 面積は導出であって表現ではない。**ugatsu は意味を作らない** (koyu spec/scope.md §1)。
import {
  areaM2,
  displayName,
  effectiveUse,
  isSemiOutdoor,
  levelsSorted,
  zoneAreaM2,
  type Model,
  type Space,
} from "@kensnzk/koyu";

/**
 * 面積表における空間の区分。**算入するかどうかは `isIndoor` が決め、ここは名前を付けるだけである。**
 * `indoor` は `isIndoor(model, s) === true` と厳密に一致する (test/core.test.ts が縛る)。
 */
export type AreaClass = "indoor" | "void" | "exterior" | "semi";

export const AREA_CLASS_LABEL: Record<AreaClass, string> = {
  indoor: "",
  void: "吹抜け (不算入)",
  exterior: "屋外 (不算入)",
  semi: "半屋外 (別掲)",
};

/** koyu の stats と同じ順序で区分する — void → exterior → 半屋外 → 屋内 */
function classOf(model: Model, s: Space): AreaClass {
  if (s.type === "void") return "void";
  if (s.type === "exterior") return "exterior";
  if (isSemiOutdoor(model, s)) return "semi";
  return "indoor";
}

export interface SpaceRow {
  path: string;
  name: string;
  type: string;
  use?: string;
  /** ㎡ (壁芯)。吹抜けは undefined (面を持たない) */
  area?: number;
  cls: AreaClass;
}

export interface LevelBlock {
  level: string;
  z: number;
  rows: SpaceRow[];
  /** 屋内床面積の小計 (屋外・半屋外・吹抜けを含まない) */
  subtotal: number;
}

export interface ZoneRow {
  path: string;
  name: string;
  use?: string;
  area: number;
}

export interface Stats {
  levels: LevelBlock[];
  /** 延べ面積 = 屋内床面積の合計。`koyu stats` の「合計」と一致する */
  total: number;
  /** 屋外 (exterior) の合計 — 広場・空地等。床面積に算入しない */
  outdoorTotal: number;
  /** 半屋外の合計 — バルコニー・屋外階段等。算入条件は法規細部のため別掲 */
  semiTotal: number;
  zones: ZoneRow[];
  byUse: Array<{ use: string; area: number; pct: number }>;
  byType: Array<{ type: string; area: number }>;
  spaceCount: number;
  boundaryCount: number;
  doorCount: number;
  windowCount: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function computeStats(model: Model): Stats {
  const spaces = [...model.spaces.values()];
  const levels: LevelBlock[] = [];
  const byUse = new Map<string, number>();
  const byType = new Map<string, number>();
  let total = 0;
  let outdoorTotal = 0;
  let semiTotal = 0;

  for (const l of levelsSorted(model)) {
    const onLevel = spaces.filter((s) => s.level === l.name && s.rects.length > 0);
    if (onLevel.length === 0) continue;
    const rows: SpaceRow[] = [];
    let subtotal = 0;
    for (const s of onLevel) {
      const cls = classOf(model, s);
      const a = cls === "void" ? undefined : areaM2(s);
      const use = effectiveUse(model, s);
      rows.push({ path: s.path, name: displayName(s), type: s.type, use, area: a, cls });
      if (a === undefined) continue;
      if (cls === "exterior") {
        outdoorTotal += a;
        continue;
      }
      if (cls === "semi") {
        semiTotal += a;
        continue;
      }
      // 屋内だけが延べ面積・小計・use別・type別の母集団になる
      subtotal += a;
      total += a;
      byType.set(s.type, (byType.get(s.type) ?? 0) + a);
      if (use) byUse.set(use, (byUse.get(use) ?? 0) + a);
    }
    levels.push({ level: l.name, z: l.z, rows, subtotal: r2(subtotal) });
  }

  // 敷地ゾーン (site:1) は建物の集約ではなく所与の与件。専有面積の言葉では常に0になるので出さない
  const zones: ZoneRow[] = [...model.zones.values()]
    .filter((z) => z.attrs["site"] !== 1)
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((z) => ({
      path: z.path,
      name: typeof z.attrs["name"] === "string" ? (z.attrs["name"] as string) : z.path,
      use: typeof z.attrs["use"] === "string" ? (z.attrs["use"] as string) : undefined,
      area: zoneAreaM2(model, z.path),
    }));

  let doors = 0;
  let windows = 0;
  for (const b of model.boundaries) {
    for (const o of b.openings) {
      if (o.kind === "door") doors++;
      else windows++;
    }
  }

  return {
    levels,
    total: r2(total),
    outdoorTotal: r2(outdoorTotal),
    semiTotal: r2(semiTotal),
    zones,
    byUse: [...byUse.entries()]
      .map(([use, area]) => ({ use, area: r2(area), pct: total > 0 ? r2((area / total) * 100) : 0 }))
      .sort((a, b) => b.area - a.area),
    byType: [...byType.entries()]
      .map(([type, area]) => ({ type, area: r2(area) }))
      .sort((a, b) => b.area - a.area),
    spaceCount: model.spaces.size,
    boundaryCount: model.boundaries.length,
    doorCount: doors,
    windowCount: windows,
  };
}

/** 面積表CSV (Excel向けにBOM付きで使う) */
export function statsToCsv(stats: Stats, modelName: string): string {
  const lines: string[] = [];
  const esc = (v: string | number | undefined) => {
    if (v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  lines.push(`面積表,${esc(modelName)},,,(壁芯・㎡)`);
  lines.push("レベル,パス,名称,型,用途,面積,区分");
  for (const lb of stats.levels) {
    for (const r of lb.rows) {
      lines.push(
        [
          lb.level,
          r.path,
          r.name,
          r.type,
          r.use ?? "",
          r.area?.toFixed(2),
          AREA_CLASS_LABEL[r.cls],
        ]
          .map(esc)
          .join(","),
      );
    }
    lines.push(`${lb.level} 小計 (屋内),,,,,${lb.subtotal.toFixed(2)}`);
  }
  lines.push(`延べ面積 (屋内床面積),,,,,${stats.total.toFixed(2)}`);
  if (stats.outdoorTotal > 0) {
    lines.push(`屋外 (不算入),,,,,${stats.outdoorTotal.toFixed(2)}`);
  }
  if (stats.semiTotal > 0) {
    lines.push(`半屋外 (別掲),,,,,${stats.semiTotal.toFixed(2)}`);
  }
  if (stats.zones.length) {
    lines.push("");
    lines.push("ゾーン (数える集約),名称,用途,面積");
    for (const z of stats.zones) {
      lines.push([z.path, z.name, z.use ?? "", z.area.toFixed(2)].map(esc).join(","));
    }
  }
  if (stats.byUse.length) {
    lines.push("");
    lines.push("用途別,面積,比率%");
    for (const u of stats.byUse) lines.push([u.use, u.area.toFixed(2), u.pct.toFixed(1)].map(esc).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
