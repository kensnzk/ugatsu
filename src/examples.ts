// 同梱の実例 — インストールされた @kensnzk/koyu の examples/ のコピー。
// koyu を更新したら `npm run sync-examples` で追随する (examples/ は手で編集しない)。
import house from "../examples/house.muro?raw";
import mansion from "../examples/mansion.muro?raw";
import office from "../examples/office.muro?raw";
import twoRooms from "../examples/two-rooms.muro?raw";

export interface Example {
  key: string;
  label: string;
  fileName: string;
  source: string;
}

export const EXAMPLES: Example[] = [
  { key: "two-rooms", label: "二室一扉 — 最初の一手", fileName: "two-rooms.muro", source: twoRooms },
  { key: "office", label: "小さなオフィス — 2フロア+吹抜け", fileName: "office.muro", source: office },
  { key: "house", label: "小さな戸建住宅 — メゾネット+敷地", fileName: "house.muro", source: house },
  { key: "mansion", label: "集合住宅 — 10階建て43戸", fileName: "mansion.muro", source: mansion },
];

export const DEFAULT_EXAMPLE = EXAMPLES[3]!;
