/**
 * Validates discoverable template projects under projects/.
 * Run with: node tests/test-template-projects.js
 */

const fs = require('fs');
const path = require('path');
const projectSchema = require('../Koz_Engine_Lib/Project/projectSchema');

const projectsRoot = path.join(__dirname, '..', 'projects');
const entries = fs.readdirSync(projectsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(projectsRoot, entry.name, 'project.json'))
  .filter((filePath) => fs.existsSync(filePath))
  .sort();

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

console.log('\n=== Template Project Tests ===\n');

assert(entries.length === 3, 'three template projects are present');

entries.forEach((filePath) => {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const project = projectSchema.migrate(raw);
  const result = projectSchema.validate(project);
  const name = project.meta && project.meta.name ? project.meta.name : path.basename(path.dirname(filePath));
  assert(result.valid, `${name} validates`);
  assert(Array.isArray(project.scenes) && project.scenes.length >= 2, `${name} includes at least two scenes`);
  assert(typeof project.activeSceneId === 'string' && project.activeSceneId.length > 0, `${name} has an active scene`);
  assert(Array.isArray(project.objects) && project.objects.length > 0, `${name} exposes active-scene objects at top level`);
  assert(Array.isArray(project.scripts) && project.scripts.length > 0, `${name} includes script assets`);
  if (name === 'Template - 3D FPS Shell') {
    assert(project.meta && project.meta.renderMode === 'webgl-3d', `${name} opts into WebGL 3D play mode`);
  }
});

console.log('\n=== Results ===\n');
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('\nAll template project tests passed!\n');
