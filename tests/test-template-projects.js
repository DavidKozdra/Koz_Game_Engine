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

assert(entries.length === 4, 'four template projects are present');

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
  assert(project.activeSceneId === 'scene_menu', `${name} boots into its menu scene`);
  if (name === 'Template - 3D FPS Shell') {
    const menuScene = project.scenes.find((scene) => scene.id === 'scene_menu');
    const labScene = project.scenes.find((scene) => scene.id === 'scene_fps_lab');
    assert(menuScene && menuScene.renderMode === '2d', `${name} keeps the menu in 2D`);
    assert(labScene && labScene.renderMode === 'webgl-3d', `${name} marks the gameplay lab as WebGL 3D`);
    assert(labScene && Array.isArray(labScene.objects) && labScene.objects.some((obj) => obj.components && obj.components.LightingManager), `${name} includes a lighting manager object in the gameplay lab`);
    assert(labScene && Array.isArray(labScene.objects) && labScene.objects.some((obj) => obj.components && obj.components.Light), `${name} includes a light-emitter object`);
  }
  if (name === 'Template - 2D Clicker') {
    const arenaScene = project.scenes.find((scene) => scene.id === 'scene_click_arena');
    assert(arenaScene && Array.isArray(arenaScene.objects) && arenaScene.objects.some((obj) => obj.components && obj.components.LightingManager), `${name} includes a lighting manager object in the arena`);
    assert(arenaScene && Array.isArray(arenaScene.objects) && arenaScene.objects.some((obj) => obj.components && obj.components.Light), `${name} includes a 2D light object`);
  }
  if (name === 'Template - 2D Platformer') {
    const completeScene = project.scenes.find((scene) => scene.id === 'scene_level_complete');
    const playerController = (project.scripts || []).find((script) => script.id === 'script_player_controller');
    assert(completeScene, `${name} includes a scripted level-complete scene`);
    assert(playerController && playerController.source.includes('loadNextScene()'), `${name} goal script uses ordered scene progression`);
  }
  if (name === 'Template - 2D Adventure Platformer') {
    const levelScenes = project.scenes.filter((scene) => /^scene_level_/.test(scene.id));
    const litScene = project.scenes.find((scene) => scene.id === 'scene_level_3');
    const goalScript = (project.scripts || []).find((script) => script.id === 'script_goal_portal');
    const menuScript = (project.scripts || []).find((script) => script.id === 'script_menu_system');
    assert(levelScenes.length === 5, `${name} includes five distinct gameplay levels`);
    assert(project.scenes.some((scene) => scene.id === 'scene_victory'), `${name} includes a victory scene`);
    assert(litScene && Array.isArray(litScene.objects) && litScene.objects.some((obj) => obj.components && obj.components.LightingManager), `${name} includes a lighting-manager scene`);
    assert(litScene && Array.isArray(litScene.objects) && litScene.objects.some((obj) => obj.components && obj.components.Light), `${name} includes active light emitters in the lit level`);
    assert(goalScript && goalScript.source.includes('@prop nextSceneId scene'), `${name} goal portals expose a scene-typed serialized prop`);
    assert(menuScript && menuScript.source.includes('Continue Save') && menuScript.source.includes('Master Volume'), `${name} menu script exposes save/load and volume controls`);
    assert(levelScenes.every((scene) => Array.isArray(scene.objects) && scene.objects.some((obj) => obj.components && obj.components.ParticleEmitter)), `${name} each level includes a particle-enabled goal`);
  }
});

console.log('\n=== Results ===\n');
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('\nAll template project tests passed!\n');
