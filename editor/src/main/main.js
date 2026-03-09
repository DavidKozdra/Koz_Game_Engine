const { app, BrowserWindow } = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');

// Detect dev mode: check if Vite dev server is running on 5173
function checkViteRunning() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(5173, '127.0.0.1');
  });
}

const { Menu, shell, ipcMain, dialog } = require('electron');

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runStreamingCommand(cmd, args, cwd, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      out += text;
      if (onLine) onLine(text, 'stdout');
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      err += text;
      if (onLine) onLine(text, 'stderr');
    });
    child.on('error', (e) => reject(e));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: out, stderr: err });
        return;
      }
      reject(new Error(err || out || `Command failed with code ${code}`));
    });
  });
}

async function writeExportWorkspace(tmpDir, payload) {
  const htmlPath = path.join(tmpDir, 'index.html');
  await fs.promises.writeFile(htmlPath, payload.html || '', 'utf8');
  if (payload.projectJson) {
    await fs.promises.writeFile(path.join(tmpDir, 'project.json'), payload.projectJson, 'utf8');
  }
  if (payload.target === 'pwa') {
    const manifest = {
      name: payload.fileName || 'Koz Export',
      short_name: payload.fileName || 'Koz',
      start_url: '.',
      display: 'standalone',
      background_color: '#0b1220',
      theme_color: '#0b1220',
      icons: [],
    };
    await fs.promises.writeFile(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await fs.promises.writeFile(path.join(tmpDir, 'sw.js'), "self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('fetch', () => {});", 'utf8');
  }
}

function extensionForTarget(target, options) {
  if (target === 'tarball') return options && options.tarGzip ? 'tar.gz' : 'tar';
  if (target === 'electron-exe') return 'desktop';
  return 'zip';
}

function desktopPlatformFlag(platform) {
  if (platform === 'win') return '--win';
  if (platform === 'linux') return '--linux';
  if (platform === 'mac') return '--mac';
  return '--dir';
}

function platformTargets(platform, format) {
  const defaults = platform === 'win' ? ['portable', 'nsis', 'zip'] : platform === 'linux' ? ['AppImage', 'deb', 'zip'] : ['dmg', 'zip'];
  const fallback = platform === 'win' ? 'portable' : platform === 'linux' ? 'AppImage' : 'dmg';
  const normalized = defaults.includes(format) ? format : fallback;
  return [normalized];
}

async function exportDesktopBuild(event, payload) {
  const opts = payload.options || {};
  const currentPlatform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
  const platform = !opts.desktopPlatform || opts.desktopPlatform === 'auto' ? currentPlatform : opts.desktopPlatform;
  const format = opts.desktopFormat || (platform === 'win' ? 'portable' : platform === 'linux' ? 'AppImage' : 'dmg');
  const editorRoot = path.resolve(__dirname, '../..');
  const outDir = path.join(editorRoot, 'dist-desktop', `${payload.fileName || 'game'}-${platform}-${Date.now().toString(36)}`);
  await fs.promises.mkdir(outDir, { recursive: true });

  event.sender.send('export:progress', { stage: 'desktop', message: `Starting electron-builder (${platform}/${format})...` });
  const args = [
    'exec',
    'electron-builder',
    desktopPlatformFlag(platform),
    ...platformTargets(platform, format),
    '--publish', 'never',
    `--config.directories.output=${outDir}`,
  ];
  await runStreamingCommand('pnpm', args, editorRoot, (line, stream) => {
    const text = line.trim();
    if (!text) return;
    event.sender.send('export:progress', { stage: 'desktop', stream, message: text });
  });
  event.sender.send('export:progress', { stage: 'desktop', message: `Desktop build complete at ${outDir}` });
  return { ok: true, path: outDir };
}

ipcMain.handle('export:build', async (event, payload) => {
  const target = payload && payload.target ? payload.target : 'html-zip';
  const fileName = (payload && payload.fileName) || 'game';
  if (target === 'electron-exe') {
    try {
      return await exportDesktopBuild(event, payload || {});
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  const ext = extensionForTarget(target, payload && payload.options ? payload.options : {});
  const suggestedName = `${fileName}.${ext}`;
  const save = await dialog.showSaveDialog({
    title: 'Export Build',
    defaultPath: path.join(app.getPath('downloads'), suggestedName),
  });
  if (save.canceled || !save.filePath) return { ok: false, canceled: true };

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'koz-export-'));
  try {
    event.sender.send('export:progress', { stage: target, message: `Preparing ${target} package...` });
    await writeExportWorkspace(tmpDir, payload || {});

    if (target === 'tarball') {
      const args = payload.options && payload.options.tarGzip
        ? ['-czf', save.filePath, '-C', tmpDir, '.']
        : ['-cf', save.filePath, '-C', tmpDir, '.'];
      await runCommand('tar', args, tmpDir);
      event.sender.send('export:progress', { stage: target, message: `Created ${path.basename(save.filePath)}` });
      return { ok: true, path: save.filePath };
    }

    await runCommand('zip', ['-rq', save.filePath, '.'], tmpDir);
    event.sender.send('export:progress', { stage: target, message: `Created ${path.basename(save.filePath)}` });

    return { ok: true, path: save.filePath };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch (_e) {
      // ignore temp cleanup errors
    }
  }
});

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Auto-detect: if Vite is running use it, otherwise load built files
  const isDev = process.env.NODE_ENV === 'development'
    || process.argv.includes('--dev')
    || await checkViteRunning();

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    const distPath = path.join(__dirname, '../renderer/dist/index.html');
    win.loadFile(distPath);
  }

  // Custom menu
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => { win.webContents.send('menu-save'); } },
        { label: 'Load', accelerator: 'CmdOrCtrl+O', click: () => { win.webContents.send('menu-load'); } },
        { label: 'Export', accelerator: 'CmdOrCtrl+E', click: () => { win.webContents.send('menu-export'); } },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Koz Engine GitHub',
          click: async () => {
            await shell.openExternal('https://github.com/DavidKozdra/Koz_Engine_boilerPlate');
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
