(function initEngineBridge() {
  const ROOT = "Koz_Engine_Lib";
  const moduleCache = new Map();

  function normalizePath(path) {
    const parts = [];
    const segments = String(path || "").split("/");
    for (const segment of segments) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        parts.pop();
        continue;
      }
      parts.push(segment);
    }
    return parts.join("/");
  }

  function ensureJsExtension(path) {
    return path.endsWith(".js") ? path : `${path}.js`;
  }

  function resolveRequest(requestPath, parentDir) {
    let result = requestPath;
    if (parentDir && (requestPath.startsWith("./") || requestPath.startsWith("../"))) {
      result = `${parentDir}/${requestPath}`;
    }
    if (!result.startsWith(ROOT)) {
      result = `${ROOT}/${result}`.replace(/\/+/g, "/");
    }
    result = normalizePath(result);
    return ensureJsExtension(result);
  }

  function loadModule(requestPath, parentDir) {
    const normalizedPath = resolveRequest(requestPath, parentDir);
    if (moduleCache.has(normalizedPath)) {
      return moduleCache.get(normalizedPath);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("GET", normalizedPath, false);
    xhr.send(null);
    if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0)) {
      throw new Error(`Failed to fetch engine module: ${normalizedPath} (${xhr.status})`);
    }

    const module = { exports: {} };
    const exports = module.exports;
    const moduleDir = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
    const requireFn = (id) => loadModule(id, moduleDir);
    const wrapped = new Function("module", "exports", "require", `${xhr.responseText}\n//# sourceURL=${normalizedPath}`);
    wrapped(module, exports, requireFn);
    moduleCache.set(normalizedPath, module.exports);
    return module.exports;
  }

  window.EngineBridge = {
    require: (path) => loadModule(path, ROOT),
  };
})();
