// IFCXS コア — 本体リポジトリ (../IFCXS) の src からの vendor コピー。
// ここのファイルは手で編集しない。本体が更新されたら `npm run sync-core` で追随する。
// (cli.ts のみ node 依存のため vendor 対象外)
export * from "./model.js";
export { parse, tokenize } from "./parse.js";
export * from "./graph.js";
export { check } from "./check.js";
export { daylight } from "./light.js";
export { svgPlan } from "./plan.js";
