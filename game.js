let state = null;
let GameObjectCtor = null;
let findCollisionsFn = null;

let leftPaddle = null;
let rightPaddle = null;
let ball = null;
let elapsed = 0;
let winner = "";
let scores = { left: 0, right: 0 };

const GameStates = {
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
};

const Pong = {
  winningScore: 7,
  paddleWidth: 14,
  paddleHeight: 110,
  paddleSpeed: 470,
  aiSpeed: 390,
  ballRadius: 10,
  ballSpeed: 360,
  ballMaxSpeed: 780,
};

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
  elapsed = 0;

  leftPaddle.x = 30;
  leftPaddle.y = height / 2 - leftPaddle.height / 2;
  rightPaddle.x = width - 30 - rightPaddle.width;
  rightPaddle.y = height / 2 - rightPaddle.height / 2;

  resetRound();
}

function setupEntities() {
  leftPaddle = new GameObjectCtor("paddle", 30, height / 2 - Pong.paddleHeight / 2, {
    shape: "rect",
    width: Pong.paddleWidth,
    height: Pong.paddleHeight,
    tags: ["paddle", "left"],
  });
  leftPaddle.side = "left";

  rightPaddle = new GameObjectCtor("paddle", width - 30 - Pong.paddleWidth, height / 2 - Pong.paddleHeight / 2, {
    shape: "rect",
    width: Pong.paddleWidth,
    height: Pong.paddleHeight,
    tags: ["paddle", "right"],
  });
  rightPaddle.side = "right";

  ball = new GameObjectCtor("ball", width / 2, height / 2, {
    shape: "circle",
    radius: Pong.ballRadius,
    tags: ["ball"],
  });
  ball.vx = 0;
  ball.vy = 0;
}

function setup() {
  const canvas = createCanvas(960, 540);
  canvas.parent(document.body);
  pixelDensity(1);
  textFont("Trebuchet MS");

  state = window.KozStateManager || null;
  if (!state) throw new Error("KozStateManager is not available. Check preload/bootstrap.");

  const gameObjectApi = window.KozEngine?.Core?.gameObject || null;
  GameObjectCtor = gameObjectApi?.GameObject || window.GameObject || null;
  findCollisionsFn = gameObjectApi?.findCollisions || null;
  if (!GameObjectCtor || typeof findCollisionsFn !== "function") {
    throw new Error("GameObject API is not available.");
  }

  if (!state.states?.[GameStates.READY]) {
    state.addState(GameStates.READY, {
      onEnter: () => {
        resetMatch();
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

  setupEntities();

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

function bounceFromPaddle(paddle) {
  const hitOffset = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
  const bounceAngle = hitOffset * (PI / 3);

  let speed = Math.hypot(ball.vx, ball.vy) * 1.06;
  speed = clamp(speed, Pong.ballSpeed, Pong.ballMaxSpeed);

  const dir = paddle.side === "right" ? -1 : 1;
  ball.vx = Math.cos(bounceAngle) * speed * dir;
  ball.vy = Math.sin(bounceAngle) * speed;
  ball.x = paddle.side === "right" ? paddle.x - ball.radius : paddle.x + paddle.width + ball.radius;
}

function handlePaddleBallCollision() {
  const collisions = findCollisionsFn([leftPaddle, rightPaddle, ball], {
    tagPairs: [["paddle", "ball"]],
    invokeCallbacks: false,
  });

  if (collisions.length === 0) return;

  const hit = collisions[0];
  const paddle = hit.a.hasTag("paddle") ? hit.a : hit.b;
  if (!paddle || paddle.type !== "paddle") return;

  bounceFromPaddle(paddle);
}

function checkScore() {
  if (ball.x < -ball.radius) {
    scores.right += 1;
    if (scores.right >= Pong.winningScore) {
      state.setState(GameStates.READY);
      winner = "Computer wins";
      return;
    }
    resetRound("left");
    return;
  }

  if (ball.x > width + ball.radius) {
    scores.left += 1;
    if (scores.left >= Pong.winningScore) {
      state.setState(GameStates.READY);
      winner = "Player wins";
      return;
    }
    resetRound("right");
  }
}

function updateGameplay(dt) {
  elapsed += dt;

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

function drawReadyScreen() {
  background("#081320");

  stroke("#16314d");
  strokeWeight(2);
  for (let y = 0; y < height; y += 24) {
    line(0, y, width, y);
  }

  noStroke();
  fill("#e8f2ff");
  textAlign(CENTER, CENTER);
  textSize(48);
  text("PONG", width / 2, height / 2 - 70);

  textSize(18);
  fill("#9fb6cf");
  text("First to 7 points", width / 2, height / 2 - 24);
  text("Space to start, P pause, R reset", width / 2, height / 2 + 6);

  if (winner) {
    fill("#d8e9ff");
    textSize(20);
    text(winner, width / 2, height / 2 + 46);
  }
}

function drawPauseOverlay() {
  fill(5, 10, 20, 150);
  rect(0, 0, width, height);

  fill("#e8f2ff");
  textAlign(CENTER, CENTER);
  textSize(28);
  text("Paused", width / 2, height / 2);
}

function draw() {
  if (!state || !leftPaddle || !rightPaddle || !ball) {
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
    drawPauseOverlay();
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
