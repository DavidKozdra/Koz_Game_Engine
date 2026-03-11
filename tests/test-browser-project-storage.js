/**
 * Regression tests for browser-side project storage helpers.
 * Run with: node tests/test-browser-project-storage.js
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

function createStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

async function loadBrowserProjectsModule() {
  const modulePath = path.join(__dirname, '..', 'editor', 'src', 'renderer', 'lib', 'browserProjects.js');
  const source = fs.readFileSync(modulePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(moduleUrl);
}

async function main() {
  console.log('\n=== Browser Project Storage Tests ===\n');

  const originalWindow = global.window;
  global.window = {
    localStorage: createStorage(),
  };

  try {
    const {
      getBrowserProjectsRootLabel,
      listBrowserProjects,
      loadBrowserProject,
      saveBrowserProject,
    } = await loadBrowserProjectsModule();

    const projectJson = JSON.stringify({
      schemaVersion: 1,
      meta: { name: 'Browser Save Test', resolution: { width: 960, height: 540 } },
      scenes: [],
      objects: [],
      animations: [],
      scripts: [],
      assets: [],
      build: { profile: 'web-prod' },
    });

    const saveResult = await saveBrowserProject({ projectJson });
    assert(saveResult && saveResult.ok, 'saveBrowserProject stores a project in local storage');
    assert(typeof saveResult.browserProjectId === 'string' && saveResult.browserProjectId.length > 0, 'saveBrowserProject returns a browser project id');
    assert(saveResult.projectPath === `browser://project/${saveResult.browserProjectId}`, 'saveBrowserProject returns a browser project path');

    const listResult = await listBrowserProjects();
    assert(listResult && listResult.ok, 'listBrowserProjects succeeds with local storage available');
    assert(listResult.root === 'Browser Storage', 'browser root label prefers Browser Storage without file pickers');
    assert(Array.isArray(listResult.projects) && listResult.projects.length === 1, 'listBrowserProjects returns the saved project');
    assert(listResult.projects[0].name === 'Browser Save Test', 'listBrowserProjects preserves the project name from project JSON');

    const loadResult = await loadBrowserProject(saveResult.projectPath);
    assert(loadResult && loadResult.ok, 'loadBrowserProject loads by browser project path');
    assert(loadResult.content === projectJson, 'loadBrowserProject returns the saved project JSON');
    assert(loadResult.name === 'Browser Save Test', 'loadBrowserProject returns project metadata');

    const rootLabel = getBrowserProjectsRootLabel();
    assert(rootLabel === 'Browser Storage', 'getBrowserProjectsRootLabel matches local-storage-only environments');
  } finally {
    global.window = originalWindow;
  }

  console.log('\n=== Results ===\n');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('\nAll browser project storage tests passed!\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
