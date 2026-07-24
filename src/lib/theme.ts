// デザインシステムのトークン (CSS変数) をJS側から読む。
// DOMのCSSと同じ一次情報 (@kensnzk/koyu-design-system) から描画系
// (Three.js / SVG / CodeMirror) の色も導出し、DS更新が全ビューへ波及するようにする。
// 直書きのhexをここ以外のTS/TSXに増やさないこと (npm run ds:check が検出する)。

const cache = new Map<string, string>();

/** トークンの計算済み値 (例: token("--primary") → "#3A5590") */
export function token(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  let v = "";
  if (typeof document !== "undefined") {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  if (!v) {
    // stylesheet未適用 (テスト等)。キャッシュせず灰色で流す — 適用後の読取は正しい値になる
    return "#808080";
  }
  cache.set(name, v);
  return v;
}

/** Three.js 用 — トークンを 0xRRGGBB の数値へ */
export function tokenColor(name: string): number {
  const v = token(name);
  return v.startsWith("#") ? parseInt(v.slice(1, 7), 16) : 0x808080;
}

/** テーマ切替 (dark等) 時に呼ぶ — 以後の読取が新しい値になる */
export function resetTokenCache(): void {
  cache.clear();
}
