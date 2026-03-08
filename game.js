let state = null;

const GameStates = {
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
};

const Pong = {
  winningScore: 12,
  paddleWidth: 14,
  paddleHeight: 110,
  paddleSpeed: 470,
  aiSpeed: 390,
  ballRadius: 10,
  ballSpeed: 360,
  ballMaxSpeed: 780,
};

const leftPaddle = { x: 0, y: 0, width: Pong.paddleWidth, height: Pong.paddleHeight };
const rightPaddle = { x: 0, y: 0, width: Pong.paddleWidth, height: Pong.paddleHeight };
const ball = { x: 0, y: 0, vx: 0, vy: 0, radius: Pong.ballRadius };

let scores = { left: 0, right: 0 };
let winner = "";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomServeVelocity(direction) {
  const dir = direction === "left" ? -1 : 1;
  const angle = random(-PI / 4, PI / 4);
  return {
    vx: Math.cos(angle) * Pong.ballSpeed * dir,
    vy: Math.sin(angle) * Pong.ballSpeed,
  };
}

function resetRound(direction = random() < 0.5 ? "left" : "right") {
  const velocity = randomServeVelocity(direction);
  ball.x = width / 2;
  ball.y = height / 2;
  ball.vx = velocity.vx;
  ball.vy = velocity.vy;
}

function resetMatch() {
  scores.left = 0;
  scores.right = 0;
  winner = "";

  leftPaddle.x = 30;
  leftPaddle.y = height / 2 - leftPaddle.height / 2;
  rightPaddle.x = width - 30 - rightPaddle.width;
  rightPaddle.y = height / 2 - rightPaddle.height / 2;

  resetRound();
}

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
  const canvas = createCanvas(2400, 1040);
  canvas.parent(document.body);
  pixelDensity(1);
  textFont("Trebuchet MS");

  state = ensureStateManager();

  if (!state.states?.[GameStates.READY]) {
    state.addState(GameStates.READY, { onEnter: () => resetMatch() });
  }
  if (!state.states?.[GameStates.RUNNING]) state.addState(GameStates.RUNNING, {});
  if (!state.states?.[GameStates.PAUSED]) state.addState(GameStates.PAUSED, {});

  state.setTransitionRules({
    [GameStates.READY]: [GameStates.RUNNING],
    [GameStates.RUNNING]: [GameStates.PAUSED, GameStates.READY],
    [GameStates.PAUSED]: [GameStates.RUNNING, GameStates.READY],
    "*": [GameStates.READY],
  });

  if (!state.getState()) state.setState(GameStates.READY);
  else if (state.getState() === GameStates.READY) resetMatch();
}

function updatePlayer(dt) {
  const upPressed = keyIsDown(87) || keyIsDown(38);
  const downPressed = keyIsDown(83) || keyIsDown(40);
  let move = 0;
  if (upPressed) move -= 1;
  if (downPressed) move += 1;

  leftPaddle.y += move * Pong.paddleSpeed * dt;
  leftPaddle.y = clamp(leftPaddle.y, 0, height - leftPaddle.height);
}

function updateAi(dt) {
  const targetY = ball.y - rightPaddle.height / 2;
  if (Math.abs(targetY - rightPaddle.y) < 6) return;

  const direction = targetY > rightPaddle.y ? 1 : -1;
  rightPaddle.y += direction * Pong.aiSpeed * dt;
  rightPaddle.y = clamp(rightPaddle.y, 0, height - rightPaddle.height);
}

function ballHitsPaddle(paddle) {
  const ballLeft = ball.x - ball.radius;
  const ballRight = ball.x + ball.radius;
  const ballTop = ball.y - ball.radius;
  const ballBottom = ball.y + ball.radius;

  const paddleLeft = paddle.x;
  const paddleRight = paddle.x + paddle.width;
  const paddleTop = paddle.y;
  const paddleBottom = paddle.y + paddle.height;

  return ballRight >= paddleLeft &&
    ballLeft <= paddleRight &&
    ballBottom >= paddleTop &&
    ballTop <= paddleBottom;
}

function bounceFromPaddle(paddle, side) {
  const hitOffset = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
  const bounceAngle = hitOffset * (PI / 3);

  let speed = Math.hypot(ball.vx, ball.vy) * 1.06;
  speed = clamp(speed, Pong.ballSpeed, Pong.ballMaxSpeed);

  const dir = side === "right" ? -1 : 1;
  ball.vx = Math.cos(bounceAngle) * speed * dir;
  ball.vy = Math.sin(bounceAngle) * speed;
  ball.x = side === "right"
    ? paddle.x - ball.radius
    : paddle.x + paddle.width + ball.radius;
}

function handlePaddleBallCollision() {
  if (ball.vx < 0 && ballHitsPaddle(leftPaddle)) {
    bounceFromPaddle(leftPaddle, "left");
    return;
  }
  if (ball.vx > 0 && ballHitsPaddle(rightPaddle)) {
    bounceFromPaddle(rightPaddle, "right");
  }
}

function checkScore() {
  if (ball.x < -ball.radius) {
    scores.right += 1;
    if (scores.right >= Pong.winningScore) {
      winner = "Computer wins";
      state.setState(GameStates.READY);
      return;
    }
    resetRound("left");
    return;
  }

  if (ball.x > width + ball.radius) {
    scores.left += 1;
    if (scores.left >= Pong.winningScore) {
      winner = "Player wins";
      state.setState(GameStates.READY);
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

  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy *= -1;
  } else if (ball.y + ball.radius >= height) {
    ball.y = height - ball.radius;
    ball.vy *= -1;
  }

  handlePaddleBallCollision();
  checkScore();
}

function drawArena() {
  background("#081320");

  stroke("#1d3857");
  strokeWeight(2);
  for (let y = 10; y < height; y += 24) {
    line(width / 2, y, width / 2, y + 12);
  }

  noStroke();
  fill("#d8e9ff");
  rect(leftPaddle.x, leftPaddle.y, leftPaddle.width, leftPaddle.height, 5);
  rect(rightPaddle.x, rightPaddle.y, rightPaddle.width, rightPaddle.height, 5);
  circle(ball.x, ball.y, ball.radius * 2);

  fill("#9fb6cf");
  textSize(16);
  textAlign(CENTER, TOP);
  text(`Player ${scores.left} : ${scores.right} CPU`, width / 2, 16);
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
    updateGameplay(dt);
    drawArena();
    return;
  }

  if (state.is(GameStates.PAUSED)) {
    drawArena();
    return;
  }

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
