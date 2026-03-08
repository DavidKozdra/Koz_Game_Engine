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
  return {
    vx: Math.cos(angle) * PONG.ballSpeed * dir,
    vy: Math.sin(angle) * PONG.ballSpeed,
  };
}

function resetRound(direction = random() < 0.5 ? "left" : "right") {
  const vector = randomServeVector(direction);
  ball.x = CANVAS.width / 2;
  ball.y = CANVAS.height / 2;
  ball.vx = vector.vx;
  ball.vy = vector.vy;
}

function resetMatchState() {
  scores.left = 0;
  scores.right = 0;
  winnerLabel = "";
  leftPaddle.y = CANVAS.height / 2 - PONG.paddleHeight / 2;
  rightPaddle.y = CANVAS.height / 2 - PONG.paddleHeight / 2;
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
  leftPaddle = {
    x: 30,
    y: CANVAS.height / 2 - PONG.paddleHeight / 2,
    w: PONG.paddleWidth,
    h: PONG.paddleHeight,
  };
  rightPaddle = {
    x: CANVAS.width - 30 - PONG.paddleWidth,
    y: CANVAS.height / 2 - PONG.paddleHeight / 2,
    w: PONG.paddleWidth,
    h: PONG.paddleHeight,
  };
  ball = { x: 0, y: 0, vx: 0, vy: 0, r: PONG.ballRadius };
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
  leftPaddle.y = clamp(leftPaddle.y, 0, CANVAS.height - leftPaddle.h);
}

function updateAi(dt) {
  const targetY = ball.y - rightPaddle.h / 2;
  if (Math.abs(targetY - rightPaddle.y) < 6) return;
  const direction = targetY > rightPaddle.y ? 1 : -1;
  rightPaddle.y += direction * PONG.aiSpeed * dt;
  rightPaddle.y = clamp(rightPaddle.y, 0, CANVAS.height - rightPaddle.h);
}

function bounceFromPaddle(paddle, movingRight) {
  const withinX = movingRight
    ? ball.x + ball.r >= paddle.x && ball.x - ball.r <= paddle.x + paddle.w
    : ball.x - ball.r <= paddle.x + paddle.w && ball.x + ball.r >= paddle.x;
  const withinY = ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h;
  if (!withinX || !withinY) return false;

  const hitOffset = (ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2);
  const bounceAngle = hitOffset * (PI / 3);
  let nextSpeed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.06, PONG.ballMaxSpeed);
  if (nextSpeed < PONG.ballSpeed) nextSpeed = PONG.ballSpeed;

  const dir = movingRight ? -1 : 1;
  ball.vx = Math.cos(bounceAngle) * nextSpeed * dir;
  ball.vy = Math.sin(bounceAngle) * nextSpeed;
  ball.x = movingRight ? paddle.x - ball.r : paddle.x + paddle.w + ball.r;
  return true;
}

function checkScore() {
  if (ball.x < -ball.r) {
    scores.right += 1;
    if (scores.right >= PONG.winningScore) {
      winnerLabel = "Computer wins";
      gameStateManager.setState(AppStates.MAIN_MENU);
      return;
    }
    resetRound("left");
  } else if (ball.x > CANVAS.width + ball.r) {
    scores.left += 1;
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

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.y - ball.r <= 0) {
    ball.y = ball.r;
    ball.vy *= -1;
  } else if (ball.y + ball.r >= CANVAS.height) {
    ball.y = CANVAS.height - ball.r;
    ball.vy *= -1;
  }

  if (!bounceFromPaddle(rightPaddle, true)) {
    bounceFromPaddle(leftPaddle, false);
  }
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
  rect(leftPaddle.x, leftPaddle.y, leftPaddle.w, leftPaddle.h, 5);
  rect(rightPaddle.x, rightPaddle.y, rightPaddle.w, rightPaddle.h, 5);
  circle(ball.x, ball.y, ball.r * 2);
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
