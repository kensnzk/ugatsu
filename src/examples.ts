// 同梱の実例 — インストールされた @kensnzk/koyu の examples/ のコピー。
// koyu を更新したら `npm run sync-examples` で追随する (examples/ は手で編集しない)。
import house from "../examples/house.muro?raw";
import towerMain from "../examples/tower/main.muro?raw";
import towerGeo from "../examples/tower/site-geometry.muro?raw";
import towerSite from "../examples/tower/site.muro?raw";
import towerAssets from "../examples/tower/assets.muro?raw";
import towerL1 from "../examples/tower/L1.muro?raw";
import towerL2 from "../examples/tower/L2.muro?raw";
import towerTypical from "../examples/tower/typical.muro?raw";
import towerL3 from "../examples/tower/L3.muro?raw";
import towerL11 from "../examples/tower/L11.muro?raw";
import houseAssets from "../examples/house/assets.muro?raw";
import houseL1 from "../examples/house/L1.muro?raw";
import houseL2 from "../examples/house/L2.muro?raw";
import houseMain from "../examples/house/main.muro?raw";
import houseSite from "../examples/house/site.muro?raw";
import mansion from "../examples/mansion.muro?raw";
import office from "../examples/office.muro?raw";
import twoRooms from "../examples/two-rooms.muro?raw";

export interface Example {
  key: string;
  label: string;
  /** レイヤー群 (単一ファイルの例は1枚)。キーが import の解決空間になる */
  files: Record<string, string>;
  /** base層 (合成の入口) のファイル名 */
  entry: string;
}

const single = (key: string, label: string, fileName: string, source: string): Example => ({
  key,
  label,
  files: { [fileName]: source },
  entry: fileName,
});

export const EXAMPLES: Example[] = [
  single("two-rooms", "二室 — 最小の例", "two-rooms.muro", twoRooms),
  single("office", "小さなオフィス — 2フロア+吹抜け", "office.muro", office),
  single("house", "小さな戸建住宅 — メゾネット+敷地", "house.muro", house),
  {
    key: "house-compose",
    label: "戸建住宅 — 5ファイル合成 (import+建具アセット)",
    files: {
      "main.muro": houseMain,
      "assets.muro": houseAssets,
      "site.muro": houseSite,
      "L1.muro": houseL1,
      "L2.muro": houseL2,
    },
    entry: "main.muro",
  },
  single("mansion", "集合住宅 — 10階建て43戸", "mansion.muro", mansion),
  {
    key: "tower",
    label: "街角の複合ビル — 低層商業+高層住宅 (ショーケース・9ファイル合成)",
    files: {
      "main.muro": towerMain,
      "site-geometry.muro": towerGeo,
      "site.muro": towerSite,
      "assets.muro": towerAssets,
      "L1.muro": towerL1,
      "L2.muro": towerL2,
      "typical.muro": towerTypical,
      "L3.muro": towerL3,
      "L11.muro": towerL11,
    },
    entry: "main.muro",
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES.find((e) => e.key === "tower")!;
