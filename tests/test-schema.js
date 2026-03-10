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

// Test 5: Create game object
const obj = projectSchema.createGameObject('Player', 10, 20, { color: '#ff0000' });
assert(obj.name === 'Player', 'object name');
assert(obj.components.Transform.x === 10, 'transform x');
assert(obj.components.Sprite.color === '#ff0000', 'sprite color');

// Test 6: Create script
const script = projectSchema.createScript('MyScript');
assert(script.name === 'MyScript', 'script name');
assert(script.source.includes('onInit'), 'has onInit template');

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
testProject.objects.push(projectSchema.createGameObject('TestObj', 0, 0));
testProject.scripts.push({
  id: 'test_script',
  name: 'TestScript',
  source: 'function onInit(self, engine) { self.initCalled = true; }\nfunction onUpdate(self, engine, dt) { self.x += 1; }',
});
testProject.objects[0].components.ScriptBinding.scriptId = 'test_script';

runtime.loadProject(testProject);
assert(runtime.worldSpace.cols === 5, 'runtime world loaded');
assert(runtime.gameObjects.length === 1, 'runtime has 1 object');

runtime.init();
assert(runtime.running === true, 'runtime is running');

// Simulate a few frames
runtime.update(0.016);
runtime.update(0.016);
runtime.update(0.016);
assert(runtime.gameObjects[0].x === 3, 'script moved object 3 units');

runtime.stop();
assert(runtime.running === false, 'runtime stopped');

console.log('\n=== Results ===\n');
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('\nAll tests passed!\n');
