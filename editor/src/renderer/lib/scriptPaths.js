function normalizePath(value) {
  return String(value || '').trim().replace(/\\/g, '/');
}

function stripTrailingSlash(value) {
  if (!value || value === '/') return value;
  if (/^[A-Za-z]:\/$/.test(value)) return value;
  return value.replace(/\/+$/g, '');
}

function lastSegment(value) {
  const normalized = stripTrailingSlash(normalizePath(value));
  if (!normalized) return '';
  const segments = normalized.split('/');
  return segments[segments.length - 1] || '';
}

export function isAbsolutePath(value) {
  const normalized = normalizePath(value);
  return normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//');
}

export function getProjectFolderPath(projectPath) {
  const normalized = stripTrailingSlash(normalizePath(projectPath));
  if (!normalized) return '';
  const segment = lastSegment(normalized).toLowerCase();
  if (segment.endsWith('.json')) {
    const slashIndex = normalized.lastIndexOf('/');
    if (slashIndex < 0) return '';
    return slashIndex === 0 ? '/' : normalized.slice(0, slashIndex);
  }
  return normalized;
}

export function getScriptsFolderPath(projectPath) {
  const folder = stripTrailingSlash(getProjectFolderPath(projectPath));
  if (!folder) return 'scripts';
  return lastSegment(folder).toLowerCase() === 'scripts' ? folder : `${folder}/scripts`;
}

export function resolveScriptFilePath(projectPath, scriptPath) {
  const normalizedScriptPath = normalizePath(scriptPath);
  if (!normalizedScriptPath) return '';
  if (isAbsolutePath(normalizedScriptPath)) return normalizedScriptPath;
  const scriptsFolder = stripTrailingSlash(getScriptsFolderPath(projectPath));
  const relativePath = normalizedScriptPath.replace(/^\/+/g, '');
  return scriptsFolder ? `${scriptsFolder}/${relativePath}` : relativePath;
}
