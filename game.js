let state = null;
let elapsed = 0;

const GameStates = {
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
};

function ensureStateManager() {
  if (window.KozStateManager) return window.KozStateManager;

  if (typeof _createGameStateManager === "function") {
    window.KozStateManager = _createGameStateManager();
    return window.KozStateManager;
  }

  const Ctor = window.KozEngine?.Core?.gameStateManager?.GameStateManager || window.GameStateManager;
  if (typeof Ctor === "function") {
    window.KozStateManager = new Ctor();
    return window.KozStateManager;
  }

  throw new Error("GameStateManager is not available.");
}

function setup() {
  const canvas = createCanvas(960, 540);
  canvas.parent(document.body);
  pixelDensity(1);
  textFont("Trebuchet MS");

  state = ensureStateManager();

  if (!state.states?.[GameStates.READY]) state.addState(GameStates.READY, {});
  if (!state.states?.[GameStates.RUNNING]) state.addState(GameStates.RUNNING, {});
  if (!state.states?.[GameStates.PAUSED]) state.addState(GameStates.PAUSED, {});

  state.setTransitionRules({
    [GameStates.READY]: [GameStates.RUNNING],
    [GameStates.RUNNING]: [GameStates.PAUSED, GameStates.READY],
    [GameStates.PAUSED]: [GameStates.RUNNING, GameStates.READY],
    "*": [GameStates.READY],
  });

  state.onChange((_from, to) => {
    if (to === GameStates.READY) elapsed = 0;
  });

  if (!state.getState()) state.setState(GameStates.READY);
}

function updateGame(dt) {
  // TODO: Put your game simulation update logic here.
  elapsed += dt;
}

function drawReadyScreen() {
  background("#0b1220");

  fill("#e5e7eb");
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(42);
  text("Koz Engine Boilerplate", width / 2, height / 2 - 40);

  textSize(16);
  fill("#9ca3af");
  text("Replace this template with your own game logic.", width / 2, height / 2 + 4);
  text("Space: start | P: pause/resume | R: reset | Esc: ready", width / 2, height / 2 + 30);
}

function drawRunningScreen() {
  background("#111827");

  fill("#e5e7eb");
  noStroke();
  textAlign(LEFT, TOP);
  textSize(18);
  text(`State: ${state ? state.getState() : "READY"}`, 16, 16);
  text(`Elapsed: ${elapsed.toFixed(1)}s`, 16, 40);

  textSize(14);
  fill("#9ca3af");
  text("Running template. Implement your own gameplay systems.", 16, 72);
}

function drawPausedOverlay() {
  fill(2, 6, 14, 160);
  rect(0, 0, width, height);

  fill("#e5e7eb");
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(28);
  text("Paused", width / 2, height / 2);
}

function draw() {
  if (!state) {
    background("#111827");
    fill("#f9fafb");
    noStroke();
    textSize(16);
    textAlign(LEFT, TOP);
    text("Waiting for game bootstrap...", 12, 12);
    return;
  }

  const dt = Math.min(deltaTime / 1000, 0.033);

  if (state.is(GameStates.RUNNING)) {
    updateGame(dt);
    drawRunningScreen();
    return;
  }

  if (state.is(GameStates.PAUSED)) {
    drawRunningScreen();
    drawPausedOverlay();
    return;
  }

  drawReadyScreen();
}

function keyPressed() {
  const k = key.toLowerCase();

  if (k === " ") {
    if (state && state.is(GameStates.READY)) state.setState(GameStates.RUNNING);
    return;
  }

  if (k === "p") {
    if (state && state.is(GameStates.RUNNING)) state.setState(GameStates.PAUSED);
    else if (state && state.is(GameStates.PAUSED)) state.setState(GameStates.RUNNING);
    return;
  }

  if (k === "r") {
    if (state) state.setState(GameStates.READY);
    return;
  }

  if (keyCode === ESCAPE && state) state.setState(GameStates.READY);
}
