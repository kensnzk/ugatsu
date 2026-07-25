// 三次元ビュー — 3D押し出し / 2.5Dレベル重ね (展開)
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { areaM2, displayName } from "@kensnzk/koyu";
import { buildColors, routeColor, selectColor } from "../lib/colors.js";
import { Button, Checkbox, Slider, Switch } from "../lib/ds.js";
import { tokenColor } from "../lib/theme.js";
import { levelsWithRooms, routePaths, useViewer } from "../state/store.js";
import { buildScene, disposeGroup, type BuiltScene } from "../three/buildScene.js";
import { Dropdown } from "./Dropdown.js";
import { Legend } from "./Legend.js";
import { ToolIcon } from "./ui.js";

export function Scene3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    raycaster: THREE.Raycaster;
    grid: THREE.GridHelper;
    hemi: THREE.HemisphereLight;
    /** 再描画の要求 — 変化があったときだけ描く (アイドル時のGPU負荷ゼロ) */
    invalidate: () => void;
    built: BuiltScene | null;
  } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; path: string } | null>(null);
  const [glError, setGlError] = useState(false);
  // コンテキスト喪失中 (three標準の復帰待ち)。自動で作り直さない —
  // 喪失→即再作成のループはGPUプロセスを落とし、ブラウザ全体のWebGL無効化を招く
  const [glLost, setGlLost] = useState(false);
  // 手動再試行の合図 (復帰が来ないときにユーザー操作でのみ作り直す)
  const [glRetry, setGlRetry] = useState(0);

  const model = useViewer((s) => s.model);
  const modelKey = useViewer((s) => s.modelKey);
  const fitKey = useViewer((s) => s.fitKey);
  const colorMode = useViewer((s) => s.colorMode);
  const stackMode = useViewer((s) => s.stackMode);
  const spread = useViewer((s) => s.spread);
  const showWalls = useViewer((s) => s.showWalls);
  const showOpenings = useViewer((s) => s.showOpenings);
  const showGrid = useViewer((s) => s.showGrid);
  const hiddenLevels = useViewer((s) => s.hiddenLevels);
  const selected = useViewer((s) => s.selected);
  const hovered = useViewer((s) => s.hovered);
  const route = useViewer((s) => s.route);
  const theme = useViewer((s) => s.theme);
  const mainView = useViewer((s) => s.mainView);
  const select = useViewer((s) => s.select);
  const hover = useViewer((s) => s.hover);
  const setStackMode = useViewer((s) => s.setStackMode);
  const setSpread = useViewer((s) => s.setSpread);
  const setShowWalls = useViewer((s) => s.setShowWalls);
  const setShowOpenings = useViewer((s) => s.setShowOpenings);
  const setShowGrid = useViewer((s) => s.setShowGrid);
  const toggleLevelHidden = useViewer((s) => s.toggleLevelHidden);
  const showAllLevels = useViewer((s) => s.showAllLevels);

  const colors = useMemo(
    () => (model ? buildColors(model, colorMode) : null),
    [model, colorMode, modelKey],
  );
  const levels = useMemo(() => (model ? levelsWithRooms(model) : []), [model, modelKey]);

  // 初期化 (一度だけ)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch (err) {
      // GPU無効環境 (アクセラレーション停止など) ではコンテキストが作れない
      console.error("WebGL初期化に失敗:", err);
      setGlError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(tokenColor("--bg-canvas"));
    host.appendChild(renderer.domElement);
    // コンテキスト喪失時はthree標準の復帰 (contextrestored) を待つだけ。
    // 作り直しはしない — ここで再作成ループを作るとGPUプロセスごと落ちる
    const onContextLost = () => {
      console.warn("WebGLコンテキスト喪失 — 復帰を待ちます");
      setGlLost(true);
    };
    const onContextRestored = () => {
      console.info("WebGLコンテキスト復帰");
      // threeは復帰時に内部モジュールを作り直し clearColor が黒に戻る — 再適用する
      renderer.setClearColor(tokenColor("--bg-canvas"));
      setGlLost(false);
      worldRef.current?.invalidate();
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, tokenColor("--line"), 1.05); // ds:allow 白色光 (物理値)
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85); // ds:allow 白色光 (物理値)
    dir.position.set(30, 60, 40);
    scene.add(dir);
    const grid = new THREE.GridHelper(120, 120, tokenColor("--drawing-line-muted"), tokenColor("--border-1"));
    grid.visible = useViewer.getState().showGrid;
    grid.position.y = -0.02;
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
    camera.position.set(28, 24, 28);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    // オンデマンド描画: 変化 (操作・モデル・テーマ) があったフレームだけ描く。
    // dampingの残りがある間は自走し、収まったら止まる — アイドル時のGPU負荷はゼロ
    let raf = 0;
    let rendering = false;
    const frame = () => {
      let moving = false;
      try {
        moving = controls.update();
        renderer.render(scene, camera);
      } finally {
        // 例外でもフラグを固めない (以後のinvalidateが効かなくなるのを防ぐ)
        if (moving) raf = requestAnimationFrame(frame);
        else rendering = false;
      }
    };
    const invalidate = () => {
      if (rendering) return;
      rendering = true;
      raf = requestAnimationFrame(frame);
    };
    controls.addEventListener("change", invalidate);

    const world: NonNullable<typeof worldRef.current> = {
      renderer,
      scene,
      camera,
      controls,
      raycaster: new THREE.Raycaster(),
      grid,
      hemi,
      invalidate,
      built: null,
    };
    worldRef.current = world;
    setGlLost(false);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      invalidate();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      if (world.built) disposeGroup(world.built.group);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      renderer.dispose();
      // GLコンテキストを即時解放する (GCまかせだと再マウントの繰返しで
      // コンテキスト上限に達し、ChromeのGPUプロセスを巻き込みやすい)
      renderer.forceContextLoss();
      host.removeChild(renderer.domElement);
      worldRef.current = null;
    };
  }, [glRetry]);

  // 3Dタブへ戻ったとき・復帰したときに一度描く (以後は変化駆動)
  useEffect(() => {
    if (mainView === "3d" && !glLost) worldRef.current?.invalidate();
  }, [mainView, glLost, glRetry]);

  // テーマ切替 — 机・地面色・グリッドを新トークンで作り直す
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.renderer.setClearColor(tokenColor("--bg-canvas"));
    world.hemi.groundColor.set(tokenColor("--line"));
    world.scene.remove(world.grid);
    world.grid.geometry.dispose();
    (world.grid.material as THREE.Material).dispose();
    const grid = new THREE.GridHelper(120, 120, tokenColor("--drawing-line-muted"), tokenColor("--border-1"));
    grid.visible = useViewer.getState().showGrid;
    grid.position.y = -0.02;
    world.scene.add(grid);
    world.grid = grid;
    world.invalidate();
  }, [theme]);

  // Cartesian grid は関係モデルの原本ではなく検査補助。必要なときだけ表示する。
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.grid.visible = showGrid;
    world.invalidate();
  }, [showGrid]);

  // モデル / 表示設定の変化でシーンを組み直す
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    if (world.built) {
      world.scene.remove(world.built.group);
      disposeGroup(world.built.group);
      world.built = null;
    }
    if (!model || !colors) {
      world.invalidate();
      return;
    }
    const built = buildScene(model, {
      colors,
      stackMode,
      spread,
      showWalls,
      showOpenings,
      hiddenLevels,
    });
    world.scene.add(built.group);
    world.built = built;
    applyHighlights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, modelKey, colors, stackMode, spread, showWalls, showOpenings, hiddenLevels, theme, glRetry]);

  // カメラフィット (ファイル切替・モード切替のとき)
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, stackMode, spread, glRetry]);

  function fit() {
    const world = worldRef.current;
    if (!world?.built) return;
    const box = new THREE.Box3().setFromObject(world.built.group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.75 + 4;
    world.controls.target.copy(center);
    world.camera.position.set(center.x + radius, center.y + radius * 0.85, center.z + radius);
    world.camera.updateProjectionMatrix();
    world.invalidate();
  }

  function applyHighlights() {
    const world = worldRef.current;
    if (!world?.built) return;
    const onRoute = routePaths(route);
    for (const m of world.built.pickables) {
      const mat = m.material as THREE.MeshLambertMaterial;
      if (!mat.emissive) continue;
      const path = m.userData.path as string;
      if (path === selected) mat.emissive.set(selectColor());
      else if (onRoute.has(path)) mat.emissive.set(routeColor());
      else if (path === hovered) mat.emissive.set(tokenColor("--drawing-derived"));
      else mat.emissive.set(0x000000); // ds:allow 発光オフ (物理値)
      mat.emissiveIntensity = path === selected ? 0.5 : 0.35;
    }
    world.invalidate();
  }
  useEffect(applyHighlights, [selected, hovered, route, modelKey, stackMode, theme]);

  // ピッキング
  function pick(ev: React.PointerEvent): string | null {
    const world = worldRef.current;
    const host = hostRef.current;
    if (!world?.built || !host) return null;
    const rect = host.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    world.raycaster.setFromCamera(ndc, world.camera);
    const hits = world.raycaster.intersectObjects(world.built.pickables, false);
    return (hits[0]?.object.userData.path as string | undefined) ?? null;
  }

  const downPos = useRef<{ x: number; y: number } | null>(null);

  if (glError) {
    return (
      <div className="scene3d">
        <div className="scene3d-fallback panel">
          <strong>3D表示を初期化できませんでした</strong>
          <span>
            ブラウザでWebGLが利用できません。GPUプロセスが落ちた直後なら再試行で直ることがあります。
            直らない場合はChromeの再起動が必要です (chrome://gpu で状態確認・ハードウェア
            アクセラレーションが有効か確認)。平面・表・エディタはそのまま使えます。
          </span>
          <Button
            size="sm"
            onClick={() => {
              setGlError(false);
              setGlRetry((n) => n + 1);
            }}
          >
            再試行
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="scene3d">
      <div
        ref={hostRef}
        className="scene3d-canvas"
        onPointerMove={(ev) => {
          const path = pick(ev);
          hover(path);
          if (path && model) {
            setTooltip({ x: ev.clientX, y: ev.clientY, path });
          } else setTooltip(null);
        }}
        onPointerLeave={() => {
          hover(null);
          setTooltip(null);
        }}
        onPointerDown={(ev) => (downPos.current = { x: ev.clientX, y: ev.clientY })}
        onPointerUp={(ev) => {
          const d = downPos.current;
          downPos.current = null;
          if (d && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 5) select(pick(ev));
        }}
      />
      {glLost && (
        <div className="scene3d-fallback panel">
          <strong>3Dの描画コンテキストが失われました</strong>
          <span>ブラウザの復帰を待っています。戻らない場合は再試行してください。</span>
          <Button
            size="sm"
            onClick={() => {
              setGlLost(false);
              setGlRetry((n) => n + 1);
            }}
          >
            再試行
          </Button>
        </div>
      )}
      <div className="scene3d-controls">
        <Dropdown icon="mixer-horizontal" label="表示設定">
          <Switch size="sm" label="2.5D 重ね" checked={stackMode} onChange={(b: boolean) => setStackMode(b)} />
          <Checkbox label="グリッド" checked={showGrid} onChange={(b: boolean) => setShowGrid(b)} />
          {stackMode ? (
            <div className="spread-slider">
              <Slider
                min={1}
                max={5}
                step={0.5}
                value={spread}
                onChange={(n: number) => setSpread(n)}
                label="展開"
                showValue
                unit="×"
              />
            </div>
          ) : (
            <>
              <Checkbox label="壁" checked={showWalls} onChange={(b: boolean) => setShowWalls(b)} />
              <Checkbox
                label="開口"
                checked={showOpenings}
                onChange={(b: boolean) => setShowOpenings(b)}
                disabled={!showWalls}
              />
            </>
          )}
        </Dropdown>
        {levels.length > 1 && (
          <Dropdown icon="layers" label="レベル表示">
            {levels.map((l) => (
              <Checkbox
                key={l}
                label={l}
                checked={!hiddenLevels[l]}
                onChange={() => toggleLevelHidden(l)}
              />
            ))}
            {Object.keys(hiddenLevels).length > 0 && (
              <Button size="sm" variant="ghost" onClick={showAllLevels}>
                全表示
              </Button>
            )}
          </Dropdown>
        )}
        <ToolIcon icon="frame" label="フィット" variant="outline" onClick={fit} />
      </div>
      {colors && <Legend colors={colors} />}
      {tooltip && model && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {(() => {
            const s = model.spaces.get(tooltip.path);
            if (!s) return tooltip.path;
            const a = s.type === "void" ? "吹抜け" : `${areaM2(s)?.toFixed(2) ?? "–"}㎡`;
            return `${displayName(s)} ・ ${a}`;
          })()}
          <span className="tooltip-path">{tooltip.path}</span>
        </div>
      )}
    </div>
  );
}
