window.KozReady = false;
window.KozInitError = null;

function preload() {
  try {
    if (!window.Koz || typeof window.Koz.init !== "function") {
      throw new Error("Koz.init is unavailable. Ensure koz-engine.global.js is loaded.");
    }
    window.KozRuntime = window.Koz.init();
    window.KozReady = true;
  } catch (error) {
    window.KozReady = false;
    window.KozInitError = error;
    throw error;
  }
}
