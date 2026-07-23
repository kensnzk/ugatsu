// 同梱の実例 — IFCXS本体リポジトリの examples/ から (sync-core が追随させる)
import mansion from "../examples/mansion.ifcxs?raw";
import office from "../examples/office.ifcxs?raw";
import twoRooms from "../examples/two-rooms.ifcxs?raw";

export interface Example {
  key: string;
  label: string;
  fileName: string;
  source: string;
}

export const EXAMPLES: Example[] = [
  { key: "two-rooms", label: "二室一扉 (22行)", fileName: "two-rooms.ifcxs", source: twoRooms },
  { key: "office", label: "小さなオフィス — 2フロア+吹抜け", fileName: "office.ifcxs", source: office },
  { key: "mansion", label: "集合住宅 — 10階建て43戸", fileName: "mansion.ifcxs", source: mansion },
];

export const DEFAULT_EXAMPLE = EXAMPLES[2]!;
