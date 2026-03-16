const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildDesktopMainSource,
  createDesktopExportApp,
  createDesktopPackageJson,
} = require('../editor/src/main/exportDesktopApp.js');

async function main() {
  const payload = {
    fileName: 'Sample Export',
    html: '<!doctype html><html><body>Hello export</body></html>',
    projectJson: JSON.stringify({ meta: { version: '2.4.6', name: 'Sample Export' } }),
  };

  const pkg = createDesktopPackageJson(payload, { electronVersion: '28.3.3', includeIcon: true });
  assert.strictEqual(pkg.productName, 'Sample Export', 'desktop package preserves product name');
  assert.strictEqual(pkg.version, '2.4.6', 'desktop package uses project version');
  assert.strictEqual(pkg.main, 'main.js', 'desktop package starts from generated main.js');
  assert.deepStrictEqual(pkg.devDependencies, { electron: '28.3.3' }, 'desktop package pins the local electron version');
  assert(pkg.build.files.includes('index.html'), 'desktop package includes exported html');
  assert.strictEqual(pkg.build.win.icon, 'build/icon.png', 'desktop package points to bundled icon');

  const mainSource = buildDesktopMainSource();
  assert(mainSource.includes("win.loadFile(path.join(__dirname, 'index.html'));"), 'desktop runtime loads the generated export html');
  assert(!mainSource.includes('../renderer/dist/index.html'), 'desktop runtime does not depend on the editor renderer dist output');

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'koz-desktop-test-'));
  try {
    const iconSource = path.join(tempDir, 'source-icon.png');
    await fs.promises.writeFile(iconSource, 'icon', 'utf8');
    await createDesktopExportApp(tempDir, payload, { electronVersion: '28.3.3', iconSourcePath: iconSource });

    const writtenHtml = await fs.promises.readFile(path.join(tempDir, 'index.html'), 'utf8');
    const writtenProjectJson = await fs.promises.readFile(path.join(tempDir, 'project.json'), 'utf8');
    const writtenMain = await fs.promises.readFile(path.join(tempDir, 'main.js'), 'utf8');
    const writtenPackage = JSON.parse(await fs.promises.readFile(path.join(tempDir, 'package.json'), 'utf8'));
    const copiedIcon = await fs.promises.readFile(path.join(tempDir, 'build', 'icon.png'), 'utf8');

    assert.strictEqual(writtenHtml, payload.html, 'desktop export app writes the generated html payload');
    assert.strictEqual(writtenProjectJson, payload.projectJson, 'desktop export app writes project metadata beside the html payload');
    assert(writtenMain.includes("win.loadFile(path.join(__dirname, 'index.html'));"), 'desktop export app launcher opens the export html');
    assert.strictEqual(writtenPackage.productName, 'Sample Export', 'desktop export app writes the generated package metadata');
    assert.strictEqual(copiedIcon, 'icon', 'desktop export app copies the shared build icon');
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }

  console.log('\nDesktop export app tests passed!\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
