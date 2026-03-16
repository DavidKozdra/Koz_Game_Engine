const { app, BrowserWindow } = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { createDesktopExportApp, resolveElectronVersion } = require('./exportDesktopApp');

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

function sanitizeProjectName(name) {
  const value = String(name || 'Untitled Project').trim();
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ');
  return cleaned || 'Untitled Project';
}

function projectSlug(name) {
  return sanitizeProjectName(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function getProjectsRoot() {
  const root = path.join(app.getPath('documents'), 'KozProjects');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function getProjectDiscoveryRoots() {
  const roots = [];
  const seen = new Set();

  function addRoot(dirPath) {
    if (!dirPath) return;
    const resolved = path.resolve(dirPath);
    if (seen.has(resolved) || !fs.existsSync(resolved)) return;
    seen.add(resolved);
    roots.push(resolved);
  }

  if (app.isPackaged) {
    addRoot(path.join(process.resourcesPath, 'projects'));
    addRoot(path.join(process.resourcesPath, 'samples'));
    // When running a packaged build directly from the repo, the executable still sits under editor/dist.
    const repoRootNearExecutable = path.resolve(path.dirname(process.execPath), '../../..');
    addRoot(path.join(repoRootNearExecutable, 'projects'));
    addRoot(path.join(repoRootNearExecutable, 'samples'));
  } else {
    const workspaceRoot = path.resolve(__dirname, '../../..');
    addRoot(path.join(workspaceRoot, 'projects'));
    addRoot(path.join(workspaceRoot, 'samples'));
  }

  return roots;
}

function resolveProjectJsonPath(projectPath) {
  if (!projectPath) return null;
  const stat = fs.existsSync(projectPath) ? fs.statSync(projectPath) : null;
  if (stat && stat.isDirectory()) return path.join(projectPath, 'project.json');
  return projectPath.toLowerCase().endsWith('.json') ? projectPath : null;
}

function looksLikeProject(parsed) {
  return !!(parsed
    && typeof parsed === 'object'
    && (
      (parsed.meta && typeof parsed.meta === 'object')
      || (parsed.world && typeof parsed.world === 'object')
      || Array.isArray(parsed.scenes)
      || Array.isArray(parsed.objects)
    ));
}

async function readProjectInfo(jsonPath, fallbackName, keepInvalid = false) {
  const stat = await fs.promises.stat(jsonPath);
  let name = fallbackName || path.basename(jsonPath, '.json');
  let valid = true;
  try {
    const raw = await fs.promises.readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.meta && parsed.meta.name) name = String(parsed.meta.name);
    if (!looksLikeProject(parsed)) valid = false;
  } catch (_e) {
    valid = false;
  }
  if (!keepInvalid && !valid) return null;
  return {
    id: jsonPath,
    name,
    folderPath: path.dirname(jsonPath),
    projectPath: jsonPath,
    updatedAt: stat.mtimeMs,
  };
}

async function collectJsonCandidates(dirPath, maxDepth = 2) {
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
  const out = [];
  async function walk(current, depth) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch (_e) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        if (depth < maxDepth) await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.json')) continue;
      out.push(full);
    }
  }
  await walk(dirPath, 0);
  return out;
}

async function listProjects() {
  const root = getProjectsRoot();
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  const byPath = new Map();

  async function addProject(jsonPath, fallbackName, keepInvalid = false) {
    const resolved = path.resolve(jsonPath);
    if (byPath.has(resolved)) return;
    const item = await readProjectInfo(resolved, fallbackName, keepInvalid);
    if (!item) return;
    byPath.set(resolved, item);
  }

  for (const entry of entries) {
    let jsonPath = null;
    if (entry.isDirectory()) {
      const nested = path.join(root, entry.name, 'project.json');
      if (!fs.existsSync(nested)) continue;
      jsonPath = nested;
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      jsonPath = path.join(root, entry.name);
    } else {
      continue;
    }
    const fallbackName = entry.name.replace(/\.json$/i, '');
    await addProject(jsonPath, fallbackName, true);
  }

  // Also discover bundled sample projects and nearby workspace projects.
  for (const dirPath of getProjectDiscoveryRoots()) {
    if (!fs.existsSync(dirPath)) continue;
    const candidates = await collectJsonCandidates(dirPath, 3);
    for (const jsonPath of candidates) {
      await addProject(jsonPath, path.basename(jsonPath, '.json'), false);
    }
  }

  const projects = Array.from(byPath.values());
  projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return { ok: true, root, projects };
}

async function writeProjectFile(payload, explicitPath = null) {
  const projectJson = String(payload && payload.projectJson ? payload.projectJson : '{}');
  const desiredName = sanitizeProjectName((payload && payload.name) || 'Untitled Project');
  const root = getProjectsRoot();
  const existing = explicitPath || (payload && payload.projectPath) || null;
  if (existing) {
    const jsonPath = resolveProjectJsonPath(existing);
    if (!jsonPath) return { ok: false, error: 'Invalid project path' };
    await fs.promises.mkdir(path.dirname(jsonPath), { recursive: true });
    await fs.promises.writeFile(jsonPath, projectJson, 'utf8');
    return { ok: true, projectPath: jsonPath, folderPath: path.dirname(jsonPath), name: desiredName };
  }

  const baseSlug = projectSlug(desiredName);
  let candidate = path.join(root, baseSlug);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(root, `${baseSlug}-${i}`);
    i += 1;
  }
  await fs.promises.mkdir(candidate, { recursive: true });
  const jsonPath = path.join(candidate, 'project.json');
  await fs.promises.writeFile(jsonPath, projectJson, 'utf8');
  return { ok: true, projectPath: jsonPath, folderPath: candidate, name: desiredName };
}

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

async function createZipArchive(zipPath, cwd) {
  try {
    await runCommand('zip', ['-rq', zipPath, '.'], cwd);
    return { method: 'zip' };
  } catch (zipError) {
    try {
      await runCommand('python3', ['-m', 'zipfile', '-c', zipPath, '.'], cwd);
      return { method: 'python3' };
    } catch (pythonError) {
      throw new Error(`ZIP tooling unavailable (zip: ${zipError.message}; python3 zipfile: ${pythonError.message})`);
    }
  }
}

async function createTarArchive(tarPath, cwd, gzip = true) {
  try {
    const args = gzip ? ['-czf', tarPath, '-C', cwd, '.'] : ['-cf', tarPath, '-C', cwd, '.'];
    await runCommand('tar', args, cwd);
    return { method: 'tar' };
  } catch (tarError) {
    const mode = gzip ? 'w:gz' : 'w';
    const script = [
      'import os,sys,tarfile',
      'out_path=sys.argv[1]',
      'src_dir=sys.argv[2]',
      `mode='${mode}'`,
      "with tarfile.open(out_path, mode) as tf:",
      "  tf.add(src_dir, arcname='.')",
    ].join(';');
    try {
      await runCommand('python3', ['-c', script, tarPath, cwd], cwd);
      return { method: 'python3' };
    } catch (pythonError) {
      throw new Error(`Tar tooling unavailable (tar: ${tarError.message}; python3 tarfile: ${pythonError.message})`);
    }
  }
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
    if (!payload.options || payload.options.pwaOfflineCache !== false) {
      await fs.promises.writeFile(path.join(tmpDir, 'sw.js'), "self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('fetch', () => {});", 'utf8');
    }
  }
}

function extensionForTarget(target, options) {
  if (target === 'tarball') return options && options.tarGzip ? 'tar.gz' : 'tar';
  if (target === 'single-html') return 'html';
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
  const singleFileFormat = platform === 'win' ? 'portable' : platform === 'linux' ? 'AppImage' : 'zip';
  const format = opts.electronSingleFile
    ? singleFileFormat
    : (opts.desktopFormat || (platform === 'win' ? 'portable' : platform === 'linux' ? 'AppImage' : 'dmg'));
  const editorRoot = path.resolve(__dirname, '../..');
  const buildName = sanitizeProjectName((payload && payload.fileName) || 'game');
  const outDir = path.join(editorRoot, 'dist-desktop', `${projectSlug(buildName)}-${platform}-${Date.now().toString(36)}`);
  const tempAppDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'koz-desktop-app-'));
  const electronVersion = resolveElectronVersion(editorRoot);
  const electronDistPath = path.join(editorRoot, 'node_modules', 'electron', 'dist');
  await fs.promises.mkdir(outDir, { recursive: true });

  try {
    if (!payload || !payload.html) {
      throw new Error('Missing export HTML payload for desktop build');
    }

    event.sender.send('export:progress', { stage: 'desktop', message: 'Preparing desktop runtime...' });
    await createDesktopExportApp(tempAppDir, { ...payload, fileName: buildName }, {
      electronVersion,
      iconSourcePath: path.join(editorRoot, 'build', 'icon.png'),
    });

    event.sender.send('export:progress', { stage: 'desktop', message: `Starting electron-builder (${platform}/${format})...` });
    const args = [
      'exec',
      'electron-builder',
      '--projectDir',
      tempAppDir,
      desktopPlatformFlag(platform),
      ...platformTargets(platform, format),
      '--publish', 'never',
      `--config.directories.output=${outDir}`,
    ];
    if (electronVersion) args.push(`--config.electronVersion=${electronVersion}`);
    if (fs.existsSync(electronDistPath)) args.push(`--config.electronDist=${electronDistPath}`);
    await runStreamingCommand('pnpm', args, editorRoot, (line, stream) => {
      const text = line.trim();
      if (!text) return;
      event.sender.send('export:progress', { stage: 'desktop', stream, message: text });
    });
    event.sender.send('export:progress', { stage: 'desktop', message: `Desktop build complete at ${outDir}` });
    return { ok: true, path: outDir };
  } finally {
    try {
      await fs.promises.rm(tempAppDir, { recursive: true, force: true });
    } catch (_error) {
      // ignore temp cleanup errors
    }
  }
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
    if (target === 'single-html') {
      await fs.promises.writeFile(save.filePath, payload && payload.html ? payload.html : '', 'utf8');
      event.sender.send('export:progress', { stage: target, message: `Created ${path.basename(save.filePath)}` });
      return { ok: true, path: save.filePath };
    }

    await writeExportWorkspace(tmpDir, payload || {});

    if (target === 'tarball') {
      const archive = await createTarArchive(save.filePath, tmpDir, !!(payload.options && payload.options.tarGzip));
      const extra = archive.method === 'python3' ? ' using python3 tarfile fallback' : '';
      event.sender.send('export:progress', { stage: target, message: `Created ${path.basename(save.filePath)}${extra}` });
      return { ok: true, path: save.filePath };
    }

    const archive = await createZipArchive(save.filePath, tmpDir);
    const extra = archive.method === 'python3' ? ' using python3 zipfile fallback' : '';
    event.sender.send('export:progress', { stage: target, message: `Created ${path.basename(save.filePath)}${extra}` });

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

ipcMain.handle('projects:list', async () => {
  try {
    return await listProjects();
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('projects:openDialog', async () => {
  const pick = await dialog.showOpenDialog({
    title: 'Open Project',
    properties: ['openFile'],
    filters: [{ name: 'Koz Project', extensions: ['json'] }],
  });
  if (pick.canceled || !pick.filePaths || pick.filePaths.length === 0) return { ok: false, canceled: true };
  const projectPath = pick.filePaths[0];
  try {
    const content = await fs.promises.readFile(projectPath, 'utf8');
    return { ok: true, projectPath, folderPath: path.dirname(projectPath), content };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('projects:load', async (_event, payload) => {
  const projectPath = payload && payload.projectPath ? String(payload.projectPath) : '';
  if (!projectPath) return { ok: false, error: 'Missing projectPath' };
  const jsonPath = resolveProjectJsonPath(projectPath);
  if (!jsonPath) return { ok: false, error: 'Invalid project path' };
  try {
    const content = await fs.promises.readFile(jsonPath, 'utf8');
    return { ok: true, projectPath: jsonPath, folderPath: path.dirname(jsonPath), content };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('projects:save', async (_event, payload) => {
  try {
    return await writeProjectFile(payload || {}, null);
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('projects:saveAs', async (_event, payload) => {
  const name = sanitizeProjectName((payload && payload.name) || 'Untitled Project');
  const pick = await dialog.showOpenDialog({
    title: 'Choose Save Folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: getProjectsRoot(),
  });
  if (pick.canceled || !pick.filePaths || pick.filePaths.length === 0) return { ok: false, canceled: true };
  const baseFolder = pick.filePaths[0];
  const projectFolder = path.join(baseFolder, projectSlug(name));
  await fs.promises.mkdir(projectFolder, { recursive: true });
  const explicitPath = path.join(projectFolder, 'project.json');
  try {
    return await writeProjectFile(payload || {}, explicitPath);
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

// ---- Script file operations ----

function getScriptsDir(projectPath) {
  const folder = path.dirname(resolveProjectJsonPath(projectPath) || projectPath);
  // Avoid double scripts/scripts
  if (folder.endsWith('/scripts')) return folder;
  return path.join(folder, 'scripts');
}

ipcMain.handle('scripts:list', async (_event, payload) => {
  const scriptsDir = getScriptsDir(payload?.projectPath);
  try {
    if (!fs.existsSync(scriptsDir)) {
      return { ok: true, files: [] };
    }
    const entries = await fs.promises.readdir(scriptsDir);
    const files = entries
      .filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.lua') || f.endsWith('.py') || f.endsWith('.css'))
      .map(f => ({ name: f, path: path.join(scriptsDir, f) }));
    return { ok: true, files };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('scripts:load', async (_event, payload) => {
  const scriptsDir = getScriptsDir(payload?.projectPath);
  const filePath = payload?.filePath;
  if (!filePath) return { ok: false, error: 'Missing filePath' };
  
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(scriptsDir, filePath);
  try {
    if (!fs.existsSync(fullPath)) {
      return { ok: false, error: 'File not found', notFound: true };
    }
    const content = await fs.promises.readFile(fullPath, 'utf8');
    return { ok: true, content, filePath: fullPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('scripts:save', async (_event, payload) => {
  const scriptsDir = getScriptsDir(payload?.projectPath);
  const filePath = payload?.filePath;
  const content = payload?.content;
  console.log('[DEBUG][main] scripts:save called with:', { projectPath: payload?.projectPath, scriptsDir, filePath, contentPreview: content && content.slice ? content.slice(0, 100) : content });
  if (!filePath) {
    console.error('[DEBUG][main] scripts:save missing filePath');
    return { ok: false, error: 'Missing filePath' };
  }
  if (content === undefined) {
    console.error('[DEBUG][main] scripts:save missing content');
    return { ok: false, error: 'Missing content' };
  }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(scriptsDir, filePath);
  console.log('[DEBUG][main] scripts:save resolved fullPath:', fullPath);
  try {
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, content, 'utf8');
    console.log('[DEBUG][main] scripts:save wrote file:', fullPath);
    return { ok: true, filePath: fullPath };
  } catch (error) {
    console.error('[DEBUG][main] scripts:save error:', error);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('scripts:delete', async (_event, payload) => {
  const scriptsDir = getScriptsDir(payload?.projectPath);
  const filePath = payload?.filePath;
  if (!filePath) return { ok: false, error: 'Missing filePath' };
  
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(scriptsDir, filePath);
  try {
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('editor:openFile', async (_event, payload) => {
  const filePath = payload?.filePath;
  const editor = payload?.editor || 'vscode';
  const commandOverride = typeof payload?.command === 'string' ? payload.command.trim() : '';
  const extraArgs = Array.isArray(payload?.args) ? payload.args.map((arg) => String(arg)).filter((arg) => arg.length > 0) : [];
  if (!filePath) return { ok: false, error: 'Missing filePath' };
  
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    let command;
    if (commandOverride) {
      command = commandOverride;
    } else if (editor === 'code' || editor === 'vscode') {
      command = 'code';
    } else if (editor === 'cursor') {
      command = 'cursor';
    } else if (editor === 'vscodium') {
      command = 'vscodium';
    } else {
      command = editor;
    }
    
    await spawn(command, [...extraArgs, fullPath], { detached: true, stdio: 'ignore' });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Only probe a Vite dev server for unpackaged runs. Packaged apps must load bundled assets.
  const isDev = !app.isPackaged && (
    process.env.NODE_ENV === 'development'
    || process.argv.includes('--dev')
    || await checkViteRunning()
  );

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
        { label: 'Save As', accelerator: 'CmdOrCtrl+Shift+S', click: () => { win.webContents.send('menu-save-as'); } },
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
