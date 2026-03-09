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
    image: null,
    collision: false,
    layerId: 'cell-base',
    rigidBody: { enabled: false, weight: 0, friction: 0 },
  },
  {
    id: 'solid',
    name: 'Solid',
    color: '#334155',
    image: null,
    collision: true,
    layerId: 'cell-base',
    rigidBody: { enabled: true, weight: 1, friction: 0.8 },
  },
  {
    id: 'hazard',
    name: 'Hazard',
    color: '#7f1d1d',
    image: null,
    collision: true,
    layerId: 'cell-detail',
    rigidBody: { enabled: false, weight: 0, friction: 0 },
  },
];

const DEFAULT_CLASSES = [
  { id: 'generic', name: 'Generic Object', baseType: 'generic' },
  { id: 'sprite', name: 'Sprite Object', baseType: 'sprite' },
  { id: 'animator', name: 'Animator Object', baseType: 'animator' },
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

const DEFAULT_CAMERA = {
  targetObjectId: null,
  speed: 8,
  zoom: 1,
  minZoom: 0.25,
  maxZoom: 4,
};

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function defaultSceneFromProject(projectLike) {
  const base = projectLike || {};
  return {
    id: 'scene_main',
    name: 'Main Scene',
    world: clone(base.world || { cols: 30, rows: 20, defaultCell: null, grid: [], elements: [], meta: {} }),
    objects: clone(base.objects || []),
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
  next.scenes = next.scenes.map((scene, idx) => ({
    id: scene.id || `scene_${idx}`,
    name: scene.name || `Scene ${idx + 1}`,
    world: clone(scene.world || next.world),
    objects: clone(scene.objects || next.objects || []),
  }));
  if (!next.activeSceneId) next.activeSceneId = next.scenes[0].id;
  const activeScene = next.scenes.find((s) => s.id === next.activeSceneId) || next.scenes[0];
  if (activeScene) {
    next.world = clone(activeScene.world || next.world);
    next.objects = clone(activeScene.objects || next.objects || []);
  }
  if (!Array.isArray(next.sceneFolders)) next.sceneFolders = ['Root'];
  if (!Array.isArray(next.assetFolders)) next.assetFolders = ['Root'];
  if (!Array.isArray(next.defaultClasses)) next.defaultClasses = clone(DEFAULT_CLASSES);
  if (!next.build || typeof next.build !== 'object') next.build = clone(DEFAULT_BUILD);
  next.build = { ...clone(DEFAULT_BUILD), ...next.build, targets: { ...DEFAULT_BUILD.targets, ...(next.build.targets || {}) } };
  if (!next.camera || typeof next.camera !== 'object') next.camera = clone(DEFAULT_CAMERA);
  next.camera = { ...clone(DEFAULT_CAMERA), ...next.camera };
  if (!Array.isArray(next.plugins)) next.plugins = [];
  if (!next.scripting || typeof next.scripting !== 'object') {
    next.scripting = { engines: { javascript: true, lua: false, python: false } };
  }
  if (!next.scripting.engines) next.scripting.engines = { javascript: true, lua: false, python: false };
  next.scripting.engines = { javascript: true, lua: false, python: false, ...next.scripting.engines };

  if (next.world && Array.isArray(next.world.grid)) {
    next.world.grid = next.world.grid.map((row) => (Array.isArray(row) ? row.slice() : []));
  }

  if (Array.isArray(next.objects)) {
    next.objects = next.objects.map((obj) => {
      const components = obj.components || {};
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
  ensureProjectShape,
  normalizeCellTypeId,
  getCellType,
  getBrushValue,
};
