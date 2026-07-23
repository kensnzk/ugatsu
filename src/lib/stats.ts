// 面積表 — MUN-144 の最初の一手。CLI の stats と同じ集計をUI向けの構造で返す。
import {
  areaM2,
  displayName,
  effectiveUse,
  levelsSorted,
  zoneAreaM2,
  type Model,
  type Space,
} from "../core/index.js";

export interface SpaceRow {
  path: string;
  name: string;
  type: string;
  use?: string;
  /** ㎡ (壁芯)。吹抜けは undefined (床面積不算入) */
  area?: number;
  isVoid: boolean;
}

export interface LevelBlock {
  level: string;
  z: number;
  rows: SpaceRow[];
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
  total: number;
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

  for (const l of levelsSorted(model)) {
    const onLevel = spaces.filter((s) => s.level === l.name && s.rects.length > 0);
    if (onLevel.length === 0) continue;
    const rows: SpaceRow[] = [];
    let subtotal = 0;
    for (const s of onLevel) {
      const isVoid = s.type === "void";
      const a = isVoid ? undefined : areaM2(s);
      const use = effectiveUse(model, s);
      rows.push({ path: s.path, name: displayName(s), type: s.type, use, area: a, isVoid });
      if (a !== undefined) {
        subtotal += a;
        total += a;
        byType.set(s.type, (byType.get(s.type) ?? 0) + a);
        if (use) byUse.set(use, (byUse.get(use) ?? 0) + a);
      }
    }
    levels.push({ level: l.name, z: l.z, rows, subtotal: r2(subtotal) });
  }

  const zones: ZoneRow[] = [...model.zones.values()]
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
  lines.push("レベル,パス,名称,型,用途,面積");
  for (const lb of stats.levels) {
    for (const r of lb.rows) {
      lines.push(
        [lb.level, r.path, r.name, r.type, r.use ?? "", r.isVoid ? "吹抜け(不算入)" : r.area?.toFixed(2)]
          .map(esc)
          .join(","),
      );
    }
    lines.push(`${lb.level} 小計,,,,,${lb.subtotal.toFixed(2)}`);
  }
  lines.push(`合計,,,,,${stats.total.toFixed(2)}`);
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
