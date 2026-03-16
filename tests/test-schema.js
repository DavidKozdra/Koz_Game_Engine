/**
 * Quick validation test for project schema, adapters, and runtime.
 * Run with: node tests/test-schema.js
 */

const projectSchema = require('../Koz_Engine_Lib/Project/projectSchema');
const projectAdapters = require('../Koz_Engine_Lib/Project/projectAdapters');
const worldSpaceLib = require('../Koz_Engine_Lib/World/worldSpace');
const gameObjectLib = require('../Koz_Engine_Lib/Core/GameObject');
const gameRuntimeLib = require('../Koz_Engine_Lib/Runtime/gameRuntime');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

console.log('\n=== Project Schema Tests ===\n');

// Test 1: Create default project
const project = projectSchema.createDefaultProject({ name: 'Test Game', cols: 10, rows: 8 });
assert(project.schemaVersion === 1, 'schemaVersion is 1');
assert(project.meta.name === 'Test Game', 'project name is set');
assert(project.world.cols === 10, 'world cols is 10');
assert(project.world.rows === 8, 'world rows is 8');
assert(project.world.grid.length === 8, 'grid has 8 rows');
assert(project.world.grid[0].length === 10, 'grid row has 10 cols');
assert(Array.isArray(project.objects), 'objects is array');
assert(project.objects.some((entry) => entry && entry.components && entry.components.Camera), 'default project includes a camera object');
assert(project.objects.some((entry) => entry && entry.type === 'player'), 'default project includes a starter player object');
assert(Array.isArray(project.scenes), 'scenes is array');
assert(project.scenes.length === 1, 'default project has one scene');
assert(project.activeSceneId === project.scenes[0].id, 'activeSceneId points at default scene');
assert(project.scenes[0].renderMode === '2d', 'default scene render mode is 2d');
assert(project.scenes[0].world === project.world, 'top-level world aliases active scene world');
assert(project.scenes[0].objects === project.objects, 'top-level objects alias active scene objects');
assert(project.world.grid.some((row) => Array.isArray(row) && row.some((cell) => cell === 'solid')), 'default project includes starter terrain');
assert(Array.isArray(project.scripts), 'scripts is array');
assert(Array.isArray(project.animations), 'animations is array');

// Test 2: Validate
const result = projectSchema.validate(project);
assert(result.valid === true, 'default project validates');
assert(result.errors.length === 0, 'no validation errors');

// Test 3: Validate bad project
const badResult = projectSchema.validate({ schemaVersion: 99 });
assert(badResult.valid === false, 'bad project fails validation');
assert(badResult.errors.length > 0, 'has validation errors');

// Test 4: Migrate
const migrated = projectSchema.migrate({ cols: 5, rows: 5, grid: [[1,2],[3,4]], elements: [] });
assert(migrated.schemaVersion === 1, 'migrated to v1');
assert(migrated.world.cols === 5, 'preserved cols');
assert(Array.isArray(migrated.scenes) && migrated.scenes.length === 1, 'legacy project migrated to one scene');
assert(migrated.activeSceneId === migrated.scenes[0].id, 'migrated project has active scene');
assert(migrated.scenes[0].renderMode === '2d', 'migrated legacy scene gets a default render mode');
assert(migrated.scenes[0].objects.some((entry) => entry && entry.components && entry.components.Camera), 'migrated scene gets a camera object');
assert(!migrated.scenes[0].lighting, 'migrated legacy scene does not carry scene lighting metadata by default');

const migratedLightingProject = projectSchema.migrate({
  schemaVersion: 1,
  meta: { name: 'Lit Legacy', resolution: { width: 960, height: 540 }, renderMode: '2d' },
  world: project.world,
  objects: [],
  scenes: [{
    id: 'scene_main',
    name: 'Main Scene',
    renderMode: '2d',
    lighting: { enabled: true, ambientColor: '#111827', ambientIntensity: 0.2, overlayOpacity: 0.7, fogColor: '#020617', fogDensity: 0.4 },
    world: project.world,
    objects: [],
  }],
  activeSceneId: 'scene_main',
  animations: [],
  scripts: [],
  assets: [],
  build: { profile: 'web-prod' },
  settings: {},
});
const migratedLightingManager = migratedLightingProject.scenes[0].objects.find((entry) => entry.components && entry.components.LightingManager);
assert(!!migratedLightingManager, 'legacy scene lighting migrates into a LightingManager object');
assert(!migratedLightingProject.scenes[0].lighting, 'legacy scene lighting metadata is stripped after migration');
assert(migratedLightingManager.components.LightingManager.mode === 'pixel', 'migrated lighting manager defaults to pixel lighting mode');
assert(migratedLightingManager.components.LightingManager.flicker === false, 'migrated lighting manager defaults flicker off');
assert(migratedLightingManager.components.LightingManager.volumetric === false, 'migrated lighting manager defaults volumetric off');
assert(migratedLightingManager.components.LightingManager.fogBoost === 0, 'migrated lighting manager defaults fog boost to 0');
assert(migratedLightingManager.components.LightingManager.dither === false, 'migrated lighting manager defaults dither off');
assert(migratedLightingManager.components.LightingManager.vignette === 0, 'migrated lighting manager defaults vignette to 0');
assert(migratedLightingManager.components.LightingManager.colorPreset === 'none', 'migrated lighting manager defaults to no color preset');

// Test 5: Create game object
const obj = projectSchema.createGameObject('Player', 10, 20, { color: '#ff0000' });
assert(obj.name === 'Player', 'object name');
assert(obj.components.Transform.x === 10, 'transform x');
assert(obj.components.Sprite.color === '#ff0000', 'sprite color');
const lightObj = projectSchema.createGameObject('Lamp', 30, 40, { type: 'light' });
assert(lightObj.components.Light && lightObj.components.Light.enabled === true, 'light object includes Light component');
assert(lightObj.components.Collider.shape === 'circle', 'light object uses circle collider');
const lightingManagerObj = projectSchema.createGameObject('Lighting Manager', 0, 0, { type: 'lighting_manager' });
assert(lightingManagerObj.components.LightingManager, 'lighting manager object includes LightingManager component');
assert(lightingManagerObj.components.LightingManager.mode === 'pixel', 'lighting manager object defaults to pixel lighting mode');
assert(lightingManagerObj.components.LightingManager.flicker === false, 'lighting manager object defaults flicker off');
assert(lightingManagerObj.components.LightingManager.volumetric === false, 'lighting manager object defaults volumetric off');
assert(lightingManagerObj.components.LightingManager.fogBoost === 0, 'lighting manager object defaults fog boost to 0');
assert(lightingManagerObj.components.LightingManager.dither === false, 'lighting manager object defaults dither off');
assert(lightingManagerObj.components.LightingManager.vignette === 0, 'lighting manager object defaults vignette to 0');
assert(lightingManagerObj.components.LightingManager.colorPreset === 'none', 'lighting manager object defaults to no color preset');
assert(lightingManagerObj.components.Render.visible === false, 'lighting manager object is hidden by default');

// Test 6: Create script
const script = projectSchema.createScript('MyScript');
assert(script.name === 'MyScript', 'script name');
assert(script.source.includes('onInit'), 'has onInit template');
const cssScript = projectSchema.createScript('HudTheme', null, { language: 'css' });
assert(cssScript.filePath.endsWith('.css'), 'css script uses .css extension');
assert(cssScript.language === 'css', 'css script language is css');

// Test 7: Create animation clip
const clip = projectSchema.createAnimationClip('Walk', { duration: 2 });
assert(clip.name === 'Walk', 'clip name');
assert(clip.duration === 2, 'clip duration');
assert(clip.loop === true, 'clip loops by default');

console.log('\n=== Adapter Tests ===\n');

// Test 8: WorldSpace round-trip
const ws = worldSpaceLib.createWorldSpace({ cols: 5, rows: 5, defaultCell: 0 });
ws.setCell(2, 3, 7);
ws.addElement({ kind: 'spawn', x: 1, y: 1 });
const serialized = projectAdapters.worldSpaceToProject(ws);
assert(serialized.cols === 5, 'serialized cols');
assert(serialized.grid[3][2] === 7, 'serialized cell value');

const restored = projectAdapters.projectToWorldSpace(worldSpaceLib.createWorldSpace, serialized);
assert(restored.cols === 5, 'restored cols');
assert(restored.getCell(2, 3) === 7, 'restored cell value');
assert(restored.listElements().length === 1, 'restored elements');

// Test 9: GameObject adapters
const projectObjs = [projectSchema.createGameObject('Hero', 50, 100)];
const goInstances = projectAdapters.projectToGameObjects(gameObjectLib.GameObject, projectObjs);
assert(goInstances.length === 1, 'created 1 game object');
assert(goInstances[0].x === 50, 'game object x');
assert(goInstances[0].meta.name === 'Hero', 'game object name in meta');
goInstances[0].meta.components.Transform.x = 999;
assert(projectObjs[0].components.Transform.x === 50, 'adapter clones component data for runtime objects');

const backToProject = projectAdapters.gameObjectToProject(goInstances[0]);
assert(backToProject.name === 'Hero', 'round-tripped name');
assert(backToProject.components.Transform.x === 50, 'round-tripped transform');

console.log('\n=== Runtime Tests ===\n');

// Test 10: Game runtime
const runtime = gameRuntimeLib.createGameRuntime({
  createWorldSpace: worldSpaceLib.createWorldSpace,
  GameObject: gameObjectLib.GameObject,
  adapters: projectAdapters,
});

const testProject = projectSchema.createDefaultProject({ name: 'Runtime Test', cols: 5, rows: 5 });
const runtimePlayerObject = testProject.scenes[0].objects.find((entry) => entry && entry.type === 'player');
const runtimePlayerSourceId = runtimePlayerObject && runtimePlayerObject.id ? runtimePlayerObject.id : 'obj_player';
if (runtimePlayerObject) {
  const runtimePlayerPrefabSource = JSON.parse(JSON.stringify(runtimePlayerObject));
  runtimePlayerObject.id = 'obj_player_instance';
  runtimePlayerObject.name = 'Runner Prefab';
  runtimePlayerObject.prefabId = 'prefab_player';
  testProject.prefabs = [{
    id: 'prefab_player',
    name: 'Runner Prefab',
    sourceObjectId: runtimePlayerSourceId,
    object: runtimePlayerPrefabSource,
  }];
}
const runtimeTestObject = projectSchema.createGameObject('TestObj', 0, 0);
const runtimeLookupProbe = projectSchema.createGameObject('LookupProbe', 12, 0);
const runtimeNamedLookup = projectSchema.createGameObject('Player', 24, 0, { type: 'hero_named' });
const runtimeIdDecoy = projectSchema.createGameObject('ID Decoy', 36, 0, { type: 'decoy' });
const checkpointA = projectSchema.createGameObject('Checkpoint A', 48, 0, { type: 'checkpoint' });
const checkpointB = projectSchema.createGameObject('Checkpoint B', 60, 0, { type: 'checkpoint' });
runtimeIdDecoy.id = 'Player';
testProject.scenes[0].objects.push(runtimeTestObject);
testProject.scenes[0].objects.push(runtimeLookupProbe);
testProject.scenes[0].objects.push(runtimeNamedLookup);
testProject.scenes[0].objects.push(runtimeIdDecoy);
testProject.scenes[0].objects.push(checkpointA);
testProject.scenes[0].objects.push(checkpointB);
testProject.scripts.push({
  id: 'test_script',
  name: 'TestScript',
  source: 'function onInit(self, engine) { self.initCalled = true; }\nfunction onUpdate(self, engine, dt) { self.x += 1; }',
});
testProject.scripts.push({
  id: 'lookup_script',
  name: 'LookupScript',
  source: `function onInit(self, engine) {
    var byName = engine && typeof engine.findObject === 'function' ? engine.findObject('Player') : null;
    var byIdFallback = engine && typeof engine.findObject === 'function' ? engine.findObject('${runtimeNamedLookup.id}') : null;
    var bySourceId = engine && typeof engine.findObjectById === 'function' ? engine.findObjectById('${runtimePlayerSourceId}') : null;
    var byPrefabId = engine && typeof engine.findObjectById === 'function' ? engine.findObjectById('prefab_player') : null;
    var byTypeFallback = engine && typeof engine.findObject === 'function' ? engine.findObject('checkpoint') : null;
    var byTypeMethod = engine && typeof engine.findObjectByType === 'function' ? engine.findObjectByType('CHECKPOINT') : null;
    var byTypeList = engine && typeof engine.findObjectsByType === 'function' ? engine.findObjectsByType('CHECKPOINT') : [];
    self.lookupByName = !!(byName && byName.id === '${runtimeNamedLookup.id}');
    self.lookupByIdFallback = !!(byIdFallback && byIdFallback.id === '${runtimeNamedLookup.id}');
    self.lookupBySourceId = !!(bySourceId && bySourceId.meta && bySourceId.meta.prefabId === 'prefab_player');
    self.lookupByPrefabId = !!(byPrefabId && byPrefabId.meta && byPrefabId.meta.prefabId === 'prefab_player');
    self.lookupByTypeFallback = !!(byTypeFallback && byTypeFallback.type === 'checkpoint');
    self.lookupByTypeMethod = !!(byTypeMethod && byTypeMethod.type === 'checkpoint');
    self.lookupByTypeCount = Array.isArray(byTypeList) ? byTypeList.length : 0;
  }`,
});
runtimeTestObject.components.ScriptBinding.scriptId = 'test_script';
runtimeLookupProbe.components.ScriptBinding.scriptId = 'lookup_script';

runtime.loadProject(testProject);
assert(runtime.worldSpace.cols === 5, 'runtime world loaded');
assert(runtime.gameObjects.some((entry) => entry && entry.type === 'camera'), 'runtime preserves the default camera');
assert(runtime.gameObjects.some((entry) => entry && entry.meta && entry.meta.name === 'TestObj'), 'runtime has the test object');
assert(runtime.activeSceneId === testProject.activeSceneId, 'runtime tracks active scene');

runtime.init();
assert(runtime.running === true, 'runtime is running');

// Simulate a few frames
runtime.update(0.016);
runtime.update(0.016);
runtime.update(0.016);
const liveRuntimeObject = runtime.gameObjects.find((entry) => entry && entry.meta && entry.meta.name === 'TestObj');
const liveLookupProbe = runtime.gameObjects.find((entry) => entry && entry.meta && entry.meta.name === 'LookupProbe');
assert(liveRuntimeObject && liveRuntimeObject.x === 3, 'script moved object 3 units');
assert(liveLookupProbe && liveLookupProbe.lookupByName === true, 'runtime findObject prioritizes object names');
assert(liveLookupProbe && liveLookupProbe.lookupByIdFallback === true, 'runtime findObject falls back to ids when name misses');
assert(liveLookupProbe && liveLookupProbe.lookupBySourceId === true, 'runtime findObject resolves prefab source object ids');
assert(liveLookupProbe && liveLookupProbe.lookupByPrefabId === true, 'runtime findObject resolves prefab ids');
assert(liveLookupProbe && liveLookupProbe.lookupByTypeFallback === true, 'runtime findObject falls back to type lookups');
assert(liveLookupProbe && liveLookupProbe.lookupByTypeMethod === true, 'runtime exposes a findObjectByType helper');
assert(liveLookupProbe && liveLookupProbe.lookupByTypeCount === 2, 'runtime type queries return all objects of a type');
assert(runtimeTestObject.components.Transform.x === 0, 'runtime updates do not mutate source project object transforms');

runtime.stop();
assert(runtime.running === false, 'runtime stopped');

console.log('\n=== Results ===\n');
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('\nAll tests passed!\n');
