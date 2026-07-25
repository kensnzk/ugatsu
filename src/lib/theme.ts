// デザインシステムのトークン (CSS変数) をJS側から読む。
// DOMのCSSと同じ一次情報 (@kensnzk/koyu-design-system) から描画系
// (Three.js / SVG / CodeMirror) の色も導出し、DS更新が全ビューへ波及するようにする。
// 直書きのhexをここ以外のTS/TSXに増やさないこと (npm run ds:check が検出する)。

const cache = new Map<string, string>();

/** トークンの計算済み値 (例: token("--ink") → テーマに応じた墨色) */
export function token(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  let v = "";
  if (typeof document !== "undefined") {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  if (!v) {
    // stylesheet未適用 (テスト等)。キャッシュせず灰色で流す — 適用後の読取は正しい値になる
    return "#808080"; // ds:allow stylesheet未適用時だけ使う中立フォールバック
  }
  cache.set(name, v);
  return v;
}

/** Three.js 用 — トークンを 0xRRGGBB の数値へ */
export function tokenColor(name: string): number {
  const v = token(name);
  return v.startsWith("#") ? parseInt(v.slice(1, 7), 16) : 0x808080; // ds:allow 上と同じ描画フォールバック
}

/** テーマ切替 (dark等) 時に呼ぶ — 以後の読取が新しい値になる */
export function resetTokenCache(): void {
  cache.clear();
}

// ---- ライト/ダーク (DSは [data-theme="dark"] で切替) ----

export type Theme = "light" | "dark";
const THEME_KEY = "ugatsu:theme";

/** 保存値 → OS設定 の順で初期テーマを決める */
export function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* no-op */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** テーマをDOMへ適用し永続化する。トークンキャッシュも捨てる */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset["theme"] = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* no-op */
  }
  resetTokenCache();
}
