const DEFAULT_CELL_LAYERS = [
  { id: 'cell-base', name: 'Cell Base', order: 0, visible: true },
  { id: 'cell-detail', name: 'Cell Detail', order: 1, visible: true },
];

const DEFAULT_OBJECT_LAYERS = [
  { id: 'obj-main', name: 'Main Objects', order: 0, visible: true },
  { id: 'obj-fx', name: 'FX Objects', order: 1, visible: true },
];

const DEFAULT_CELL_TYPES = [
  {
    id: 'empty',
    name: 'Empty',
    color: '#111827',
    imageAssetId: null,
    collision: false,
    layerId: 'cell-base',
    rigidBody: { enabled: false, weight: 0, friction: 0 },
  },
  {
    id: 'solid',
    name: 'Solid',
    color: '#334155',
    imageAssetId: null,
    collision: true,
    layerId: 'cell-base',
    rigidBody: { enabled: true, weight: 1, friction: 0.8 },
  },
  {
    id: 'hazard',
    name: 'Hazard',
    color: '#7f1d1d',
    imageAssetId: null,
    collision: true,
    layerId: 'cell-detail',
    rigidBody: { enabled: false, weight: 0, friction: 0 },
  },
];

const DEFAULT_CLASSES = [
  { id: 'generic', name: 'Generic Object', baseType: 'generic' },
  { id: 'sprite', name: 'Sprite Object', baseType: 'sprite' },
  { id: 'animator', name: 'Animator Object', baseType: 'animator' },
  { id: 'camera', name: 'Camera Object', baseType: 'camera' },
  { id: 'lighting_manager', name: 'Lighting Manager', baseType: 'lighting_manager' },
  { id: 'light', name: 'Light Object', baseType: 'light' },
  { id: 'audio_source', name: 'Audio Source', baseType: 'audio_source' },
  { id: 'music_source', name: 'Music Source', baseType: 'music_source' },
];

const DEFAULT_BUILD = {
  profile: 'web-prod',
  target: 'html-zip',
  targets: {
    electronExe: false,
    pwa: false,
    htmlZip: true,
    tarball: false,
  },
};

const DEFAULT_SETTINGS = {
  preferredEditor: 'vscode',
  editorCommand: '',
  editorArgs: [],
  autoSaveScripts: true,
  formatOnSave: false,
  confirmBeforeScriptDelete: true,
};

const DEFAULT_CAMERA = {
  targetObjectId: null,
  speed: 8,
  zoom: 1,
  minZoom: 0.25,
  maxZoom: 4,
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
};

const DEFAULT_SOUND = {
  assetId: null,
  category: 'sfx',
  autoplay: false,
  loop: false,
  volume: 1,
  maxDistance: 0,
};

const DEFAULT_SCENE_LIGHTING = {
  enabled: false,
  ambientColor: '#0b1220',
  ambientIntensity: 0.35,
  overlayOpacity: 0.82,
  fogColor: '#07111d',
  fogDensity: 0.65,
};

const DEFAULT_LIGHT_COMPONENT = {
  enabled: true,
  color: '#ffd27a',
  intensity: 1,
  radius: 180,
  falloff: 0.65,
  offsetX: 0,
  offsetY: 0,
  height: 18,
};

const DEFAULT_LIGHTING_MANAGER_COMPONENT = {
  enabled: false,
  ambientColor: '#0b1220',
  ambientIntensity: 0.35,
  overlayOpacity: 0.82,
  fogColor: '#07111d',
  fogDensity: 0.65,
};

function normalizeRenderMode(value, fallback = '2d') {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (mode === '3d' || mode === 'webgl-3d') return 'webgl-3d';
  if (mode === '2d') return '2d';
  return fallback;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeSceneLighting(lighting) {
  const source = lighting && typeof lighting === 'object' ? lighting : {};
  return {
    enabled: source.enabled === true,
    ambientColor: typeof source.ambientColor === 'string' && source.ambientColor ? source.ambientColor : DEFAULT_SCENE_LIGHTING.ambientColor,
    ambientIntensity: clamp01(source.ambientIntensity, DEFAULT_SCENE_LIGHTING.ambientIntensity),
    overlayOpacity: clamp01(source.overlayOpacity, DEFAULT_SCENE_LIGHTING.overlayOpacity),
    fogColor: typeof source.fogColor === 'string' && source.fogColor ? source.fogColor : DEFAULT_SCENE_LIGHTING.fogColor,
    fogDensity: clamp01(source.fogDensity, DEFAULT_SCENE_LIGHTING.fogDensity),
  };
}

function normalizeLightingManagerComponent(component) {
  const source = component && typeof component === 'object' ? component : {};
  return {
    enabled: source.enabled === true,
    ambientColor: typeof source.ambientColor === 'string' && source.ambientColor ? source.ambientColor : DEFAULT_LIGHTING_MANAGER_COMPONENT.ambientColor,
    ambientIntensity: clamp01(source.ambientIntensity, DEFAULT_LIGHTING_MANAGER_COMPONENT.ambientIntensity),
    overlayOpacity: clamp01(source.overlayOpacity, DEFAULT_LIGHTING_MANAGER_COMPONENT.overlayOpacity),
    fogColor: typeof source.fogColor === 'string' && source.fogColor ? source.fogColor : DEFAULT_LIGHTING_MANAGER_COMPONENT.fogColor,
    fogDensity: clamp01(source.fogDensity, DEFAULT_LIGHTING_MANAGER_COMPONENT.fogDensity),
  };
}

function hasLightingManagerObject(objects) {
  return Array.isArray(objects) && objects.some((obj) => obj && obj.components && obj.components.LightingManager);
}

function createLightingManagerObject(sceneId, lighting) {
  return {
    id: `obj_${sceneId || 'scene_main'}_lighting_manager`,
    name: 'Lighting Manager',
    type: 'lighting_manager',
    x: 0,
    y: 0,
    editorFolder: 'Root',
    components: {
      Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      Sprite: { assetId: null, color: '#60a5fa', width: 20, height: 20 },
      Collider: { shape: 'rect', width: 20, height: 20 },
      Collision: { enabled: false, isTrigger: false },
      RigidBody: { enabled: false, weight: 1, friction: 0.4 },
      Render: { layerId: 'obj-fx', visible: false, zIndex: 0 },
      ScriptBindings: [],
      Animator: { clipId: null, autoplay: false },
      LightingManager: normalizeLightingManagerComponent(lighting),
    },
  };
}

function normalizeWorld(world) {
  const next = clone(world || { cols: 30, rows: 20, defaultCell: null, grid: [], elements: [], meta: {} });
  if (!Array.isArray(next.grid)) next.grid = [];
  if (!Number.isFinite(next.cols)) next.cols = (next.grid[0] && next.grid[0].length) || 0;
  if (!Number.isFinite(next.rows)) next.rows = next.grid.length;
  if (!Number.isFinite(next.offsetX)) next.offsetX = 0;
  if (!Number.isFinite(next.offsetY)) next.offsetY = 0;
  next.grid = next.grid.map((row) => (Array.isArray(row) ? row.slice() : []));
  return next;
}

function defaultSceneFromProject(projectLike) {
  const base = projectLike || {};
  const fallbackRenderMode = normalizeRenderMode(base?.meta?.renderMode, '2d');
  const objects = clone(base.objects || []);
  if (base.lighting && !hasLightingManagerObject(objects)) {
    objects.unshift(createLightingManagerObject('scene_main', base.lighting));
  }
  return {
    id: 'scene_main',
    name: 'Main Scene',
    renderMode: fallbackRenderMode,
    world: normalizeWorld(base.world || { cols: 30, rows: 20, offsetX: 0, offsetY: 0, defaultCell: null, grid: [], elements: [], meta: {} }),
    objects,
  };
}

function ensureProjectShape(project) {
  if (!project || typeof project !== 'object') return project;
  const next = clone(project);

  if (!Array.isArray(next.cellTypes)) next.cellTypes = clone(DEFAULT_CELL_TYPES);
  if (!next.layers || typeof next.layers !== 'object') next.layers = {};
  if (!Array.isArray(next.layers.cells)) next.layers.cells = clone(DEFAULT_CELL_LAYERS);
  if (!Array.isArray(next.layers.objects)) next.layers.objects = clone(DEFAULT_OBJECT_LAYERS);
  if (!Array.isArray(next.prefabs)) next.prefabs = [];
  if (!Array.isArray(next.scenes) || next.scenes.length === 0) next.scenes = [defaultSceneFromProject(next)];
  if (!next.meta || typeof next.meta !== 'object') next.meta = {};
  next.meta.renderMode = normalizeRenderMode(next.meta.renderMode, '2d');
  next.scenes = next.scenes.map((scene, idx) => {
    const sceneId = scene.id || `scene_${idx}`;
    const objects = clone(scene.objects || next.objects || []);
    if (scene && scene.lighting && !hasLightingManagerObject(objects)) {
      objects.unshift(createLightingManagerObject(sceneId, scene.lighting));
    }
    return {
      id: sceneId,
      name: scene.name || `Scene ${idx + 1}`,
      renderMode: normalizeRenderMode(scene && scene.renderMode, next.meta.renderMode),
      world: normalizeWorld(scene.world || next.world),
      objects,
    };
  });
  if (!next.activeSceneId) next.activeSceneId = next.scenes[0].id;
  const activeScene = next.scenes.find((s) => s.id === next.activeSceneId) || next.scenes[0];
  if (activeScene) {
    next.world = normalizeWorld(activeScene.world || next.world);
    next.objects = clone(activeScene.objects || next.objects || []);
  }
  if (!Array.isArray(next.sceneFolders)) next.sceneFolders = ['Root'];
  if (!Array.isArray(next.assetFolders)) next.assetFolders = ['Root'];
  if (!Array.isArray(next.defaultClasses)) next.defaultClasses = clone(DEFAULT_CLASSES);
  if (!next.build || typeof next.build !== 'object') next.build = clone(DEFAULT_BUILD);
  next.build = { ...clone(DEFAULT_BUILD), ...next.build, targets: { ...DEFAULT_BUILD.targets, ...(next.build.targets || {}) } };
  if (!next.settings || typeof next.settings !== 'object') next.settings = clone(DEFAULT_SETTINGS);
  next.settings = {
    ...clone(DEFAULT_SETTINGS),
    ...next.settings,
    editorArgs: Array.isArray(next.settings.editorArgs)
      ? next.settings.editorArgs.map((arg) => String(arg))
      : [],
  };
  if (!next.camera || typeof next.camera !== 'object') next.camera = clone(DEFAULT_CAMERA);
  next.camera = { ...clone(DEFAULT_CAMERA), ...next.camera };
  if (!Array.isArray(next.plugins)) next.plugins = [];
  if (!next.scripting || typeof next.scripting !== 'object') {
    next.scripting = { engines: { javascript: true, lua: false, python: false } };
  }
  if (!next.scripting.engines) next.scripting.engines = { javascript: true, lua: false, python: false };
  next.scripting.engines = { javascript: true, lua: false, python: false, ...next.scripting.engines };

  next.world = normalizeWorld(next.world);

  if (Array.isArray(next.objects)) {
    next.objects = next.objects.map((obj) => {
      const components = obj.components || {};
      if (obj.type === 'camera' || components.Camera) {
        const t = components.Transform || { x: obj.x || 0, y: obj.y || 0, rotation: 0, scaleX: 1, scaleY: 1 };
        return {
          ...obj,
          editorFolder: obj.editorFolder || 'Root',
          components: {
            Transform: {
              x: Number.isFinite(t.x) ? t.x : (obj.x || 0),
              y: Number.isFinite(t.y) ? t.y : (obj.y || 0),
              rotation: Number.isFinite(t.rotation) ? t.rotation : 0,
              scaleX: Number.isFinite(t.scaleX) ? t.scaleX : 1,
              scaleY: Number.isFinite(t.scaleY) ? t.scaleY : 1,
            },
            Camera: {
              enabled: (components.Camera && components.Camera.enabled) !== false,
              targetObjectId: (components.Camera && components.Camera.targetObjectId) || null,
              speed: (components.Camera && Number.isFinite(components.Camera.speed)) ? components.Camera.speed : 8,
              offsetX: (components.Camera && Number.isFinite(components.Camera.offsetX)) ? components.Camera.offsetX : 0,
              offsetY: (components.Camera && Number.isFinite(components.Camera.offsetY)) ? components.Camera.offsetY : 0,
              deadZoneWidth: (components.Camera && Number.isFinite(components.Camera.deadZoneWidth)) ? components.Camera.deadZoneWidth : 180,
              deadZoneHeight: (components.Camera && Number.isFinite(components.Camera.deadZoneHeight)) ? components.Camera.deadZoneHeight : 120,
              lookAheadX: (components.Camera && Number.isFinite(components.Camera.lookAheadX)) ? components.Camera.lookAheadX : 0,
              lookAheadY: (components.Camera && Number.isFinite(components.Camera.lookAheadY)) ? components.Camera.lookAheadY : 0,
              visibleMargin: (components.Camera && Number.isFinite(components.Camera.visibleMargin)) ? components.Camera.visibleMargin : 40,
              followX: (components.Camera && components.Camera.followX) !== false,
              followY: (components.Camera && components.Camera.followY) !== false,
              clampToWorld: (components.Camera && components.Camera.clampToWorld) !== false,
              maxSpeed: (components.Camera && Number.isFinite(components.Camera.maxSpeed)) ? components.Camera.maxSpeed : 2000,
            },
            Render: {
              layerId: (components.Render && components.Render.layerId) || obj.layerId || 'obj-main',
              visible: false,
              zIndex: (components.Render && Number.isFinite(components.Render.zIndex)) ? components.Render.zIndex : 0,
            },
            ScriptBindings: Array.isArray(components.ScriptBindings) ? components.ScriptBindings : [],
          },
        };
      }
      return {
        ...obj,
        editorFolder: obj.editorFolder || 'Root',
        components: {
          ...components,
          Render: {
            layerId: (components.Render && components.Render.layerId) || obj.layerId || 'obj-main',
            visible: (components.Render && components.Render.visible) !== false,
            zIndex: (components.Render && Number.isFinite(components.Render.zIndex)) ? components.Render.zIndex : 0,
          },
          Collision: {
            enabled: (components.Collision && components.Collision.enabled) !== false,
            isTrigger: !!(components.Collision && components.Collision.isTrigger),
          },
          RigidBody: {
            enabled: !!(components.RigidBody && components.RigidBody.enabled),
            weight: (components.RigidBody && Number.isFinite(components.RigidBody.weight)) ? components.RigidBody.weight : 1,
            friction: (components.RigidBody && Number.isFinite(components.RigidBody.friction)) ? components.RigidBody.friction : 0.4,
          },
          ...(components.Sound ? {
            Sound: {
              ...clone(DEFAULT_SOUND),
              ...components.Sound,
              category: components.Sound.category === 'music' ? 'music' : 'sfx',
              volume: Number.isFinite(components.Sound.volume) ? Math.max(0, Math.min(1, components.Sound.volume)) : 1,
              maxDistance: Number.isFinite(components.Sound.maxDistance) ? Math.max(0, components.Sound.maxDistance) : 0,
              loop: !!components.Sound.loop,
              autoplay: !!components.Sound.autoplay,
              assetId: components.Sound.assetId || null,
            },
          } : {}),
          ...((obj.type === 'light' || components.Light) ? {
            Light: {
              ...clone(DEFAULT_LIGHT_COMPONENT),
              ...(components.Light || {}),
              enabled: (components.Light && components.Light.enabled) !== false,
              color: (components.Light && components.Light.color) || DEFAULT_LIGHT_COMPONENT.color,
              intensity: clamp01(components.Light && components.Light.intensity, DEFAULT_LIGHT_COMPONENT.intensity),
              radius: Number.isFinite(components.Light && components.Light.radius) ? Math.max(1, components.Light.radius) : DEFAULT_LIGHT_COMPONENT.radius,
              falloff: clamp01(components.Light && components.Light.falloff, DEFAULT_LIGHT_COMPONENT.falloff),
              offsetX: Number.isFinite(components.Light && components.Light.offsetX) ? components.Light.offsetX : DEFAULT_LIGHT_COMPONENT.offsetX,
              offsetY: Number.isFinite(components.Light && components.Light.offsetY) ? components.Light.offsetY : DEFAULT_LIGHT_COMPONENT.offsetY,
              height: Number.isFinite(components.Light && components.Light.height) ? Math.max(0, components.Light.height) : DEFAULT_LIGHT_COMPONENT.height,
            },
          } : {}),
          ...((obj.type === 'lighting_manager' || components.LightingManager) ? {
            LightingManager: normalizeLightingManagerComponent(components.LightingManager),
            Render: {
              layerId: (components.Render && components.Render.layerId) || obj.layerId || 'obj-fx',
              visible: !!(components.Render && components.Render.visible),
              zIndex: (components.Render && Number.isFinite(components.Render.zIndex)) ? components.Render.zIndex : 0,
            },
            Collision: {
              enabled: false,
              isTrigger: false,
            },
            RigidBody: {
              enabled: false,
              weight: (components.RigidBody && Number.isFinite(components.RigidBody.weight)) ? components.RigidBody.weight : 1,
              friction: (components.RigidBody && Number.isFinite(components.RigidBody.friction)) ? components.RigidBody.friction : 0.4,
            },
          } : {}),
        },
      };
    });
  }

  if (Array.isArray(next.assets)) {
    next.assets = next.assets.map((asset) => ({
      ...asset,
      kind: asset.kind || (asset.url || asset.src ? 'image' : 'asset'),
    }));
  }

  return next;
}

function normalizeCellTypeId(cell) {
  if (cell === null || cell === undefined) return 'empty';
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number') {
    if (cell <= 0) return 'empty';
    return cell === 1 ? 'solid' : 'hazard';
  }
  if (typeof cell === 'object') {
    if (typeof cell.typeId === 'string') return cell.typeId;
    if (typeof cell.id === 'string') return cell.id;
  }
  return 'empty';
}

function getCellType(project, cell) {
  const typeId = normalizeCellTypeId(cell);
  const types = (project && project.cellTypes) || DEFAULT_CELL_TYPES;
  return types.find((t) => t.id === typeId) || types[0] || DEFAULT_CELL_TYPES[0];
}

function getBrushValue(editorState) {
  if (!editorState) return 'solid';
  const v = editorState.brushValue;
  if (typeof v === 'string') return v;
  return normalizeCellTypeId(v);
}

export {
  DEFAULT_CELL_TYPES,
  DEFAULT_CELL_LAYERS,
  DEFAULT_OBJECT_LAYERS,
  DEFAULT_CLASSES,
  DEFAULT_BUILD,
  DEFAULT_CAMERA,
  DEFAULT_SCENE_LIGHTING,
  DEFAULT_LIGHTING_MANAGER_COMPONENT,
  DEFAULT_LIGHT_COMPONENT,
  ensureProjectShape,
  normalizeCellTypeId,
  getCellType,
  getBrushValue,
};
