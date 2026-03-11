const PROJECT_INDEX_KEY = 'koz-editor:browser-projects:index';
const PROJECT_CONTENT_PREFIX = 'koz-editor:browser-projects:content:';
const BROWSER_PROJECT_PREFIX = 'browser://project/';

function getWindowObject() {
  return typeof window !== 'undefined' ? window : null;
}

function getLocalStorage() {
  try {
    const win = getWindowObject();
    if (!win || !win.localStorage) return null;
    const probeKey = '__koz_browser_project_probe__';
    win.localStorage.setItem(probeKey, '1');
    win.localStorage.removeItem(probeKey);
    return win.localStorage;
  } catch (_error) {
    return null;
  }
}

function projectContentKey(id) {
  return `${PROJECT_CONTENT_PREFIX}${id}`;
}

function browserProjectPath(id) {
  return `${BROWSER_PROJECT_PREFIX}${id}`;
}

function normalizeProjectId(projectPathOrId) {
  if (!projectPathOrId) return null;
  const value = String(projectPathOrId);
  if (value.startsWith(BROWSER_PROJECT_PREFIX)) return value.slice(BROWSER_PROJECT_PREFIX.length);
  return value;
}

function slugifyName(name) {
  return String(name || 'project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

function stripJsonExtension(name) {
  return String(name || '').replace(/\.json$/i, '');
}

function inferProjectName(projectJson, fallbackName = 'Untitled Project') {
  try {
    const parsed = JSON.parse(projectJson);
    const metaName = parsed && parsed.meta && parsed.meta.name;
    if (typeof metaName === 'string' && metaName.trim()) return metaName.trim();
  } catch (_error) {
    // Keep the fallback and let the caller validate the JSON separately.
  }
  const fallback = String(fallbackName || 'Untitled Project').trim();
  return fallback || 'Untitled Project';
}

function readProjectIndex(storage = getLocalStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PROJECT_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
  } catch (_error) {
    return [];
  }
}

function writeProjectIndex(entries, storage = getLocalStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(PROJECT_INDEX_KEY, JSON.stringify(entries));
    return true;
  } catch (_error) {
    return false;
  }
}

function sanitizeProjectEntry(entry = {}) {
  const id = normalizeProjectId(entry.id || entry.projectPath);
  if (!id) return null;
  return {
    id,
    projectPath: browserProjectPath(id),
    name: String(entry.name || 'Untitled Project'),
    folderPath: String(entry.folderPath || 'Browser Storage'),
    updatedAt: Number(entry.updatedAt) || Date.now(),
    storageKind: String(entry.storageKind || 'browser-local'),
    fileName: entry.fileName ? String(entry.fileName) : null,
  };
}

function readSanitizedIndex(storage = getLocalStorage()) {
  const entries = readProjectIndex(storage)
    .map(sanitizeProjectEntry)
    .filter(Boolean)
    .filter((entry) => typeof storage?.getItem === 'function' && storage.getItem(projectContentKey(entry.id)) !== null);
  if (storage) writeProjectIndex(entries, storage);
  return entries;
}

function createProjectId(name) {
  return `${slugifyName(name)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSuggestedFileName(name, fallbackFileName = '') {
  const baseName = stripJsonExtension(fallbackFileName) || slugifyName(name) || 'project';
  return `${baseName}.json`;
}

async function writeHandleContent(handle, content) {
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

function downloadJsonFile(content, fileName) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function promptForJsonFile() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}

export function getBrowserProjectCapabilities() {
  const win = getWindowObject();
  return {
    hasLocalStorage: !!getLocalStorage(),
    canOpenFilePicker: !!(win && typeof win.showOpenFilePicker === 'function'),
    canSaveFilePicker: !!(win && typeof win.showSaveFilePicker === 'function'),
  };
}

export function getBrowserProjectsRootLabel() {
  const capabilities = getBrowserProjectCapabilities();
  if (capabilities.hasLocalStorage && (capabilities.canOpenFilePicker || capabilities.canSaveFilePicker)) {
    return 'Browser Storage + local JSON files';
  }
  if (capabilities.hasLocalStorage) return 'Browser Storage';
  if (capabilities.canOpenFilePicker || capabilities.canSaveFilePicker) return 'Local JSON files';
  return 'Current browser session';
}

export async function listBrowserProjects() {
  const storage = getLocalStorage();
  const projects = storage ? readSanitizedIndex(storage) : [];
  return {
    ok: true,
    root: getBrowserProjectsRootLabel(),
    projects,
  };
}

export async function loadBrowserProject(projectPathOrId) {
  const storage = getLocalStorage();
  const id = normalizeProjectId(projectPathOrId);
  if (!storage || !id) return { ok: false, error: 'Project is not available in browser storage' };
  const content = storage.getItem(projectContentKey(id));
  if (content === null) return { ok: false, error: 'Project content not found in browser storage' };
  const entry = readSanitizedIndex(storage).find((item) => item.id === id);
  return {
    ok: true,
    content,
    projectPath: browserProjectPath(id),
    folderPath: entry ? entry.folderPath : 'Browser Storage',
    name: entry ? entry.name : inferProjectName(content),
    browserProjectId: id,
    storageKind: entry ? entry.storageKind : 'browser-local',
    fileName: entry ? entry.fileName : null,
  };
}

export async function saveBrowserProject({
  projectJson,
  name,
  browserProjectId = null,
  fileHandle = null,
  fileName = null,
  storageKind = null,
  folderPath = null,
} = {}) {
  const content = String(projectJson || '{}');
  const projectName = inferProjectName(content, name);
  let nextStorageKind = storageKind || 'browser-local';
  let nextFolderPath = folderPath || 'Browser Storage';
  let nextFileName = fileName || null;

  if (fileHandle && typeof fileHandle.createWritable === 'function') {
    await writeHandleContent(fileHandle, content);
    nextStorageKind = 'browser-file';
    nextFileName = nextFileName || fileHandle.name || null;
    nextFolderPath = nextFileName ? `File System - ${nextFileName}` : 'File System';
  }

  const storage = getLocalStorage();
  if (!storage) {
    if (!fileHandle) {
      const downloadName = createSuggestedFileName(projectName, nextFileName);
      downloadJsonFile(content, downloadName);
      return {
        ok: true,
        downloaded: true,
        name: projectName,
        projectPath: null,
        folderPath: 'Download',
        browserProjectId: null,
        storageKind: nextStorageKind,
        fileHandle,
        fileName: downloadName,
      };
    }
    return {
      ok: true,
      name: projectName,
      projectPath: null,
      folderPath: nextFolderPath,
      browserProjectId: null,
      storageKind: nextStorageKind,
      fileHandle,
      fileName: nextFileName,
    };
  }

  const index = readSanitizedIndex(storage);
  const id = normalizeProjectId(browserProjectId) || createProjectId(projectName);
  const entry = sanitizeProjectEntry({
    id,
    name: projectName,
    folderPath: nextFolderPath,
    updatedAt: Date.now(),
    storageKind: nextStorageKind,
    fileName: nextFileName,
  });

  try {
    storage.setItem(projectContentKey(id), content);
    const nextIndex = [entry, ...index.filter((item) => item.id !== id)];
    if (!writeProjectIndex(nextIndex, storage)) {
      throw new Error('Failed to update browser project index');
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    name: projectName,
    projectPath: entry.projectPath,
    folderPath: entry.folderPath,
    browserProjectId: id,
    storageKind: entry.storageKind,
    fileHandle,
    fileName: entry.fileName,
  };
}

export async function saveBrowserProjectAs({
  projectJson,
  name,
  browserProjectId = null,
  fileHandle = null,
  fileName = null,
} = {}) {
  const capabilities = getBrowserProjectCapabilities();
  if (capabilities.canSaveFilePicker) {
    try {
      const [suggestedName, projectName] = [
        createSuggestedFileName(name || inferProjectName(projectJson), fileName),
        inferProjectName(projectJson, name),
      ];
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: 'Koz Project',
          accept: { 'application/json': ['.json'] },
        }],
      });
      return await saveBrowserProject({
        projectJson,
        name: projectName,
        browserProjectId,
        fileHandle: handle || fileHandle,
        fileName: (handle && handle.name) || fileName || suggestedName,
      });
    } catch (error) {
      if (error && error.name === 'AbortError') return { ok: false, canceled: true };
      return { ok: false, error: error.message };
    }
  }

  try {
    const result = await saveBrowserProject({
      projectJson,
      name,
      browserProjectId,
      fileHandle,
      fileName,
    });
    if (result && result.ok && !result.downloaded) {
      const downloadName = createSuggestedFileName(result.name || name, result.fileName || fileName);
      downloadJsonFile(projectJson, downloadName);
      return { ...result, downloaded: true, fileName: downloadName, folderPath: 'Browser Storage + Download' };
    }
    return result;
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function importBrowserProjectFromFile() {
  const capabilities = getBrowserProjectCapabilities();
  try {
    if (capabilities.canOpenFilePicker) {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'Koz Project',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const handle = Array.isArray(handles) ? handles[0] : null;
      if (!handle) return { ok: false, canceled: true };
      const file = await handle.getFile();
      const content = await file.text();
      const name = inferProjectName(content, stripJsonExtension(file.name));
      const saved = await saveBrowserProject({
        projectJson: content,
        name,
        fileHandle: handle,
        fileName: file.name,
      });
      return {
        ...saved,
        ok: true,
        content,
        fileHandle: handle,
        fileName: file.name,
      };
    }

    const file = await promptForJsonFile();
    if (!file) return { ok: false, canceled: true };
    const content = await file.text();
    const name = inferProjectName(content, stripJsonExtension(file.name));
    const saved = await saveBrowserProject({
      projectJson: content,
      name,
      fileName: file.name,
      storageKind: 'browser-import',
      folderPath: 'Imported File',
    });
    return {
      ...saved,
      ok: true,
      content,
      fileName: file.name,
    };
  } catch (error) {
    if (error && error.name === 'AbortError') return { ok: false, canceled: true };
    return { ok: false, error: error.message };
  }
}
