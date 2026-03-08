let state = null;
let elapsed = 0;
const GameStates = {
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
};

function setup() {
  const canvas = createCanvas(960, 540);
  canvas.parent(document.body);
  pixelDensity(1);
  textFont("Trebuchet MS");

  state = window.KozStateManager || null;
  if (!state) throw new Error("KozStateManager is not available. Check preload/bootstrap.");

  if (!state.states?.[GameStates.READY]) {
    state.addState(GameStates.READY, {
      onEnter: () => {
        elapsed = 0;
      },
    });
  }
  if (!state.states?.[GameStates.RUNNING]) {
    state.addState(GameStates.RUNNING, {});
  }
  if (!state.states?.[GameStates.PAUSED]) {
    state.addState(GameStates.PAUSED, {});
  }

  state.setTransitionRules({
    [GameStates.READY]: [GameStates.RUNNING],
    [GameStates.RUNNING]: [GameStates.PAUSED, GameStates.READY],
    [GameStates.PAUSED]: [GameStates.RUNNING, GameStates.READY],
    "*": [GameStates.READY],
  });

  if (!state.getState()) state.setState(GameStates.READY);
}

function drawBackground() {
  background("#111827");
  stroke("#1f2937");
  strokeWeight(1);
  for (let x = 0; x < width; x += 32) line(x, 0, x, height);
  for (let y = 0; y < height; y += 32) line(0, y, width, y);
}

function drawStatus() {
  noStroke();
  fill("#e5e7eb");
  textAlign(LEFT, TOP);
  textSize(18);
  text(`State: ${state ? state.getState() : GameStates.READY}`, 16, 16);
  text(`Time: ${elapsed.toFixed(1)}s`, 16, 40);

  textSize(14);
  fill("#9ca3af");
  text("Boilerplate loop active. Replace this with your game logic.", 16, 70);
}

function draw() {
  if (!state) {
    background("#111827");
    fill("#f9fafb");
    noStroke();
    textSize(16);
    textAlign(LEFT, TOP);
    text("Waiting for Koz runtime...", 12, 12);
    return;
  }

  if (state.is(GameStates.RUNNING)) {
    const dt = Math.min(deltaTime / 1000, 0.033);
    elapsed += dt;
  }

  drawBackground();
  drawStatus();
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
