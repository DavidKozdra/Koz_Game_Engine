import React, { useState, useCallback, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Viewport from './components/Viewport.jsx';
import ObjectList from './components/ObjectList.jsx';
import WorldTools from './components/WorldTools.jsx';
import Inspector from './components/Inspector.jsx';
import ScriptEditor from './components/ScriptEditor.jsx';
import SystemsTab from './components/SystemsTab.jsx';
import Timeline from './components/Timeline.jsx';
import ConsolePanel from './components/Console.jsx';
import { usePlayMode } from './components/PlayMode.jsx';
import KozLogo from './components/KozLogo.jsx';
import Modal from './components/Modal.jsx';
import { ensureProjectShape, normalizeCellTypeId, getBrushValue } from './state/projectModel.js';
import './editor.css';

// ---- Project helpers ----
function createDefaultProject(opts = {}) {
  const cols = opts.cols || 30;
  const rows = opts.rows || 20;
  const dc = opts.defaultCell !== undefined ? opts.defaultCell : null;
  const grid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) row.push(dc);
    grid.push(row);
  }
  return ensureProjectShape({
    schemaVersion: 1,
    meta: { name: opts.name || 'Untitled Project', version: '1.0.0', resolution: { width: 960, height: 540 }, engineVersion: '0.1.0' },
    world: { cols, rows, offsetX: 0, offsetY: 0, defaultCell: dc, grid, elements: [], meta: {} },
    objects: [],
    animations: [],
    scripts: [],
    assets: [],
    build: { profile: 'web-prod', pwa: false },
  });
}

function worldOffsets(world) {
  return {
    x: Number.isFinite(world && world.offsetX) ? world.offsetX : 0,
    y: Number.isFinite(world && world.offsetY) ? world.offsetY : 0,
  };
}

function worldFillValue(world) {
  return world && world.defaultCell !== undefined ? world.defaultCell : 'empty';
}

function normalizeWorldGrid(world) {
  if (!world) return;
  if (!Array.isArray(world.grid)) world.grid = [];
  if (!Number.isFinite(world.cols)) world.cols = (world.grid[0] && world.grid[0].length) || 0;
  if (!Number.isFinite(world.rows)) world.rows = world.grid.length;
  if (!Number.isFinite(world.offsetX)) world.offsetX = 0;
  if (!Number.isFinite(world.offsetY)) world.offsetY = 0;
}

function ensureWorldContains(world, cellX, cellY) {
  normalizeWorldGrid(world);
  const fill = worldFillValue(world);
  const width = Math.max(0, world.cols);
  const height = Math.max(0, world.rows);
  if (height === 0 || width === 0) {
    world.offsetX = cellX;
    world.offsetY = cellY;
    world.cols = 1;
    world.rows = 1;
    world.grid = [[fill]];
    return { lx: 0, ly: 0 };
  }

  if (cellX < world.offsetX) {
    const add = world.offsetX - cellX;
    world.grid = world.grid.map((row) => [...Array(add).fill(fill), ...row]);
    world.cols += add;
    world.offsetX = cellX;
  } else if (cellX >= world.offsetX + world.cols) {
    const add = cellX - (world.offsetX + world.cols) + 1;
    world.grid = world.grid.map((row) => [...row, ...Array(add).fill(fill)]);
    world.cols += add;
  }

  if (cellY < world.offsetY) {
    const add = world.offsetY - cellY;
    const rowTemplate = Array(world.cols).fill(fill);
    const topRows = Array.from({ length: add }, () => rowTemplate.slice());
    world.grid = [...topRows, ...world.grid];
    world.rows += add;
    world.offsetY = cellY;
  } else if (cellY >= world.offsetY + world.rows) {
    const add = cellY - (world.offsetY + world.rows) + 1;
    const rowTemplate = Array(world.cols).fill(fill);
    for (let i = 0; i < add; i += 1) world.grid.push(rowTemplate.slice());
    world.rows += add;
  }

  return { lx: cellX - world.offsetX, ly: cellY - world.offsetY };
}

function getWorldCell(world, cellX, cellY) {
  normalizeWorldGrid(world);
  const { x: ox, y: oy } = worldOffsets(world);
  const lx = cellX - ox;
  const ly = cellY - oy;
  if (lx < 0 || ly < 0 || lx >= world.cols || ly >= world.rows) return worldFillValue(world);
  return (world.grid[ly] && world.grid[ly][lx]) !== undefined ? world.grid[ly][lx] : worldFillValue(world);
}

let _idCounter = 0;
function genId(prefix) { _idCounter++; return prefix + '_' + Date.now().toString(36) + '_' + _idCounter; }

function createGameObject(name, x, y, opts = {}) {
  const type = opts.type || 'generic';
  if (type === 'camera') {
    return {
      id: genId('obj'),
      name: name || 'Camera',
      type,
      parentId: null,
      x,
      y,
      components: {
        Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
        Camera: {
          enabled: true,
          targetObjectId: null,
          speed: 8,
          offsetX: 0,
          offsetY: 0,
          deadZoneWidth: 180,
          deadZoneHeight: 120,
          lookAheadX: 0,
          lookAheadY: 0,
          visibleMargin: 40,
          followX: true,
          followY: true,
          clampToWorld: true,
          maxSpeed: 2000,
        },
        Render: { layerId: opts.layerId || 'obj-main', visible: false, zIndex: 0 },
        ScriptBindings: [],
      },
    };
  }
  const next = {
    id: genId('obj'), name: name || 'Object', type, x, y,
    parentId: null,
    components: {
      Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
      Sprite: { assetId: null, color: opts.color || '#4ade80', width: 32, height: 32 },
      Collider: { shape: 'rect', width: 32, height: 32 },
      Collision: { enabled: true, isTrigger: false },
      RigidBody: { enabled: false, weight: 1, friction: 0.4 },
      Render: { layerId: opts.layerId || 'obj-main', visible: true, zIndex: 0 },
      ScriptBindings: [],
      Animator: { clipId: null, autoplay: type === 'animator' },
    },
  };
  return next;
}

function instantiateFromPrefab(prefab, projectView, x, y) {
  const sourceById = (projectView && projectView.objects || []).find((o) => o.id === prefab.sourceObjectId) || null;
  const source = prefab && prefab.object ? prefab.object : sourceById;
  if (!source) return createGameObject(prefab && prefab.name ? prefab.name : 'Object', x, y);

  const obj = JSON.parse(JSON.stringify(source));
  obj.id = genId('obj');
  obj.name = (prefab && prefab.name) || obj.name || 'Object';
  obj.parentId = null;
  obj.x = x;
  obj.y = y;
  obj.components = obj.components || {};
  const t = obj.components.Transform || {};
  obj.components.Transform = {
    ...t,
    x,
    y,
    rotation: Number.isFinite(t.rotation) ? t.rotation : 0,
    scaleX: Number.isFinite(t.scaleX) ? t.scaleX : 1,
    scaleY: Number.isFinite(t.scaleY) ? t.scaleY : 1,
  };

  if (obj.type === 'camera' || obj.components.Camera) {
    obj.type = 'camera';
    obj.components.Camera = {
      enabled: (obj.components.Camera && obj.components.Camera.enabled) !== false,
      targetObjectId: (obj.components.Camera && obj.components.Camera.targetObjectId) || null,
      speed: (obj.components.Camera && Number.isFinite(obj.components.Camera.speed)) ? obj.components.Camera.speed : 8,
      offsetX: (obj.components.Camera && Number.isFinite(obj.components.Camera.offsetX)) ? obj.components.Camera.offsetX : 0,
      offsetY: (obj.components.Camera && Number.isFinite(obj.components.Camera.offsetY)) ? obj.components.Camera.offsetY : 0,
      deadZoneWidth: (obj.components.Camera && Number.isFinite(obj.components.Camera.deadZoneWidth)) ? obj.components.Camera.deadZoneWidth : 180,
      deadZoneHeight: (obj.components.Camera && Number.isFinite(obj.components.Camera.deadZoneHeight)) ? obj.components.Camera.deadZoneHeight : 120,
      lookAheadX: (obj.components.Camera && Number.isFinite(obj.components.Camera.lookAheadX)) ? obj.components.Camera.lookAheadX : 0,
      lookAheadY: (obj.components.Camera && Number.isFinite(obj.components.Camera.lookAheadY)) ? obj.components.Camera.lookAheadY : 0,
      visibleMargin: (obj.components.Camera && Number.isFinite(obj.components.Camera.visibleMargin)) ? obj.components.Camera.visibleMargin : 40,
      followX: (obj.components.Camera && obj.components.Camera.followX) !== false,
      followY: (obj.components.Camera && obj.components.Camera.followY) !== false,
      clampToWorld: (obj.components.Camera && obj.components.Camera.clampToWorld) !== false,
      maxSpeed: (obj.components.Camera && Number.isFinite(obj.components.Camera.maxSpeed)) ? obj.components.Camera.maxSpeed : 2000,
    };
    obj.components.Render = {
      layerId: (obj.components.Render && obj.components.Render.layerId) || 'obj-main',
      visible: false,
      zIndex: (obj.components.Render && Number.isFinite(obj.components.Render.zIndex)) ? obj.components.Render.zIndex : 0,
    };
    delete obj.components.Sprite;
    delete obj.components.Collider;
    delete obj.components.Collision;
    delete obj.components.RigidBody;
    delete obj.components.Animator;
  }

  return obj;
}

function buildExportHtml(project, projectJson, target) {
  const safeJson = projectJson
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${(project && project.meta && project.meta.name) || 'Koz Game'}</title>
</head>
<body style="margin:0;background:#0b1220;color:#e2e8f0;font-family:sans-serif;">
  <div style="padding:12px;border-bottom:1px solid #334155;">Export target: ${target || 'html-zip'}</div>
  <canvas id="game" width="${project?.meta?.resolution?.width || 960}" height="${project?.meta?.resolution?.height || 540}" style="display:block;margin:12px auto;background:#111827;"></canvas>
  <script>window.__KOZ_PROJECT__=${safeJson};</script>
  <script>
    const p = window.__KOZ_PROJECT__;
    const ctx = document.getElementById('game').getContext('2d');
    ctx.fillStyle = '#111827'; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.fillStyle = '#22c55e'; ctx.font = '16px sans-serif';
    ctx.fillText((p.meta && p.meta.name) || 'Koz Export', 16, 28);
    ctx.fillStyle = '#94a3b8'; ctx.font = '12px sans-serif';
    ctx.fillText('Project exported with target: ${(target || 'html-zip')}', 16, 50);
  </script>
</body>
</html>`;
}

function resolveActiveScene(project) {
  if (!project || !Array.isArray(project.scenes) || project.scenes.length === 0) return null;
  return project.scenes.find((scene) => scene.id === project.activeSceneId) || project.scenes[0];
}

function withActiveSceneView(project) {
  if (!project) return project;
  const active = resolveActiveScene(project);
  if (!active) return project;
  return {
    ...project,
    world: active.world || project.world,
    objects: active.objects || project.objects || [],
  };
}

const MAX_UNDO = 100;

function App() {
  // All hooks must be called unconditionally and in the same order
  const [project, setProject] = useState(null);
  const [showProjectSelector, setShowProjectSelector] = useState(true);
  const [projectFile, setProjectFile] = useState({ projectPath: null, folderPath: null, name: null });
  const [availableProjects, setAvailableProjects] = useState([]);
  const [projectsRoot, setProjectsRoot] = useState(null);
  const [newProjectName, setNewProjectName] = useState('Untitled Project');
  const [editorState, setEditorState] = useState({
    mode: 'EDIT', activeTool: 'brush', brushValue: 'solid',
    selectedObjectId: null, selectedObjectIds: [], selectedScriptId: null, camera: { x: 0, y: 0, zoom: 1 }, gridVisible: true,
  });
  const [bottomTab, setBottomTab] = useState('timeline');
  const [bottomHeight, setBottomHeight] = useState(240);
  const [logs, setLogs] = useState([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState([]);
  const [exportConfig, setExportConfig] = useState({
    target: 'html-zip',
    fileName: '',
    includeAssets: true,
    includeScripts: true,
    minify: true,
    pwaOfflineCache: true,
    electronSingleFile: false,
    tarGzip: true,
    desktopPlatform: 'auto',
    desktopFormat: 'portable',
  });
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const [mainTab, setMainTab] = useState('world');
  const inferredPlatform = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
    ? 'mac'
    : typeof navigator !== 'undefined' && /win/i.test(navigator.platform)
      ? 'win'
      : 'linux';
  const effectiveDesktopPlatform = exportConfig.desktopPlatform === 'auto' ? inferredPlatform : exportConfig.desktopPlatform;
  const desktopFormats = effectiveDesktopPlatform === 'win'
    ? ['portable', 'nsis', 'zip']
    : effectiveDesktopPlatform === 'mac'
      ? ['dmg', 'zip']
      : ['AppImage', 'deb', 'zip'];
  const projectView = withActiveSceneView(project);

  // ...existing callbacks and logic...

  const updateEditor = useCallback((patch) => {
    setEditorState(prev => ({ ...prev, ...patch }));
  }, []);

  const refreshProjects = useCallback(() => {
    const api = window.api;
    if (!api || typeof api.listProjects !== 'function') return;
    api.listProjects().then((result) => {
      if (!result || !result.ok) return;
      setProjectsRoot(result.root || null);
      setAvailableProjects(Array.isArray(result.projects) ? result.projects : []);
    });
  }, []);

  const mutateActiveScene = useCallback((prevProject, mutateFn) => {
    const base = ensureProjectShape(prevProject);
    const scenes = Array.isArray(base.scenes) && base.scenes.length > 0 ? base.scenes : [{
      id: 'scene_main',
      name: 'Main Scene',
      world: base.world,
      objects: base.objects || [],
    }];
    const active = resolveActiveScene(base) || scenes[0];
    const activeId = active.id;
    const world = JSON.parse(JSON.stringify(active.world || base.world));
    const objects = JSON.parse(JSON.stringify(active.objects || base.objects || []));
    const nextState = mutateFn({ world, objects }) || { world, objects };
    const nextScenes = scenes.map((scene) => (
      scene.id === activeId ? { ...scene, world: nextState.world, objects: nextState.objects } : scene
    ));
    return ensureProjectShape({
      ...base,
      scenes: nextScenes,
      activeSceneId: activeId,
      world: nextState.world,
      objects: nextState.objects,
    });
  }, []);

  // ---- Undo/redo ----
  const pushUndo = useCallback((prevProject) => {
    undoStackRef.current.push(JSON.stringify(prevProject));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    setProject(prev => {
      redoStackRef.current.push(JSON.stringify(prev));
      return JSON.parse(undoStackRef.current.pop());
    });
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    setProject(prev => {
      undoStackRef.current.push(JSON.stringify(prev));
      return JSON.parse(redoStackRef.current.pop());
    });
  }, []);

  // ---- Console ----
  const addLog = useCallback((log) => {
    setLogs(prev => [...prev.slice(-500), log]);
  }, []);

  // ---- Play mode ----
  const { canvasRef: playCanvasRef, isPlaying, start: startPlay, stop: stopPlay, execute } = usePlayMode(projectView, addLog);

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) { stopPlay(); updateEditor({ mode: 'EDIT' }); }
    else { startPlay(); updateEditor({ mode: 'PLAY' }); setMainTab('world'); setBottomTab('console'); }
  }, [isPlaying, startPlay, stopPlay, updateEditor]);

  // ---- World editing ----
  const handleCellPaint = useCallback((cx, cy, value) => {
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => {
        const { lx, ly } = ensureWorldContains(world, cx, cy);
        world.grid[ly][lx] = value || 'empty';
        return { world, objects };
      });
    });
  }, [pushUndo, mutateActiveScene]);

  const handleCellFill = useCallback((startX, startY, value) => {
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => {
        normalizeWorldGrid(world);
        world.grid = world.grid.map((r) => [...r]);
        const { x: ox, y: oy } = worldOffsets(world);
        const minX = ox;
        const minY = oy;
        const maxX = ox + world.cols - 1;
        const maxY = oy + world.rows - 1;
        if (startX < minX || startX > maxX || startY < minY || startY > maxY) {
          const { lx, ly } = ensureWorldContains(world, startX, startY);
          world.grid[ly][lx] = value;
          return { world, objects };
        }
      const old = normalizeCellTypeId(getWorldCell(world, startX, startY));
        if (old === value) return { world, objects };
      const stack = [[startX, startY]];
      const visited = new Set();
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = x + ',' + y;
        if (visited.has(key) || x < minX || x > maxX || y < minY || y > maxY) continue;
        if (normalizeCellTypeId(getWorldCell(world, x, y)) !== old) continue;
        visited.add(key);
        const lx = x - world.offsetX;
        const ly = y - world.offsetY;
        world.grid[ly][lx] = value;
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
        return { world, objects };
      });
    });
  }, [pushUndo, mutateActiveScene]);

  const handleResizeWorld = useCallback((nextCols, nextRows) => {
    setProject((prev) => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => {
        const cols = Math.max(1, parseInt(String(nextCols), 10) || 1);
        const rows = Math.max(1, parseInt(String(nextRows), 10) || 1);
        const fillValue = world.defaultCell !== undefined ? world.defaultCell : 'empty';
        const sourceOffsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
        const sourceOffsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
        const source = Array.isArray(world.grid) ? world.grid : [];
        const grid = [];
        for (let y = 0; y < rows; y += 1) {
          const srcRow = Array.isArray(source[y]) ? source[y] : [];
          const row = [];
          for (let x = 0; x < cols; x += 1) {
            row.push(srcRow[x] !== undefined ? srcRow[x] : fillValue);
          }
          grid.push(row);
        }
        return { world: { ...world, cols, rows, offsetX: sourceOffsetX, offsetY: sourceOffsetY, grid }, objects };
      });
    });
  }, [pushUndo, mutateActiveScene]);

  // ---- Object management ----
  const handleAddObject = useCallback((template) => {
    const cam = editorState.camera;
    const x = Math.floor(cam.x + 100);
    const y = Math.floor(cam.y + 100);
    let obj;

    if (template && template.kind === 'prefab' && template.prefab) {
      obj = instantiateFromPrefab(template.prefab, projectView, x, y);
    } else if (template && template.kind === 'class') {
      const baseType = template.baseType || 'generic';
      const name = template.name || (baseType === 'camera' ? 'Camera' : 'Object');
      obj = createGameObject(name, x, y, { type: baseType });
    } else {
      const cls = (projectView?.defaultClasses || [])[0];
      obj = createGameObject('Object', x, y, { type: (cls && cls.baseType) || 'generic' });
    }

    if (obj.type === 'camera') {
      const player = (projectView && projectView.objects || []).find((o) => o.type === 'player');
      if (player && obj.components && obj.components.Camera && !obj.components.Camera.targetObjectId) {
        obj.components.Camera.targetObjectId = player.id;
      }
    }

    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({ world, objects: [...objects, obj] }));
    });
    updateEditor({ selectedObjectId: obj.id, selectedObjectIds: [obj.id] });
  }, [editorState.camera, updateEditor, pushUndo, projectView, mutateActiveScene]);

  const handleAddCameraObject = useCallback(() => {
    handleAddObject({ kind: 'class', baseType: 'camera', name: 'Camera' });
  }, [handleAddObject]);

  const handleRemoveObject = useCallback((id) => {
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({
        world,
        objects: objects
          .filter((o) => o.id !== id)
          .map((o) => (o.parentId === id ? { ...o, parentId: null } : o)),
      }));
    });
    setEditorState((prev) => {
      const ids = (prev.selectedObjectIds || []).filter((sid) => sid !== id);
      const nextPrimary = prev.selectedObjectId === id ? (ids[ids.length - 1] || null) : prev.selectedObjectId;
      return { ...prev, selectedObjectIds: ids, selectedObjectId: nextPrimary };
    });
  }, [pushUndo, mutateActiveScene]);

  const handleSelectObject = useCallback((id, opts = {}) => {
    setEditorState((prev) => {
      const prevIds = Array.isArray(prev.selectedObjectIds) ? prev.selectedObjectIds : (prev.selectedObjectId ? [prev.selectedObjectId] : []);
      let ids = prevIds.slice();
      let primary = prev.selectedObjectId;

      if (Array.isArray(opts.ids)) {
        if (opts.add) {
          const set = new Set(ids);
          for (const sid of opts.ids) set.add(sid);
          ids = [...set];
          primary = opts.ids[opts.ids.length - 1] || primary;
        } else {
          ids = opts.ids.slice();
          primary = ids[ids.length - 1] || null;
        }
      } else if (opts.toggle && id) {
        if (ids.includes(id)) ids = ids.filter((sid) => sid !== id);
        else ids.push(id);
        primary = ids.includes(id) ? id : (ids[ids.length - 1] || null);
      } else if (id) {
        ids = [id];
        primary = id;
      } else {
        ids = [];
        primary = null;
      }

      return {
        ...prev,
        selectedObjectId: primary,
        selectedObjectIds: ids,
        activeTool: primary ? 'select' : prev.activeTool,
      };
    });
  }, [updateEditor, editorState.activeTool]);

  const handleUpdateObject = useCallback((id, patch) => {
    setProject(prev => mutateActiveScene(prev, ({
      world,
      objects,
    }) => ({ world, objects: objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) })));
  }, [mutateActiveScene]);

  const handleUpdateComponent = useCallback((objId, compName, compData) => {
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map(o => {
        if (o.id !== objId) return o;
        const updated = { ...o, components: { ...o.components, [compName]: compData } };
        if (compName === 'Transform') { updated.x = compData.x; updated.y = compData.y; }
        return updated;
      }),
    })));
  }, [mutateActiveScene]);

  const handleMoveObject = useCallback((id, x, y) => {
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map(o => {
        if (o.id !== id) return o;
        return { ...o, x, y, components: { ...o.components, Transform: { ...o.components.Transform, x, y } } };
      }),
    })));
  }, [mutateActiveScene]);

  const handleMoveObjects = useCallback((updates) => {
    if (!Array.isArray(updates) || updates.length === 0) return;
    const map = new Map(updates.map((u) => [u.id, u]));
    setProject((prev) => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map((o) => {
        const u = map.get(o.id);
        if (!u) return o;
        return {
          ...o,
          x: u.x,
          y: u.y,
          components: { ...o.components, Transform: { ...(o.components && o.components.Transform), x: u.x, y: u.y } },
        };
      }),
    })));
  }, [mutateActiveScene]);

  const handleMoveWorld = useCallback((dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    setProject((prev) => mutateActiveScene(prev, ({ world, objects }) => {
      const cellDx = Math.round(dx / 24);
      const cellDy = Math.round(dy / 24);
      if (cellDx === 0 && cellDy === 0) return { world, objects };
      const nextObjects = objects.map((obj) => {
        const t = (obj.components && obj.components.Transform) || {};
        const x = (Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0)) + (cellDx * 24);
        const y = (Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0)) + (cellDy * 24);
        return {
          ...obj,
          x,
          y,
          components: { ...obj.components, Transform: { ...t, x, y } },
        };
      });
      return {
        world: {
          ...world,
          offsetX: (Number.isFinite(world.offsetX) ? world.offsetX : 0) + cellDx,
          offsetY: (Number.isFinite(world.offsetY) ? world.offsetY : 0) + cellDy,
        },
        objects: nextObjects,
      };
    }));
  }, [mutateActiveScene]);

  const handleCreatePrefabFromObject = useCallback((objId) => {
    const source = (projectView && projectView.objects || []).find((o) => o.id === objId);
    if (!source) return;
    const nextPrefab = {
      id: `prefab_${Date.now().toString(36)}`,
      name: `${source.name || source.type || 'Object'} Prefab`,
      sourceObjectId: source.id,
      object: JSON.parse(JSON.stringify(source)),
    };
    setProject((prev) => ({ ...prev, prefabs: [...((prev && prev.prefabs) || []), nextPrefab] }));
  }, [projectView]);

  // ---- Scripts ----
  const handleUpdateScript = useCallback((id, patch) => {
    setProject(prev => ({ ...prev, scripts: prev.scripts.map(s => s.id === id ? { ...s, ...patch } : s) }));
  }, []);

  const handleAddScript = useCallback((name, language = 'javascript') => {
const templates = {
      javascript: `function onInit(self, engine) {
  // Called once when game starts
}

function onUpdate(self, engine, dt) {
  // Called every frame
  // Use engine.keyIsDown(keyCode) for input
}
`,
      ui: `// UI Screen using KozUIManager
// Registers a screen that shows/hides based on game state

function onInit(self, engine) {
  // Register screen with UIManager (auto-injected as global)
  if (typeof KozUIManager !== 'undefined') {
    KozUIManager.registerScreen('myScreen', {
      // validStates: ['RUNNING', 'PAUSED'], // Show in these states
      create: function() {
        const container = document.createElement('div');
        container.id = 'myScreen';
        container.style.cssText = 'position:absolute;top:20px;right:20px;padding:16px;background:rgba(0,0,0,0.8);color:#fff;border-radius:8px;font-family:sans-serif;';
        container.innerHTML = '<h3>My UI</h3><p>Game time: 0s</p><button id="myBtn">Click Me</button>';
        
        // Add click handler
        const btn = container.querySelector('#myBtn');
        if (btn) {
          btn.onclick = function() {
            console.log('Button clicked!');
          };
        }
        
        return container;
      },
      show: function() {
        // Called when screen becomes visible
        console.log('UI Screen shown');
      },
      hide: function() {
        // Called when screen hides
        console.log('UI Screen hidden');
      },
      update: function() {
        // Called every frame while visible
        const container = this.container;
        if (container) {
          const time = Math.floor(engine.elapsed || 0);
          const p = container.querySelector('p');
          if (p) p.textContent = 'Game time: ' + time + 's';
        }
      },
      validStates: ['RUNNING']
    });
  }
}

function onUpdate(self, engine, dt) {
  // Called every frame
  // KozUIManager.updateAll() is called automatically
}
`,
      typescript: `// TypeScript support coming soon
function onInit(self: any, engine: any): void {
  // Called once when game starts
}

function onUpdate(self: any, engine: any, dt: number): void {
  // Called every frame
}
`,
      lua: `-- Lua support coming soon
function onInit(self, engine)
  -- Called once when game starts
end

function onUpdate(self, engine, dt)
  -- Called every frame
end
`,
      python: `# Python support coming soon
def on_init(self, engine):
    # Called once when game starts
    pass

def on_update(self, engine, dt):
    # Called every frame
    pass
`,
    };
    const script = {
      id: genId('script'), name, language,
      source: templates[language] || templates.javascript,
    };
    setProject(prev => { pushUndo(prev); return { ...prev, scripts: [...prev.scripts, script] }; });
  }, [pushUndo]);

  const handleDeleteScript = useCallback((id) => {
    setProject(prev => { pushUndo(prev); return { ...prev, scripts: prev.scripts.filter(s => s.id !== id) }; });
  }, [pushUndo]);

  // ---- Animations ----
  const handleUpdateAnimation = useCallback((id, patch) => {
    setProject(prev => ({ ...prev, animations: prev.animations.map(a => a.id === id ? { ...a, ...patch } : a) }));
  }, []);

  const handleAddAnimation = useCallback((name) => {
    const clip = { id: genId('anim'), name, duration: 2.0, loop: true, tracks: [] };
    setProject(prev => { pushUndo(prev); return { ...prev, animations: [...prev.animations, clip] }; });
  }, [pushUndo]);

  const handleDeleteAnimation = useCallback((id) => {
    setProject(prev => { pushUndo(prev); return { ...prev, animations: prev.animations.filter(a => a.id !== id) }; });
  }, [pushUndo]);

  const handleAddTrack = useCallback((clipId, objectId, property) => {
    setProject(prev => ({
      ...prev,
      animations: prev.animations.map(a => {
        if (a.id !== clipId) return a;
        return { ...a, tracks: [...a.tracks, { targetObjectId: objectId, property, keyframes: [] }] };
      }),
    }));
  }, []);

  const handleAddKeyframe = useCallback((clipId, trackIdx, time, value) => {
    setProject(prev => ({
      ...prev,
      animations: prev.animations.map(a => {
        if (a.id !== clipId) return a;
        const tracks = a.tracks.map((t, i) => {
          if (i !== trackIdx) return t;
          const kfs = [...t.keyframes, { time: parseFloat(time.toFixed(2)), value, easing: 'linear' }];
          kfs.sort((a, b) => a.time - b.time);
          return { ...t, keyframes: kfs };
        });
        return { ...a, tracks };
      }),
    }));
  }, []);

  // ---- Camera ----
  const handleUpdateCamera = useCallback((cam) => updateEditor({ camera: cam }), [updateEditor]);
  const handleToggleGrid = useCallback(() => updateEditor({ gridVisible: !editorState.gridVisible }), [updateEditor, editorState.gridVisible]);
  const handleFrameScene = useCallback(() => {
    if (!projectView || !projectView.world) return;
    const world = projectView.world;
    const ox = Number.isFinite(world.offsetX) ? world.offsetX : 0;
    const oy = Number.isFinite(world.offsetY) ? world.offsetY : 0;
    const cols = Number.isFinite(world.cols) ? world.cols : ((world.grid && world.grid[0] && world.grid[0].length) || 1);
    const rows = Number.isFinite(world.rows) ? world.rows : ((world.grid && world.grid.length) || 1);
    const minX = ox * 24;
    const minY = oy * 24;
    const maxX = (ox + cols) * 24;
    const maxY = (oy + rows) * 24;
    let sceneMinX = minX;
    let sceneMinY = minY;
    let sceneMaxX = maxX;
    let sceneMaxY = maxY;
    for (const obj of (projectView.objects || [])) {
      const t = (obj.components && obj.components.Transform) || {};
      const s = (obj.components && obj.components.Sprite) || {};
      const x = Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0);
      const y = Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0);
      const w = Number.isFinite(s.width) ? s.width : 32;
      const h = Number.isFinite(s.height) ? s.height : 32;
      sceneMinX = Math.min(sceneMinX, x);
      sceneMinY = Math.min(sceneMinY, y);
      sceneMaxX = Math.max(sceneMaxX, x + w);
      sceneMaxY = Math.max(sceneMaxY, y + h);
    }
    updateEditor({
      camera: {
        ...editorState.camera,
        x: sceneMinX - 48,
        y: sceneMinY - 48,
        zoom: editorState.camera.zoom || 1,
      },
    });
  }, [projectView, updateEditor, editorState.camera]);

  useEffect(() => {
    if (!projectView || !projectView.world) return;
    const ox = Number.isFinite(projectView.world.offsetX) ? projectView.world.offsetX : 0;
    const oy = Number.isFinite(projectView.world.offsetY) ? projectView.world.offsetY : 0;
    if ((ox !== 0 || oy !== 0) && editorState.camera.x === 0 && editorState.camera.y === 0) {
      handleFrameScene();
    }
  }, [projectView, editorState.camera.x, editorState.camera.y, handleFrameScene]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);


  // ---- File ops ----
  const openProjectFromContent = useCallback((content, fileInfo = {}) => {
    try {
      const data = JSON.parse(content);
      if (data.schemaVersion !== 1) {
        alert('Unknown schema version');
        return;
      }
      const next = ensureProjectShape(data);
      setProject(next);
      setProjectFile({
        projectPath: fileInfo.projectPath || null,
        folderPath: fileInfo.folderPath || null,
        name: (next.meta && next.meta.name) || fileInfo.name || null,
      });
      setShowProjectSelector(false);
      undoStackRef.current = [];
      redoStackRef.current = [];
    } catch (err) {
      alert('Invalid project file: ' + err.message);
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!project) return;
    const normalized = ensureProjectShape(project);
    const json = JSON.stringify(normalized, null, 2);
    const api = window.api;
    if (api && typeof api.saveProject === 'function') {
      api.saveProject({
        projectPath: projectFile.projectPath,
        name: normalized.meta && normalized.meta.name ? normalized.meta.name : newProjectName,
        projectJson: json,
      }).then((result) => {
        if (!result || !result.ok) {
          if (!(result && result.canceled)) alert(`Save failed: ${(result && result.error) || 'Unknown error'}`);
          return;
        }
        setProjectFile({
          projectPath: result.projectPath || null,
          folderPath: result.folderPath || null,
          name: result.name || (normalized.meta && normalized.meta.name) || null,
        });
        refreshProjects();
      });
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (normalized.meta.name || 'project') + '.json'; a.click();
    URL.revokeObjectURL(url);
  }, [project, projectFile.projectPath, newProjectName, refreshProjects]);

  const handleSaveAs = useCallback(() => {
    if (!project) return;
    const normalized = ensureProjectShape(project);
    const json = JSON.stringify(normalized, null, 2);
    const api = window.api;
    if (api && typeof api.saveProjectAs === 'function') {
      api.saveProjectAs({
        name: normalized.meta && normalized.meta.name ? normalized.meta.name : newProjectName,
        projectJson: json,
      }).then((result) => {
        if (!result || !result.ok) {
          if (!(result && result.canceled)) alert(`Save As failed: ${(result && result.error) || 'Unknown error'}`);
          return;
        }
        setProjectFile({
          projectPath: result.projectPath || null,
          folderPath: result.folderPath || null,
          name: result.name || (normalized.meta && normalized.meta.name) || null,
        });
        refreshProjects();
      });
      return;
    }
    handleSave();
  }, [project, newProjectName, handleSave, refreshProjects]);

  const handleLoad = useCallback(() => {
    refreshProjects();
    setShowProjectSelector(true);
  }, [refreshProjects]);

  const handleLoadProjectFromList = useCallback((item) => {
    const api = window.api;
    if (!item) return;
    if (api && typeof api.loadProject === 'function') {
      api.loadProject(item.projectPath).then((result) => {
        if (!result || !result.ok) return;
        openProjectFromContent(result.content, { projectPath: result.projectPath, folderPath: result.folderPath, name: item.name });
      });
      return;
    }
  }, [openProjectFromContent]);

  const handleNew = useCallback(() => {
    const name = (newProjectName || 'Untitled Project').trim() || 'Untitled Project';
    const nextProject = createDefaultProject({ name });
    setProject(nextProject);
    setShowProjectSelector(false);
    setProjectFile({ projectPath: null, folderPath: null, name });
    updateEditor({ selectedObjectId: null, selectedObjectIds: [], selectedScriptId: null, camera: { x: 0, y: 0, zoom: 1 }, brushValue: 'solid' });
    undoStackRef.current = [];
    redoStackRef.current = [];
    const api = window.api;
    if (api && typeof api.saveProject === 'function') {
      api.saveProject({
        projectPath: null,
        name,
        projectJson: JSON.stringify(nextProject, null, 2),
      }).then((result) => {
        if (!result || !result.ok) return;
        setProjectFile({
          projectPath: result.projectPath || null,
          folderPath: result.folderPath || null,
          name: result.name || name,
        });
        refreshProjects();
      });
    }
  }, [updateEditor, newProjectName, refreshProjects]);

  const handlePatchProject = useCallback((patch) => {
    setProject(prev => {
      const merged = ensureProjectShape({ ...prev, ...patch });
      const active = resolveActiveScene(merged);
      if (!active) return merged;
      return ensureProjectShape({ ...merged, world: active.world, objects: active.objects, activeSceneId: active.id });
    });
  }, []);

  const openExportModal = useCallback(() => {
    if (!project) return;
    const normalized = ensureProjectShape(project);
    const defaultTarget = (normalized.build && normalized.build.target) || 'html-zip';
    setExportConfig(prev => ({
      ...prev,
      target: defaultTarget,
      fileName: normalized.meta && normalized.meta.name ? normalized.meta.name : 'game',
    }));
    setExportProgress([]);
    setShowExportModal(true);
  }, [project]);

  const handleExport = useCallback(() => {
    if (isExporting) return;
    const normalized = ensureProjectShape(project);
    const target = exportConfig.target || 'html-zip';
    const projectForExport = ensureProjectShape({
      ...normalized,
      build: { ...normalized.build, target },
      exportOptions: {
        includeAssets: exportConfig.includeAssets,
        includeScripts: exportConfig.includeScripts,
        minify: exportConfig.minify,
        pwaOfflineCache: exportConfig.pwaOfflineCache,
        electronSingleFile: exportConfig.electronSingleFile,
        tarGzip: exportConfig.tarGzip,
        desktopPlatform: exportConfig.desktopPlatform,
        desktopFormat: exportConfig.desktopFormat,
      },
    });
    setProject(projectForExport);

    const json = JSON.stringify(projectForExport);
    const html = buildExportHtml(projectForExport, json, target);
    const baseName = (exportConfig.fileName || projectForExport.meta.name || 'game').trim();

    const electronApi = window.api && typeof window.api.exportBuild === 'function' ? window.api : null;
    if (electronApi) {
      setIsExporting(true);
      setExportProgress((prev) => [...prev, `Starting export for ${target}...`]);
      electronApi.exportBuild({
        target,
        fileName: baseName,
        html,
        projectJson: json,
        options: {
          includeAssets: exportConfig.includeAssets,
          includeScripts: exportConfig.includeScripts,
          minify: exportConfig.minify,
          pwaOfflineCache: exportConfig.pwaOfflineCache,
          electronSingleFile: exportConfig.electronSingleFile,
          tarGzip: exportConfig.tarGzip,
          desktopPlatform: exportConfig.desktopPlatform,
          desktopFormat: exportConfig.desktopFormat,
        },
      }).then((result) => {
        setIsExporting(false);
        if (result && result.ok) {
          setShowExportModal(false);
          addLog({ type: 'info', message: `Exported build target: ${target}`, time: new Date().toLocaleTimeString() });
          if (result.warning) {
            addLog({ type: 'warn', message: result.warning, time: new Date().toLocaleTimeString() });
          }
        } else if (result && result.canceled) {
          addLog({ type: 'warn', message: 'Export canceled', time: new Date().toLocaleTimeString() });
        } else {
          addLog({ type: 'error', message: `Export failed: ${(result && result.error) || 'Unknown error'}`, time: new Date().toLocaleTimeString() });
        }
      });
      return;
    }

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = baseName + '.html'; a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
    addLog({ type: 'info', message: `Exported fallback HTML: ${target}`, time: new Date().toLocaleTimeString() });
  }, [project, addLog, exportConfig, isExporting]);

  // ---- Bottom panel resize ----
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomHeight;
    function onMove(e) { setBottomHeight(Math.max(100, Math.min(600, startH - (e.clientY - startY)))); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [bottomHeight]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.closest('.cm-editor')) return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handleRedo(); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); handleSaveAs(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
      if (e.key === 'F5') { e.preventDefault(); handlePlayToggle(); }
      if (!isPlaying) {
        if (e.key === 'b') updateEditor({ activeTool: 'brush' });
        if (e.key === 'f') updateEditor({ activeTool: 'fill' });
        if (e.key === 'e') updateEditor({ activeTool: 'erase' });
        if (e.key === 'v') updateEditor({ activeTool: 'select' });
        if (e.key === 'g') updateEditor({ activeTool: 'worldMove' });
        const camStep = e.shiftKey ? 48 : 24;
        const isPan = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'].includes(e.key);
        if (isPan && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const cam = editorState.camera;
          if (e.key === 'ArrowLeft' || e.key === 'a') updateEditor({ camera: { ...cam, x: cam.x - camStep } });
          if (e.key === 'ArrowRight' || e.key === 'd') updateEditor({ camera: { ...cam, x: cam.x + camStep } });
          if (e.key === 'ArrowUp' || e.key === 'w') updateEditor({ camera: { ...cam, y: cam.y - camStep } });
          if (e.key === 'ArrowDown' || e.key === 's') updateEditor({ camera: { ...cam, y: cam.y + camStep } });
        }
        if (e.key === 'Delete') {
          const ids = Array.isArray(editorState.selectedObjectIds) && editorState.selectedObjectIds.length > 0
            ? editorState.selectedObjectIds
            : (editorState.selectedObjectId ? [editorState.selectedObjectId] : []);
          if (ids.length === 1) handleRemoveObject(ids[0]);
          if (ids.length > 1) {
            setProject((prev) => {
              pushUndo(prev);
              return mutateActiveScene(prev, ({ world, objects }) => ({
                world,
                objects: objects
                  .filter((o) => !ids.includes(o.id))
                  .map((o) => (ids.includes(o.parentId) ? { ...o, parentId: null } : o)),
              }));
            });
            updateEditor({ selectedObjectId: null, selectedObjectIds: [] });
          }
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleUndo, handleRedo, handleSave, handleSaveAs, handlePlayToggle, updateEditor, editorState.camera, editorState.selectedObjectId, editorState.selectedObjectIds, handleRemoveObject, isPlaying, pushUndo, mutateActiveScene]);

  useEffect(() => {
    if (!window.api || typeof window.api.onMenuEvent !== 'function') return;
    const unbind = window.api.onMenuEvent((eventName) => {
      if (eventName === 'menu-save') handleSave();
      if (eventName === 'menu-save-as') handleSaveAs();
      if (eventName === 'menu-load') handleLoad();
      if (eventName === 'menu-export') openExportModal();
    });
    return () => { if (typeof unbind === 'function') unbind(); };
  }, [handleSave, handleSaveAs, handleLoad, openExportModal]);

  useEffect(() => {
    if (!window.api || typeof window.api.onExportProgress !== 'function') return;
    const unbind = window.api.onExportProgress((entry) => {
      if (!entry || !entry.message) return;
      setExportProgress((prev) => [...prev.slice(-199), entry.message]);
    });
    return () => { if (typeof unbind === 'function') unbind(); };
  }, []);

  useEffect(() => {
    if (exportConfig.target !== 'electron-exe') return;
    if (desktopFormats.includes(exportConfig.desktopFormat)) return;
    setExportConfig((prev) => ({ ...prev, desktopFormat: desktopFormats[0] || 'portable' }));
  }, [exportConfig.target, exportConfig.desktopFormat, desktopFormats]);

  useEffect(() => {
    const theme = (project && project.editorTheme) || 'slate';
    document.documentElement.setAttribute('data-editor-theme', theme);
  }, [project]);

  // Render project selector modal if no project loaded
  return (
    <>
      {(showProjectSelector || !project) && (
        <Modal open={true} title={null} onClose={() => { if (project) setShowProjectSelector(false); }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, minWidth: 360, maxHeight: '72vh' }}>
            <KozLogo size={80} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <button className="btn btn-lg" style={{ width: '100%' }} onClick={handleNew}>New Project</button>
              <button className="btn btn-lg" style={{ width: '100%' }} onClick={handleLoad}>Load Project</button>
              {!!project && (
                <button className="btn btn-lg" style={{ width: '100%' }} onClick={() => setShowProjectSelector(false)}>Cancel</button>
              )}
              <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                Save uses {projectsRoot || 'the current projects folder'} and does not open the file system.
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: '#0b1220', maxHeight: '32vh', overflow: 'auto' }}>
                {(availableProjects || []).length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 10 }}>No projects found yet.</div>
                )}
                {(availableProjects || []).map((item) => (
                  <button
                    key={item.projectPath}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleLoadProjectFromList(item)}
                    style={{ width: '100%', justifyContent: 'space-between', border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, background: 'transparent' }}
                  >
                    <span style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{new Date(item.updatedAt).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {!(showProjectSelector || !project) && (
        // ...existing code for the editor layout...
        <div className="editor-layout">
          <Toolbar project={projectView} editorState={editorState} isPlaying={isPlaying}
            onToolChange={(tool) => updateEditor({ activeTool: tool })}
            onBrushChange={(val) => updateEditor({ brushValue: getBrushValue({ brushValue: val }) })}
            onUndo={handleUndo} onRedo={handleRedo}
            onNewProject={handleNew} onSaveProject={handleSave} onSaveAsProject={handleSaveAs} onLoadProject={handleLoad}
            onExport={openExportModal} onPlayToggle={handlePlayToggle}
            undoCount={undoStackRef.current.length} redoCount={redoStackRef.current.length} />

          <div className="editor-left">
            <WorldTools
              project={projectView}
              editorState={editorState}
              onUpdateCamera={handleUpdateCamera}
              onToggleGrid={handleToggleGrid}
              onResizeWorld={handleResizeWorld}
              onResetView={handleFrameScene}
            />
            <ObjectList
              project={projectView}
              editorState={editorState}
              onSelectObject={handleSelectObject}
              onAddObject={handleAddObject}
              onAddCameraObject={handleAddCameraObject}
              onRemoveObject={handleRemoveObject}
            />
          </div>

          <div className="editor-center">
            <div className="main-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#181c24' }}>
              {['world', 'scripts', 'assets', 'scenes', 'settings'].map(tab => (
                <button
                  key={tab}
                  className={`main-tab ${mainTab === tab ? 'active' : ''}`}
                  style={{
                    padding: '8px 20px',
                    border: 'none',
                    background: mainTab === tab ? '#23283a' : 'transparent',
                    color: mainTab === tab ? '#fff' : '#aaa',
                    fontWeight: mainTab === tab ? 600 : 400,
                    cursor: 'pointer',
                    outline: 'none',
                    borderBottom: mainTab === tab ? '2px solid #4ade80' : '2px solid transparent',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onClick={() => setMainTab(tab)}
                >
                  {tab === 'world'
                    ? 'World / Game'
                    : tab === 'scripts'
                      ? `Scripts (${projectView && Array.isArray(projectView.scripts) ? projectView.scripts.length : 0})`
                      : tab === 'assets'
                        ? 'Assets'
                        : tab === 'scenes'
                          ? `Scenes (${project && Array.isArray(project.scenes) ? project.scenes.length : 0})`
                          : 'Settings'}
                </button>
              ))}
            </div>

            {mainTab === 'world' && (
              <>
                <div className="editor-viewport">
                  {isPlaying ? (
                    <canvas ref={playCanvasRef} width={projectView.meta.resolution.width} height={projectView.meta.resolution.height}
                      style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', margin: '0 auto', background: '#0b1220' }} tabIndex={0} />
                  ) : (
                    <Viewport project={projectView} editorState={editorState}
                      onCellPaint={handleCellPaint} onCellFill={handleCellFill} onSelectObject={handleSelectObject}
                      onPlaceObject={(x, y) => {
                        const cls = (projectView?.defaultClasses || [])[0];
                        const obj = createGameObject('Object', x, y, { type: (cls && cls.baseType) || 'generic' });
                        setProject(prev => {
                          pushUndo(prev);
                          return mutateActiveScene(prev, ({ world, objects }) => ({ world, objects: [...objects, obj] }));
                        });
                        updateEditor({ selectedObjectId: obj.id, selectedObjectIds: [obj.id] });
                      }}
                      onMoveObject={handleMoveObject}
                      onMoveObjects={handleMoveObjects}
                      onMoveWorld={handleMoveWorld}
                      onSelectObjects={(ids, add) => handleSelectObject(null, { ids, add })}
                      onUpdateCamera={handleUpdateCamera} />
                  )}
                </div>
                <div className="resize-handle" onMouseDown={handleResizeStart} />
                <div className="editor-bottom" style={{ height: bottomHeight }}>
                  <div className="bottom-tabs">
                    {['timeline', 'console'].map(tab => (
                      <button key={tab} className={`bottom-tab ${bottomTab === tab ? 'active' : ''}`} onClick={() => setBottomTab(tab)}>
                        {tab === 'timeline'
                          ? `Timeline (${projectView && Array.isArray(projectView.animations) ? projectView.animations.length : 0})`
                          : `Console (${logs.length})`}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    {bottomTab === 'timeline' && (
                      <Timeline
                        project={projectView}
                        onUpdateAnimation={handleUpdateAnimation}
                        onAddAnimation={handleAddAnimation}
                        onDeleteAnimation={handleDeleteAnimation}
                        onAddTrack={handleAddTrack}
                        onAddKeyframe={handleAddKeyframe}
                      />
                    )}
                    {bottomTab === 'console' && (
                      <ConsolePanel
                        logs={logs}
                        onClear={() => setLogs([])}
                        onCommand={(cmd) => execute && execute(cmd)}
                        isRunning={isPlaying}
                        onStop={stopPlay}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
            {mainTab === 'scripts' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <ScriptEditor
                  project={projectView}
                  onUpdateScript={handleUpdateScript}
                  onAddScript={handleAddScript}
                  onDeleteScript={handleDeleteScript}
                  selectedId={editorState.selectedScriptId}
                  setSelectedId={id => setEditorState(prev => ({ ...prev, selectedScriptId: id }))}
                  showFileList={true}
                />
              </div>
            )}
            {mainTab === 'assets' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SystemsTab
                  mode="assets"
                  project={project}
                  selectedObjectId={editorState.selectedObjectId}
                  onPatchProject={handlePatchProject}
                  onSelectObject={handleSelectObject}
                />
              </div>
            )}
            {mainTab === 'scenes' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SystemsTab
                  mode="scenes"
                  project={project}
                  selectedObjectId={editorState.selectedObjectId}
                  onPatchProject={handlePatchProject}
                  onSelectObject={handleSelectObject}
                />
              </div>
            )}
            {mainTab === 'settings' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SystemsTab
                  mode="settings"
                  project={project}
                  selectedObjectId={editorState.selectedObjectId}
                  onPatchProject={handlePatchProject}
                  onSelectObject={handleSelectObject}
                />
              </div>
            )}
          </div>
          <div className="editor-right">
            <Inspector
              project={projectView}
              editorState={editorState}
              onUpdateObject={handleUpdateObject}
              onUpdateComponent={handleUpdateComponent}
              onCreatePrefabFromObject={handleCreatePrefabFromObject}
            />
          </div>
        </div>
      )}
      <Modal open={showExportModal} title="Export Project" onClose={() => setShowExportModal(false)}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="field">
            <label>Target</label>
            <select value={exportConfig.target} onChange={(e) => setExportConfig(prev => ({ ...prev, target: e.target.value }))}>
              <option value="electron-exe">Electron based EXE</option>
              <option value="pwa">PWA</option>
              <option value="html-zip">HTML/ZIP</option>
              <option value="tarball">Tarball</option>
            </select>
          </div>
          <div className="field">
            <label>Filename</label>
            <input
              value={exportConfig.fileName}
              onChange={(e) => setExportConfig(prev => ({ ...prev, fileName: e.target.value }))}
              placeholder="Build file name"
            />
          </div>
          <div className="field">
            <label>Assets</label>
            <input type="checkbox" checked={exportConfig.includeAssets} onChange={(e) => setExportConfig(prev => ({ ...prev, includeAssets: e.target.checked }))} />
            <label>Scripts</label>
            <input type="checkbox" checked={exportConfig.includeScripts} onChange={(e) => setExportConfig(prev => ({ ...prev, includeScripts: e.target.checked }))} />
            <label>Minify</label>
            <input type="checkbox" checked={exportConfig.minify} onChange={(e) => setExportConfig(prev => ({ ...prev, minify: e.target.checked }))} />
          </div>
          {exportConfig.target === 'pwa' && (
            <div className="field">
              <label>Offline Cache</label>
              <input type="checkbox" checked={exportConfig.pwaOfflineCache} onChange={(e) => setExportConfig(prev => ({ ...prev, pwaOfflineCache: e.target.checked }))} />
            </div>
          )}
          {exportConfig.target === 'electron-exe' && (
            <>
              <div className="field">
                <label>Platform</label>
                <select value={exportConfig.desktopPlatform} onChange={(e) => setExportConfig(prev => ({ ...prev, desktopPlatform: e.target.value }))}>
                  <option value="auto">Auto (current OS)</option>
                  <option value="win">Windows</option>
                  <option value="linux">Linux</option>
                  <option value="mac">macOS</option>
                </select>
              </div>
              <div className="field">
                <label>Format</label>
                <select value={exportConfig.desktopFormat} onChange={(e) => setExportConfig(prev => ({ ...prev, desktopFormat: e.target.value }))}>
                  {desktopFormats.map((fmt) => (
                    <option key={`desktop-fmt-${fmt}`} value={fmt}>{fmt}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {exportConfig.target === 'tarball' && (
            <div className="field">
              <label>gzip</label>
              <input type="checkbox" checked={exportConfig.tarGzip} onChange={(e) => setExportConfig(prev => ({ ...prev, tarGzip: e.target.checked }))} />
            </div>
          )}
          {exportProgress.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 4, padding: 6, background: '#0b1220', maxHeight: 120, overflow: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
              {exportProgress.map((line, i) => (
                <div key={`exp-line-${i}`} style={{ color: '#94a3b8' }}>{line}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button className="btn btn-sm" onClick={() => setShowExportModal(false)} disabled={isExporting}>Cancel</button>
            <button className="btn btn-sm btn-play" onClick={handleExport} disabled={isExporting}>{isExporting ? 'Exporting...' : 'Export'}</button>
          </div>
        </div>
      </Modal>
            </>
          );
}
export default App;
