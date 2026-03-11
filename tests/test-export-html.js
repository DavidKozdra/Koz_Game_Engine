/**
 * Validates export HTML generation for mixed 2D/3D scene projects.
 * Run with: node tests/test-export-html.js
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

async function main() {
  console.log('\n=== Export HTML Tests ===\n');

  const modulePath = path.join(__dirname, '..', 'editor', 'src', 'renderer', 'lib', 'exportHtml.js');
  const moduleSource = fs.readFileSync(modulePath, 'utf8');
  const playModePath = path.join(__dirname, '..', 'editor', 'src', 'renderer', 'components', 'PlayMode.jsx');
  const playModeSource = fs.readFileSync(playModePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`;
  const { buildExportHtml } = await import(moduleUrl);
  const projectPath = path.join(__dirname, '..', 'projects', 'template-3d-fps-shell', 'project.json');
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const html = buildExportHtml(project, JSON.stringify(project), 'html-zip', { minify: false });

  assert(html.includes('id="game-2d"'), 'export includes a dedicated 2D canvas');
  assert(html.includes('id="game-3d"'), 'export includes a dedicated WebGL canvas');
  assert(html.includes('sceneManager'), 'export runtime includes scene-manager support');
  assert(html.includes('lightingManager'), 'export runtime includes lighting-manager support');
  assert(html.includes('loadScene'), 'export runtime includes runtime scene transitions');
  assert(html.includes('loadNextScene'), 'export runtime includes ordered scene progression helpers');
  assert(html.includes('renderFrame2DLighting'), 'export runtime includes 2D lighting overlay support');
  assert(html.includes('drawWorldElements'), 'export runtime renders world elements');
  assert(html.includes('createParticleSystem'), 'export runtime includes particle support');
  assert(html.includes('particles:'), 'export runtime exposes particle helpers to scripts');
  assert(html.includes('storage:'), 'export runtime exposes storage helpers to scripts');
  assert(html.includes('components: clone(obj.components || {})'), 'export runtime clones scene component data before mutation');
  assert(html.includes('prefabId: obj.prefabId || null'), 'export runtime preserves prefab ids on runtime objects');
  assert(html.includes('findObjectById: function(value) { return findObjectById(value); }'), 'export runtime exposes an explicit id lookup helper');
  assert(html.includes("findObjectByType: function(type) { return findObjectsByType(type)[0] || null; }"), 'export runtime exposes a singular type lookup helper');
  assert(playModeSource.includes("findObjectById: (value) => findRuntimeObjectById(runtimeState.gameObjects, value)"), 'editor play runtime exposes an explicit id lookup helper');
  assert(playModeSource.includes("findObjectByType: (type) => findRuntimeObjectsByType(runtimeState.gameObjects, type)[0] || null"), 'editor play runtime exposes a singular type lookup helper');
  assert(playModeSource.includes('components: JSON.parse(JSON.stringify(obj.components || {}))'), 'editor play runtime clones scene component data before mutation');
  assert(html.includes("source: 'engine-fallback'"), 'export runtime includes engine fallback camera metadata');
  assert(html.includes('webgl-3d'), 'export runtime contains the WebGL render mode');

  console.log('\n=== Results ===\n');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('\nAll export HTML tests passed!\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
