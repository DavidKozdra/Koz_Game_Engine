function cellTypeId(cell) {
  if (cell == null) return 'empty';
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'object') return cell.typeId || cell.id || 'empty';
  return String(cell);
}

function isSolidCell(cell) {
  if (cell == null) return false;

  if (typeof cell === 'object') {
    if (cell.solid === true) return true;
    if (cell.collision === true) return true;
    if (cell.collides === true) return true;
  }

  var id = cellTypeId(cell);
  return id === 'solid' || id === 'wall' || id === 'block' || id === 'ground';
}

function rectTouchesType(x, y, width, height, engine, typeId) {
  var world = engine && engine.world;
  if (!world || typeof world.sampleCell !== 'function') return false;

  var cellSize = world.cellSize || 24;
  var left = Math.floor((x + 1) / cellSize);
  var right = Math.floor((x + width - 1) / cellSize);
  var top = Math.floor((y + 1) / cellSize);
  var bottom = Math.floor((y + height - 1) / cellSize);

  for (var cy = top; cy <= bottom; cy += 1) {
    for (var cx = left; cx <= right; cx += 1) {
      if (cellTypeId(world.sampleCell(cx, cy)) === typeId) {
        return true;
      }
    }
  }

  return false;
}

function rectTouchesSolid(x, y, width, height, engine) {
  var world = engine && engine.world;
  if (!world || typeof world.sampleCell !== 'function') return false;

  var cellSize = world.cellSize || 24;
  var left = Math.floor((x + 1) / cellSize);
  var right = Math.floor((x + width - 1) / cellSize);
  var top = Math.floor((y + 1) / cellSize);
  var bottom = Math.floor((y + height - 1) / cellSize);

  for (var cy = top; cy <= bottom; cy += 1) {
    for (var cx = left; cx <= right; cx += 1) {
      if (isSolidCell(world.sampleCell(cx, cy))) {
        return true;
      }
    }
  }

  return false;
}

function moveAxis(self, engine, amount, axis) {
  if (!amount) return false;

  var world = engine && engine.world;
  var cellSize = (world && world.cellSize) || 24;
  var stepSize = Math.max(1, Math.floor(cellSize / 4));
  var remaining = amount;
  var collided = false;

  while (Math.abs(remaining) > 0) {
    var step =
      Math.abs(remaining) > stepSize
        ? stepSize * Math.sign(remaining)
        : remaining;

    var nextX = self.x;
    var nextY = self.y;

    if (axis === 'x') nextX += step;
    else nextY += step;

    if (rectTouchesSolid(nextX, nextY, self.width, self.height, engine)) {
      collided = true;
      break;
    }

    self.x = nextX;
    self.y = nextY;
    remaining -= step;
  }

  return collided;
}

function respawn(self) {
  self.x = self.spawnX;
  self.y = self.spawnY;
  self.vx = 0;
  self.vy = 0;
  self.grounded = false;
  self.jumpHeld = false;
}

function onInit(self, engine) {
  self.spawnX = self.x;
  self.spawnY = self.y;

  self.vx = 0;
  self.vy = 0;
  self.grounded = false;
  self.jumpHeld = false;

  // simple controller tuning
  self.moveSpeed = 190;
  self.jumpSpeed = 420;
  self.gravity = 1100;
  self.maxFallSpeed = 700;
}

function onUpdate(self, engine, dt) {
  var world = engine && engine.world;
  dt = Math.min(dt || 0, 1 / 30);

  var left = keyIsDown(65) || keyIsDown(37);
  var right = keyIsDown(68) || keyIsDown(39);
  var jump = keyIsDown(32) || keyIsDown(87) || keyIsDown(38);

  var move = (right ? 1 : 0) - (left ? 1 : 0);

  // horizontal input
  self.vx = move * self.moveSpeed;

  // jump
  if (jump && self.grounded && !self.jumpHeld) {
    self.vy = -self.jumpSpeed;
    self.grounded = false;
  }
  self.jumpHeld = jump;

  // gravity
  self.vy += self.gravity * dt;
  if (self.vy > self.maxFallSpeed) {
    self.vy = self.maxFallSpeed;
  }

  // move horizontally
  var hitX = moveAxis(self, engine, self.vx * dt, 'x');
  if (hitX) {
    self.vx = 0;
  }

  // move vertically
  var wasFalling = self.vy > 0;
  var hitY = moveAxis(self, engine, self.vy * dt, 'y');

  if (hitY) {
    self.grounded = wasFalling;
    self.vy = 0;
  } else {
    self.grounded = false;
  }

  // optional world clamps
  if (world) {
    if (typeof world.minX === 'number' && self.x < world.minX) {
      self.x = world.minX;
    }
    if (typeof world.maxX === 'number' && self.x + self.width > world.maxX) {
      self.x = world.maxX - self.width;
    }
  }

  // hazards / fall death
  if (
    rectTouchesType(self.x, self.y, self.width, self.height, engine, 'hazard') ||
    (world && typeof world.maxY === 'number' && self.y > world.maxY + 160)
  ) {
    respawn(self);
  }
}