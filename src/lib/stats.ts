// 面積表 — 母集団の判断は koyu が持つ。ここは koyu の `isIndoor` が返した答えを表に写すだけである。
//
// **かつてここは自前で数えていた。**「吹抜け以外はすべて床」という一行が、外部 (広場・空地) と
// 半屋外 (バルコニー・屋外階段) を延べ面積へ算入し、同じモデルに対して koyu の stats と
// 違う答えを返していた (complex で 32,342.24 対 31,606.24 — 736.00㎡)。
// 面積は導出であって表現ではない。**ugatsu は意味を作らない** (koyu docs/reference/scope.md)。
//
// **区分は型の語からは読まない。**muro 1.1 が型の位置から構造を読むのをやめ (koyu ADR-0051)、
// 外部は `outside:1`、吹抜けは `void:1` という**宣言**になった。`s.type === "exterior"` と
// 書いてあった二行は、`space /out name:外部 outside:1` と書かれた原本に対して静かに
// 「屋内」を返す — 型は自由なラベルであり、書かなくてもよい位置である。
//
// **集計軸も同じ理由で組み替わった。**muro 1.3 が `use` を廃した (koyu ADR-0061)。
// 「用途別」という一つの表は、鍵を利用者が名乗る `koyu stats --by <鍵>` に対応する形へ移す。
// 既定の鍵は無い — 既定を置けば、廃したはずの特権的な集計軸がそのまま戻る。
import {
  areaM2,
  displayName,
  effectiveAttr,
  isOutside,
  isSemiOutdoor,
  isVoid,
  levelsSorted,
  zoneAreaM2,
  type Model,
  type Space,
} from "@kensnzk/koyu/model";
import { carriedKeys } from "./colors.js";

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

/** 型が書かれていない空間の見出し。**型は自由で、書かなくてよい位置である** (koyu ADR-0051) */
export const UNTYPED_LABEL = "(型なし)";

/** その鍵を持たない空間の集計先。**明示して合計を閉じる** (koyu ADR-0061 決定6) */
export const UNSPECIFIED_LABEL = "(未記載)";

/** koyu の stats と同じ順序で区分する — void → exterior → 半屋外 → 屋内 */
function classOf(model: Model, s: Space): AreaClass {
  if (isVoid(s)) return "void";
  if (isOutside(s)) return "exterior";
  if (isSemiOutdoor(model, s)) return "semi";
  return "indoor";
}

export interface SpaceRow {
  path: string;
  name: string;
  /** 書かれた型 (室の目的)。**書かれないことがある** */
  type?: string;
  /** 集計軸ごとの実効値 (鍵 → 値。ゾーンからの継承を含む) */
  carried: Record<string, string>;
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
  carried: Record<string, string>;
  area: number;
}

/** 一つの鍵による集計。**バケツの合計は延べ面積に一致する** (未記載も一つのバケツ) */
export interface AttrBreakdown {
  key: string;
  rows: Array<{ value: string; area: number; pct: number }>;
}

export interface Stats {
  levels: LevelBlock[];
  /** 延べ面積 = 屋内床面積の合計。`koyu stats` の「合計」と一致する */
  total: number;
  /** 屋外 (outside:1) の合計 — 広場・空地等。床面積に算入しない */
  outdoorTotal: number;
  /** 半屋外の合計 — バルコニー・屋外階段等。算入条件は法規細部のため別掲 */
  semiTotal: number;
  zones: ZoneRow[];
  /** 集計に使った鍵 (モデルに書かれている名前空間つきの鍵) */
  keys: string[];
  byAttr: AttrBreakdown[];
  byType: Array<{ type: string; area: number }>;
  spaceCount: number;
  boundaryCount: number;
  doorCount: number;
  windowCount: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

const valueText = (v: unknown): string | undefined => (v === undefined ? undefined : String(v));

export function computeStats(model: Model): Stats {
  const spaces = [...model.spaces.values()];
  const levels: LevelBlock[] = [];
  const keys = carriedKeys(model);
  const byAttr = new Map<string, Map<string, number>>(keys.map((k) => [k, new Map()]));
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
      const carried: Record<string, string> = {};
      for (const k of keys) {
        const v = valueText(effectiveAttr(model, s, k));
        if (v !== undefined) carried[k] = v;
      }
      rows.push({
        path: s.path,
        name: displayName(s),
        ...(s.type !== undefined ? { type: s.type } : {}),
        carried,
        area: a,
        cls,
      });
      if (a === undefined) continue;
      if (cls === "exterior") {
        outdoorTotal += a;
        continue;
      }
      if (cls === "semi") {
        semiTotal += a;
        continue;
      }
      // 屋内だけが延べ面積・小計・鍵別・型別の母集団になる
      subtotal += a;
      total += a;
      byType.set(s.type ?? UNTYPED_LABEL, (byType.get(s.type ?? UNTYPED_LABEL) ?? 0) + a);
      for (const k of keys) {
        const bucket = byAttr.get(k)!;
        const v = carried[k] ?? UNSPECIFIED_LABEL;
        bucket.set(v, (bucket.get(v) ?? 0) + a);
      }
    }
    levels.push({ level: l.name, z: l.z, rows, subtotal: r2(subtotal) });
  }

  // 敷地ゾーン (site:1) は建物の集約ではなく所与の与件。専有面積の言葉では常に0になるので出さない
  const zones: ZoneRow[] = [...model.zones.values()]
    .filter((z) => z.attrs["site"] !== 1)
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((z) => {
      const carried: Record<string, string> = {};
      for (const k of keys) {
        const v = valueText(z.attrs[k]);
        if (v !== undefined) carried[k] = v;
      }
      return {
        path: z.path,
        name: typeof z.attrs["name"] === "string" ? (z.attrs["name"] as string) : z.path,
        carried,
        area: zoneAreaM2(model, z.path),
      };
    });

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
    keys,
    byAttr: keys
      .map((key) => ({
        key,
        rows: [...byAttr.get(key)!.entries()]
          .map(([value, area]) => ({
            value,
            area: r2(area),
            pct: total > 0 ? r2((area / total) * 100) : 0,
          }))
          .sort((a, b) => b.area - a.area),
      }))
      .filter((b) => b.rows.length > 0),
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
  // 集計軸の列は**モデルに書かれた鍵の数だけ**立つ。既定の一列 (かつての「用途」) は無い
  const pad = stats.keys.map(() => "").join(",");
  lines.push(`面積表,${esc(modelName)},,${pad},(壁芯・㎡)`);
  lines.push(["レベル", "パス", "名称", "型", ...stats.keys, "面積", "区分"].map(esc).join(","));
  for (const lb of stats.levels) {
    for (const r of lb.rows) {
      lines.push(
        [
          lb.level,
          r.path,
          r.name,
          r.type ?? "",
          ...stats.keys.map((k) => r.carried[k] ?? ""),
          r.area?.toFixed(2),
          AREA_CLASS_LABEL[r.cls],
        ]
          .map(esc)
          .join(","),
      );
    }
    lines.push(`${lb.level} 小計 (屋内),,,${pad},,${lb.subtotal.toFixed(2)}`);
  }
  lines.push(`延べ面積 (屋内床面積),,,${pad},,${stats.total.toFixed(2)}`);
  if (stats.outdoorTotal > 0) {
    lines.push(`屋外 (不算入),,,${pad},,${stats.outdoorTotal.toFixed(2)}`);
  }
  if (stats.semiTotal > 0) {
    lines.push(`半屋外 (別掲),,,${pad},,${stats.semiTotal.toFixed(2)}`);
  }
  if (stats.zones.length) {
    lines.push("");
    lines.push(["ゾーン (数える集約)", "名称", ...stats.keys, "面積"].map(esc).join(","));
    for (const z of stats.zones) {
      lines.push(
        [z.path, z.name, ...stats.keys.map((k) => z.carried[k] ?? ""), z.area.toFixed(2)]
          .map(esc)
          .join(","),
      );
    }
  }
  for (const b of stats.byAttr) {
    lines.push("");
    lines.push([`${b.key} 別`, "面積", "比率%"].map(esc).join(","));
    for (const r of b.rows) {
      lines.push([r.value, r.area.toFixed(2), r.pct.toFixed(1)].map(esc).join(","));
    }
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
