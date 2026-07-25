// ビューワーの状態 — 原本はソーステキスト。モデルはその導出物であり、
// すべての編集は (将来のGUIオーサリングも含め) テキストへの操作として設計する。
// v0.2: 原本は一枚のテキストからレイヤー群 (files+entry) になった (koyu ADR-0010)。
// 各レイヤーは分担の単位で、合成 (parseFiles) のコンフリクトは出所つきのエラーになる。
import { create } from "zustand";
import {
  check,
  doorsBetween,
  parseFiles,
  SourceError,
  type Model,
  type Route,
} from "@kensnzk/koyu";
import type { ColorMode } from "../lib/colors.js";
import { applyTheme, initialTheme, type Theme } from "../lib/theme.js";

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

export interface ParseErrorInfo {
  /** どのレイヤーのエラーか (合成時のみ) */
  file?: string;
  line: number;
  message: string;
}

export interface ViewerState {
  /** レイヤー群 — ファイル名 → ソース。単一ファイルは1枚 */
  files: Record<string, string>;
  /** base層 (合成の入口) */
  entry: string;
  /** エディタが開いているレイヤー */
  activeFile: string;
  /** activeFile の中身 (エディタ用の派生値) */
  source: string;
  /** 最後にパースに成功したモデル (編集エラー中も表示は保つ) */
  model: Model | null;
  /** パース成功のたびに増える (シーン再構築の合図) */
  modelKey: number;
  /** カメラをフィットし直す合図 (ファイル切替のたびに変わる) */
  fitKey: string;
  parseError: ParseErrorInfo | null;
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
  /** 通り芯 / Cartesian grid は検査補助。既定では図面へ出さない */
  showGrid: boolean;
  showEditor: boolean;
  showInspector: boolean;
  /** プロパティパネルの幅 (px) — 左端ハンドルでリサイズ */
  inspectorWidth: number;
  /** ライト/ダーク — DSトークンごと切り替わる ([data-theme]) */
  theme: Theme;

  selected: string | null;
  hovered: string | null;
  routeTarget: string | null;
  route: Route | "unreachable" | null;

  /** 単一ファイルを開く (ドロップ・開く・埋め込み) */
  setSource(src: string, fileName?: string): void;
  /** レイヤー群を開く (合成の例・複数ファイルの埋め込み) */
  setFiles(files: Record<string, string>, entry: string): void;
  /** エディタからの編集 — activeFile だけを書き換えて再合成 */
  editActive(src: string): void;
  setActiveFile(name: string): void;
  setMainView(v: MainView): void;
  setColorMode(m: ColorMode): void;
  setPlanLevel(l: string): void;
  toggleLevelHidden(l: string): void;
  showAllLevels(): void;
  setStackMode(b: boolean): void;
  setSpread(n: number): void;
  setShowWalls(b: boolean): void;
  setShowOpenings(b: boolean): void;
  setShowGrid(b: boolean): void;
  toggleEditor(): void;
  toggleInspector(): void;
  setInspectorWidth(w: number): void;
  toggleTheme(): void;
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

export const useViewer = create<ViewerState>()((set, get) => {
  /** files+entry から再合成し、状態に反映する。fresh=true はファイル切替 (ビューをリセット) */
  function recompose(files: Record<string, string>, entry: string, activeFile: string, fresh: boolean) {
    const st = get();
    const base = {
      files,
      entry,
      activeFile,
      source: files[activeFile] ?? "",
    };
    try {
      const model = parseFiles(files, entry);
      const { errors, warnings } = check(model);
      const levels = levelsWithRooms(model);
      const planLevel =
        !fresh && st.planLevel && levels.includes(st.planLevel)
          ? st.planLevel
          : (levels[0] ?? null);
      const selected = st.selected && model.spaces.has(st.selected) ? st.selected : null;
      const routeTarget =
        st.routeTarget && model.spaces.has(st.routeTarget) ? st.routeTarget : null;
      set({
        ...base,
        model,
        modelKey: st.modelKey + 1,
        fitKey: fresh ? entry + String(st.modelKey) : st.fitKey,
        parseError: null,
        checkErrors: errors,
        checkWarnings: warnings,
        planLevel,
        hiddenLevels: fresh ? {} : st.hiddenLevels,
        selected,
        routeTarget,
        route: computeRoute(model, selected, routeTarget),
      });
    } catch (e) {
      if (e instanceof SourceError) {
        set({
          ...base,
          parseError: { line: e.line, message: e.message, ...(e.file ? { file: e.file } : {}) },
        });
      } else {
        set({
          ...base,
          parseError: { line: 0, message: e instanceof Error ? e.message : String(e) },
        });
      }
    }
  }

  return {
    files: {},
    entry: "untitled.muro",
    activeFile: "untitled.muro",
    source: "",
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
    showGrid: false,
    showEditor: true,
    showInspector: true,
    inspectorWidth: 300,
    theme: initialTheme(),

    selected: null,
    hovered: null,
    routeTarget: null,
    route: null,

    setSource(src, fileName) {
      const name = fileName ?? get().entry;
      recompose({ [name]: src }, name, name, fileName !== undefined);
    },
    setFiles(files, entry) {
      recompose(files, entry, entry, true);
    },
    editActive(src) {
      const st = get();
      recompose({ ...st.files, [st.activeFile]: src }, st.entry, st.activeFile, false);
    },
    setActiveFile(name) {
      const st = get();
      if (!(name in st.files)) return;
      set({ activeFile: name, source: st.files[name]! });
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
    setShowGrid: (showGrid) => set({ showGrid }),
    toggleEditor: () => set((s) => ({ showEditor: !s.showEditor })),
    toggleInspector: () => set((s) => ({ showInspector: !s.showInspector })),
    setInspectorWidth: (w) => set({ inspectorWidth: Math.min(Math.max(w, 220), 640) }),
    toggleTheme() {
      const theme: Theme = get().theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      set({ theme });
    },

    select(path) {
      const st = get();
      set({ selected: path, route: computeRoute(st.model, path, st.routeTarget) });
    },
    hover: (hovered) => set({ hovered }),
    setRouteTarget(path) {
      const st = get();
      set({ routeTarget: path, route: computeRoute(st.model, st.selected, path) });
    },
  };
});

/** 経路ハイライト対象の空間パス集合 */
export function routePaths(route: Route | "unreachable" | null): Set<string> {
  if (!route || route === "unreachable") return new Set();
  return new Set(route.path);
}
