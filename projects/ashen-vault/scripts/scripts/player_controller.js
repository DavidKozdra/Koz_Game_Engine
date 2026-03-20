function spriteWidth(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.width) || 18;
}

function spriteHeight(obj) {
  return (obj && obj.components && obj.components.Sprite && obj.components.Sprite.height) || 18;
}

function centerX(obj) {
  return (Number(obj && obj.x) || 0) + spriteWidth(obj) * 0.5;
}

function centerY(obj) {
  return (Number(obj && obj.y) || 0) + spriteHeight(obj) * 0.5;
}

function distance(a, b) {
  var dx = centerX(a) - centerX(b);
  var dy = centerY(a) - centerY(b);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function normalize(x, y) {
  var length = Math.sqrt((x * x) + (y * y));
  if (!length) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

function wouldHitWall(obj, engine, nextX, nextY) {
  if (!engine || !engine.world || typeof engine.world.worldToCell !== "function" || typeof engine.world.isSolidCell !== "function") return false;
  var width = ((obj && obj.components && obj.components.Collider && obj.components.Collider.width) || spriteWidth(obj));
  var height = ((obj && obj.components && obj.components.Collider && obj.components.Collider.height) || spriteHeight(obj));
  var points = [
    { x: nextX + 2, y: nextY + 2 },
    { x: nextX + width - 2, y: nextY + 2 },
    { x: nextX + 2, y: nextY + height - 2 },
    { x: nextX + width - 2, y: nextY + height - 2 }
  ];
  for (var i = 0; i < points.length; i += 1) {
    var cell = engine.world.worldToCell(points[i].x, points[i].y);
    if (engine.world.isSolidCell(cell.x, cell.y)) return true;
  }
  return false;
}

function setNoise(self, engine, intensity) {
  window.__ashenVaultRun = window.__ashenVaultRun || {};
  window.__ashenVaultRun.noise = {
    x: centerX(self),
    y: centerY(self),
    power: intensity || 1,
    time: engine && typeof engine.elapsed === "number" ? engine.elapsed : 0
  };
}

function canHit(self, enemy) {
  if (!enemy || enemy.dead) return false;
  if (distance(self, enemy) > (Number(self.attackRange) || 36)) return false;
  var dx = centerX(enemy) - centerX(self);
  var dy = centerY(enemy) - centerY(self);
  var dir = normalize(self.lastDirX || 1, self.lastDirY || 0);
  var target = normalize(dx, dy);
  var dot = (dir.x * target.x) + (dir.y * target.y);
  return dot >= -(Number(self.attackSpread) || 0.1);
}

function onInit(self, engine) {
  self.maxHealth = 100;
  self.health = 100;
  self.moveSpeed = self.moveSpeed || 118;
  self.attackDamage = self.attackDamage || 1.8;
  self.attackRange = self.attackRange || 38;
  self.attackSpread = self.attackSpread || 0.95;
  self.attackColor = self.attackColor || "#fb923c";
  self.dashDistance = self.dashDistance || 48;
  self.attackCooldown = 0;
  self.dashCooldown = 0;
  self.hitCooldown = 0;
  self.attackLatch = false;
  self.dashLatch = false;
  self.lastDirX = 1;
  self.lastDirY = 0;
}

function onUpdate(self, engine, dt) {
  if (self.health <= 0) {
    self.dead = true;
    self.components.Render.visible = false;
    return;
  }

  self.attackCooldown = Math.max(0, Number(self.attackCooldown || 0) - dt);
  self.dashCooldown = Math.max(0, Number(self.dashCooldown || 0) - dt);
  self.hitCooldown = Math.max(0, Number(self.hitCooldown || 0) - dt);

  var moveX = 0;
  var moveY = 0;
  if (keyIsDown(65) || keyIsDown(LEFT_ARROW)) moveX -= 1;
  if (keyIsDown(68) || keyIsDown(RIGHT_ARROW)) moveX += 1;
  if (keyIsDown(87) || keyIsDown(UP_ARROW)) moveY -= 1;
  if (keyIsDown(83) || keyIsDown(DOWN_ARROW)) moveY += 1;
  var move = normalize(moveX, moveY);
  if (move.x || move.y) {
    self.lastDirX = move.x;
    self.lastDirY = move.y;
  }
  var stepX = move.x * Number(self.moveSpeed || 118) * dt;
  var stepY = move.y * Number(self.moveSpeed || 118) * dt;
  if (!wouldHitWall(self, engine, self.x + stepX, self.y)) self.x += stepX;
  if (!wouldHitWall(self, engine, self.x, self.y + stepY)) self.y += stepY;

  var attackPressed = keyIsDown(SPACE);
  if (attackPressed && !self.attackLatch && self.attackCooldown <= 0) {
    self.attackLatch = true;
    self.attackCooldown = self.vow === "thread" ? 0.3 : 0.38;
    setNoise(self, engine, 1);
    if (engine && engine.audio && typeof engine.audio.play === "function") {
      engine.audio.play("asset_swing", { volume: self.vow === "ash" ? 0.3 : 0.26 });
    }
    var enemies = engine && typeof engine.findObjectsByType === "function" ? engine.findObjectsByType("enemy") : [];
    (enemies || []).forEach(function(enemy) {
      if (!canHit(self, enemy)) return;
      enemy.health = Number(enemy.health || enemy.maxHealth || 3) - (Number(self.attackDamage) || 1);
      if (enemy.health <= 0) enemy.dead = true;
      if (engine && engine.particles && typeof engine.particles.burstAt === "function") {
        engine.particles.burstAt(centerX(enemy), centerY(enemy), {
          count: self.vow === "ash" ? 18 : 12,
          speed: self.vow === "thread" ? 72 : 58,
          life: 520,
          color: self.attackColor || "#fb923c",
          size: 6,
          sizeEnd: 1,
          gravity: 14
        });
      }
      if (engine && engine.audio && typeof engine.audio.play === "function") {
        engine.audio.play("asset_hit", { volume: 0.28 });
      }
    });
  }
  if (!attackPressed) self.attackLatch = false;

  var dashPressed = keyIsDown(16);
  if (dashPressed && !self.dashLatch && self.dashCooldown <= 0) {
    self.dashLatch = true;
    self.dashCooldown = 1.05;
    var dash = normalize(self.lastDirX || 1, self.lastDirY || 0);
    var dashX = dash.x * Number(self.dashDistance || 48);
    var dashY = dash.y * Number(self.dashDistance || 48);
    if (!wouldHitWall(self, engine, self.x + dashX, self.y)) self.x += dashX;
    if (!wouldHitWall(self, engine, self.x, self.y + dashY)) self.y += dashY;
    self.hitCooldown = 0.22;
    setNoise(self, engine, 1.2);
    if (engine && engine.audio && typeof engine.audio.play === "function") {
      engine.audio.play("asset_dash", { volume: 0.26 });
    }
    if (engine && engine.particles && typeof engine.particles.burstAt === "function") {
      engine.particles.burstAt(centerX(self), centerY(self), {
        count: 16,
        speed: 68,
        life: 420,
        color: "#f8fafc",
        size: 5,
        sizeEnd: 0.6,
        gravity: 0
      });
    }
  }
  if (!dashPressed) self.dashLatch = false;
}
