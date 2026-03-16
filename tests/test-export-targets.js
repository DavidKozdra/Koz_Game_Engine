const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function main() {
  const modulePath = path.join(__dirname, '..', 'editor', 'src', 'renderer', 'lib', 'exportTargets.js');
  const moduleSource = fs.readFileSync(modulePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`;
  const { getDefaultExportTarget, getExportTargetOptions } = await import(moduleUrl);

  const browserOptions = getExportTargetOptions(false);
  assert.deepStrictEqual(browserOptions.map((option) => option.value), ['single-html'], 'browser mode only exposes single-html export');
  assert.strictEqual(getDefaultExportTarget('html-zip', false), 'single-html', 'browser mode coerces unsupported targets to single-html');

  const nativeOptions = getExportTargetOptions(true);
  assert(nativeOptions.some((option) => option.value === 'electron-exe'), 'native mode keeps desktop export');
  assert(nativeOptions.some((option) => option.value === 'pwa'), 'native mode keeps archive exports');
  assert.strictEqual(getDefaultExportTarget('html-zip', true), 'html-zip', 'native mode preserves supported targets');

  console.log('\nExport target tests passed!\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
