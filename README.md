# IFCXS Viewer

空間一次のテキスト記述 [IFCXS](../IFCXS) の 2D/3D ビューワー。ソースに形は無い — 平面図・レベルの重ね (2.5D)・立体・面積表は、すべてテキストからその場で生成される。

位置づけは IFCXS 本体の M1-2「関連ツール整備」(デバグ的な道具立て)。Linear: [MUN-143](https://linear.app/munipersonal/issue/MUN-143) (一つのファイルとして閲覧できる2D/3Dビューワー) / [MUN-144](https://linear.app/munipersonal/issue/MUN-144) (クエリして面積表などにまとめるツール)。

## できること

- **読み込み** — `.ifcxs` (author形式DSL) をドラッグ&ドロップ / ファイル選択で開く。two-rooms / office / mansion の実例を同梱。
- **エディタ** — 左ペインでソースを直接編集すると、パース → check → 全ビューが即座に追随する。エラー時は行番号つきで表示し、画面は最後に整合したモデルを保つ。テキストが原本であることの実演であり、将来のGUIオーサリングの土台 (GUI操作 = テキスト書き換え)。
- **平面** — core の svgPlan と同じ作図規約 (通り芯・壁芯・扉の軌跡・吹抜けの対角線・数えない分節) のインタラクティブ版。レベル切替、ホイール拡大、クリックで空間選択。
- **3D** — 空間を天井高で押し出し、壁は境界から厚みつきで生成、扉・窓を壁面に表示。色は 用途 / 型 / レベル で塗り分け。レベル単位の表示切替。
- **2.5D 重ね** — 各レベルの床プレートを実高さ×展開係数で持ち上げて重ねる。吹抜け (void) はプレートを置かない = 床の不在がそのまま穴になる。
- **面積表** — レベル別の室リストと小計、ゾーン集計 (専有面積)、用途別面積比 (レンタブル比)、型別集計。CSV書き出し。
- **グラフ** — 空間を選ぶと隣接 (境界の種別・扉数・耐火) が出る。経路クエリ「扉をいくつ通るか」は doorsBetween がそのまま答える。
- **書き出し** — ソース / 正準JSON / 平面SVG / 面積表CSV / **配布用HTML** (モデルを埋め込んだ単一ファイル。閲覧に必要なものはこの1ファイルだけ)。

## 使い方

```sh
npm install
npm run dev        # 開発サーバー
npm test           # vitest
npm run typecheck
npm run build      # dist/index.html — ビューワー全体が単一HTML
npm run embed -- examples/mansion.ifcxs   # モデル埋め込みの配布用HTMLを生成
npm run sync-core  # ../IFCXS から vendor コアを更新
```

ビルド産物は常に単一HTML。`dist/index.html` をそのまま送れば誰でもブラウザで開ける (MUN-143)。ビューワーのUI内「書き出し → 配布用HTML」でも同じものが作れる。

## 構成

```
src/core/        IFCXS本体 src/ の vendor コピー (手で編集しない — sync-core で追随)
src/state/       zustand ストア。原本=ソーステキスト、モデルは導出物
src/components/  Toolbar / EditorPane / PlanView / Scene3D / AreaTable / Inspector
src/three/       モデル → three.js シーン生成 (3D / 2.5D)
src/lib/         色割当・面積集計・書き出し
examples/        本体 examples/ のコピー (sync-core が追随)
```

設計判断 (three.js直・vendor方針・単一HTML・オーサリングの向き) は [docs/decisions/0001-viewer-v0.md](docs/decisions/0001-viewer-v0.md)。
