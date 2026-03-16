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
{ id: 'camera', name: 'Camera Object', baseType: 'camera' },
  { id: 'lighting_manager', name: 'Lighting Manager', baseType: 'lighting_manager' },
  { id: 'light', name: 'Light Object', baseType: 'light' },
  { id: 'audio_source', name: 'Audio Source', baseType: 'audio_source' },
  { id: 'music_source', name: 'Music Source', baseType: 'music_source' },
  { id: 'particle_emitter', name: 'Particle Emitter', baseType: 'particle_emitter' },
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

const DEFAULT_RESOLUTION = {
  width: 960,
  height: 540,
};

const DEFAULT_DISPLAY = {
  scaleMode: 'contain',
  allowFullscreen: true,
  showFullscreenButton: true,
  backgroundColor: '#0b1220',
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

const LIGHTING_MODE_PIXEL = 'pixel';
const LIGHTING_MODE_SOFT = 'soft';

function normalizeLightingMode(value, fallback = LIGHTING_MODE_PIXEL) {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (mode === LIGHTING_MODE_SOFT) return LIGHTING_MODE_SOFT;
  if (mode === LIGHTING_MODE_PIXEL || mode === 'crisp' || mode === 'hard') return LIGHTING_MODE_PIXEL;
  return fallback;
}

const DEFAULT_SCENE_LIGHTING = {
  enabled: false,
  mode: LIGHTING_MODE_PIXEL,
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
  mode: LIGHTING_MODE_PIXEL,
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
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v));
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeResolution(resolution) {
  const source = resolution && typeof resolution === 'object' ? resolution : {};
  const width = Number.isFinite(source.width) && source.width > 0
    ? Math.max(1, Math.round(source.width))
    : DEFAULT_RESOLUTION.width;
  const height = Number.isFinite(source.height) && source.height > 0
    ? Math.max(1, Math.round(source.height))
    : DEFAULT_RESOLUTION.height;
  return { width, height };
}

function normalizeDisplaySettings(display) {
  const source = display && typeof display === 'object' ? display : {};
  const scaleMode = typeof source.scaleMode === 'string' ? source.scaleMode.trim().toLowerCase() : '';
  const normalizedScaleMode = ['contain', 'cover', 'stretch', 'native'].includes(scaleMode)
    ? scaleMode
    : DEFAULT_DISPLAY.scaleMode;
  const allowFullscreen = source.allowFullscreen !== false;
  return {
    scaleMode: normalizedScaleMode,
    allowFullscreen,
    showFullscreenButton: allowFullscreen && source.showFullscreenButton !== false,
    backgroundColor: typeof source.backgroundColor === 'string' && source.backgroundColor.trim()
      ? source.backgroundColor.trim()
      : DEFAULT_DISPLAY.backgroundColor,
  };
}

function getProjectResolution(project) {
  return normalizeResolution(project && project.meta ? project.meta.resolution : null);
}

function getProjectDisplaySettings(project) {
  return normalizeDisplaySettings(project && project.meta ? project.meta.display : null);
}

function buildDisplayStageLayout(containerWidth, containerHeight, resolutionLike, displayLike) {
  const resolution = normalizeResolution(resolutionLike);
  const display = normalizeDisplaySettings(displayLike);
  const availableWidth = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : resolution.width;
  const availableHeight = Number.isFinite(containerHeight) && containerHeight > 0 ? containerHeight : resolution.height;
  const scaleX = availableWidth / resolution.width;
  const scaleY = availableHeight / resolution.height;
  let stageWidth = resolution.width;
  let stageHeight = resolution.height;
  let scale = 1;

  if (display.scaleMode === 'stretch') {
    stageWidth = availableWidth;
    stageHeight = availableHeight;
    scale = Math.min(scaleX, scaleY);
  } else if (display.scaleMode === 'cover') {
    scale = Math.max(scaleX, scaleY);
    stageWidth = resolution.width * scale;
    stageHeight = resolution.height * scale;
  } else if (display.scaleMode === 'contain') {
    scale = Math.min(scaleX, scaleY);
    stageWidth = resolution.width * scale;
    stageHeight = resolution.height * scale;
  }

  return {
    width: Math.max(1, Math.round(stageWidth)),
    height: Math.max(1, Math.round(stageHeight)),
    scale,
    scaleMode: display.scaleMode,
  };
}

function normalizeSceneLighting(lighting) {
  const source = lighting && typeof lighting === 'object' ? lighting : {};
  return {
    enabled: source.enabled === true,
    mode: normalizeLightingMode(source.mode, DEFAULT_SCENE_LIGHTING.mode),
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
    mode: normalizeLightingMode(source.mode, DEFAULT_LIGHTING_MANAGER_COMPONENT.mode),
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

function hasCameraObject(objects) {
  return Array.isArray(objects) && objects.some((obj) => obj && (obj.type === 'camera' || (obj.components && obj.components.Camera)));
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

function createSceneCameraObject(sceneId, world, options = {}) {
  const cols = Number.isFinite(world && world.cols) ? world.cols : 30;
  const rows = Number.isFinite(world && world.rows) ? world.rows : 20;
  const offsetX = Number.isFinite(world && world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world && world.offsetY) ? world.offsetY : 0;
  const centerX = Math.round((offsetX * 24) + (cols * 12));
  const centerY = Math.round((offsetY * 24) + (rows * 12));
  return {
    id: options.id || `obj_${sceneId || 'scene_main'}_camera`,
    name: options.name || 'Main Camera',
    type: 'camera',
    parentId: null,
    x: centerX,
    y: centerY,
    editorFolder: 'Root',
    components: {
      Transform: { x: centerX, y: centerY, rotation: 0, scaleX: 1, scaleY: 1 },
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
      Render: { layerId: 'obj-main', visible: false, zIndex: 0 },
      ScriptBindings: [],
    },
  };
}

function ensureSceneObjects(sceneId, world, objects, lighting) {
  const next = clone(objects || []);
  if (lighting && !hasLightingManagerObject(next)) {
    next.unshift(createLightingManagerObject(sceneId, lighting));
  }
  if (!hasCameraObject(next)) {
    next.unshift(createSceneCameraObject(sceneId, world));
  }
  return next;
}

function hasMeaningfulSceneObjects(objects) {
  return Array.isArray(objects) && objects.some((obj) => {
    if (!obj) return false;
    if (obj.type === 'camera' || (obj.components && obj.components.Camera)) return false;
    if (obj.type === 'lighting_manager' || (obj.components && obj.components.LightingManager)) return false;
    return true;
  });
}

function worldHasContent(world) {
  if (!world || typeof world !== 'object') return false;
  if (Array.isArray(world.elements) && world.elements.length > 0) return true;
  const grid = Array.isArray(world.grid) ? world.grid : [];
  for (const row of grid) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (normalizeCellTypeId(cell) !== 'empty') return true;
    }
  }
  return false;
}

function shouldHydrateSingleSceneWorld(sceneWorld, projectWorld) {
  if (!projectWorld || typeof projectWorld !== 'object') return false;
  if (!sceneWorld || typeof sceneWorld !== 'object') return true;
  const sceneCols = Number.isFinite(sceneWorld.cols) ? sceneWorld.cols : 0;
  const sceneRows = Number.isFinite(sceneWorld.rows) ? sceneWorld.rows : 0;
  const projectCols = Number.isFinite(projectWorld.cols) ? projectWorld.cols : 0;
  const projectRows = Number.isFinite(projectWorld.rows) ? projectWorld.rows : 0;
  if (sceneCols <= 0 || sceneRows <= 0) return projectCols > 0 && projectRows > 0;
  return !worldHasContent(sceneWorld) && worldHasContent(projectWorld);
}

function shouldHydrateSingleSceneObjects(sceneObjects, projectObjects) {
  if (!Array.isArray(projectObjects) || projectObjects.length === 0) return false;
  if (!Array.isArray(sceneObjects) || sceneObjects.length === 0) return true;
  return !hasMeaningfulSceneObjects(sceneObjects) && hasMeaningfulSceneObjects(projectObjects);
}

function resolveProjectSceneId(project, preferredSceneId) {
  const scenes = Array.isArray(project && project.scenes) ? project.scenes : [];
  if (scenes.length === 0) return null;
  if (preferredSceneId && scenes.some((scene) => scene && scene.id === preferredSceneId)) return preferredSceneId;
  if (project && project.activeSceneId && scenes.some((scene) => scene && scene.id === project.activeSceneId)) return project.activeSceneId;
  return scenes[0].id || null;
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
  const world = normalizeWorld(base.world || { cols: 30, rows: 20, offsetX: 0, offsetY: 0, defaultCell: null, grid: [], elements: [], meta: {} });
  const objects = ensureSceneObjects('scene_main', world, base.objects || [], base.lighting);
  return {
    id: 'scene_main',
    name: 'Main Scene',
    renderMode: fallbackRenderMode,
    world,
    objects,
  };
}

const PREFAB_DELETE_KEY = '__kozPrefabDelete';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createPrefabDeleteMarker() {
  return { [PREFAB_DELETE_KEY]: true };
}

function isPrefabDeleteMarker(value) {
  return isPlainObject(value) && value[PREFAB_DELETE_KEY] === true;
}

function stripPrefabLinkFields(objectLike) {
  const next = clone(objectLike || {});
  if (!next || typeof next !== 'object') return {};
  delete next.prefabId;
  delete next.prefabRevision;
  delete next.variantId;
  delete next.prefabOverrides;
  return next;
}

function stripInstanceLocalFields(objectLike) {
  const next = stripPrefabLinkFields(objectLike);
  delete next.id;
  delete next.parentId;
  delete next.x;
  delete next.y;
  delete next.editorFolder;
  if (next.components && typeof next.components === 'object') {
    next.components = clone(next.components);
    delete next.components.Transform;
    if (Object.keys(next.components).length === 0) delete next.components;
  }
  return next;
}

function applyPrefabPatch(baseValue, patchValue) {
  if (patchValue === undefined) return clone(baseValue);
  if (isPrefabDeleteMarker(patchValue)) return undefined;
  if (Array.isArray(patchValue)) return clone(patchValue);
  if (!isPlainObject(patchValue)) return clone(patchValue);

  const base = isPlainObject(baseValue) ? clone(baseValue) : {};
  Object.keys(patchValue).forEach((key) => {
    const nextValue = applyPrefabPatch(base[key], patchValue[key]);
    if (nextValue === undefined && isPrefabDeleteMarker(patchValue[key])) {
      delete base[key];
    } else {
      base[key] = nextValue;
    }
  });
  return base;
}

function diffPrefabPatch(baseValue, nextValue) {
  if (Array.isArray(baseValue) || Array.isArray(nextValue)) {
    return JSON.stringify(baseValue) === JSON.stringify(nextValue) ? undefined : clone(nextValue);
  }
  if (isPlainObject(baseValue) && isPlainObject(nextValue)) {
    const patch = {};
    const keys = new Set([...Object.keys(baseValue), ...Object.keys(nextValue)]);
    keys.forEach((key) => {
      const hasBase = Object.prototype.hasOwnProperty.call(baseValue, key);
      const hasNext = Object.prototype.hasOwnProperty.call(nextValue, key);
      if (!hasNext) {
        if (hasBase) patch[key] = createPrefabDeleteMarker();
        return;
      }
      const childPatch = diffPrefabPatch(baseValue[key], nextValue[key]);
      if (childPatch !== undefined) patch[key] = childPatch;
    });
    return Object.keys(patch).length > 0 ? patch : undefined;
  }
  return JSON.stringify(baseValue) === JSON.stringify(nextValue) ? undefined : clone(nextValue);
}

function prefabVariantId(name, fallback) {
  return String(name || fallback || 'variant')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback || 'variant';
}

function normalizePrefabVariant(variant, index) {
  const source = variant && typeof variant === 'object' ? variant : {};
  const values = isPlainObject(source.values)
    ? clone(source.values)
    : (isPlainObject(source.patch) ? clone(source.patch) : {});
  const name = source.name || `Variant ${index + 1}`;
  return {
    id: source.id || `variant_${prefabVariantId(name, String(index + 1))}`,
    name,
    values,
  };
}

function collectProjectObjectsById(projectLike) {
  const map = new Map();
  const addObject = (obj) => {
    if (!obj || !obj.id) return;
    map.set(obj.id, obj);
  };
  (projectLike && Array.isArray(projectLike.objects) ? projectLike.objects : []).forEach(addObject);
  (projectLike && Array.isArray(projectLike.scenes) ? projectLike.scenes : []).forEach((scene) => {
    (scene && Array.isArray(scene.objects) ? scene.objects : []).forEach(addObject);
  });
  return map;
}

function getPrefabVariant(prefab, variantId) {
  if (!prefab || !variantId || !Array.isArray(prefab.variants)) return null;
  return prefab.variants.find((variant) => variant && variant.id === variantId) || null;
}

function getPrefabBaseComparable(prefab, variantId = null) {
  let base = stripInstanceLocalFields(prefab && prefab.baseObject ? prefab.baseObject : (prefab && prefab.object ? prefab.object : {}));
  const variant = getPrefabVariant(prefab, variantId);
  if (variant && isPlainObject(variant.values)) {
    base = applyPrefabPatch(base, variant.values);
  }
  return base || {};
}

function materializePrefabObject(prefab, objectLike) {
  if (!prefab || !objectLike || typeof objectLike !== 'object') return clone(objectLike || {});

  const source = clone(objectLike);
  let resolved = stripPrefabLinkFields(prefab.baseObject || prefab.object || {});
  const variant = getPrefabVariant(prefab, source.variantId);
  if (variant && isPlainObject(variant.values)) {
    resolved = applyPrefabPatch(resolved, variant.values) || {};
  }
  if (isPlainObject(source.prefabOverrides)) {
    resolved = applyPrefabPatch(resolved, source.prefabOverrides) || {};
  }

  const localTransform = source.components && source.components.Transform ? clone(source.components.Transform) : null;
  const transform = localTransform || (resolved.components && resolved.components.Transform ? clone(resolved.components.Transform) : null) || {
    x: Number.isFinite(source.x) ? source.x : 0,
    y: Number.isFinite(source.y) ? source.y : 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };
  const x = Number.isFinite(source.x) ? source.x : (Number.isFinite(transform.x) ? transform.x : 0);
  const y = Number.isFinite(source.y) ? source.y : (Number.isFinite(transform.y) ? transform.y : 0);

  resolved.id = source.id || resolved.id;
  resolved.prefabId = prefab.id;
  resolved.prefabRevision = prefab.revision;
  resolved.variantId = typeof source.variantId === 'string' && source.variantId ? source.variantId : null;
  resolved.prefabOverrides = isPlainObject(source.prefabOverrides) ? clone(source.prefabOverrides) : {};
  resolved.parentId = Object.prototype.hasOwnProperty.call(source, 'parentId') ? source.parentId : (resolved.parentId || null);
  resolved.editorFolder = source.editorFolder || resolved.editorFolder || 'Root';
  resolved.x = x;
  resolved.y = y;
  resolved.components = resolved.components && typeof resolved.components === 'object' ? resolved.components : {};
  resolved.components.Transform = {
    ...(resolved.components.Transform || {}),
    ...transform,
    x,
    y,
  };
  return resolved;
}

function derivePrefabOverrides(prefab, objectLike) {
  if (!prefab || !objectLike || typeof objectLike !== 'object') return {};
  const baseComparable = getPrefabBaseComparable(prefab, objectLike.variantId);
  const nextComparable = stripInstanceLocalFields(objectLike);
  const patch = diffPrefabPatch(baseComparable, nextComparable);
  return isPlainObject(patch) ? patch : {};
}

function clearPrefabOverridePath(prefabOverrides, path) {
  const source = isPlainObject(prefabOverrides) ? clone(prefabOverrides) : {};
  const segments = Array.isArray(path)
    ? path.map((segment) => String(segment || '').trim()).filter(Boolean)
    : String(path || '').split('.').map((segment) => segment.trim()).filter(Boolean);

  if (segments.length === 0) return source;

  function clearNode(node, depth) {
    if (!isPlainObject(node)) return node;
    const next = clone(node);
    const key = segments[depth];
    if (!Object.prototype.hasOwnProperty.call(next, key)) return next;
    if (depth >= segments.length - 1) {
      delete next[key];
      return next;
    }
    const child = clearNode(next[key], depth + 1);
    if (isPlainObject(child) && Object.keys(child).length > 0) next[key] = child;
    else delete next[key];
    return next;
  }

  const cleared = clearNode(source, 0);
  return isPlainObject(cleared) ? cleared : {};
}

function normalizePrefabRecord(prefab, objectById, index) {
  const source = prefab && typeof prefab === 'object' ? prefab : {};
  const previousBaseObject = stripPrefabLinkFields(source.baseObject || source.object || {});
  const sourceObject = source.sourceObjectId ? objectById.get(source.sourceObjectId) : null;
  const nextBaseObject = stripPrefabLinkFields(sourceObject || source.baseObject || source.object || {});
  const baseObject = Object.keys(nextBaseObject).length > 0 ? nextBaseObject : previousBaseObject;
  const sourceObjectId = source.sourceObjectId || baseObject.id || `obj_prefab_${index + 1}`;
  const revisionChanged = sourceObject
    && JSON.stringify(stripInstanceLocalFields(previousBaseObject || {})) !== JSON.stringify(stripInstanceLocalFields(baseObject || {}));
  const previousRevision = Number.isFinite(source.revision) ? Math.max(1, source.revision) : 1;
  const revision = revisionChanged ? previousRevision + 1 : previousRevision;
  const normalizedBaseObject = {
    ...baseObject,
    id: baseObject.id || sourceObjectId,
  };
  return {
    ...source,
    id: source.id || `prefab_${index + 1}`,
    name: source.name || `${normalizedBaseObject.name || normalizedBaseObject.type || 'Object'} Prefab`,
    sourceObjectId,
    revision,
    baseObject: normalizedBaseObject,
    object: clone(normalizedBaseObject),
    variants: Array.isArray(source.variants) ? source.variants.map(normalizePrefabVariant) : [],
  };
}

function createPrefabFromObject(sourceObject, options = {}) {
  const source = stripPrefabLinkFields(sourceObject || {});
  const prefabId = options.id || `prefab_${Date.now().toString(36)}`;
  return {
    id: prefabId,
    name: options.name || `${source.name || source.type || 'Object'} Prefab`,
    sourceObjectId: source.id || options.sourceObjectId || `obj_${prefabId}`,
    revision: Number.isFinite(options.revision) ? Math.max(1, options.revision) : 1,
    baseObject: source,
    object: clone(source),
    variants: Array.isArray(options.variants) ? options.variants.map(normalizePrefabVariant) : [],
  };
}

function createPrefabInstance(prefab, options = {}) {
  const baseObject = prefab && (prefab.baseObject || prefab.object) ? clone(prefab.baseObject || prefab.object) : {};
  const baseTransform = baseObject.components && baseObject.components.Transform ? clone(baseObject.components.Transform) : { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const x = Number.isFinite(options.x) ? options.x : (Number.isFinite(baseTransform.x) ? baseTransform.x : 0);
  const y = Number.isFinite(options.y) ? options.y : (Number.isFinite(baseTransform.y) ? baseTransform.y : 0);
  return materializePrefabObject(prefab, {
    ...baseObject,
    id: options.id || baseObject.id,
    parentId: options.parentId !== undefined ? options.parentId : null,
    editorFolder: options.editorFolder || 'Root',
    x,
    y,
    components: {
      ...(baseObject.components || {}),
      Transform: {
        ...baseTransform,
        x,
        y,
      },
    },
    prefabId: prefab && prefab.id ? prefab.id : null,
    prefabRevision: prefab && Number.isFinite(prefab.revision) ? prefab.revision : 1,
    variantId: typeof options.variantId === 'string' && options.variantId ? options.variantId : null,
    prefabOverrides: isPlainObject(options.prefabOverrides) ? clone(options.prefabOverrides) : {},
  });
}

function createPrefabVariantFromObject(prefab, objectLike, options = {}) {
  const source = objectLike && typeof objectLike === 'object' ? objectLike : null;
  if (!prefab || !source) return null;
  const name = String(options.name || '').trim() || `Variant ${(Array.isArray(prefab.variants) ? prefab.variants.length : 0) + 1}`;
  const id = options.id || `variant_${prefabVariantId(name, Date.now().toString(36))}`;
  const values = derivePrefabOverrides({
    ...prefab,
    variants: [],
  }, {
    ...source,
    variantId: null,
  });
  return {
    id,
    name,
    values,
  };
}

function normalizeProjectObject(objectLike, prefabById) {
  const sourceObject = objectLike && typeof objectLike === 'object' ? clone(objectLike) : {};
  const prefab = sourceObject.prefabId && prefabById ? prefabById.get(sourceObject.prefabId) : null;
  let obj = prefab ? sourceObject : stripPrefabLinkFields(sourceObject);

  if (prefab) {
    const isSourceObject = obj.id === prefab.sourceObjectId;
    obj.variantId = typeof obj.variantId === 'string' && obj.variantId && getPrefabVariant(prefab, obj.variantId) ? obj.variantId : null;
    const hasStoredOverrides = isPlainObject(obj.prefabOverrides);
    const isStaleMaterialization = Number.isFinite(obj.prefabRevision) && obj.prefabRevision < prefab.revision;
    obj.prefabOverrides = isSourceObject
      ? {}
      : (hasStoredOverrides
        ? (isStaleMaterialization ? clone(obj.prefabOverrides) : derivePrefabOverrides(prefab, obj))
        : (obj.variantId && !Number.isFinite(obj.prefabRevision) ? {} : derivePrefabOverrides(prefab, obj)));
    obj = materializePrefabObject(prefab, obj);
  }

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
  next.meta.resolution = normalizeResolution(next.meta.resolution);
  next.meta.display = normalizeDisplaySettings(next.meta.display);
  next.meta.renderMode = normalizeRenderMode(next.meta.renderMode, '2d');
  const shouldHydrateSingleScene = next.scenes.length === 1;
  next.scenes = next.scenes.map((scene, idx) => {
    const sceneId = scene.id || `scene_${idx}`;
    const worldSource = shouldHydrateSingleScene && shouldHydrateSingleSceneWorld(scene && scene.world, next.world)
      ? next.world
      : (scene.world || next.world);
    const objectSource = shouldHydrateSingleScene && shouldHydrateSingleSceneObjects(scene && scene.objects, next.objects)
      ? next.objects
      : (scene.objects || next.objects || []);
    const world = normalizeWorld(worldSource);
    const objects = ensureSceneObjects(sceneId, world, objectSource, scene && scene.lighting);
    return {
      id: sceneId,
      name: scene.name || `Scene ${idx + 1}`,
      renderMode: normalizeRenderMode(scene && scene.renderMode, next.meta.renderMode),
      world,
      objects,
    };
  });
  const objectById = collectProjectObjectsById(next);
  next.prefabs = next.prefabs.map((prefab, index) => normalizePrefabRecord(prefab, objectById, index));
  const prefabById = new Map(next.prefabs.map((prefab) => [prefab.id, prefab]));
  next.scenes = next.scenes.map((scene) => ({
    ...scene,
    objects: (scene.objects || []).map((obj) => normalizeProjectObject(obj, prefabById)),
  }));
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
    next.objects = next.objects.map((obj) => normalizeProjectObject(obj, prefabById));
  }

  if (Array.isArray(next.assets)) {
    next.assets = next.assets.map((asset) => ({
      ...asset,
      kind: asset.kind || (asset.url || asset.src ? 'image' : 'asset'),
    }));
  }

  return next;
}

function applyProjectPatch(project, patch, options = {}) {
  if (!project || typeof project !== 'object') return project;
  if (!patch || typeof patch !== 'object') return ensureProjectShape(project);

  const base = ensureProjectShape(project);
  const nextPatch = clone(patch);
  const targetSceneId = resolveProjectSceneId(base, options.sceneId);
  const patchTouchesWorld = Object.prototype.hasOwnProperty.call(nextPatch, 'world');
  const patchTouchesObjects = Object.prototype.hasOwnProperty.call(nextPatch, 'objects');

  let nextScenes = Array.isArray(nextPatch.scenes) ? clone(nextPatch.scenes) : clone(base.scenes || []);
  if ((patchTouchesWorld || patchTouchesObjects) && nextScenes.length > 0 && targetSceneId) {
    nextScenes = nextScenes.map((scene) => {
      if (!scene || scene.id !== targetSceneId) return scene;
      return {
        ...scene,
        ...(patchTouchesWorld ? { world: clone(nextPatch.world) } : {}),
        ...(patchTouchesObjects ? { objects: clone(nextPatch.objects) } : {}),
      };
    });
  }

  return ensureProjectShape({
    ...base,
    ...nextPatch,
    ...(nextScenes.length > 0 ? { scenes: nextScenes } : {}),
  });
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
  DEFAULT_RESOLUTION,
  DEFAULT_DISPLAY,
  DEFAULT_CAMERA,
  DEFAULT_SCENE_LIGHTING,
  DEFAULT_LIGHTING_MANAGER_COMPONENT,
  DEFAULT_LIGHT_COMPONENT,
  buildDisplayStageLayout,
  createPrefabFromObject,
  createPrefabInstance,
  createPrefabVariantFromObject,
  clearPrefabOverridePath,
  derivePrefabOverrides,
  ensureProjectShape,
  getProjectDisplaySettings,
  getProjectResolution,
  getPrefabVariant,
  materializePrefabObject,
  normalizeProjectObject,
  normalizeDisplaySettings,
  normalizeResolution,
  applyProjectPatch,
  normalizeCellTypeId,
  getCellType,
  getBrushValue,
};
