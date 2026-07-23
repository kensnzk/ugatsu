// ダウンロードと配布用HTMLの自己埋め込み

/** React がマウントする前の素のHTML (main.tsx が起動時に確保する) */
let pristineHtml: string | null = null;

export function capturePristineHtml(): void {
  pristineHtml = "<!doctype html>\n" + document.documentElement.outerHTML;
}

export function downloadText(fileName: string, text: string, mime = "text/plain"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** UTF-8 → base64 */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodeBase64(b64: string): string {
  const bin = atob(b64.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * いま開いているモデルを埋め込んだ配布用HTMLを書き出す (MUN-143)。
 * ビューワー自体が単一HTMLなので、素のHTMLの embed スクリプトに
 * ソースを注入するだけで「一つのファイルとして閲覧できる図面」になる。
 * dev サーバー上では素のHTMLがバンドルを含まないため無効。
 */
export function exportEmbeddedHtml(source: string, fileName: string): boolean {
  if (!pristineHtml || !import.meta.env.PROD) return false;
  const b64 = encodeBase64(source);
  const re = /(<script[^>]*id="ifcxs-embed"[^>]*>)([\s\S]*?)(<\/script>)/;
  if (!re.test(pristineHtml)) return false;
  const html = pristineHtml.replace(
    re,
    (_m, open: string, _body: string, close: string) =>
      open.replace(/\s*data-name="[^"]*"/, "").replace(">", ` data-name="${fileName}">`) + b64 + close,
  );
  const out = fileName.replace(/\.ifcxs$/, "") + ".viewer.html";
  downloadText(out, html, "text/html");
  return true;
}
