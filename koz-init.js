const Koz = (window.Koz = window.Koz || {});

Koz.init = function initKoz() {
  const engine = window.KozEngine || {};

  function resolveFromEngine(path) {
    const parts = String(path || "").split(".").filter(Boolean);
    let current = engine;
    for (const part of parts) {
      if (!current || !(part in current)) return undefined;
      current = current[part];
    }
    return current;
  }

  function requireFunction(path, label) {
    const fn = resolveFromEngine(path);
    if (typeof fn !== "function") {
      throw new Error(`Missing engine function: ${label || path}`);
    }
    return fn;
  }

  function requireConstructor(path, label) {
    return requireFunction(path, label);
  }

  const hasCore = !!window.KozEngine?.Core?.gameStateManager?.GameStateManager;
  const hasWorldSpace = !!window.KozEngine?.World?.worldSpace?.createWorldSpace;
  const hasWorldEditor = !!window.KozEngine?.World?.worldEditor?.createWorldEditor;
  if (!hasCore || !hasWorldSpace || !hasWorldEditor) {
    throw new Error("KozEngine is not fully loaded. Ensure koz-engine.global.js loads before init.");
  }

  return {
    engine,
    resolve: resolveFromEngine,
    call(path, ...args) {
      return requireFunction(path, path)(...args);
    },
    construct(path, ...args) {
      const Ctor = requireConstructor(path, path);
      return new Ctor(...args);
    },
    createGameStateManager() {
      const Ctor = requireConstructor("Core.gameStateManager.GameStateManager", "GameStateManager");
      return new Ctor();
    },
    createWorldSpace(options) {
      return requireFunction("World.worldSpace.createWorldSpace", "createWorldSpace")(options);
    },
    createWorldEditor(options) {
      return requireFunction("World.worldEditor.createWorldEditor", "createWorldEditor")(options);
    },
  };
};
