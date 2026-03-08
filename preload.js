if (window.KozReady === undefined) window.KozReady = false;
if (window.KozInitError === undefined) window.KozInitError = null;

function _resolveConstructor(candidates, name) {
  for (const candidate of candidates) {
    if (typeof candidate === "function") return candidate;
  }
  throw new Error(`${name} constructor is not available.`);
}

function _createGameStateManager() {
  const Ctor = _resolveConstructor(
    [
      window.KozEngine?.Core?.gameStateManager?.GameStateManager,
      window.GameStateManager,
    ],
    "GameStateManager"
  );
  return new Ctor();
}

function preload() {
  try {
    let runtime = window.KozRuntime || null;
    if (!runtime && window.Koz && typeof window.Koz.autoInit === "function") {
      runtime = window.Koz.autoInit();
    }

    if (!window.KozStateManager) {
      window.KozStateManager = runtime && typeof runtime.createGameStateManager === "function"
        ? runtime.createGameStateManager()
        : _createGameStateManager();
    }

    window.KozReady = true;
    window.KozInitError = null;
  } catch (error) {
    window.KozReady = false;
    window.KozInitError = error;
    throw error;
  }
}
