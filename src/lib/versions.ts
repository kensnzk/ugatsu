// 版の三本 — **どの版の形を見ているかを、利用者が言えなければ凍結はできない。**
//
// ugatsu の版は独立に動く。koyu の版は導出の出所であり、muro の版は読める記法の版である
// (koyu spec/scope.md §9)。三つは別々に動くので、一つにまとめて名乗ることはできない。
//
// ugatsu と koyu はビルド時に package.json / lockfile から凍る (vite.config.ts の define)。
// muro は koyu が実行時に名乗る台帳を読む — 直書きすれば版が上がったときに黙って嘘になる。
import { DEFAULT_LANGUAGE_VERSION } from "@kensnzk/koyu";

/** このビューアの版 */
export const UGATSU_VERSION: string = __UGATSU_VERSION__;
/** 導出を担っている koyu の版 (このHTMLに焼き込まれた実装) */
export const KOYU_VERSION: string = __KOYU_VERSION__;
/** 読める muro の版 (koyu の台帳が名乗る言語版) */
export const MURO_VERSION: string = DEFAULT_LANGUAGE_VERSION;

/** 「ugatsu 0.4.0 / koyu 0.15.0 / muro 0.5」 — 画面と meta で同じ綴りを使う */
export const VERSION_LINE = `ugatsu ${UGATSU_VERSION} / koyu ${KOYU_VERSION} / muro ${MURO_VERSION}`;
