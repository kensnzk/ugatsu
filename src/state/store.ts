// ビューワーの状態 — 原本はソーステキスト。モデルはその導出物であり、
// すべての編集は (将来のGUIオーサリングも含め) テキストへの操作として設計する。
import { create } from "zustand";
import {
  check,
  doorsBetween,
  parse,
  SourceError,
  type Model,
  type Route,
} from "../core/index.js";
import type { ColorMode } from "../lib/colors.js";

export type MainView = "plan" | "3d" | "table";

/** 領域を持つ空間があるレベルを z 順で返す */
export function levelsWithRooms(model: Model): string[] {
  const has = new Set<string>();
  for (const s of model.spaces.values()) {
    if (s.level && s.rects.length > 0) has.add(s.level);
  }
  return Object.values(model.levels)
    .filter((l) => has.has(l.name))
    .sort((a, b) => a.z - b.z)
    .map((l) => l.name);
}

export interface ViewerState {
  source: string;
  fileName: string;
  /** 最後にパースに成功したモデル (編集エラー中も表示は保つ) */
  model: Model | null;
  /** パース成功のたびに増える (シーン再構築の合図) */
  modelKey: number;
  /** カメラをフィットし直す合図 (ファイル切替のたびに変わる) */
  fitKey: string;
  parseError: { line: number; message: string } | null;
  checkErrors: string[];
  checkWarnings: string[];

  mainView: MainView;
  colorMode: ColorMode;
  planLevel: string | null;
  hiddenLevels: Record<string, true>;
  stackMode: boolean;
  /** 2.5D 展開係数 (1=実寸) */
  spread: number;
  showWalls: boolean;
  showOpenings: boolean;
  showEditor: boolean;

  selected: string | null;
  hovered: string | null;
  routeTarget: string | null;
  route: Route | "unreachable" | null;

  setSource(src: string, fileName?: string): void;
  setMainView(v: MainView): void;
  setColorMode(m: ColorMode): void;
  setPlanLevel(l: string): void;
  toggleLevelHidden(l: string): void;
  showAllLevels(): void;
  setStackMode(b: boolean): void;
  setSpread(n: number): void;
  setShowWalls(b: boolean): void;
  setShowOpenings(b: boolean): void;
  toggleEditor(): void;
  select(path: string | null): void;
  hover(path: string | null): void;
  setRouteTarget(path: string | null): void;
}

function computeRoute(
  model: Model | null,
  from: string | null,
  to: string | null,
): Route | "unreachable" | null {
  if (!model || !from || !to || from === to) return null;
  return doorsBetween(model, from, to) ?? "unreachable";
}

export const useViewer = create<ViewerState>()((set, get) => ({
  source: "",
  fileName: "untitled.ifcxs",
  model: null,
  modelKey: 0,
  fitKey: "",
  parseError: null,
  checkErrors: [],
  checkWarnings: [],

  mainView: "plan",
  colorMode: "use",
  planLevel: null,
  hiddenLevels: {},
  stackMode: false,
  spread: 1,
  showWalls: true,
  showOpenings: true,
  showEditor: true,

  selected: null,
  hovered: null,
  routeTarget: null,
  route: null,

  setSource(src, fileName) {
    const st = get();
    const nextFile = fileName ?? st.fileName;
    try {
      const model = parse(src);
      const { errors, warnings } = check(model);
      const levels = levelsWithRooms(model);
      const planLevel =
        st.planLevel && levels.includes(st.planLevel) ? st.planLevel : (levels[0] ?? null);
      const selected = st.selected && model.spaces.has(st.selected) ? st.selected : null;
      const routeTarget =
        st.routeTarget && model.spaces.has(st.routeTarget) ? st.routeTarget : null;
      set({
        source: src,
        fileName: nextFile,
        model,
        modelKey: st.modelKey + 1,
        fitKey: nextFile,
        parseError: null,
        checkErrors: errors,
        checkWarnings: warnings,
        planLevel,
        hiddenLevels: fileName !== undefined && fileName !== st.fileName ? {} : st.hiddenLevels,
        selected,
        routeTarget,
        route: computeRoute(model, selected, routeTarget),
      });
    } catch (e) {
      if (e instanceof SourceError) {
        set({ source: src, fileName: nextFile, parseError: { line: e.line, message: e.message } });
      } else {
        set({
          source: src,
          fileName: nextFile,
          parseError: { line: 0, message: e instanceof Error ? e.message : String(e) },
        });
      }
    }
  },

  setMainView: (mainView) => set({ mainView }),
  setColorMode: (colorMode) => set({ colorMode }),
  setPlanLevel: (planLevel) => set({ planLevel }),
  toggleLevelHidden(l) {
    const hidden = { ...get().hiddenLevels };
    if (hidden[l]) delete hidden[l];
    else hidden[l] = true;
    set({ hiddenLevels: hidden });
  },
  showAllLevels: () => set({ hiddenLevels: {} }),
  setStackMode: (stackMode) => set({ stackMode }),
  setSpread: (spread) => set({ spread }),
  setShowWalls: (showWalls) => set({ showWalls }),
  setShowOpenings: (showOpenings) => set({ showOpenings }),
  toggleEditor: () => set((s) => ({ showEditor: !s.showEditor })),

  select(path) {
    const st = get();
    set({ selected: path, route: computeRoute(st.model, path, st.routeTarget) });
  },
  hover: (hovered) => set({ hovered }),
  setRouteTarget(path) {
    const st = get();
    set({ routeTarget: path, route: computeRoute(st.model, st.selected, path) });
  },
}));

/** 経路ハイライト対象の空間パス集合 */
export function routePaths(route: Route | "unreachable" | null): Set<string> {
  if (!route || route === "unreachable") return new Set();
  return new Set(route.path);
}
