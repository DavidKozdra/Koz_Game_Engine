import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import Icon from './components/Icon.jsx';
import { ensureProjectShape, applyProjectPatch, normalizeCellTypeId, getBrushValue } from './state/projectModel.js';
import { buildExportHtml } from './lib/exportHtml.js';
import template2dPlatformer from '../../../projects/template-2d-platformer/project.json';
import template2dClicker from '../../../projects/template-2d-clicker/project.json';
import template3dFpsShell from '../../../projects/template-3d-fps-shell/project.json';
import './editor.css';

// ---- Project helpers ----
const PROJECT_TEMPLATES = [
  {
    id: 'blank',
    label: 'Blank Project',
    badge: 'Core',
    description: 'Single starter scene with the default editor setup.',
    note: 'Starts with a small test platform and player so Play mode is immediately visible.',
  },
  {
    id: 'platformer',
    label: '2D Platformer',
    badge: '2D',
    description: 'Main menu plus a playable side-view test level.',
    note: 'Movement, HUD, and a second scene are already wired in.',
  },
  {
    id: 'clicker',
    label: '2D Clicker',
    badge: '2D',
    description: 'Main menu plus a mouse-driven target arena.',
    note: 'Good for testing UI, scripts, and pointer input together.',
  },
  {
    id: 'fps-shell',
    label: '3D FPS Template',
    badge: '3D',
    description: '2D main menu plus a WebGL first-person prototype lab.',
    note: 'This template is the mixed 2D/3D export test case.',
  },
];

const PROJECT_TEMPLATE_SOURCES = {
  platformer: template2dPlatformer,
  clicker: template2dClicker,
  'fps-shell': template3dFpsShell,
};

function createSceneCameraObject(world, options = {}) {
  const cols = Number.isFinite(world && world.cols) ? world.cols : 30;
  const rows = Number.isFinite(world && world.rows) ? world.rows : 20;
  const offsetX = Number.isFinite(world && world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world && world.offsetY) ? world.offsetY : 0;
  const centerX = Math.round((offsetX * 24) + (cols * 12));
  const centerY = Math.round((offsetY * 24) + (rows * 12));
  const id = options.id || 'obj_main_camera';
  return {
    id,
    name: options.name || 'Main Camera',
    type: 'camera',
    parentId: null,
    x: centerX,
    y: centerY,
    components: {
      Transform: { x: centerX, y: centerY, rotation: 0, scaleX: 1, scaleY: 1 },
      Camera: {
        enabled: true,
        targetObjectId: options.targetObjectId || null,
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
      Render: { layerId: 'obj-main', visible: false, zIndex: 0 },
      ScriptBindings: [],
    },
  };
}

function setStarterWorldCell(world, cellX, cellY, value) {
  if (!world || !Array.isArray(world.grid)) return;
  const offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
  const lx = cellX - offsetX;
  const ly = cellY - offsetY;
  if (ly < 0 || lx < 0 || ly >= world.grid.length) return;
  if (!Array.isArray(world.grid[ly]) || lx >= world.grid[ly].length) return;
  world.grid[ly][lx] = value;
}

function createBlankStarterWorld(world) {
  const next = JSON.parse(JSON.stringify(world || {}));
  const cols = Number.isFinite(next.cols) ? next.cols : 30;
  const rows = Number.isFinite(next.rows) ? next.rows : 20;
  const offsetX = Number.isFinite(next.offsetX) ? next.offsetX : 0;
  const offsetY = Number.isFinite(next.offsetY) ? next.offsetY : 0;
  const centerCellX = offsetX + Math.floor(cols / 2);
  const floorLocalY = Math.min(rows - 1, Math.max(1, rows - 4));
  const floorCellY = offsetY + floorLocalY;

  for (let cellX = centerCellX - 6; cellX <= centerCellX + 6; cellX += 1) {
    setStarterWorldCell(next, cellX, floorCellY, 'solid');
  }
  for (let cellX = centerCellX - 10; cellX <= centerCellX - 6; cellX += 1) {
    setStarterWorldCell(next, cellX, floorCellY - 3, 'solid');
  }
  for (let cellX = centerCellX + 5; cellX <= centerCellX + 9; cellX += 1) {
    setStarterWorldCell(next, cellX, floorCellY - 5, 'solid');
  }

  return next;
}

function createBlankStarterPlayer(world) {
  const cols = Number.isFinite(world && world.cols) ? world.cols : 30;
  const rows = Number.isFinite(world && world.rows) ? world.rows : 20;
  const offsetX = Number.isFinite(world && world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world && world.offsetY) ? world.offsetY : 0;
  const centerCellX = offsetX + Math.floor(cols / 2);
  const floorLocalY = Math.min(rows - 1, Math.max(1, rows - 4));
  const floorCellY = offsetY + floorLocalY;
  const player = createGameObject('Player', (centerCellX * 24) - 14, (floorCellY * 24) - 36, {
    type: 'player',
    color: '#f59e0b',
  });
  if (player.components && player.components.Sprite) {
    player.components.Sprite.width = 28;
    player.components.Sprite.height = 36;
  }
  if (player.components && player.components.Collider) {
    player.components.Collider.width = 28;
    player.components.Collider.height = 36;
  }
  return player;
}

function createDefaultProject(opts = {}) {
  const cols = opts.cols || 30;
  const rows = opts.rows || 20;
  const offsetX = opts.offsetX !== undefined ? opts.offsetX : -Math.floor(cols / 2);
  const offsetY = opts.offsetY !== undefined ? opts.offsetY : -Math.floor(rows / 2);
  const dc = opts.defaultCell !== undefined ? opts.defaultCell : null;
  const grid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) row.push(dc);
    grid.push(row);
  }
  const starterWorld = createBlankStarterWorld({ cols, rows, offsetX, offsetY, defaultCell: dc, grid, elements: [], meta: {} });
  return ensureProjectShape({
    schemaVersion: 1,
    meta: { name: opts.name || 'Untitled Project', version: '1.0.0', resolution: { width: 960, height: 540 }, engineVersion: '0.1.0' },
    world: starterWorld,
    objects: [createSceneCameraObject(starterWorld), createBlankStarterPlayer(starterWorld)],
    animations: [],
    scripts: [],
    assets: [],
    build: { profile: 'web-prod', pwa: false },
  });
}

function createProjectFromTemplate(templateId, opts = {}) {
  const name = opts.name || 'Untitled Project';
  if (!templateId || templateId === 'blank') return createDefaultProject({ name });
  const source = PROJECT_TEMPLATE_SOURCES[templateId];
  if (!source) return createDefaultProject({ name });
  const next = JSON.parse(JSON.stringify(source));
  next.meta = { ...(next.meta || {}), name };
  return ensureProjectShape(next);
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
  const isAudioType = type === 'audio_source' || type === 'music_source';
  const isLightingManagerType = type === 'lighting_manager';
  const isLightType = type === 'light';
  const isParticleEmitterType = type === 'particle_emitter';
  const next = {
    id: genId('obj'), name: name || 'Object', type, x, y,
    parentId: null,
    components: {
      Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
      Sprite: {
        assetId: null,
        color: opts.color || (isParticleEmitterType ? '#fb923c' : (isLightingManagerType ? '#60a5fa' : (isLightType ? '#fbbf24' : '#4ade80'))),
        width: isLightingManagerType ? 20 : (isLightType ? 18 : (isParticleEmitterType ? 16 : 32)),
        height: isLightingManagerType ? 20 : (isLightType ? 18 : (isParticleEmitterType ? 16 : 32)),
      },
      Collider: { shape: isLightType ? 'circle' : 'rect', width: isLightingManagerType ? 20 : (isLightType ? 18 : 32), height: isLightingManagerType ? 20 : (isLightType ? 18 : 32) },
      Collision: { enabled: !isLightType && !isLightingManagerType && !isParticleEmitterType, isTrigger: false },
      RigidBody: { enabled: false, weight: 1, friction: 0.4 },
      Render: { layerId: opts.layerId || ((isLightType || isLightingManagerType || isParticleEmitterType) ? 'obj-fx' : 'obj-main'), visible: !isLightingManagerType, zIndex: 0 },
      ScriptBindings: [],
      Animator: { clipId: null, autoplay: type === 'animator' },
      ...(isLightingManagerType ? {
        LightingManager: {
          enabled: false,
          ambientColor: '#0b1220',
          ambientIntensity: 0.35,
          overlayOpacity: 0.82,
          fogColor: '#07111d',
          fogDensity: 0.65,
        },
      } : {}),
      ...(isLightType ? {
        Light: {
          enabled: true,
          color: '#ffd27a',
          intensity: 1,
          radius: 180,
          falloff: 0.65,
          offsetX: 0,
          offsetY: 0,
          height: 18,
        },
      } : {}),
      ...(isAudioType ? {
        Sound: {
          assetId: null,
          category: type === 'music_source' ? 'music' : 'sfx',
          autoplay: type === 'music_source',
          loop: type === 'music_source',
          volume: 1,
          maxDistance: type === 'music_source' ? 0 : 320,
        },
      } : {}),
      ...(isParticleEmitterType ? {
        ParticleEmitter: {
          enabled: true,
          count: 24,
          rate: 0,
          burst: true,
          life: 500,
          speed: 80,
          spreadAngle: 360,
          direction: 270,
          color: '#fb923c',
          size: 4,
          sizeEnd: 1,
          gravity: 0,
          drag: 0.98,
          loop: true,
          interval: 1000,
          worldSpace: true,
        },
      } : {}),
    },
  };
  if (isAudioType) {
    next.components.Render.visible = false;
  }
  if (isLightingManagerType) {
    next.components.Collision.enabled = false;
    next.components.Render.visible = false;
  }
  return next;
}

function instantiateFromPrefab(prefab, projectView, x, y) {
  const sourceById = (projectView && projectView.objects || []).find((o) => o.id === prefab.sourceObjectId) || null;
  const source = prefab && prefab.object ? prefab.object : sourceById;
  if (!source) return createGameObject(prefab && prefab.name ? prefab.name : 'Object', x, y);

  const obj = JSON.parse(JSON.stringify(source));
  obj.id = genId('obj');
  obj.name = (prefab && prefab.name) || obj.name || 'Object';
  obj.prefabId = prefab.id;
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

function stripAssetsForExport(project) {
  const next = JSON.parse(JSON.stringify(project));
  next.assets = [];
  const clearObjectAssets = (obj) => {
    if (!obj || !obj.components || !obj.components.Sprite) return;
    obj.components.Sprite.assetId = null;
    obj.components.Sprite.frameAssetIds = [];
  };
  (next.objects || []).forEach(clearObjectAssets);
  (next.scenes || []).forEach((scene) => (scene.objects || []).forEach(clearObjectAssets));
  (next.cellTypes || []).forEach((type) => { if (type) type.imageAssetId = null; });
  return next;
}

function stripScriptsForExport(project) {
  const next = JSON.parse(JSON.stringify(project));
  next.scripts = [];
  const clearObjectScripts = (obj) => {
    if (!obj || !obj.components) return;
    delete obj.components.ScriptBinding;
    obj.components.ScriptBindings = [];
  };
  (next.objects || []).forEach(clearObjectScripts);
  (next.scenes || []).forEach((scene) => (scene.objects || []).forEach(clearObjectScripts));
  return next;
}

function resolveActiveScene(project) {
  return resolveScene(project, project && project.activeSceneId);
}

function resolveScene(project, sceneId) {
  if (!project || !Array.isArray(project.scenes) || project.scenes.length === 0) return null;
  if (sceneId) {
    const explicit = project.scenes.find((scene) => scene.id === sceneId);
    if (explicit) return explicit;
  }
  return project.scenes.find((scene) => scene.id === project.activeSceneId) || project.scenes[0];
}

function withSceneView(project, sceneId) {
  if (!project) return project;
  const scene = resolveScene(project, sceneId);
  if (!scene) return project;
  return {
    ...project,
    world: scene.world || project.world,
    objects: scene.objects || project.objects || [],
  };
}

function isMenuScene(scene) {
  const id = String((scene && scene.id) || '').toLowerCase();
  const name = String((scene && scene.name) || '').toLowerCase();
  return id.includes('menu') || name.includes('menu');
}

function guessInitialEditorSceneId(project) {
  const scenes = Array.isArray(project && project.scenes) ? project.scenes : [];
  if (scenes.length === 0) return (project && project.activeSceneId) || null;
  const active = resolveActiveScene(project) || scenes[0];
  if (active && !isMenuScene(active)) return active.id;

  const populatedScene = scenes.find((scene) => !isMenuScene(scene) && Array.isArray(scene.objects) && scene.objects.length > 0);
  if (populatedScene) return populatedScene.id;

  const nonMenuScene = scenes.find((scene) => !isMenuScene(scene));
  if (nonMenuScene) return nonMenuScene.id;

  return active ? active.id : scenes[0].id;
}

function createFramedCamera(projectLike, previousCamera = {}) {
  if (!projectLike || !projectLike.world) return previousCamera;
  const world = projectLike.world;
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

  for (const obj of (projectLike.objects || [])) {
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

  return {
    ...previousCamera,
    x: sceneMinX - 48,
    y: sceneMinY - 48,
    zoom: Number.isFinite(previousCamera.zoom) ? previousCamera.zoom : 1,
  };
}

const MAX_UNDO = 100;
const DEFAULT_EDITOR_CAMERA = { x: -240, y: -140, zoom: 1 };

function formatProjectTimestamp(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return 'Unknown';
  const date = new Date(value);
  const now = Date.now();
  const diffMs = Math.max(0, now - value);
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs < dayMs) return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (diffMs < dayMs * 2) return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function App() {
  // All hooks must be called unconditionally and in the same order
  const [project, setProject] = useState(null);
  const [showProjectSelector, setShowProjectSelector] = useState(true);
  const [projectFile, setProjectFile] = useState({ projectPath: null, folderPath: null, name: null });
  const [availableProjects, setAvailableProjects] = useState([]);
  const [projectsRoot, setProjectsRoot] = useState(null);
  const [newProjectName, setNewProjectName] = useState('Untitled Project');
  const [newProjectTemplate, setNewProjectTemplate] = useState('blank');
  const [projectSearch, setProjectSearch] = useState('');
  const [editorState, setEditorState] = useState({
    mode: 'EDIT', activeTool: 'brush', brushValue: 'solid', gizmoMode: 'move',
    selectedObjectId: null, selectedObjectIds: [], selectedScriptId: null, sceneId: null, camera: DEFAULT_EDITOR_CAMERA, gridVisible: true,
  });
  const [bottomTab, setBottomTab] = useState('timeline');
  const [bottomHeight, setBottomHeight] = useState(240);
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(260);
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
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((message, duration = 2000) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), duration);
  }, []);
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
  const projectView = withSceneView(project, editorState.sceneId);
  const selectedProjectTemplate = useMemo(() => {
    return PROJECT_TEMPLATES.find((template) => template.id === newProjectTemplate) || PROJECT_TEMPLATES[0];
  }, [newProjectTemplate]);
  const sortedProjects = useMemo(() => {
    return [...(availableProjects || [])].sort((a, b) => {
      const tA = Number(a && a.updatedAt) || 0;
      const tB = Number(b && b.updatedAt) || 0;
      return tB - tA;
    });
  }, [availableProjects]);
  const filteredProjects = useMemo(() => {
    const q = String(projectSearch || '').trim().toLowerCase();
    if (!q) return sortedProjects;
    return sortedProjects.filter((item) => {
      const name = String(item && item.name || '').toLowerCase();
      const folder = String(item && item.folderPath || '').toLowerCase();
      return name.includes(q) || folder.includes(q);
    });
  }, [sortedProjects, projectSearch]);

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
    const active = resolveScene(base, editorState.sceneId) || scenes[0];
    const sceneId = active.id;
    const bootSceneId = base.activeSceneId || sceneId;
    const world = JSON.parse(JSON.stringify(active.world || base.world));
    const objects = JSON.parse(JSON.stringify(active.objects || base.objects || []));
    const nextState = mutateFn({ world, objects }) || { world, objects };
    const nextScenes = scenes.map((scene) => (
      scene.id === sceneId ? { ...scene, world: nextState.world, objects: nextState.objects } : scene
    ));
    return ensureProjectShape({
      ...base,
      scenes: nextScenes,
      activeSceneId: bootSceneId,
      world: base.world,
      objects: base.objects,
    });
  }, [editorState.sceneId]);

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
  const {
    canvas2dRef: playCanvas2dRef,
    canvas3dRef: playCanvas3dRef,
    uiRootRef: playUiRootRef,
    isPlaying,
    start: startPlay,
    stop: stopPlay,
    execute,
  } = usePlayMode(projectView, addLog);

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

  const handleDuplicateObject = useCallback((id) => {
    const source = (projectView && projectView.objects || []).find((o) => o.id === id);
    if (!source) return;
    const clone = JSON.parse(JSON.stringify(source));
    clone.id = genId('obj');
    clone.name = (source.name || 'Object') + ' Copy';
    clone.x = (source.x || 0) + 24;
    clone.y = (source.y || 0) + 24;
    if (clone.components && clone.components.Transform) {
      clone.components.Transform.x = clone.x;
      clone.components.Transform.y = clone.y;
    }
    setProject((prev) => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({ world, objects: [...objects, clone] }));
    });
    updateEditor({ selectedObjectId: clone.id, selectedObjectIds: [clone.id] });
  }, [projectView, pushUndo, mutateActiveScene, updateEditor]);

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
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({
        world,
        objects,
      }) => ({ world, objects: objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
    });
  }, [pushUndo, mutateActiveScene]);

  const handleUpdateComponent = useCallback((objId, compName, compData) => {
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({
        world,
        objects: objects.map(o => {
          if (o.id !== objId) return o;
          const updated = { ...o, components: { ...o.components, [compName]: compData } };
          if (compName === 'Transform') { updated.x = compData.x; updated.y = compData.y; }
          return updated;
        }),
      }));
    });
  }, [pushUndo, mutateActiveScene]);

  const handleRemoveComponent = useCallback((objId, compName) => {
    if (compName === 'Transform' || compName === 'Render' || compName === 'ScriptBindings') return;
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({
        world,
        objects: objects.map(o => {
          if (o.id !== objId) return o;
          const comps = { ...o.components };
          delete comps[compName];
          return { ...o, components: comps };
        }),
      }));
    });
  }, [pushUndo, mutateActiveScene]);

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

  const handleRotateObject = useCallback((id, rotation) => {
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map(o => {
        if (o.id !== id) return o;
        return { ...o, components: { ...o.components, Transform: { ...(o.components && o.components.Transform), rotation } } };
      }),
    })));
  }, [mutateActiveScene]);

  const handleScaleObject = useCallback((id, scaleX, scaleY) => {
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map(o => {
        if (o.id !== id) return o;
        return { ...o, components: { ...o.components, Transform: { ...(o.components && o.components.Transform), scaleX, scaleY } } };
      }),
    })));
  }, [mutateActiveScene]);

  const handleAlignObjects = useCallback((alignment) => {
    const ids = Array.isArray(editorState.selectedObjectIds) ? editorState.selectedObjectIds : [];
    if (ids.length < 2) return;
    pushUndo(project);
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => {
      const selected = objects.filter(o => ids.includes(o.id));
      const positions = selected.map(o => {
        const t = (o.components && o.components.Transform) || {};
        const s = (o.components && o.components.Sprite) || {};
        return {
          id: o.id,
          x: Number.isFinite(t.x) ? t.x : (Number.isFinite(o.x) ? o.x : 0),
          y: Number.isFinite(t.y) ? t.y : (Number.isFinite(o.y) ? o.y : 0),
          w: s.width || 32,
          h: s.height || 32,
        };
      });
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x + p.w));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y + p.h));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const updateMap = new Map();
      for (const p of positions) {
        let nx = p.x, ny = p.y;
        if (alignment === 'left') nx = minX;
        else if (alignment === 'right') nx = maxX - p.w;
        else if (alignment === 'centerH') nx = centerX - p.w / 2;
        else if (alignment === 'top') ny = minY;
        else if (alignment === 'bottom') ny = maxY - p.h;
        else if (alignment === 'centerV') ny = centerY - p.h / 2;
        updateMap.set(p.id, { x: Math.round(nx), y: Math.round(ny) });
      }

      return {
        world,
        objects: objects.map(o => {
          const u = updateMap.get(o.id);
          if (!u) return o;
          return { ...o, x: u.x, y: u.y, components: { ...o.components, Transform: { ...(o.components && o.components.Transform), x: u.x, y: u.y } } };
        }),
      };
    }));
  }, [editorState.selectedObjectIds, project, pushUndo, mutateActiveScene]);

  const handleReparentObject = useCallback((childId, newParentId) => {
    if (childId === newParentId) return;
    // Prevent circular references
    if (newParentId) {
      const checkCircular = (id) => {
        if (!id) return false;
        if (id === childId) return true;
        const obj = (project && project.objects || []).find(o => o.id === id);
        return obj ? checkCircular(obj.parentId) : false;
      };
      if (checkCircular(newParentId)) return;
    }
    pushUndo(project);
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map(o => o.id === childId ? { ...o, parentId: newParentId } : o),
    })));
  }, [project, pushUndo, mutateActiveScene]);

  const handleDropAsset = useCallback((assetId, assetName, x, y) => {
    const asset = (project && project.assets || []).find(a => a.id === assetId);
    if (!asset) return;
    const w = asset.width || 32;
    const h = asset.height || 32;
    const obj = createGameObject(assetName || 'Sprite', x, y, { type: 'generic' });
    obj.components.Sprite = { ...obj.components.Sprite, assetId, width: Math.min(w, 128), height: Math.min(h, 128) };
    obj.components.Collider = { ...obj.components.Collider, width: Math.min(w, 128), height: Math.min(h, 128) };
    pushUndo(project);
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({ world, objects: [...objects, obj] })));
    updateEditor({ selectedObjectId: obj.id, selectedObjectIds: [obj.id], activeTool: 'select' });
  }, [project, pushUndo, mutateActiveScene, updateEditor]);

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
    // Don't create duplicate if already linked to a prefab
    if (source.prefabId) return;
    const prefabId = `prefab_${Date.now().toString(36)}`;
    const nextPrefab = {
      id: prefabId,
      name: `${source.name || source.type || 'Object'} Prefab`,
      sourceObjectId: source.id,
      object: JSON.parse(JSON.stringify(source)),
    };
    setProject((prev) => {
      const updated = mutateActiveScene(prev, ({ world, objects }) => ({
        world,
        objects: objects.map((o) => o.id === objId ? { ...o, prefabId } : o),
      }));
      return { ...updated, prefabs: [...((updated.prefabs) || []), nextPrefab] };
    });
  }, [projectView, mutateActiveScene]);

  const handleUnlinkPrefab = useCallback((objId) => {
    setProject((prev) => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map((o) => o.id === objId ? { ...o, prefabId: undefined } : o),
    })));
  }, [mutateActiveScene]);

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
      css: `/* Loaded when this script is bound to an active component */
#ui-root {
  pointer-events: none;
}
`,
      ui: `// UI Screen using KozUIManager / uiManager
// Visibility can be filtered by game state and active scene

function onInit(self, engine) {
  const manager = (typeof uiManager !== 'undefined' && uiManager) || (typeof KozUIManager !== 'undefined' && KozUIManager);
  if (!manager) return;

  manager.registerScreen('myScreen', {
    validStates: ['RUNNING'],
    // validScenes: ['scene_main', 'Main Scene'],
    layer: 'hud',
    layerOrder: 20,
    create: function() {
      const container = document.createElement('div');
      container.id = 'myScreen';
      container.style.cssText = 'position:absolute;top:20px;right:20px;padding:16px;background:rgba(0,0,0,0.8);color:#fff;border-radius:8px;font-family:sans-serif;';
      container.innerHTML = '<h3>My UI</h3><p id="uiTime">Game time: 0s</p><button id="myBtn">Click Me</button>';
      const btn = container.querySelector('#myBtn');
      if (btn) btn.onclick = function() { console.log('Button clicked!'); };
      return container;
    },
    update: function(ctx) {
      const panel = document.getElementById('myScreen');
      if (!panel) return;
      const p = panel.querySelector('#uiTime');
      if (p) p.textContent = 'Game time: ' + Math.floor(ctx.elapsed || 0) + 's';
    }
  });
}

function onUpdate(self, engine, dt) {
  // manager.updateAll() is called automatically by play mode
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
    const ext = language === 'javascript' ? 'js' : language === 'typescript' ? 'ts' : language === 'lua' ? 'lua' : language === 'python' ? 'py' : language === 'css' ? 'css' : 'js';
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filePath = `${safeName}.${ext}`;
    const source = templates[language] || templates.javascript;
    const script = {
      id: genId('script'), name, language,
      filePath,
      source,
    };
    
    // Save to external file immediately if electron API available
    if (window.api && projectFile && projectFile.projectPath) {
      console.log('[DEBUG] Calling saveScript', {
        projectPath: projectFile.projectPath,
        filePath,
        source
      });
      window.api.saveScript(projectFile.projectPath, filePath, source)
        .then(result => {
          console.log('[DEBUG] saveScript result:', result);
        })
        .catch(err => console.error('[DEBUG] Failed to save script file:', err));
    } else {
      console.warn('[DEBUG] Script not saved: missing Electron API or project path.', { projectFile, filePath, source });
    }
    
    setProject(prev => { pushUndo(prev); return { ...prev, scripts: [...prev.scripts, script] }; });
  }, [pushUndo, projectFile.projectPath]);

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
    updateEditor({ camera: createFramedCamera(projectView, editorState.camera) });
  }, [projectView, updateEditor, editorState.camera]);

  useEffect(() => {
    if (!project) return;
    if (!editorState.sceneId) {
      const nextSceneId = guessInitialEditorSceneId(project);
      setEditorState((prev) => ({
        ...prev,
        sceneId: nextSceneId,
        camera: createFramedCamera(withSceneView(project, nextSceneId), prev.camera),
      }));
      return;
    }
    const selectedScene = resolveScene(project, editorState.sceneId);
    if (selectedScene && selectedScene.id === editorState.sceneId) return;
    const fallbackSceneId = guessInitialEditorSceneId(project);
    setEditorState((prev) => ({
      ...prev,
      sceneId: fallbackSceneId,
      selectedObjectId: null,
      selectedObjectIds: [],
      camera: createFramedCamera(withSceneView(project, fallbackSceneId), prev.camera),
    }));
  }, [project, editorState.sceneId]);

  const handleSelectScene = useCallback((sceneId) => {
    if (!sceneId) return;
    const nextScene = project ? resolveScene(project, sceneId) : null;
    setEditorState((prev) => ({
      ...prev,
      sceneId,
      selectedObjectId: null,
      selectedObjectIds: [],
      camera: nextScene ? createFramedCamera(withSceneView(project, nextScene.id), prev.camera) : prev.camera,
    }));
  }, [project]);

  const handleSetStartScene = useCallback((sceneId) => {
    if (!sceneId) return;
    setProject((prev) => {
      if (!prev || prev.activeSceneId === sceneId) return prev;
      pushUndo(prev);
      return ensureProjectShape({ ...prev, activeSceneId: sceneId });
    });
  }, [pushUndo]);

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
      const nextSceneId = guessInitialEditorSceneId(next);
      setProject(next);
      setEditorState((prev) => ({
        ...prev,
        mode: 'EDIT',
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedScriptId: null,
        sceneId: nextSceneId,
        camera: createFramedCamera(withSceneView(next, nextSceneId), DEFAULT_EDITOR_CAMERA),
      }));
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
        showToast('Project saved');
      });
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (normalized.meta.name || 'project') + '.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('Project saved');
  }, [project, projectFile.projectPath, newProjectName, refreshProjects, showToast]);

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

  const handleLoadFromFile = useCallback(() => {
    const api = window.api;
    if (api && typeof api.openProjectDialog === 'function') {
      api.openProjectDialog().then((result) => {
        if (!result || !result.ok) {
          if (!(result && result.canceled)) alert(`Load failed: ${(result && result.error) || 'Unknown error'}`);
          return;
        }
        openProjectFromContent(result.content, {
          projectPath: result.projectPath || null,
          folderPath: result.folderPath || null,
          name: null,
        });
      });
      return;
    }
  }, [openProjectFromContent]);

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
    const nextProject = createProjectFromTemplate(newProjectTemplate, { name });
    const nextSceneId = guessInitialEditorSceneId(nextProject);
    setProject(nextProject);
    setShowProjectSelector(false);
    setProjectFile({ projectPath: null, folderPath: null, name });
    updateEditor({
      selectedObjectId: null,
      selectedObjectIds: [],
      selectedScriptId: null,
      sceneId: nextSceneId,
      camera: createFramedCamera(withSceneView(nextProject, nextSceneId), DEFAULT_EDITOR_CAMERA),
      brushValue: 'solid',
    });
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
  }, [updateEditor, newProjectName, newProjectTemplate, refreshProjects]);

  const handlePatchProject = useCallback((patch) => {
    setProject((prev) => applyProjectPatch(prev, patch, { sceneId: editorState.sceneId }));
  }, [editorState.sceneId]);

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
    const persistedProject = ensureProjectShape({
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
    setProject(persistedProject);

    let projectForExport = JSON.parse(JSON.stringify(persistedProject));
    if (!exportConfig.includeAssets) projectForExport = stripAssetsForExport(projectForExport);
    if (!exportConfig.includeScripts) projectForExport = stripScriptsForExport(projectForExport);

    const json = exportConfig.minify ? JSON.stringify(projectForExport) : JSON.stringify(projectForExport, null, 2);
    const html = buildExportHtml(projectForExport, json, target, { minify: exportConfig.minify });
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

  // ---- Left panel resize ----
  const handleLeftResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;
    function onMove(e) { setLeftWidth(Math.max(180, Math.min(500, startW + (e.clientX - startX)))); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftWidth]);

  // ---- Right panel resize ----
  const handleRightResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    function onMove(e) { setRightWidth(Math.max(220, Math.min(500, startW - (e.clientX - startX)))); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [rightWidth]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.closest('.cm-editor')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (mod && e.key === 'y') { e.preventDefault(); handleRedo(); }
      if (mod && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); handleSaveAs(); }
      if (mod && e.key === 's') { e.preventDefault(); handleSave(); }
      if (mod && e.key === 'd') { e.preventDefault(); if (editorState.selectedObjectId) handleDuplicateObject(editorState.selectedObjectId); }
      if (e.key === 'F5') { e.preventDefault(); handlePlayToggle(); }
      if (!isPlaying) {
        if (e.key === 'b') updateEditor({ activeTool: 'brush' });
        if (e.key === 'f') updateEditor({ activeTool: 'fill' });
        if (e.key === 'v') updateEditor({ activeTool: 'select' });
        if (e.key === 'g') updateEditor({ activeTool: 'worldMove' });
        // Gizmo mode shortcuts (W/E/R) — switch to select tool + set gizmo mode
        if (e.key === 'w') { updateEditor({ activeTool: 'select', gizmoMode: 'move' }); return; }
        if (e.key === 'e') { updateEditor({ activeTool: 'select', gizmoMode: 'rotate' }); return; }
        if (e.key === 'r') { updateEditor({ activeTool: 'select', gizmoMode: 'scale' }); return; }
        const camStep = e.shiftKey ? 48 : 24;
        const isPan = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 's'].includes(e.key);
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
  }, [handleUndo, handleRedo, handleSave, handleSaveAs, handlePlayToggle, updateEditor, editorState.camera, editorState.selectedObjectId, editorState.selectedObjectIds, handleRemoveObject, handleDuplicateObject, isPlaying, pushUndo, mutateActiveScene]);

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
        <Modal
          open={true}
          title={null}
          onClose={() => { if (project) setShowProjectSelector(false); }}
          maxWidth={980}
          minWidth={760}
          showHeader={false}
          resizable={false}
        >
          <div style={{ display: 'grid', gap: 14, minWidth: 360, width: 'min(920px, 90vw)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'linear-gradient(145deg, rgba(14,23,37,0.95), rgba(8,15,28,0.95))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <KozLogo size={52} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>Project Hub</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {projectsRoot || 'Using current projects folder'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', color: 'var(--text-muted)' }}>
                  {availableProjects.length} project{availableProjects.length === 1 ? '' : 's'}
                </span>
                {!!project && (
                  <button className="btn btn-sm" onClick={() => setShowProjectSelector(false)} aria-label="Close project hub">
                    <Icon name="close" />
                    Close
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)', gap: 12 }}>
              <div style={{ display: 'grid', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'rgba(15,23,42,0.65)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Quick Start</div>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleNew();
                    }
                  }}
                  placeholder="Project name"
                  style={{ width: '100%', padding: '9px 10px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
                />
                <div style={{ display: 'grid', gap: 8 }}>
                  {PROJECT_TEMPLATES.map((template) => {
                    const selected = template.id === newProjectTemplate;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setNewProjectTemplate(template.id)}
                        aria-pressed={selected}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          borderRadius: 8,
                          border: selected ? '1px solid rgba(56,189,248,0.9)' : '1px solid var(--border)',
                          background: selected ? 'rgba(8,47,73,0.9)' : 'rgba(15,23,42,0.75)',
                          color: 'var(--text)',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{template.label}</div>
                          <span style={{ marginLeft: 'auto', fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: selected ? '#bae6fd' : 'var(--text-muted)' }}>
                            {template.badge}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: selected ? '#e0f2fe' : 'var(--text-muted)', lineHeight: 1.35 }}>
                          {template.description}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.35 }}>
                          {template.note}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button className="btn btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={handleNew} aria-label="Create new project">
                  <Icon name="new" />
                  {selectedProjectTemplate && selectedProjectTemplate.id === 'blank'
                    ? 'Create Blank Project'
                    : `Create ${selectedProjectTemplate.label}`}
                </button>
                <button className="btn btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={handleLoadFromFile} aria-label="Load project from file dialog">
                  <Icon name="load" />
                  Load From File
                </button>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.35 }}>
                  Save uses the projects folder directly, so template creation is an instant clone.
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'rgba(2,8,23,0.65)', minHeight: 320 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Recent Projects</div>
                  <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11 }}>
                    {filteredProjects.length} visible
                  </div>
                </div>
                <input
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredProjects.length > 0) {
                      e.preventDefault();
                      handleLoadProjectFromList(filteredProjects[0]);
                    }
                  }}
                  placeholder="Search by project or folder..."
                  aria-label="Search projects"
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}
                />
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#0b1220', maxHeight: '42vh', overflow: 'auto' }}>
                  {filteredProjects.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>
                      {availableProjects.length === 0 ? 'No projects found yet.' : 'No projects match your search.'}
                    </div>
                  )}
                  {filteredProjects.map((item) => {
                    const isCurrent = !!(projectFile && projectFile.projectPath && projectFile.projectPath === item.projectPath);
                    return (
                      <button
                        key={item.projectPath}
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleLoadProjectFromList(item)}
                        style={{
                          width: '100%',
                          justifyContent: 'space-between',
                          border: 'none',
                          borderBottom: '1px solid var(--border)',
                          borderRadius: 0,
                          background: isCurrent ? 'rgba(59,130,246,0.12)' : 'transparent',
                          paddingTop: 7,
                          paddingBottom: 7,
                        }}
                        aria-label={`Open ${item.name || 'project'}`}
                      >
                        <span style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Icon name="folder" />
                            {item.name}
                            {isCurrent && <span style={{ fontSize: 10, color: '#93c5fd' }}>CURRENT</span>}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.folderPath || ''}</span>
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 10 }}>{formatProjectTimestamp(item.updatedAt)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {!(showProjectSelector || !project) && (
        // ...existing code for the editor layout...
        <div className="editor-layout" style={{ gridTemplateColumns: `${leftWidth}px 1fr ${rightWidth}px` }}>
          <Toolbar project={projectView} editorState={editorState} isPlaying={isPlaying}
            onToolChange={(tool) => updateEditor({ activeTool: tool })}
            onBrushChange={(val) => updateEditor({ brushValue: getBrushValue({ brushValue: val }) })}
            onGizmoModeChange={(mode, snapOverride) => updateEditor({
              gizmoMode: mode,
              activeTool: 'select',
              ...(snapOverride !== undefined ? { snapToGrid: snapOverride } : {}),
            })}
            onUndo={handleUndo} onRedo={handleRedo}
            onNewProject={handleNew} onSaveProject={handleSave} onSaveAsProject={handleSaveAs} onLoadProject={handleLoadFromFile}
            onExport={openExportModal} onPlayToggle={handlePlayToggle}
            undoCount={undoStackRef.current.length} redoCount={redoStackRef.current.length}
            onAlignObjects={handleAlignObjects} />

          <div className="editor-left" style={{ width: leftWidth, overflow: 'auto' }}>
            <div className="resize-handle-h" onMouseDown={handleLeftResizeStart} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'ew-resize', zIndex: 10 }} />
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
              onDuplicateObject={handleDuplicateObject}
              onReparentObject={handleReparentObject}
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
                    <div
                      style={{
                        position: 'relative',
                        width: projectView.meta.resolution.width,
                        height: projectView.meta.resolution.height,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        margin: '0 auto',
                      }}
                    >
                      <canvas
                        ref={playCanvas2dRef}
                        width={projectView.meta.resolution.width}
                        height={projectView.meta.resolution.height}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', background: '#0b1220' }}
                        tabIndex={0}
                      />
                      <canvas
                        ref={playCanvas3dRef}
                        width={projectView.meta.resolution.width}
                        height={projectView.meta.resolution.height}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'none', background: '#0b1220' }}
                        tabIndex={0}
                      />
                      <div ref={playUiRootRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                    </div>
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
                      onRotateObject={handleRotateObject}
                      onScaleObject={handleScaleObject}
                      onSelectObjects={(ids, add) => handleSelectObject(null, { ids, add })}
                      onUpdateCamera={handleUpdateCamera}
                      onDropAsset={handleDropAsset} />
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
                  projectPath={projectFile.folderPath}
                />
              </div>
            )}
            {mainTab === 'assets' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SystemsTab
                  mode="assets"
                  project={project}
                  selectedObjectId={editorState.selectedObjectId}
                  selectedSceneId={editorState.sceneId}
                  onPatchProject={handlePatchProject}
                  onSelectObject={handleSelectObject}
                  onSelectScene={handleSelectScene}
                  onSetStartScene={handleSetStartScene}
                />
              </div>
            )}
            {mainTab === 'scenes' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SystemsTab
                  mode="scenes"
                  project={project}
                  selectedObjectId={editorState.selectedObjectId}
                  selectedSceneId={editorState.sceneId}
                  onPatchProject={handlePatchProject}
                  onSelectObject={handleSelectObject}
                  onSelectScene={handleSelectScene}
                  onSetStartScene={handleSetStartScene}
                />
              </div>
            )}
            {mainTab === 'settings' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SystemsTab
                  mode="settings"
                  project={project}
                  selectedObjectId={editorState.selectedObjectId}
                  selectedSceneId={editorState.sceneId}
                  onPatchProject={handlePatchProject}
                  onSelectObject={handleSelectObject}
                  onSelectScene={handleSelectScene}
                  onSetStartScene={handleSetStartScene}
                />
              </div>
            )}
          </div>
          <div className="editor-right" style={{ width: rightWidth, overflow: 'auto' }}>
            <div className="resize-handle-h" onMouseDown={handleRightResizeStart} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, cursor: 'ew-resize', zIndex: 10 }} />
            <Inspector
              project={projectView}
              editorState={editorState}
              onUpdateObject={handleUpdateObject}
              onUpdateComponent={handleUpdateComponent}
              onRemoveComponent={handleRemoveComponent}
              onCreatePrefabFromObject={handleCreatePrefabFromObject}
              onUnlinkPrefab={handleUnlinkPrefab}
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
              <option value="single-html">Single HTML</option>
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
              <div className="field">
                <label>Single File</label>
                <input type="checkbox" checked={exportConfig.electronSingleFile} onChange={(e) => setExportConfig(prev => ({ ...prev, electronSingleFile: e.target.checked }))} />
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
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#22c55e', color: '#0b1220', padding: '8px 20px', borderRadius: 6,
          fontSize: 13, fontWeight: 600, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
            </>
          );
}
export default App;
