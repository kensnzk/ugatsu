# ugatsu

*[日本語版 README](README.ja.md)*

A 2D/3D viewer for [koyu](https://github.com/kensnzk/koyu) — the space-first, text-native architectural notation. The source text has no geometry in it; plans, stacked levels, 3D volumes and area schedules are all generated from the text, live, as you edit.

The name 鑿つ/穿つ (*ugatsu*, "to bore through") follows koyu (戸牖, "door and window" — Laozi ch. 11): openings are what make rooms usable, and a viewer is the act of opening a way into the text.

## What it does

- **Load** — open `.muro` files by drag & drop or file picker. Ships with koyu's examples (two rooms, a two-storey office with an atrium, a small house with site and roads, a 10-storey apartment building with 43 units).
- **Edit** — the left pane is a text editor. Every keystroke re-parses, re-checks and regenerates every view. On a parse error the viewer shows the line and keeps the last consistent model. The text is the original; everything else is derived.
- **Plan** — an interactive port of koyu's `plan` drawing conventions: grid lines, centre-line walls, door swings, void diagonals, railings as thin lines, semi-outdoor tinting. Click a space to select it; wheel to zoom.
- **3D** — spaces extruded to their ceiling heights, walls generated from boundaries with thickness, doors and windows on wall faces, railings at waist height. Colour by use / type / level; per-level visibility.
- **2.5D stack** — floor plates lifted by real height × an expansion factor. A void has no plate: the absence of floor appears as a hole, which is exactly what a void is.
- **Area schedule** — per-level space lists with subtotals, zone aggregation (exclusive-area sums), use ratios, per-type totals, CSV export. Site report (site area declared vs derived, building footprint, road frontage) when the model has a site.
- **Graph** — select a space to see its neighbours (boundary kind, doors, fire rating). "How many doors from here to there?" is answered by `doorsBetween`, with the route highlighted on the plan.
- **Export** — source, canonical JSON, plan SVG, area CSV, and a **self-contained HTML file with the model embedded** — one file that anyone can open in a browser, no install.

## Usage

```sh
npm install
npm run dev            # dev server
npm test               # vitest
npm run typecheck
npm run build          # dist/index.html — the whole viewer is a single HTML file
npm run embed -- examples/mansion.muro   # emit a distributable HTML with the model embedded
npm run sync-examples  # refresh bundled examples from the installed koyu
```

The build artefact is always a single HTML file. Send `dist/index.html` to anyone and it opens in a browser.

## Structure

```
src/state/       zustand store — the source text is the only original; the model is derived
src/components/  Toolbar / EditorPane / PlanView / Scene3D / AreaTable / Inspector
src/three/       model → three.js scene (3D and 2.5D stack)
src/lib/         colour assignment, area statistics, exports
examples/        copies of koyu's examples (refreshed by sync-examples)
```

koyu is consumed as a package (`@kensnzk/koyu`) — the viewer holds no answers of its own; every derivation (wall segments, areas, routes, checks, daylight, site) is a call into koyu. Design decisions are recorded in [docs/decisions/](docs/decisions/).

## License

Code is licensed under [Apache-2.0](LICENSE) (see also [NOTICE](NOTICE)).
