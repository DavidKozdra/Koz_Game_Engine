const AppStates = {
  MAIN_MENU: "MAIN_MENU",
  GAMEPLAY: "GAMEPLAY",
  PAUSED: "PAUSED",
};
const AppCommandTypes = {
  SET_STATE: "SET_STATE",
  START_MATCH: "START_MATCH",
  RESET_MATCH: "RESET_MATCH",
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

const PONG = {
  winningScore: 7,
  paddleWidth: 14,
  paddleHeight: 110,
  paddleSpeed: 470,
  aiSpeed: 390,
  ballRadius: 10,
  ballSpeed: 360,
  ballMaxSpeed: 780,
};

let kozRuntime = null;
let gameStateManager = null;
let gameObjectApi = null;

let leftPaddle = null;
let rightPaddle = null;
let ball = null;
let scores = { left: 0, right: 0 };
let winnerLabel = "";
let lastUiSyncKey = "";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomServeVector(direction) {
  const dir = direction === "left" ? -1 : 1;
  const angle = random(-PI / 4, PI / 4);
  return createVector(Math.cos(angle) * PONG.ballSpeed * dir, Math.sin(angle) * PONG.ballSpeed);
}

function resetRound(direction = random() < 0.5 ? "left" : "right") {
  const vector = randomServeVector(direction);
  ball.x = CANVAS.width / 2;
  ball.y = CANVAS.height / 2;
  ball.velocity.set(vector.x, vector.y);
}

function resetMatchState() {
  scores.left = 0;
  scores.right = 0;
  winnerLabel = "";
  leftPaddle.y = CANVAS.height / 2 - leftPaddle.height / 2;
  rightPaddle.y = CANVAS.height / 2 - rightPaddle.height / 2;
  resetRound();
  emitUiSync();
}

function getCurrentState() {
  return gameStateManager ? gameStateManager.currentState : AppStates.MAIN_MENU;
}

function emitUiSync(fromState = null, toState = getCurrentState(), force = false) {
  const state = toState || getCurrentState();
  const key = `${state}|${scores.left}|${scores.right}|${winnerLabel}`;
  if (!force && key === lastUiSyncKey) return;
  lastUiSyncKey = key;
  window.dispatchEvent(
    new CustomEvent(AppEvents.UI_SYNC, {
      detail: {
        fromState,
        toState: state,
        state,
        winnerLabel,
        scores: { left: scores.left, right: scores.right },
      },
    })
  );
}

function startMatch() {
  if (!gameStateManager) return;
  resetMatchState();
  gameStateManager.setState(AppStates.GAMEPLAY);
}

function resetMatch() {
  if (!leftPaddle || !rightPaddle || !ball) return;
  resetMatchState();
}

function togglePause() {
  if (!gameStateManager) return;
  if (gameStateManager.is(AppStates.GAMEPLAY)) {
    gameStateManager.setState(AppStates.PAUSED);
  } else if (gameStateManager.is(AppStates.PAUSED)) {
    gameStateManager.setState(AppStates.GAMEPLAY);
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
    if (type === AppCommandTypes.START_MATCH) {
      startMatch();
      return;
    }
    if (type === AppCommandTypes.RESET_MATCH) {
      resetMatch();
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

function initializeAppRuntime() {
  if (kozRuntime && gameStateManager) return;
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
  gameStateManager.addState(AppStates.GAMEPLAY);
  gameStateManager.addState(AppStates.PAUSED);
  gameStateManager.setTransitionRules({
    [AppStates.MAIN_MENU]: [AppStates.GAMEPLAY],
    [AppStates.GAMEPLAY]: [AppStates.MAIN_MENU, AppStates.PAUSED],
    [AppStates.PAUSED]: [AppStates.GAMEPLAY, AppStates.MAIN_MENU],
    "*": [AppStates.MAIN_MENU],
  });

  gameStateManager.onChange((from, to) => emitUiSync(from, to, true));
}

function setupGameEntities() {
  leftPaddle = kozRuntime.createGameObject("paddle", 30, CANVAS.height / 2 - PONG.paddleHeight / 2, {
    shape: "rect",
    width: PONG.paddleWidth,
    height: PONG.paddleHeight,
    tags: ["paddle", "left"],
  });
  leftPaddle.side = "left";

  rightPaddle = kozRuntime.createGameObject(
    "paddle",
    CANVAS.width - 30 - PONG.paddleWidth,
    CANVAS.height / 2 - PONG.paddleHeight / 2,
    {
      shape: "rect",
      width: PONG.paddleWidth,
      height: PONG.paddleHeight,
      tags: ["paddle", "right"],
    }
  );
  rightPaddle.side = "right";

  ball = kozRuntime.createGameObject("ball", CANVAS.width / 2, CANVAS.height / 2, {
    shape: "circle",
    radius: PONG.ballRadius,
    tags: ["ball"],
  });
  ball.velocity = createVector(0, 0);
  resetMatchState();
}

function setup() {
  const canvas = createCanvas(CANVAS.width, CANVAS.height);
  canvas.parent(document.body);
  pixelDensity(1);
  textFont("Trebuchet MS");

  initializeAppRuntime();
  registerUiCommandHandlers();
  setupGameEntities();
  gameStateManager.setState(AppStates.MAIN_MENU);
  emitUiSync(null, AppStates.MAIN_MENU, true);
}

function updatePlayer(dt) {
  const upPressed = keyIsDown(87) || keyIsDown(38);
  const downPressed = keyIsDown(83) || keyIsDown(40);
  let move = 0;
  if (upPressed) move -= 1;
  if (downPressed) move += 1;
  leftPaddle.y += move * PONG.paddleSpeed * dt;
  leftPaddle.y = clamp(leftPaddle.y, 0, CANVAS.height - leftPaddle.height);
}

function updateAi(dt) {
  const targetY = ball.y - rightPaddle.height / 2;
  if (Math.abs(targetY - rightPaddle.y) < 6) return;
  const direction = targetY > rightPaddle.y ? 1 : -1;
  rightPaddle.y += direction * PONG.aiSpeed * dt;
  rightPaddle.y = clamp(rightPaddle.y, 0, CANVAS.height - rightPaddle.height);
}

function bounceFromPaddle(paddle) {
  const hitOffset = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
  const bounceAngle = hitOffset * (PI / 3);
  let nextSpeed = Math.min(ball.velocity.mag() * 1.06, PONG.ballMaxSpeed);
  if (nextSpeed < PONG.ballSpeed) nextSpeed = PONG.ballSpeed;

  const dir = paddle.side === "right" ? -1 : 1;
  ball.velocity.set(Math.cos(bounceAngle) * nextSpeed * dir, Math.sin(bounceAngle) * nextSpeed);
  ball.x = paddle.side === "right" ? paddle.x - ball.radius : paddle.x + paddle.width + ball.radius;
}

function handlePaddleBallCollision() {
  const collisions = gameObjectApi.findCollisions([leftPaddle, rightPaddle, ball], {
    tagPairs: [["paddle", "ball"]],
    invokeCallbacks: false,
  });
  if (collisions.length === 0) return;
  const first = collisions[0];
  const paddle = first.a.hasTag("paddle") ? first.a : first.b;
  if (!paddle || paddle.type !== "paddle") return;
  bounceFromPaddle(paddle);
}

function checkScore() {
  if (ball.x < -ball.radius) {
    scores.right += 1;
    emitUiSync();
    if (scores.right >= PONG.winningScore) {
      winnerLabel = "Computer wins";
      gameStateManager.setState(AppStates.MAIN_MENU);
      return;
    }
    resetRound("left");
  } else if (ball.x > CANVAS.width + ball.radius) {
    scores.left += 1;
    emitUiSync();
    if (scores.left >= PONG.winningScore) {
      winnerLabel = "Player wins";
      gameStateManager.setState(AppStates.MAIN_MENU);
      return;
    }
    resetRound("right");
  }
}

function updateGameplay(dt) {
  updatePlayer(dt);
  updateAi(dt);

  ball.x += ball.velocity.x * dt;
  ball.y += ball.velocity.y * dt;

  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.velocity.y *= -1;
  } else if (ball.y + ball.radius >= CANVAS.height) {
    ball.y = CANVAS.height - ball.radius;
    ball.velocity.y *= -1;
  }

  handlePaddleBallCollision();
  checkScore();
}

function drawArena() {
  background("#081320");
  stroke("#1d3857");
  strokeWeight(2);
  for (let i = 10; i < CANVAS.height; i += 24) {
    line(CANVAS.width / 2, i, CANVAS.width / 2, i + 12);
  }

  noStroke();
  fill("#d8e9ff");
  rect(leftPaddle.x, leftPaddle.y, leftPaddle.width, leftPaddle.height, 5);
  rect(rightPaddle.x, rightPaddle.y, rightPaddle.width, rightPaddle.height, 5);
  circle(ball.x, ball.y, ball.radius * 2);
}

function drawMenuBackground() {
  background("#081320");
  stroke("#16314d");
  strokeWeight(2);
  for (let y = 0; y < CANVAS.height; y += 24) {
    line(0, y, CANVAS.width, y);
  }
}

function draw() {
  if (!gameStateManager) {
    background("#081320");
    fill("#ffffff");
    noStroke();
    textSize(16);
    textAlign(LEFT, TOP);
    text("Waiting for Koz runtime...", 12, 12);
    return;
  }

  const dt = Math.min(deltaTime / 1000, 0.033);
  if (gameStateManager.is(AppStates.GAMEPLAY)) {
    updateGameplay(dt);
  }

  if (gameStateManager.is(AppStates.MAIN_MENU)) {
    drawMenuBackground();
  } else {
    drawArena();
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
    if (gameStateManager.is(AppStates.MAIN_MENU)) startMatch();
    else gameStateManager.setState(AppStates.GAMEPLAY);
    return;
  }
  if (k === "p") {
    togglePause();
    return;
  }
  if (k === "r") {
    resetMatch();
  }
}
