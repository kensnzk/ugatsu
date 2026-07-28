# ugatsu

*[日本語版 README](README.ja.md)*

**[Open the demo → ugatsu.dev](https://ugatsu.dev)** — nothing to install. The demo *is* the release artefact: the same single HTML file you can download and send to anyone.

A 2D/3D viewer for [koyu](https://github.com/kensnzk/koyu) — the space-first, text-native architectural notation. The source text has no geometry in it; plans, stacked levels, 3D volumes and area schedules are all generated from the text, live, as you edit.

The name 鑿つ/穿つ (*ugatsu*, "to bore through") follows koyu (戸牖, "door and window" — Laozi ch. 11): openings are what make rooms usable, and a viewer is the act of opening a way into the text.

## What it does

- **Load** — open `.muro` files by drag & drop or file picker; dropping several files at once opens them as composed layers. Ships with koyu's examples (two rooms, a two-storey office with an atrium, a small house with site and roads, **the same house composed from 5 files**, a 10-storey apartment building with 43 units, and the full-feature showcase: **an 11-storey mixed-use corner tower composed from 9 layers with a polygon site** — the default).
- **Edit** — the left pane is a text editor. Every keystroke re-parses, re-checks and regenerates every view. On a parse error the viewer shows the line and keeps the last consistent model. The text is the original; everything else is derived.
- **Composition (koyu ADR-0010)** — layers split by `import` are edited as tabs (◈ marks the base layer). Composition runs through koyu's `parseFiles`; conflicts (duplicate paths or asset names) and opening-overflow checks report the source layer and line, and clicking an error jumps to that tab. Door/window assets (`asset`, with sliding/auto `style`) drive the plan symbols.
- **Plan** — an interactive port of koyu's `plan` drawing conventions: grid lines, centre-line walls, door swings, void diagonals, railings as thin lines, semi-outdoor tinting. Click a space to select it; wheel to zoom.
- **3D** — spaces extruded to their ceiling heights, walls generated from boundaries with thickness, doors and windows on wall faces, railings at waist height. Colour by use / type / level; per-level visibility.
- **2.5D stack** — floor plates lifted by real height × an expansion factor. A void has no plate: the absence of floor appears as a hole, which is exactly what a void is.
- **Area schedule** — per-level space lists with subtotals, zone aggregation (exclusive-area sums), use ratios, per-type totals, CSV export. Site report (site area declared vs derived, building footprint, road frontage) when the model has a site.
- **Graph** — select a space to see its neighbours (boundary kind, doors, fire rating). "How many doors from here to there?" is answered by `doorsBetween`, with the route highlighted on the plan.
- **Export** — source, canonical JSON, plan SVG, area CSV, and a **self-contained HTML file with the model embedded** — one file that anyone can open in a browser, no install. Layered models embed as layers, so the division of labour survives the hand-off.

## Usage

```sh
npm install
npm run dev            # dev server
npm test               # vitest
npm run typecheck
npm run build          # dist/index.html — the whole viewer is a single HTML file
npm run embed -- examples/mansion.muro   # emit a distributable HTML with the model embedded
npm run sync-examples  # refresh bundled examples from the installed koyu

npm run koyu:local            # point at the sibling koyu working tree
npm run koyu:local -- aef5b67 # …or at one specific koyu commit (tag/branch too)
npm run koyu:status           # which koyu am I linked to right now?
npm run koyu:unlink           # back to the published package
```

`koyu:local` swaps `node_modules/@kensnzk/koyu` for a symlink, so Vite, `tsc` and Vitest all resolve to the same tree — you can check a koyu change in the plan and the 3D **without publishing it first** ([ADR-0005](docs/decisions/0005-local-koyu-pipeline.md)). CI is untouched: `npm ci` restores the registry version, so a red CI here means the version you are using has not been published yet, which is exactly what it should say.

```sh
```

The build artefact is always a single HTML file. Send `dist/index.html` to anyone and it opens in a browser. [ugatsu.dev](https://ugatsu.dev) serves that very file — Vercel, static, `vercel.json` is the whole deployment ([ADR-0004](docs/decisions/0004-demo-site.md)).

## Structure

```
src/state/       zustand store — the source text is the only original; the model is derived
src/components/  Toolbar / EditorPane / PlanView / Scene3D / AreaTable / Inspector
src/three/       model → three.js scene (3D and 2.5D stack)
src/lib/         colour assignment, area statistics, exports
examples/        copies of koyu's examples (refreshed by sync-examples)
```

koyu is consumed as a package (`@kensnzk/koyu`) — the viewer holds no answers of its own; every derivation (wall segments, areas, routes, checks, site) is a call into koyu. Design decisions are recorded in [docs/decisions/](docs/decisions/).

## Scope

**koyu makes no coordinates. ugatsu makes no meaning.** What ugatsu draws, what it does not draw, what it never judges, and the default values it fills in for things you did not write, are all listed in **[docs/scope.md](docs/scope.md)** (Japanese). Read it before concluding that something is missing from the notation: **what cannot be drawn is not what cannot be written.**

## License

Code is licensed under [Apache-2.0](LICENSE) (see also [NOTICE](NOTICE)).
