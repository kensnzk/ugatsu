// 版の三本 — **どの版の形を見ているかを、利用者が言えなければ凍結はできない。**
//
// ugatsu の版は独立に動く。koyu の版は導出の出所であり、muro の版は読める記法の版である
// (koyu ADR-0042 — 二本の版の線)。三つは別々に動くので、一つにまとめて名乗ることはできない。
//
// ugatsu と koyu はビルド時に package.json / lockfile から凍る (vite.config.ts の define)。
// muro は koyu が実行時に名乗る台帳を読む — 直書きすれば版が上がったときに黙って嘘になる。
//
// **muro は一点ではなく幅である。**読める範囲・最新・「版行を書かなかった原本の読み方」は
// 別の数であり、三つ目は 1.1 に**凍って動かない** (koyu docs/reference/muro/version.md)。
// かつてここは `DEFAULT_LANGUAGE_VERSION` 一つを「読める muro の版」として出しており、
// koyu が 1.3 まで読めるようになってもなお「1.1」と名乗り続けていた。
import {
  DEFAULT_LANGUAGE_VERSION,
  NEWEST_LANGUAGE_VERSION,
  requireMuro,
  SUPPORTED_LANGUAGE_VERSIONS,
} from "@kensnzk/koyu";

/** このビューアの版 */
export const UGATSU_VERSION: string = __UGATSU_VERSION__;
/** 導出を担っている koyu の版 (このHTMLに焼き込まれた実装) */
export const KOYU_VERSION: string = __KOYU_VERSION__;

/**
 * ugatsu が読み書きすると名乗る muro の版。**同梱の例がこの版で書かれている。**
 *
 * 依存として本当のものは koyu のパッケージ範囲ではなく**言語の版**である
 * (koyu docs/reference/api/index.md)。範囲指定は黙って古びるが、この一行は古びない —
 * 読めない koyu を掴んだ瞬間に `assertMuro()` が理由を名指しで言う。
 */
export const MURO_REQUIRED = "1.3";

/** 読める muro の最新版 — 全部の記法を得るために原本が名乗るべき版 */
export const MURO_VERSION: string = NEWEST_LANGUAGE_VERSION;
/** 読める muro の範囲 (古い版は意味が保たれる場合にだけ通る) */
export const MURO_READS = `${SUPPORTED_LANGUAGE_VERSIONS[0]}–${NEWEST_LANGUAGE_VERSION}`;
/** 版行を書かなかった原本の読み方。**凍っており、最新には追随しない** */
export const MURO_UNDECLARED: string = DEFAULT_LANGUAGE_VERSION;

/**
 * このビルドの koyu が `MURO_REQUIRED` を読むことを確かめる。読めなければ、
 * 症状ではなく**直し方**を名乗って投げる (koyu の `requireMuro`)。
 */
export const assertMuro = (): void => requireMuro(MURO_REQUIRED);

/** 「ugatsu 0.6.0 / koyu 0.21.0 / muro 1.3」 — 画面と meta で同じ綴りを使う */
export const VERSION_LINE = `ugatsu ${UGATSU_VERSION} / koyu ${KOYU_VERSION} / muro ${MURO_VERSION}`;
