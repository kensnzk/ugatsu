// 三次元ビュー — 3D押し出し / 2.5Dレベル重ね (展開)
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { areaM2, displayName } from "../core/index.js";
import { buildColors, SELECT_COLOR, ROUTE_COLOR } from "../lib/colors.js";
import { levelsWithRooms, routePaths, useViewer } from "../state/store.js";
import { buildScene, disposeGroup, type BuiltScene } from "../three/buildScene.js";
import { Legend } from "./Legend.js";

const PAPER = 0xfaf8f4;

export function Scene3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    raycaster: THREE.Raycaster;
    built: BuiltScene | null;
  } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; path: string } | null>(null);

  const model = useViewer((s) => s.model);
  const modelKey = useViewer((s) => s.modelKey);
  const fitKey = useViewer((s) => s.fitKey);
  const colorMode = useViewer((s) => s.colorMode);
  const stackMode = useViewer((s) => s.stackMode);
  const spread = useViewer((s) => s.spread);
  const showWalls = useViewer((s) => s.showWalls);
  const showOpenings = useViewer((s) => s.showOpenings);
  const hiddenLevels = useViewer((s) => s.hiddenLevels);
  const selected = useViewer((s) => s.selected);
  const hovered = useViewer((s) => s.hovered);
  const route = useViewer((s) => s.route);
  const select = useViewer((s) => s.select);
  const hover = useViewer((s) => s.hover);
  const setStackMode = useViewer((s) => s.setStackMode);
  const setSpread = useViewer((s) => s.setSpread);
  const setShowWalls = useViewer((s) => s.setShowWalls);
  const setShowOpenings = useViewer((s) => s.setShowOpenings);
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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(PAPER);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ae9c, 1.05));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(30, 60, 40);
    scene.add(dir);
    const grid = new THREE.GridHelper(120, 120, 0xe0dacb, 0xeae4d6);
    grid.position.y = -0.02;
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
    camera.position.set(28, 24, 28);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    const world: NonNullable<typeof worldRef.current> = {
      renderer,
      scene,
      camera,
      controls,
      raycaster: new THREE.Raycaster(),
      built: null,
    };
    worldRef.current = world;

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (world.built) disposeGroup(world.built.group);
      renderer.dispose();
      host.removeChild(renderer.domElement);
      worldRef.current = null;
    };
  }, []);

  // モデル / 表示設定の変化でシーンを組み直す
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    if (world.built) {
      world.scene.remove(world.built.group);
      disposeGroup(world.built.group);
      world.built = null;
    }
    if (!model || !colors) return;
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
  }, [model, modelKey, colors, stackMode, spread, showWalls, showOpenings, hiddenLevels]);

  // カメラフィット (ファイル切替・モード切替のとき)
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, stackMode, spread]);

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
  }

  function applyHighlights() {
    const world = worldRef.current;
    if (!world?.built) return;
    const onRoute = routePaths(route);
    for (const m of world.built.pickables) {
      const mat = m.material as THREE.MeshLambertMaterial;
      if (!mat.emissive) continue;
      const path = m.userData.path as string;
      if (path === selected) mat.emissive.set(SELECT_COLOR);
      else if (onRoute.has(path)) mat.emissive.set(ROUTE_COLOR);
      else if (path === hovered) mat.emissive.set(0x5a5040);
      else mat.emissive.set(0x000000);
      mat.emissiveIntensity = path === selected ? 0.5 : 0.35;
    }
  }
  useEffect(applyHighlights, [selected, hovered, route, modelKey, stackMode]);

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
      <div className="scene3d-controls panel">
        <label className="toggle">
          <input
            type="checkbox"
            checked={stackMode}
            onChange={(e) => setStackMode(e.target.checked)}
          />
          2.5D 重ね
        </label>
        {stackMode ? (
          <label className="slider">
            展開 ×{spread.toFixed(1)}
            <input
              type="range"
              min={1}
              max={5}
              step={0.5}
              value={spread}
              onChange={(e) => setSpread(Number(e.target.value))}
            />
          </label>
        ) : (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showWalls}
                onChange={(e) => setShowWalls(e.target.checked)}
              />
              壁
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showOpenings}
                onChange={(e) => setShowOpenings(e.target.checked)}
                disabled={!showWalls}
              />
              開口
            </label>
          </>
        )}
        <button className="mini" onClick={fit}>
          フィット
        </button>
      </div>
      {levels.length > 1 && (
        <div className="scene3d-levels panel">
          {levels.map((l) => (
            <button
              key={l}
              className={`chip ${hiddenLevels[l] ? "chip-off" : ""}`}
              onClick={() => toggleLevelHidden(l)}
              title={hiddenLevels[l] ? `${l} を表示` : `${l} を隠す`}
            >
              {l}
            </button>
          ))}
          {Object.keys(hiddenLevels).length > 0 && (
            <button className="mini" onClick={showAllLevels}>
              全表示
            </button>
          )}
        </div>
      )}
      {colors && <Legend colors={colors} />}
      {tooltip && model && (
        <div className="tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 10 }}>
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
