const fs = require('fs');
const path = require('path');

function sanitizeDesktopName(name) {
  const value = String(name || 'Koz Game').trim();
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ');
  return cleaned || 'Koz Game';
}

function packageSlug(name) {
  return sanitizeDesktopName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'koz-game';
}

function normalizeVersion(value) {
  if (typeof value !== 'string') return '1.0.0';
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : '1.0.0';
}

function getProjectVersion(projectJson) {
  if (!projectJson) return '1.0.0';
  try {
    const parsed = JSON.parse(projectJson);
    return normalizeVersion(parsed && parsed.meta && parsed.meta.version);
  } catch (_error) {
    return '1.0.0';
  }
}

function buildDesktopMainSource() {
  return `const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`;
}

function createDesktopPackageJson(payload, options = {}) {
  const productName = sanitizeDesktopName(payload && payload.fileName ? payload.fileName : 'Koz Game');
  const slug = packageSlug(productName);
  const version = getProjectVersion(payload && payload.projectJson ? payload.projectJson : null);
  const includeIcon = !!options.includeIcon;
  const build = {
    appId: `com.koz.export.${slug}`,
    productName,
    asar: true,
    npmRebuild: false,
    files: ['main.js', 'index.html', 'project.json'],
  };

  if (includeIcon) {
    build.files.push('build/**/*');
    build.directories = { buildResources: 'build' };
    build.win = { icon: 'build/icon.png' };
    build.linux = { icon: 'build/icon.png' };
    build.mac = { icon: 'build/icon.png' };
  }

  const pkg = {
    name: slug,
    productName,
    version,
    private: true,
    main: 'main.js',
    description: 'Koz Engine exported desktop runtime',
    build,
  };

  if (options.electronVersion) {
    pkg.devDependencies = { electron: options.electronVersion };
  }

  return pkg;
}

async function createDesktopExportApp(appDir, payload, options = {}) {
  const includeIcon = !!(options.iconSourcePath && fs.existsSync(options.iconSourcePath));
  const pkg = createDesktopPackageJson(payload, {
    electronVersion: options.electronVersion,
    includeIcon,
  });

  await fs.promises.mkdir(appDir, { recursive: true });
  await fs.promises.writeFile(path.join(appDir, 'index.html'), payload && payload.html ? payload.html : '', 'utf8');
  await fs.promises.writeFile(path.join(appDir, 'project.json'), payload && payload.projectJson ? payload.projectJson : '{}', 'utf8');
  await fs.promises.writeFile(path.join(appDir, 'main.js'), buildDesktopMainSource(), 'utf8');
  await fs.promises.writeFile(path.join(appDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

  if (includeIcon) {
    const buildDir = path.join(appDir, 'build');
    await fs.promises.mkdir(buildDir, { recursive: true });
    await fs.promises.copyFile(options.iconSourcePath, path.join(buildDir, 'icon.png'));
  }

  return pkg;
}

function resolveElectronVersion(editorRoot) {
  const installedPackagePath = path.join(editorRoot, 'node_modules', 'electron', 'package.json');
  if (fs.existsSync(installedPackagePath)) {
    try {
      const installed = JSON.parse(fs.readFileSync(installedPackagePath, 'utf8'));
      if (installed && typeof installed.version === 'string' && installed.version.trim()) {
        return installed.version.trim();
      }
    } catch (_error) {
      // fall through to package.json declaration
    }
  }

  const editorPackagePath = path.join(editorRoot, 'package.json');
  if (fs.existsSync(editorPackagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(editorPackagePath, 'utf8'));
      const declared = (pkg.dependencies && pkg.dependencies.electron)
        || (pkg.devDependencies && pkg.devDependencies.electron);
      if (typeof declared === 'string' && declared.trim()) {
        return declared.replace(/^[^\d]*/, '').trim() || null;
      }
    } catch (_error) {
      return null;
    }
  }

  return null;
}

module.exports = {
  buildDesktopMainSource,
  createDesktopPackageJson,
  createDesktopExportApp,
  getProjectVersion,
  packageSlug,
  resolveElectronVersion,
  sanitizeDesktopName,
};
