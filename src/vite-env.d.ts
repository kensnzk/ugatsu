/// <reference types="vite/client" />

declare module "*.muro?raw" {
  const src: string;
  export default src;
}

/** ビルド時に凍る版 (vite.config.ts の define — src/lib/versions.ts が唯一の読み手) */
declare const __UGATSU_VERSION__: string;
declare const __KOYU_VERSION__: string;
