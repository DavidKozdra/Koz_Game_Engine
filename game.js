const AppStates = {
  BOOT: "BOOT",
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
};

const AppCommandTypes = {
  SET_STATE: "SET_STATE",
  START: "START",
  RESET: "RESET",
  TOGGLE_PAUSE: "TOGGLE_PAUSE",
  SYNC: "SYNC",
};

const AppEvents = {
  COMMAND: "koz:command",
  UI_SYNC: "koz:ui-sync",
};

const CANVAS = {
  width: 960,
  height: 540,
};

let kozRuntime = null;
let gameStateManager = null;
let appTime = 0;
let lastUiSyncKey = "";

function getCurrentState() {
  return gameStateManager ? gameStateManager.currentState : AppStates.BOOT;
}

function emitUiSync(fromState = null, toState = getCurrentState(), force = false) {
  const state = toState || getCurrentState();
  const key = `${state}|${Math.floor(appTime * 10)}`;
  if (!force && key === lastUiSyncKey) return;
  lastUiSyncKey = key;

  window.dispatchEvent(
    new CustomEvent(AppEvents.UI_SYNC, {
      detail: {
        fromState,
        toState: state,
        state,
        appTime,
      },
    })
  );
}

function initializeAppRuntime() {
  if (kozRuntime && gameStateManager) return;

  if (!window.KozReady || !window.KozRuntime) {
    const reason = window.KozInitError ? ` ${window.KozInitError.message}` : "";
    throw new Error(`Koz runtime is not ready.${reason}`);
  }

  kozRuntime = window.KozRuntime;
  gameStateManager = kozRuntime.createGameStateManager();

  gameStateManager.addState(AppStates.BOOT);
  gameStateManager.addState(AppStates.READY);
  gameStateManager.addState(AppStates.RUNNING);
  gameStateManager.addState(AppStates.PAUSED);

  gameStateManager.setTransitionRules({
    [AppStates.BOOT]: [AppStates.READY],
    [AppStates.READY]: [AppStates.RUNNING],
    [AppStates.RUNNING]: [AppStates.PAUSED, AppStates.READY],
    [AppStates.PAUSED]: [AppStates.RUNNING, AppStates.READY],
    "*": [AppStates.READY],
  });

  gameStateManager.onChange((from, to) => emitUiSync(from, to, true));
  gameStateManager.setState(AppStates.READY);
}

function resetApp() {
  appTime = 0;
  if (gameStateManager) gameStateManager.setState(AppStates.READY);
  emitUiSync(null, getCurrentState(), true);
}

function startApp() {
  if (!gameStateManager) return;
  appTime = 0;
  gameStateManager.setState(AppStates.RUNNING);
}

function togglePause() {
  if (!gameStateManager) return;
  if (gameStateManager.is(AppStates.RUNNING)) {
    gameStateManager.setState(AppStates.PAUSED);
  } else if (gameStateManager.is(AppStates.PAUSED)) {
    gameStateManager.setState(AppStates.RUNNING);
  }
}

function registerUiCommandHandlers() {
  window.addEventListener(AppEvents.COMMAND, (event) => {
    const detail = event && event.detail ? event.detail : {};
    const type = detail.type;

    if (type === AppCommandTypes.SET_STATE) {
      if (gameStateManager && detail.state) gameStateManager.setState(detail.state);
      return;
    }
    if (type === AppCommandTypes.START) {
      startApp();
      return;
    }
    if (type === AppCommandTypes.RESET) {
      resetApp();
      return;
    }
    if (type === AppCommandTypes.TOGGLE_PAUSE) {
      togglePause();
      return;
    }
    if (type === AppCommandTypes.SYNC) {
      emitUiSync(null, getCurrentState(), true);
    }
  });
}

function setup() {
  const canvas = createCanvas(CANVAS.width, CANVAS.height);
  canvas.parent(document.body);
  pixelDensity(1);
  textFont("Trebuchet MS");

  initializeAppRuntime();
  registerUiCommandHandlers();
  emitUiSync(null, getCurrentState(), true);
}

function drawBackground() {
  background("#111827");
  stroke("#1f2937");
  strokeWeight(1);
  for (let x = 0; x < CANVAS.width; x += 32) {
    line(x, 0, x, CANVAS.height);
  }
  for (let y = 0; y < CANVAS.height; y += 32) {
    line(0, y, CANVAS.width, y);
  }
}

function drawStatus() {
  const state = getCurrentState();

  noStroke();
  fill("#e5e7eb");
  textAlign(LEFT, TOP);
  textSize(18);
  text(`State: ${state}`, 16, 16);
  text(`Time: ${appTime.toFixed(1)}s`, 16, 40);

  textSize(14);
  fill("#9ca3af");
  text("Boilerplate loop active. Replace this with your game logic.", 16, 70);
}

function draw() {
  if (!gameStateManager) {
    background("#111827");
    fill("#f9fafb");
    noStroke();
    textSize(16);
    textAlign(LEFT, TOP);
    text("Waiting for Koz runtime...", 12, 12);
    return;
  }

  const dt = Math.min(deltaTime / 1000, 0.033);
  if (gameStateManager.is(AppStates.RUNNING)) {
    appTime += dt;
  }

  drawBackground();
  drawStatus();
  emitUiSync();
}

function keyPressed() {
  const k = key.toLowerCase();
  if (k === " ") {
    if (gameStateManager.is(AppStates.READY)) startApp();
    return;
  }
  if (k === "p") {
    togglePause();
    return;
  }
  if (k === "r") {
    resetApp();
    return;
  }
  if (keyCode === ESCAPE) {
    if (gameStateManager) gameStateManager.setState(AppStates.READY);
  }
}
