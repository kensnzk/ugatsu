# ugatsu — 開発メモ

koyu (.muro テキスト) の 2D/3D ビューア。React + Vite + Three.js + CodeMirror。

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
