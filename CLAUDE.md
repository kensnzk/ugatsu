# ugatsu — 開発メモ

koyu (.muro テキスト) の 2D/3D ビューア。React + Vite + Three.js + CodeMirror。

## 形 (最初に読む)

**ugatsu は形を組み立てない。**座標・厚み・z 範囲・向きは koyu の `derive(model): Form` が返し、ugatsu はそれを描くだけである ([ADR-0007](docs/decisions/0007-draw-the-form.md) / koyu [docs/reference/form](https://github.com/kensnzk/koyu/blob/main/docs/reference/form/index.md))。範囲の規範は [docs/scope.md](docs/scope.md)。

- **形の入口は `src/lib/form.ts` の `formOf(model)` 一つ。**`derive` を呼ぶ頁を増やさない — 平面と立体が別の形を見た瞬間に凍結面「導出の一致」が壊れる
- **描画の三頁** (`components/PlanView.tsx` / `three/buildScene.ts` / `lib/planFigure.ts`) **は koyu の形の部品を取り込まない** (`segmentsFor` `placeOpening` `slabs` `columnsFor` `runSolids` `runDrawsForLevel` `heff` …)。`test/form.test.ts` が import で縛る
- **実体の構成子 (`band` `bandLine` `columnRect` `runPrism`) は逆に koyu から取る。**芯線と厚みから実体を起こす規則も導出の一部で、koyu が唯一の実装を公開している (koyu ADR-0058)。**書き写さない** — 同じ `Form` から違う形が出る余地がそこから戻る
- **壁だけは起こしもしない。**区間は `footprint` — 両端の取合いが決まった足あと — を持って届くので、押し出すだけである (koyu ADR-0063 / [ADR-0009](docs/decisions/0009-the-wall-body-arrives.md))。**芯線は足あとの軸ではない**ので、`thicken` で組み直すと隅が開く。開いても落ちない
- **既定値を発明しない。**壁厚も開口の高さも階高も `Form` に入って届く。**決まらなければ描かない** — koyu が形を作らない場面で ugatsu も作らない
- ugatsu が足してよいのは色・線幅・線種・記号・注記の言葉・紙面の余白だけ。それらは `Form` に一つも無い

## 意味 (次に読む)

**構造は宣言から読む。型の語からは読まない。**muro 1.1 が型の位置から構造を抜いた (koyu ADR-0051) — 外部は `outside:1`、吹抜けは `void:1` であり、`type` は自由で、書かれないことがある。

- `s.type === "void"` / `"exterior"` と書かない。`isVoid(s)` / `isOutside(s)`、形の側は `FormSpace.void` / `.outside` / `.indoor` / `.semiOutdoor`。**この間違いは落ちない** — ただ違う面積と違う図を返す
- **集計と色分けの軸に既定を持たない。**muro 1.3 が `use` を廃した (koyu ADR-0061)。用途は型の位置が持ち、他の区分は名前空間つきの鍵 (`lease.category` …) が持つ。母集団は `carriedKeys(model)` — **原本に書かれている鍵だけ**
- **`Form` の索引から原本へ戻る道は `src/lib/written.ts` の一本だけ。**`FormBoundary.boundary` は正準順への添字であって宣言順ではない (koyu ADR-0041)
- **判定は持たない。**`assess` は呼ばない。敷地の数だけ `runAnalysis` (合否を返さない面) から来る

## 版 (三本、別々に動く)

`src/lib/versions.ts` が一箇所。**muro は一点ではなく幅である** — `NEWEST_LANGUAGE_VERSION` (読める最新 = 名乗る版) と `DEFAULT_LANGUAGE_VERSION` (版行の無い原本の読み方。1.1 に凍っている) は別の数で、後者を「読める版」として出すと版が上がっても嘘が残る。

koyu を上げたら: `npm run sync-examples` → `MURO_REQUIRED` を確かめる → `npm test` (同梱例が名乗る版をこのビルドが読むかを縛っている)。ローカルのツリーへ向けるには `KOYU_REPO=/path/to/koyu npm run koyu:local` ([ADR-0005](docs/decisions/0005-local-koyu-pipeline.md))。

## koyu の公開面は 12 の入口 (koyu ADR-0053)

`@kensnzk/koyu` (合成・整合・正準化・版) / `/model` / `/form` / `/graph` / `/draw` / `/analysis` / `/validate` / `/diagnostics` / `/vocabulary` / `/diff` / `/node` / `/validate/builtin`。**import の一行がどの契約に寄りかかっているかを言う** — ルートは domain 名を再輸出しないので、`areaM2` は `/model`、`derive` は `/form`、`svgPlan` は `/draw` から取る。

取り下げられた名 (`canonicalBoundaryOrder` `polyBounds` `polygonAreaM2` `slopeText` `siteReport`) は `src/lib/koyu-compat.ts` に閉じる。**増やさない** — 増やすなら koyu 側へ出し直す方が正しい。

## デザインシステム (koyu-design-system)

見た目は **@kensnzk/koyu-design-system** のトークンで表現する。基調は冷灰、選択 = 藍 (`--primary`)、注意・経路 = 朱 (`--accent`)、浮遊パネル、12pxが文字の下限。

- **UIを触る前に読む**: `node_modules/@kensnzk/koyu-design-system/readme.md` と `SKILL.md` (常にインストール済みの現行版を参照する — 値をコピーしない)
- **CSS**: 色・書体・角丸・影・余白は `var(--token)` を参照。生のhexや装飾pxを書かない
- **TS/TSX (Three.js / SVG / CodeMirror)**: `src/lib/theme.ts` の `token()` / `tokenColor()` 経由でトークンを読む。テーマ (light/dark) で反転すべき色はセマンティックトークン (`--text-*` / `--border-*` / `--bg-*`) を使う。直書きhexの例外は theme.ts のフォールバックと `src/lib/colors.ts` のカテゴリカル配色のみ
- **コントロール類**: 素の `<button>`/`<select>`/`<input>` ではなく `src/lib/ds.ts` 経由のDSコンポーネント (Button/IconButton/Tabs/Select/Checkbox/Switch/Slider) を使う。DSに無いパターン (チップ・メニュー等) だけトークン準拠の自前CSS
- **レイアウト**: 机 (`--bg-app`) の上にすべて浮遊パネル (`--bg-panel` + `--radius-lg` + `--shadow-panel`)。ダークは `toggleTheme()` (store) — canvasは `theme` 依存のeffectで再構築される
- **逸脱検出**: `npm run ds:check` (oxlint — 生hex/px/非DSフォントを警告)
- **DS更新への追従**: `npm run ds:update` (lockfileの固定コミットを最新のmainへ更新して逸脱検査)。取り込みは意図的な操作 — 勝手には動かない

## コマンド

- `npm run dev` / `npm run build` / `npm test` / `npm run typecheck`
- `npm run ds:check` — デザインシステム遵守の検査
- `npm run ds:update` — デザインシステムの更新取り込み
