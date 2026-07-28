# ugatsu — 開発メモ

koyu (.muro テキスト) の 2D/3D ビューア。React + Vite + Three.js + CodeMirror。

## 形 (最初に読む)

**ugatsu は形を組み立てない。**座標・厚み・z 範囲・向きは koyu の `derive(model): Form` が返し、ugatsu はそれを描くだけである ([ADR-0007](docs/decisions/0007-draw-the-form.md) / koyu [spec/derivation.md](https://github.com/kensnzk/koyu/blob/main/spec/derivation.md))。範囲の規範は [docs/scope.md](docs/scope.md)。

- **形の入口は `src/lib/form.ts` の `formOf(model)` 一つ。**`derive` を呼ぶ頁を増やさない — 平面と立体が別の形を見た瞬間に凍結面「導出の一致」が壊れる
- **描画の三頁** (`components/PlanView.tsx` / `three/buildScene.ts` / `lib/planFigure.ts`) **は koyu の形の部品を取り込まない** (`segmentsFor` `placeOpening` `slabs` `columnsFor` `runSolids` `runDrawsForLevel` `heff` …)。`test/form.test.ts` が import で縛る
- **既定値を発明しない。**壁厚も開口の高さも階高も `Form` に入って届く。**決まらなければ描かない** — koyu が形を作らない場面で ugatsu も作らない
- ugatsu が足してよいのは色・線幅・線種・記号・注記の言葉・紙面の余白だけ。それらは `Form` に一つも無い

koyu をローカルのツリーへ向けるには `KOYU_REPO=/path/to/koyu npm run koyu:local` ([ADR-0005](docs/decisions/0005-local-koyu-pipeline.md))。

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
