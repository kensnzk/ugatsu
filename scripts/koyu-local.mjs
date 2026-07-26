#!/usr/bin/env node
// 穿つを「koyu の特定のコミット」に対して手元で動かすためのパイプライン (ADR-0005)。
//
//   npm run koyu:local              # 隣の作業ツリー (../koyu_core) をそのまま見る
//   npm run koyu:local -- aef5b67   # そのコミットを worktree に取り出して見る
//   npm run koyu:local -- v0.11.0   # タグでもブランチでもよい
//   npm run koyu:status             # 今どれに繋がっているか
//   npm run koyu:unlink             # レジストリの版へ戻す
//
// 仕組みは単純で、node_modules/@kensnzk/koyu を対象へのシンボリックリンクに差し替える
// だけである。vite も tsc も vitest も同じ解決を通るので、三つが必ず一致する。
// npm ci はこのリンクを消してレジストリから入れ直すので、CI は影響を受けない。

import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KOYU_REPO = resolve(process.env.KOYU_REPO ?? join(root, "..", "koyu_core"));
const LINK = join(root, "node_modules", "@kensnzk", "koyu");
const STATE = join(root, ".koyu-local.json");
const PINS = join(root, ".koyu");

const sh = (cmd, args, cwd, quiet = false) =>
  execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", quiet ? "pipe" : "inherit"],
  }).trim();

/** 今リンクされているものを言葉にする。見えない差し替えは事故のもとなので必ず出す */
function status() {
  if (!existsSync(LINK)) return console.log("koyu: 未インストール (npm install してください)");
  const linked = lstatSync(LINK).isSymbolicLink();
  const pkg = JSON.parse(readFileSync(join(LINK, "package.json"), "utf8"));
  if (!linked) {
    console.log(`koyu: レジストリ版 ${pkg.version} (npm から)`);
    return;
  }
  const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
  console.log(
    `koyu: ローカル ${pkg.version} — ${st.ref ?? "作業ツリー"}` +
      (st.commit ? ` (${st.commit.slice(0, 7)})` : "") +
      `\n      ${st.path ?? LINK}`,
  );
}

/** 指定のrefを worktree に取り出す。同じrefなら作り直さない */
function checkout(ref) {
  let commit;
  try {
    commit = sh("git", ["rev-parse", "--verify", `${ref}^{commit}`], KOYU_REPO, true);
  } catch {
    console.error(`koyu にそのコミットがありません: ${ref}\n  ${KOYU_REPO} で git fetch してから試してください`);
    process.exit(1);
  }
  const dir = join(PINS, commit.slice(0, 12));
  if (!existsSync(dir)) {
    mkdirSync(PINS, { recursive: true });
    sh("git", ["worktree", "add", "--detach", dir, commit], KOYU_REPO);
    console.log(`worktree ← ${ref} (${commit.slice(0, 7)})`);
  }
  // 取り出したツリーには node_modules が無い。ビルドに要るのは typescript だけなので、
  // 本体の node_modules を貸す (取り出しごとに npm install しない)
  const nm = join(dir, "node_modules");
  if (!existsSync(nm)) symlinkSync(join(KOYU_REPO, "node_modules"), nm, "dir");
  return { dir, commit, ref };
}

/** dist が要る (package.json の exports が dist を指すため)。zero-dep なのでtscだけで足りる */
function build(dir) {
  console.log("koyu をビルド中…");
  execFileSync("npx", ["tsc", "-p", "tsconfig.build.json"], { cwd: dir, stdio: "inherit" });
}

function link(target, meta) {
  mkdirSync(dirname(LINK), { recursive: true });
  rmSync(LINK, { recursive: true, force: true });
  symlinkSync(target, LINK, "dir");
  writeFileSync(STATE, JSON.stringify({ ...meta, path: target }, null, 2) + "\n");
}

// 第1引数が --status / --unlink ならコマンド、そうでなければ ref (省略時は作業ツリー)
const argv = process.argv.slice(2).filter((a) => a !== "--");
const cmd = argv[0]?.startsWith("--") ? argv[0] : undefined;
const rest = cmd ? argv.slice(1) : argv;

if (cmd === "--status") {
  status();
} else if (cmd === "--unlink") {
  rmSync(STATE, { force: true });
  rmSync(LINK, { recursive: true, force: true });
  console.log("レジストリ版へ戻します (npm install)…");
  execFileSync("npm", ["install", "--no-save", "@kensnzk/koyu"], { cwd: root, stdio: "inherit" });
  status();
} else {
  if (!existsSync(join(KOYU_REPO, "package.json"))) {
    console.error(`koyu のリポジトリが見つかりません: ${KOYU_REPO}\nKOYU_REPO=... で指定できます`);
    process.exit(1);
  }
  const ref = rest[0];
  const t = ref ? checkout(ref) : { dir: KOYU_REPO, ref: undefined, commit: sh("git", ["rev-parse", "HEAD"], KOYU_REPO) };
  build(t.dir);
  link(t.dir, { ref: t.ref, commit: t.commit });
  status();
  console.log("\nnpm run dev / typecheck / test はこのツリーを見ます。戻すときは npm run koyu:unlink");
}
