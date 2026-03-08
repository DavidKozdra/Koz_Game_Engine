const AppStates = {
  MAIN_MENU: "MAIN_MENU",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  LEVEL_EDITOR: "LEVEL_EDITOR",
};

<<<<<<< Updated upstream
const GRID = {
  cols: 24,
  rows: 14,
  tileSize: 36,
=======
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
>>>>>>> Stashed changes
};

const CANVAS = {
  width: GRID.cols * GRID.tileSize,
  height: GRID.rows * GRID.tileSize,
};

<<<<<<< Updated upstream
const CellType = {
  EMPTY: "empty",
  SOLID: "solid",
=======
const DEMO = {
  actorSize: 44,
  actorSpeed: 280,
  targetRadius: 42,
>>>>>>> Stashed changes
};

let kozRuntime = null;
let world = null;
let worldEditor = null;
let gameStateManager = null;

<<<<<<< Updated upstream
let activeBrush = CellType.SOLID;

function initializeAppRuntime() {
  if (kozRuntime && world && worldEditor && gameStateManager) return;
  if (!window.KozReady || !window.KozRuntime) {
    const reason = window.KozInitError ? ` ${window.KozInitError.message}` : "";
    throw new Error(`Koz runtime is not ready.${reason}`);
  }

  kozRuntime = window.KozRuntime;
  world = kozRuntime.createWorldSpace({
    cols: GRID.cols,
    rows: GRID.rows,
    defaultCell: { type: CellType.EMPTY },
  });
  worldEditor = kozRuntime.createWorldEditor({ world });
  gameStateManager = kozRuntime.createGameStateManager();

  gameStateManager.addState(AppStates.MAIN_MENU);
  gameStateManager.addState(AppStates.GAMEPLAY);
  gameStateManager.addState(AppStates.PAUSED);
  gameStateManager.addState(AppStates.LEVEL_EDITOR);
  gameStateManager.setTransitionRules({
    [AppStates.MAIN_MENU]: [AppStates.GAMEPLAY, AppStates.LEVEL_EDITOR],
    [AppStates.GAMEPLAY]: [AppStates.PAUSED, AppStates.MAIN_MENU, AppStates.LEVEL_EDITOR],
    [AppStates.PAUSED]: [AppStates.GAMEPLAY, AppStates.MAIN_MENU],
    [AppStates.LEVEL_EDITOR]: [AppStates.MAIN_MENU, AppStates.GAMEPLAY],
    "*": [AppStates.MAIN_MENU],
  });

  gameStateManager.onChange((from, to) => {
      window.KozBoilerplateApp.onStateChange(to, from);

  });
}

=======
let actor = null;
let target = null;
let statusText = "Ready. Press Start.";
let isTouchingTarget = false;
let lastUiSyncKey = "";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCurrentState() {
  return gameStateManager ? gameStateManager.currentState : AppStates.MAIN_MENU;
}

function emitUiSync(fromState = null, toState = getCurrentState(), force = false) {
  const state = toState || getCurrentState();
  const key = `${state}|${statusText}|${isTouchingTarget}`;
  if (!force && key === lastUiSyncKey) return;
  lastUiSyncKey = key;

  window.dispatchEvent(
    new CustomEvent(AppEvents.UI_SYNC, {
      detail: {
        fromState,
        toState: state,
        state,
        statusText,
        flags: {
          isTouchingTarget,
        },
      },
    })
  );
}

function initializeAppRuntime() {
  if (kozRuntime && gameStateManager && gameObjectApi) return;
  if (!window.KozReady || !window.KozRuntime) {
    const reason = window.KozInitError ? ` ${window.KozInitError.message}` : "";
    throw new Error(`Koz runtime is not ready.${reason}`);
  }

  kozRuntime = window.KozRuntime;
  gameStateManager = kozRuntime.createGameStateManager();
  gameObjectApi = kozRuntime.resolve("Core.gameObject");
  if (!gameObjectApi || typeof gameObjectApi.GameObject !== "function") {
    throw new Error("Koz GameObject module is unavailable.");
  }

  gameStateManager.addState(AppStates.MAIN_MENU);
  gameStateManager.addState(AppStates.RUNNING);
  gameStateManager.addState(AppStates.PAUSED);
  gameStateManager.setTransitionRules({
    [AppStates.MAIN_MENU]: [AppStates.RUNNING],
    [AppStates.RUNNING]: [AppStates.MAIN_MENU, AppStates.PAUSED],
    [AppStates.PAUSED]: [AppStates.RUNNING, AppStates.MAIN_MENU],
    "*": [AppStates.MAIN_MENU],
  });

  gameStateManager.onChange((from, to) => emitUiSync(from, to, true));
}

function createDemoObjects() {
  actor = kozRuntime.createGameObject(
    "actor",
    CANVAS.width / 2 - DEMO.actorSize / 2,
    CANVAS.height / 2 - DEMO.actorSize / 2,
    {
      shape: "rect",
      width: DEMO.actorSize,
      height: DEMO.actorSize,
      tags: ["actor", "player"],
    }
  );

  target = kozRuntime.createGameObject("target", CANVAS.width * 0.72, CANVAS.height * 0.48, {
    shape: "circle",
    radius: DEMO.targetRadius,
    tags: ["target"],
  });

  statusText = "Move the block into the target zone.";
  isTouchingTarget = false;
}

function resetSimulation() {
  if (!actor || !target) return;
  actor.x = CANVAS.width / 2 - DEMO.actorSize / 2;
  actor.y = CANVAS.height / 2 - DEMO.actorSize / 2;
  target.x = CANVAS.width * 0.72;
  target.y = CANVAS.height * 0.48;
  statusText = "Move the block into the target zone.";
  isTouchingTarget = false;
  emitUiSync();
}

function startSimulation() {
  if (!gameStateManager) return;
  resetSimulation();
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
      startSimulation();
      return;
    }
    if (type === AppCommandTypes.RESET) {
      resetSimulation();
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

>>>>>>> Stashed changes
function setup() {
  const canvas = createCanvas(CANVAS.width, CANVAS.height);
  canvas.parent(document.body);
  pixelDensity(1);
  initializeAppRuntime();
<<<<<<< Updated upstream
  gameStateManager.setState(AppStates.MAIN_MENU);
=======
  registerUiCommandHandlers();
  createDemoObjects();

  gameStateManager.setState(AppStates.MAIN_MENU);
  emitUiSync(null, AppStates.MAIN_MENU, true);
}

function updateSimulation(dt) {
  let xInput = 0;
  let yInput = 0;
  if (keyIsDown(65) || keyIsDown(37)) xInput -= 1;
  if (keyIsDown(68) || keyIsDown(39)) xInput += 1;
  if (keyIsDown(87) || keyIsDown(38)) yInput -= 1;
  if (keyIsDown(83) || keyIsDown(40)) yInput += 1;

  actor.x += xInput * DEMO.actorSpeed * dt;
  actor.y += yInput * DEMO.actorSpeed * dt;
  actor.x = clamp(actor.x, 0, CANVAS.width - actor.width);
  actor.y = clamp(actor.y, 0, CANVAS.height - actor.height);

  const nowTouching = kozRuntime.tagCollides(actor, target, "actor", "target");
  if (nowTouching !== isTouchingTarget) {
    isTouchingTarget = nowTouching;
    statusText = isTouchingTarget ? "Collision detected via tagCollides(actor,target)." : "Move the block into the target zone.";
    emitUiSync();
  }
}

function drawMenu() {
  background("#0d1a2a");
  stroke("#1d3655");
  strokeWeight(2);
  for (let y = 0; y < CANVAS.height; y += 26) {
    line(0, y, CANVAS.width, y);
  }

  noStroke();
  fill("#e5eef9");
  textAlign(CENTER, CENTER);
  textSize(22);
  text("Koz Engine Boilerplate", CANVAS.width / 2, CANVAS.height / 2 - 22);
  textSize(14);
  text("Use UI controls or press Space to start", CANVAS.width / 2, CANVAS.height / 2 + 12);
}

function drawSimulation() {
  background("#0b1522");

  noFill();
  stroke("#355b85");
  strokeWeight(2);
  circle(target.x, target.y, target.radius * 2);

  noStroke();
  fill(isTouchingTarget ? "#7de57f" : "#dbe7ff");
  rect(actor.x, actor.y, actor.width, actor.height, 6);

  fill("#a8bdd6");
  textAlign(LEFT, TOP);
  textSize(13);
  text("WASD / Arrows to move", 12, 12);
  text(`State: ${getCurrentState()}`, 12, 30);
}

function drawPausedOverlay() {
  fill(7, 16, 26, 180);
  rect(0, 0, CANVAS.width, CANVAS.height);

  fill("#e5eef9");
  textAlign(CENTER, CENTER);
  textSize(24);
  text("Paused", CANVAS.width / 2, CANVAS.height / 2);
>>>>>>> Stashed changes
}

function draw() {
  if (!world || !gameStateManager) {
    background("#0b1a2b");
    fill("#ffffff");
    noStroke();
    textSize(16);
    textAlign(LEFT, TOP);
    text("Waiting for Koz runtime...", 12, 12);
    return;
  }
<<<<<<< Updated upstream
  background("#0b1a2b");
  drawWorld();
  if (gameStateManager.is(AppStates.LEVEL_EDITOR)) {
    drawEditorCursor();
  }
}

function drawWorld() {
  stroke("#1f3552");
  strokeWeight(1);
  for (let y = 0; y < GRID.rows; y++) {
    for (let x = 0; x < GRID.cols; x++) {
      const cell = world.getCell(x, y);
      const isSolid = cell?.type === CellType.SOLID;
      fill(isSolid ? "#7dd3fc" : "#11243c");
      rect(x * GRID.tileSize, y * GRID.tileSize, GRID.tileSize, GRID.tileSize);
    }
=======

  const dt = Math.min(deltaTime / 1000, 0.033);
  if (gameStateManager.is(AppStates.RUNNING)) {
    updateSimulation(dt);
  }

  if (gameStateManager.is(AppStates.MAIN_MENU)) {
    drawMenu();
    return;
  }

  drawSimulation();
  if (gameStateManager.is(AppStates.PAUSED)) {
    drawPausedOverlay();
  }
}

function keyPressed() {
  if (!gameStateManager) return;
  const k = key.toLowerCase();

  if (k === "1" || keyCode === ESCAPE) {
    gameStateManager.setState(AppStates.MAIN_MENU);
    return;
  }
  if (k === "2" || keyCode === 32) {
    if (gameStateManager.is(AppStates.MAIN_MENU)) startSimulation();
    else gameStateManager.setState(AppStates.RUNNING);
    return;
  }
  if (k === "p") {
    togglePause();
    return;
  }
  if (k === "r") {
    resetSimulation();
>>>>>>> Stashed changes
  }
}


