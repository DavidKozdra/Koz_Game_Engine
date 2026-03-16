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
  const sanitizedModuleSource = moduleSource.replace(
    "import tailwindBrowserJs from '@tailwindcss/browser?raw';",
    "const tailwindBrowserJs = '';",
  );
  const playModePath = path.join(__dirname, '..', 'editor', 'src', 'renderer', 'components', 'PlayMode.jsx');
  const playModeSource = fs.readFileSync(playModePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(sanitizedModuleSource).toString('base64')}`;
  const { buildExportHtml } = await import(moduleUrl);
  const projectPath = path.join(__dirname, '..', 'projects', 'template-3d-fps-shell', 'project.json');
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const html = await buildExportHtml(project, JSON.stringify(project), 'html-zip', { minify: false });
  const disabledFullscreenProject = {
    ...project,
    meta: {
      ...(project.meta || {}),
      display: {
        scaleMode: 'cover',
        allowFullscreen: false,
        showFullscreenButton: true,
        backgroundColor: '#123456',
      },
    },
  };
  const disabledFullscreenHtml = await buildExportHtml(disabledFullscreenProject, JSON.stringify(disabledFullscreenProject), 'html-zip', { minify: false });

  assert(html.includes('id="game-2d"'), 'export includes a dedicated 2D canvas');
  assert(html.includes('id="game-3d"'), 'export includes a dedicated WebGL canvas');
  assert(html.includes('window.__KOZ_DISPLAY__='), 'export includes normalized display configuration metadata');
  assert(html.includes('id="fullscreen-toggle"'), 'export includes a fullscreen toggle button by default');
  assert(html.includes('stage.dataset.scaleMode'), 'export applies responsive stage sizing metadata');
  assert(html.includes('toggleFullscreen'), 'export includes a fullscreen toggle handler');
  assert(html.includes('sceneManager'), 'export runtime includes scene-manager support');
  assert(html.includes('lightingManager'), 'export runtime includes lighting-manager support');
  assert(html.includes('loadScene'), 'export runtime includes runtime scene transitions');
  assert(html.includes('loadNextScene'), 'export runtime includes ordered scene progression helpers');
  assert(html.includes('renderFrame2DLighting'), 'export runtime includes 2D lighting overlay support');
  assert(html.includes('drawWorldElements'), 'export runtime renders world elements');
  assert(html.includes('createParticleSystem'), 'export runtime includes particle support');
  assert(html.includes('particles:'), 'export runtime exposes particle helpers to scripts');
  assert(html.includes('queryObjectSpatialIndex'), 'export runtime includes object spatial culling support');
  assert(html.includes('compileScriptFactory'), 'export runtime caches compiled script factories');
  assert(html.includes('storage:'), 'export runtime exposes storage helpers to scripts');
  assert(html.includes('components: clone(obj.components || {})'), 'export runtime clones scene component data before mutation');
  assert(html.includes('prefabId: obj.prefabId || null'), 'export runtime preserves prefab ids on runtime objects');
  assert(html.includes('findObjectById: function(value) { return findObjectById(value); }'), 'export runtime exposes an explicit id lookup helper');
  assert(html.includes("findObjectByType: function(type) { return findObjectsByType(type)[0] || null; }"), 'export runtime exposes a singular type lookup helper');
  assert(html.includes('function resolveKeyCode(event) {'), 'export runtime normalizes browser keyboard events');
  assert(html.includes('keys.clear();'), 'export runtime clears stale key state during scene transitions or blur');
  assert(!moduleSource.includes("if (typeof obj.grounded === 'boolean') obj.grounded = false;"), 'export runtime does not clear grounded state before tile resolution');
  assert(playModeSource.includes("findObjectById: (value) => findRuntimeObjectById(runtimeState.gameObjects, value)"), 'editor play runtime exposes an explicit id lookup helper');
  assert(playModeSource.includes("findObjectByType: (type) => findRuntimeObjectsByType(runtimeState.gameObjects, type)[0] || null"), 'editor play runtime exposes a singular type lookup helper');
  assert(playModeSource.includes('components: JSON.parse(JSON.stringify(obj.components || {}))'), 'editor play runtime clones scene component data before mutation');
  assert(playModeSource.includes('syncObjectSpatialIndex(state.objectSpatialIndex, state.gameObjects);'), 'editor play runtime refreshes object culling data after movement');
  assert(playModeSource.includes('ctx.imageSmoothingEnabled = false;'), 'editor play runtime disables 2D image smoothing for crisp rendering');
  assert(playModeSource.includes('function ensurePlayLightingSurface(state, width, height) {'), 'editor play runtime allocates a dedicated lighting overlay surface');
  assert(!playModeSource.includes('particles.splice(i, 1);'), 'editor play particle updates avoid O(n) splice removal');
  assert(!moduleSource.includes('particles.splice(i, 1);'), 'export particle updates avoid O(n) splice removal');
  assert(moduleSource.includes('ctx2d.imageSmoothingEnabled = false;'), 'export runtime disables 2D image smoothing for crisp rendering');
  assert(moduleSource.includes('function ensureLightingSurface(width, height) {'), 'export runtime allocates a dedicated lighting overlay surface');
  assert(html.includes("source: 'engine-fallback'"), 'export runtime includes engine fallback camera metadata');
  assert(html.includes('webgl-3d'), 'export runtime contains the WebGL render mode');
  assert(!disabledFullscreenHtml.includes('id="fullscreen-toggle"'), 'export omits the fullscreen button when display settings disable fullscreen');
  assert(disabledFullscreenHtml.includes('#123456'), 'export applies the configured display background color');

  console.log('\n=== Results ===\n');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('\nAll export HTML tests passed!\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
