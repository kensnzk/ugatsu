# ADR-0008 (ugatsu): muro 1.3 と、12 に割れた公開面へ追随する

日付: 2026-08-13 / 状態: 採用 / 前提: koyu [ADR-0051](https://github.com/kensnzk/koyu/blob/main/docs/decisions/0051-structure-leaves-the-type-position.md)・[ADR-0053](https://github.com/kensnzk/koyu/blob/main/docs/decisions/0053-public-surface-cutover.md)・[ADR-0058](https://github.com/kensnzk/koyu/blob/main/docs/decisions/0058-the-constructors-of-matter-are-public.md)・[ADR-0060](https://github.com/kensnzk/koyu/blob/main/docs/decisions/0060-muro-names-the-language.md)・[ADR-0061](https://github.com/kensnzk/koyu/blob/main/docs/decisions/0061-use-is-retired.md)、ugatsu [ADR-0007](0007-draw-the-form.md)

## 文脈

ugatsu 0.5.0 は koyu 0.16.0 / muro 1.0 に向いていた。koyu はその後 0.21.0 まで進み、**言語の側も実装の側も、ugatsu が寄りかかっていた面が動いた**。

止まっていたのは版だけではない。**動いたのに黙っていた**ものが四つある。

| 動いたもの | ugatsu に何が起きていたか |
|---|---|
| **型の位置から構造が抜けた** (muro 1.1 / koyu ADR-0051)。外部は `outside:1`、吹抜けは `void:1` という宣言になり、型は自由で、書かなくてもよいラベルになった | `stats.ts` の `s.type === "exterior"`、`buildScene.ts` と `planFigure.ts` の `s.type === "void"` が、**muro 1.3 で書かれた原本に対して静かに違う答えを返す**。同梱例の `space /out name:外部 outside:1` は「屋内」に数えられ、型を書かない吹抜けは床になる。ADR-0006 が消したはずの「延べ面積が koyu と食い違う」がそのまま戻る |
| **`use` が廃された** (muro 1.3 / koyu ADR-0061)。用途は型の位置が持ち、他の区分は名前空間つきの鍵 (`lease.category` …) が持つ | 色分けの「用途」軸と面積表の「用途別」が、値の来ない軸になる。`effectiveUse` は `/model` から消えているので、そもそも動かない |
| **公開面が 12 の入口に割れた** (koyu ADR-0053)。ルートに残るのは合成・整合・正準化だけで、`derive` は `/form`、`areaM2` は `/model`、`svgPlan` は `/draw` | ugatsu の全 import が落ちる |
| **実体の構成子が公開された** (koyu ADR-0058)。`band` / `bandLine` / `thicken` / `columnRect` / `runPrism` — 芯線と厚みと z から実体を起こす規則 | ugatsu は同じ式を三箇所に書き写していた。ADR-0007 が「壁厚 100mm が四箇所に別々のリテラルとして在った」と数えたのと同じ壊れ方が、構成子の側に残っていた |
| **境界の 2Dエンティティが足あとと芯線の両方を持つようになった** (同じく ADR-0058)。「厚みを持つものとして描くか一本の線として描くかは見た目の判断なので、消費者が選ぶ」 | `planFigure` は `e.lines` を先に見ていた。**平面から黒帯が一本残らず消え、壁が全部「開放的な分節」の破線になった** — complex L17 で 107 本の壁が 107 本の細い破線になっていた |

一つ目と五つ目が最も高くつく。**どちらも落ちないからである。**型の語を読む三行も、`lines` を先に見る一行も、例外を投げず、赤くもならず、ただ違う面積と違う図を返す。

## 決定

**1. 構造は宣言から読む。型の語からは読まない。**

`isVoid(s)` / `isOutside(s)` (モデル側) と `FormSpace.void` / `.outside` / `.indoor` / `.semiOutdoor` (形の側) が答える。`Space.type` は表示のラベルとしてだけ扱い、**書かれないことを潰さない** (`(型なし)`)。

`test/core.test.ts` の「構造は宣言から読む — 型の語からではない」が、型を `room` のまま `outside:1` と書いた原本と、型を一つも書かない `void:1` の原本で縛る。**型を読む実装はこの一件で落ちる。**

**2. 集計の軸は原本が決める。既定の軸を持たない。**

色分けの第三の軸と面積表の集計は、`use` の後継として `koyu stats --by <鍵>` に対応する形へ移した。母集団は**そのモデルに書かれている名前空間つきの鍵**である (`carriedKeys(model)`)。

- 色分け: 「型 / レベル / (書かれた鍵ごと)」。既定は**型** — 室の目的は型の位置が持つ
- 面積表: 列も「◯◯別」の表も、書かれた鍵の数だけ立つ。書かれていなければ立たない
- 鍵を持たない空間は `(未記載)` へ入る。**バケツの合計は延べ面積に閉じる** — かつての `byUse` は鍵の無い空間を黙って落としていた

**既定の鍵を置かない**のは、置けば廃したはずの特権的な集計軸がそのまま戻るからである (koyu ADR-0061 決定6)。`rentable` / `exclusive` / `common` に色を固定していた表も同じ理由で捨てた — koyu ADR-0061 が名指しした下流の一つがこの表である。

**3. import の一行が、どの契約に寄りかかっているかを言う。**

12 の入口へ張り替えた。`test/form.test.ts` の import 検査もサブパスを見るようにした — 見なければ、形の部品が `@kensnzk/koyu/form` 経由で描画の頁へ戻ってきても黙って通る。

**4. 実体の構成子は koyu から取る。書き写さない。**

`planFigure.ts` の `band`、`buildScene.ts` の `bandLine` と `runPrism` を koyu の実装に置き換えた。`test/form.test.ts` が「取り込んでいること」と「同じ名の関数を自前で定義していないこと」の両方を縛る。

**4.1 物があるかどうかを言うのは `polygon` の有無である。**

同じ ADR が境界のエンティティに芯線を足した。区間は足あと (厚みのある四辺形) と芯線の**両方**を持って届き、どちらで描くかが消費者に残る。`planFigure` は `e.lines` を先に見ていたので、**壁がすべて「物を持たない境界」の枝へ落ちた。**

読む順を入れ替えた。足あとを持たないものだけが破線になり、足あとを持つものは黒帯 (遮蔽する材) か細実線 (`air` — 手すり・柵) になる。手すりの芯線を四辺形の頂点から割り戻していた `centreline` も消えた — `Form` が芯線を持って届く。

**この一件をテストが見逃していた。**`expectedMarks` が実装と同じ順で枝を書いていたので、**実装が壊れたときに期待値も一緒に壊れて数が合った**。期待値を `Form` の意味から書き直し、加えて数を数えない検査を足した — 「破線になるのは材を持たない境界だけである」。同梱例すべての全レベルで、黒帯・柵の線・破線の三つが `polygon` と `air` から決まることを言う。

**5. 取り下げられた名は一頁に閉じ、koyu に対して縛る。**

`canonicalBoundaryOrder` / `polyBounds` / `polygonAreaM2` / `slopeText` / `siteReport` は公開面から消えたが、ugatsu はまだ要る。`src/lib/koyu-compat.ts` が唯一の置き場である。

`siteReport` は**置き換わった** — `runAnalysis(model, SITE_ANALYSIS_ID, …)` を呼ぶ転写であり、数も丸めも koyu が決める。`assess` ではなく `runAnalysis` を呼ぶのは、**ugatsu が判定を一つも持たない**ためである ([docs/scope.md](../scope.md) §4)。構造が矛盾していれば分析は走らず `unavailable` が返り、そのとき ugatsu は敷地の表を出さない — **0 ㎡ と表示するのは嘘である。**

`canonicalBoundaryOrder` だけは移植である。`FormBoundary.boundary` の索引がどの境界を指すかを決めており、**ずれても落ちずに別の壁の `spec` を読む**だけなので、`test/koyu-compat.test.ts` が同梱例すべてで二重に縛る — 正準JSON (`toCanonical`) の並びに対してと、`derive` が振った索引に対して。

なお **koyu 自身の文書は、これが公開面に在るといまも書いている** (`docs/reference/form/index.md`)。文書と実装が食い違っている側であり、出し直されたらこの移植は消す。

**6. 索引から原本へ戻る道は一本にする。**

`src/lib/written.ts` が `writtenOf(model)` を持ち、正準順の並べ替えを**モデル一つにつき一度だけ**行う。かつて `glassSpec` は述語の中で、平面の `seg` 注記はループの中で `canonicalBoundaryOrder(model)` を呼んでおり、境界の数だけ全体を並べ直していた。koyu ADR-0041 が名指しで警告している当のことである。

**7. muro の版は一点ではなく幅である。**

`DEFAULT_LANGUAGE_VERSION` は「版行を書かなかった原本の読み方」であり、**1.1 に凍って動かない**。それを「読める muro の版」として出していたので、koyu が 1.3 まで読むようになっても画面と配布HTMLは「muro 1.1」と名乗り続けていた。

いま名乗るのは `NEWEST_LANGUAGE_VERSION` (= 1.3) で、範囲と「版行の無い原本の読み方」はインスペクタに併記する。加えて `main.tsx` が起動時に `requireMuro("1.3")` を投げる — **本当の依存は言語の版であって、パッケージの範囲ではない。**範囲指定は黙って古びるが、この一行は古びない。

## 帰結、実測

**同じ建物である。**`test/form.test.ts` の「立体は Form と一致する」「平面は Form の 2Dエンティティを取りこぼさない」「上部吹抜けの投影 11 件」は同梱例すべてで通り、面積の四例 (complex 31,606.24 / twin 141,448.56 ほか) も動いていない。**構成子を koyu のものに差し替えても座標が一つも動かなかった**ことが、書き写しが正しかったこと、そして正しくても重複だったことの両方を言っている。

| 増えた検査 | 何を縛るか |
|---|---|
| 構造は宣言から読む | 型の語を読む実装が一件で落ちる |
| 材を持つ境界は帯として描かれる | 壁が破線に落ちない。**数を数えない検査**なので、期待値が実装を写しても通らない |
| 鍵別集計はバケツの合計が延べ面積に閉じる | 鍵を持たない空間を黙って落とさない |
| 集計軸は書かれた鍵だけ | 既定の軸が戻らない |
| 構成子を書き写さない | 同じ `Form` から違う形が出る余地が構成子の側から戻らない |
| 正準順が koyu と一致する (16 件) | 移植が古びた日に落ちる |
| 同梱の例が名乗る版をこのビルドが読む | 例と実装の版がずれない |

**残る借り。**`validate` を呼んでいないこと、機械形式を読み込めないことは動いていない ([docs/scope.md](../scope.md) §7)。判定を出すなら、それが判定であって `check` の保証ではないと読み取れる形で出す — その入口 (`assess`) は今回 `runAnalysis` の隣に見えたが、**開けていない。**
