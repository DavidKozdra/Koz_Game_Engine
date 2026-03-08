/*

if (window.KozReady === undefined) window.KozReady = false;
if (window.KozInitError === undefined) window.KozInitError = null;

function preload() {
  try {
    if (window.KozRuntime) {
      window.KozReady = true;
      window.KozInitError = null;
      return;
    }
    if (!window.Koz || typeof window.Koz.init !== "function") {
      throw new Error("Koz.init is unavailable. Ensure koz-engine.global.js is loaded.");
    }
    window.Koz.init({ setGlobalRuntime: true });
    window.KozReady = true;
    window.KozInitError = null;
  } catch (error) {
    window.KozReady = false;
    window.KozInitError = error;
    throw error;
  }
}
*/