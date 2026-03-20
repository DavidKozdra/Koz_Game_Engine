/**
 * Validates renderer-side script path helpers for editor file integration.
 * Run with: node tests/test-script-paths.js
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

async function loadScriptPaths() {
  const modulePath = path.join(__dirname, '..', 'editor', 'src', 'renderer', 'lib', 'scriptPaths.js');
  const source = fs.readFileSync(modulePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(moduleUrl);
}

async function main() {
  console.log('\n=== Script Path Tests ===\n');

  const {
    getProjectFolderPath,
    getScriptsFolderPath,
    isAbsolutePath,
    resolveScriptFilePath,
  } = await loadScriptPaths();

  assert(
    getProjectFolderPath('/tmp/koz/project.json') === '/tmp/koz',
    'project json paths resolve to their containing folder'
  );
  assert(
    getScriptsFolderPath('/tmp/koz') === '/tmp/koz/scripts',
    'project folders resolve to the scripts directory'
  );
  assert(
    resolveScriptFilePath('/tmp/koz', 'player.js') === '/tmp/koz/scripts/player.js',
    'relative script paths resolve from a project folder'
  );
  assert(
    resolveScriptFilePath('/tmp/koz/scripts', 'ai/enemy.js') === '/tmp/koz/scripts/ai/enemy.js',
    'scripts folders do not duplicate the scripts segment'
  );
  assert(
    resolveScriptFilePath('C:\\Users\\Dev\\Koz\\project.json', 'player.js') === 'C:/Users/Dev/Koz/scripts/player.js',
    'windows project json paths normalize and resolve correctly'
  );
  assert(
    resolveScriptFilePath('C:\\Users\\Dev\\Koz\\scripts', 'ai\\enemy.js') === 'C:/Users/Dev/Koz/scripts/ai/enemy.js',
    'windows script paths preserve nested subdirectories without duplicating scripts'
  );
  assert(
    isAbsolutePath('D:\\work\\custom\\enemy.js'),
    'windows drive-letter paths are treated as absolute'
  );
  assert(
    resolveScriptFilePath('/tmp/koz', 'D:\\work\\custom\\enemy.js') === 'D:/work/custom/enemy.js',
    'absolute script paths are preserved and normalized'
  );

  console.log('\n=== Results ===\n');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('\nAll script path tests passed!\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
