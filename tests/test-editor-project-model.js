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
    ensureProjectShape,
    applyProjectPatch,
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

  console.log('\n=== Results ===\n');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('\nAll editor project model tests passed!\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
