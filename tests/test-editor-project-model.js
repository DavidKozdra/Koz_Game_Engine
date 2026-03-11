/**
 * Regression tests for editor-side project scene synchronization.
 * Run with: node tests/test-editor-project-model.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS:', message);
  } else {
    failed += 1;
    console.error('  FAIL:', message);
  }
}

function createWorld(grid) {
  return {
    cols: Array.isArray(grid) && Array.isArray(grid[0]) ? grid[0].length : 0,
    rows: Array.isArray(grid) ? grid.length : 0,
    offsetX: 0,
    offsetY: 0,
    defaultCell: 'empty',
    grid,
    elements: [],
    meta: {},
  };
}

function createObject(id, name, x, y) {
  return {
    id,
    name,
    type: 'generic',
    x,
    y,
    components: {
      Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
      Sprite: { color: '#4ade80', width: 32, height: 32 },
      Collider: { shape: 'rect', width: 32, height: 32 },
      Collision: { enabled: true, isTrigger: false },
      RigidBody: { enabled: false, weight: 1, friction: 0.4 },
      Render: { layerId: 'obj-main', visible: true, zIndex: 0 },
      ScriptBindings: [],
      Animator: { clipId: null, autoplay: false },
    },
  };
}

async function loadProjectModel() {
  const modulePath = path.join(__dirname, '..', 'editor', 'src', 'renderer', 'state', 'projectModel.js');
  const source = fs.readFileSync(modulePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(moduleUrl);
}

async function main() {
  console.log('\n=== Editor Project Model Tests ===\n');

  const {
    buildDisplayStageLayout,
    ensureProjectShape,
    applyProjectPatch,
    clearPrefabOverridePath,
    createPrefabFromObject,
    createPrefabVariantFromObject,
    getProjectDisplaySettings,
    getProjectResolution,
    materializePrefabObject,
  } = await loadProjectModel();

  const singleSceneRaw = {
    schemaVersion: 1,
    meta: { name: 'Single Scene Repair', resolution: { width: 960, height: 540 }, renderMode: '2d' },
    world: createWorld([
      ['empty', 'solid', 'solid', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ]),
    objects: [createObject('obj_player', 'Player', 24, 24)],
    scenes: [{
      id: 'scene_main',
      name: 'Main Scene',
      renderMode: '2d',
      world: createWorld([
        ['empty', 'empty', 'empty', 'empty'],
        ['empty', 'empty', 'empty', 'empty'],
        ['empty', 'empty', 'empty', 'empty'],
      ]),
      objects: [],
    }],
    activeSceneId: 'scene_main',
    animations: [],
    scripts: [],
    assets: [],
  };

  const repairedSingleScene = ensureProjectShape(singleSceneRaw);
  assert(
    repairedSingleScene.scenes[0].objects.some((obj) => obj && obj.name === 'Player'),
    'single-scene load hydrates top-level objects into an empty scene copy'
  );
  assert(
    repairedSingleScene.scenes[0].world.grid.some((row) => Array.isArray(row) && row.some((cell) => cell === 'solid')),
    'single-scene load hydrates top-level world tiles into an empty scene copy'
  );

  const displayProject = ensureProjectShape({
    schemaVersion: 1,
    meta: {
      name: 'Display Normalization',
      resolution: { width: 1280.4, height: 0 },
      display: { scaleMode: 'cover', allowFullscreen: false, showFullscreenButton: true, backgroundColor: ' #123456 ' },
    },
    scenes: [{
      id: 'scene_display',
      name: 'Display Scene',
      renderMode: '2d',
      world: createWorld([['empty']]),
      objects: [],
    }],
    activeSceneId: 'scene_display',
    animations: [],
    scripts: [],
    assets: [],
  });
  const normalizedResolution = getProjectResolution(displayProject);
  const normalizedDisplay = getProjectDisplaySettings(displayProject);
  const containLayout = buildDisplayStageLayout(1000, 800, { width: 400, height: 200 }, { scaleMode: 'contain' });

  assert(normalizedResolution.width === 1280, 'project resolution width is normalized to a positive integer');
  assert(normalizedResolution.height === 540, 'invalid resolution height falls back to the default canvas height');
  assert(normalizedDisplay.scaleMode === 'cover', 'display scale mode is normalized from project metadata');
  assert(normalizedDisplay.allowFullscreen === false, 'display fullscreen flag is preserved');
  assert(normalizedDisplay.showFullscreenButton === false, 'fullscreen button is disabled when fullscreen support is disabled');
  assert(normalizedDisplay.backgroundColor === '#123456', 'display background color is trimmed and preserved');
  assert(containLayout.width === 1000 && containLayout.height === 500, 'contain stage layout preserves aspect ratio inside the available viewport');

  const multiSceneBase = ensureProjectShape({
    schemaVersion: 1,
    meta: { name: 'Patch Scene', resolution: { width: 960, height: 540 }, renderMode: '2d' },
    scenes: [{
      id: 'scene_a',
      name: 'Scene A',
      renderMode: '2d',
      world: createWorld([
        ['solid', 'solid'],
        ['empty', 'empty'],
      ]),
      objects: [createObject('obj_a', 'Box A', 0, 0)],
    }, {
      id: 'scene_b',
      name: 'Scene B',
      renderMode: '2d',
      world: createWorld([
        ['empty', 'empty'],
        ['empty', 'empty'],
      ]),
      objects: [createObject('obj_b', 'Box B', 24, 24)],
    }],
    activeSceneId: 'scene_a',
    animations: [],
    scripts: [],
    assets: [],
  });

  const newSceneBObject = createObject('obj_b2', 'Box B2', 48, 48);
  const patchedMultiScene = applyProjectPatch(multiSceneBase, {
    objects: [newSceneBObject],
  }, { sceneId: 'scene_b' });

  const patchedSceneA = patchedMultiScene.scenes.find((scene) => scene.id === 'scene_a');
  const patchedSceneB = patchedMultiScene.scenes.find((scene) => scene.id === 'scene_b');

  assert(
    patchedSceneB && patchedSceneB.objects.some((obj) => obj && obj.id === 'obj_b2'),
    'scene-targeted object patch updates the requested scene'
  );
  assert(
    patchedSceneA && !patchedSceneA.objects.some((obj) => obj && obj.id === 'obj_b2'),
    'scene-targeted object patch does not leak into other scenes'
  );
  assert(
    patchedMultiScene.objects.some((obj) => obj && obj.id === 'obj_a'),
    'top-level objects still mirror the active scene after patching a different scene'
  );

  const prefabSource = createObject('obj_enemy_source', 'Enemy Source', 24, 24);
  prefabSource.components.Sprite.color = '#22c55e';
  prefabSource.components.Sprite.width = 32;
  prefabSource.components.Collider.width = 32;
  const prefabInstance = JSON.parse(JSON.stringify(prefabSource));
  prefabInstance.id = 'obj_enemy_instance';
  prefabInstance.prefabId = 'prefab_enemy';
  prefabInstance.x = 96;
  prefabInstance.y = 120;
  prefabInstance.components.Transform.x = 96;
  prefabInstance.components.Transform.y = 120;

  const prefabBaseProject = ensureProjectShape({
    schemaVersion: 1,
    meta: { name: 'Prefab Sync', resolution: { width: 960, height: 540 }, renderMode: '2d' },
    scenes: [{
      id: 'scene_prefab',
      name: 'Prefab Scene',
      renderMode: '2d',
      world: createWorld([
        ['empty', 'empty'],
        ['empty', 'empty'],
      ]),
      objects: [prefabSource, prefabInstance],
    }],
    activeSceneId: 'scene_prefab',
    prefabs: [{
      id: 'prefab_enemy',
      name: 'Enemy Prefab',
      sourceObjectId: 'obj_enemy_source',
      object: JSON.parse(JSON.stringify(prefabSource)),
    }],
    animations: [],
    scripts: [],
    assets: [],
  });

  const migratedPrefab = prefabBaseProject.prefabs.find((prefab) => prefab.id === 'prefab_enemy');
  const migratedInstance = prefabBaseProject.scenes[0].objects.find((obj) => obj.id === 'obj_enemy_instance');
  assert(
    migratedPrefab && migratedPrefab.baseObject && migratedPrefab.baseObject.id === 'obj_enemy_source',
    'prefab migration promotes legacy prefab.object snapshots into baseObject'
  );
  assert(
    migratedInstance && migratedInstance.prefabRevision === migratedPrefab.revision,
    'linked prefab instances track the normalized prefab revision'
  );

  const syncedPrefabProject = ensureProjectShape({
    ...prefabBaseProject,
    scenes: prefabBaseProject.scenes.map((scene) => ({
      ...scene,
      objects: scene.objects.map((obj) => {
        if (obj.id !== 'obj_enemy_source') return obj;
        return {
          ...obj,
          components: {
            ...obj.components,
            Sprite: {
              ...obj.components.Sprite,
              color: '#ef4444',
              width: 48,
            },
            Collider: {
              ...obj.components.Collider,
              width: 48,
            },
          },
        };
      }),
    })),
  });
  const syncedInstance = syncedPrefabProject.scenes[0].objects.find((obj) => obj.id === 'obj_enemy_instance');
  assert(
    syncedInstance && syncedInstance.components.Sprite.color === '#ef4444' && syncedInstance.components.Sprite.width === 48,
    'editing a prefab source object syncs non-overridden fields to linked instances'
  );
  assert(
    syncedInstance && syncedInstance.x === 96 && syncedInstance.components.Transform.x === 96 && syncedInstance.y === 120 && syncedInstance.components.Transform.y === 120,
    'linked instances keep local transform values while prefab source data syncs'
  );

  const overridePrefabProject = ensureProjectShape({
    ...prefabBaseProject,
    scenes: prefabBaseProject.scenes.map((scene) => ({
      ...scene,
      objects: scene.objects.map((obj) => {
        if (obj.id !== 'obj_enemy_instance') return obj;
        return {
          ...obj,
          components: {
            ...obj.components,
            Sprite: {
              ...obj.components.Sprite,
              color: '#f97316',
            },
          },
        };
      }),
    })),
  });
  const overrideTrackedInstance = overridePrefabProject.scenes[0].objects.find((obj) => obj.id === 'obj_enemy_instance');
  assert(
    overrideTrackedInstance && overrideTrackedInstance.prefabOverrides
      && overrideTrackedInstance.prefabOverrides.components
      && overrideTrackedInstance.prefabOverrides.components.Sprite
      && overrideTrackedInstance.prefabOverrides.components.Sprite.color === '#f97316',
    'linked prefab instance edits are captured as prefabOverrides'
  );

  const overridePreservedProject = ensureProjectShape({
    ...overridePrefabProject,
    scenes: overridePrefabProject.scenes.map((scene) => ({
      ...scene,
      objects: scene.objects.map((obj) => {
        if (obj.id !== 'obj_enemy_source') return obj;
        return {
          ...obj,
          components: {
            ...obj.components,
            Sprite: {
              ...obj.components.Sprite,
              color: '#6366f1',
              width: 56,
            },
            Collider: {
              ...obj.components.Collider,
              width: 56,
            },
          },
        };
      }),
    })),
  });
  const preservedInstance = overridePreservedProject.scenes[0].objects.find((obj) => obj.id === 'obj_enemy_instance');
  assert(
    preservedInstance && preservedInstance.components.Sprite.color === '#f97316' && preservedInstance.components.Sprite.width === 56,
    'prefab source sync preserves explicit instance overrides while still updating inherited fields'
  );

  const clearedOverrideProject = ensureProjectShape({
    ...overridePrefabProject,
    scenes: overridePrefabProject.scenes.map((scene) => ({
      ...scene,
      objects: scene.objects.map((obj) => {
        if (obj.id !== 'obj_enemy_instance') return obj;
        const prefab = overridePrefabProject.prefabs.find((entry) => entry.id === obj.prefabId);
        const nextOverrides = clearPrefabOverridePath({
          ...obj.prefabOverrides,
          components: {
            ...(obj.prefabOverrides && obj.prefabOverrides.components),
            Sprite: {
              ...((obj.prefabOverrides && obj.prefabOverrides.components && obj.prefabOverrides.components.Sprite) || {}),
              width: 40,
            },
          },
        }, 'components.Sprite.color');
        return {
          ...materializePrefabObject(prefab, { ...obj, prefabOverrides: nextOverrides }),
          prefabOverrides: nextOverrides,
        };
      }),
    })),
  });
  const clearedOverrideInstance = clearedOverrideProject.scenes[0].objects.find((obj) => obj.id === 'obj_enemy_instance');
  assert(
    clearedOverrideInstance && clearedOverrideInstance.components.Sprite.color === '#22c55e' && clearedOverrideInstance.components.Sprite.width === 40,
    'clearing a single prefab override path restores that inherited value without dropping sibling overrides'
  );

  const variantSource = createObject('obj_pickup_source', 'Pickup', 0, 0);
  variantSource.components.Sprite.color = '#60a5fa';
  const variantPrefab = createPrefabFromObject(variantSource, { id: 'prefab_pickup', name: 'Pickup Prefab' });
  const variantDraft = {
    ...JSON.parse(JSON.stringify(variantSource)),
    id: 'obj_pickup_variant_draft',
    prefabId: variantPrefab.id,
    components: {
      ...JSON.parse(JSON.stringify(variantSource.components)),
      Sprite: {
        ...JSON.parse(JSON.stringify(variantSource.components.Sprite)),
        color: '#f59e0b',
      },
      RigidBody: {
        ...JSON.parse(JSON.stringify(variantSource.components.RigidBody)),
        enabled: true,
        weight: 3,
      },
    },
  };
  const variant = createPrefabVariantFromObject(variantPrefab, variantDraft, { name: 'Heavy Orange' });
  const variantProject = ensureProjectShape({
    schemaVersion: 1,
    meta: { name: 'Prefab Variant', resolution: { width: 960, height: 540 }, renderMode: '2d' },
    scenes: [{
      id: 'scene_variant',
      name: 'Variant Scene',
      renderMode: '2d',
      world: createWorld([
        ['empty', 'empty'],
        ['empty', 'empty'],
      ]),
      objects: [{
        ...JSON.parse(JSON.stringify(variantSource)),
        id: 'obj_pickup_variant',
        prefabId: variantPrefab.id,
        variantId: variant.id,
        x: 48,
        y: 72,
        components: {
          ...JSON.parse(JSON.stringify(variantSource.components)),
          Transform: {
            ...JSON.parse(JSON.stringify(variantSource.components.Transform)),
            x: 48,
            y: 72,
          },
        },
      }],
    }],
    activeSceneId: 'scene_variant',
    prefabs: [{
      ...variantPrefab,
      variants: [variant],
    }],
    animations: [],
    scripts: [],
    assets: [],
  });
  const variantInstance = variantProject.scenes[0].objects.find((obj) => obj.id === 'obj_pickup_variant');
  assert(
    variantInstance && variantInstance.components.Sprite.color === '#f59e0b' && variantInstance.components.RigidBody.weight === 3,
    'prefab variants materialize their values onto linked instances'
  );

  console.log('\n=== Results ===\n');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('\nAll editor project model tests passed!\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
