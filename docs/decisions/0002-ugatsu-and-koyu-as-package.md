# ADR-0002: ugatsu — 別リポジトリで公開し、koyu をパッケージとして消費する

状態: 採用 (2026-07-23)。ADR-0001 の決定2 (vendor + sync-core) を置き換える。

## 文脈

koyu の公開 (改名・Apache-2.0・GitHub) に合わせ、ビューワーも予約済みの名 **ugatsu (鑿つ/穿つ)** で公開する。論点は二つ: (1) koyu のリポジトリに入れるか、別リポジトリか。(2) コアの共有を vendor 継続にするか、パッケージ依存にするか。

## 決定

**1. 別リポジトリ (kensnzk/ugatsu)。** 理由:

- **koyu を小さく保つ。** koyu は原稿+仕様+実例が一体の「主張のリポジトリ」であり、建物一棟が数百行という感触そのものが伝えたい内容。そこに React/three/node_modules の質量を持ち込むと、リポジトリを開いた人が最初に見るものが変わってしまう。
- **変化の速度が違う。** 記法は ADR を刻んで進み、ビューワーはUIの試行錯誤で進む。歴史 (git log) を混ぜない。
- **ugatsu は koyu の最初の外部消費者になる。** 別リポジトリからパッケージ境界越しに使うことで、koyu の公開APIが「外から使える形か」を常に検証する。内部に手を伸ばしたくなったら、それは koyu 側のAPIを直す信号。
- モノレポの利点 (アトミックな同時変更) は、記法とビューワーの結合が薄い (ビューワーは導出関数を呼ぶだけ) ため小さい。

**2. `@kensnzk/koyu` をパッケージ依存にする。** vendor + sync-core は同期忘れで答えがズレる構造的リスクを持っていた (実際、v0.3のvendorのまま v0.5 の air / hinge / swing / site を取りこぼしていた)。koyu 側に main/types/exports/files/prepare を整備し (koyu v0.5.1)、ugatsu は `github:kensnzk/koyu` 依存で消費する。npm 公開後は `^0.5.1` に切り替え。examples も node_modules から `sync-examples` で取る — 例の原本は koyu 側。

**3. ライセンスは koyu と同じ Apache-2.0 (+NOTICE)、README は英語正+日本語並置。** 公開戦略 (防衛的公開・帰属) を揃える。

## 帰結

- ビューワーの描画規約は koyu の plan.ts への追随として維持する (air=細実線、半屋外=淡色、hinge/swing)。plan.ts が変わったらここも変える — 追随箇所は PlanView と buildScene に限定されている。
- 初回セットアップに順序がある: koyu が GitHub に push されてから ugatsu の `npm install` が通る (package-lock.json はその時点で生成してコミットする。それまで CI は `npm install`)。
- ローカル開発で koyu の未pushの変更を使うときは `npm install ../koyu` (パスは手元の配置に合わせる)。
