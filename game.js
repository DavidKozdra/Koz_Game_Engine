const engineBridge = window.EngineBridge;
if (!engineBridge || typeof engineBridge.require !== "function") {
  throw new Error("Engine bridge is missing. Load engine-loader.js before game.js.");
}

const { GameStateManager } = engineBridge.require("Core/gameStateManager.js") || {};
const { createWorldSpace } = engineBridge.require("World/worldSpace.js") || {};
const { createWorldEditor } = engineBridge.require("World/worldEditor.js") || {};

const GameStates = {
  MAIN_MENU: "MAIN_MENU",
  PLAY: "PLAY",
  PAUSE: "PAUSE",
  LEVEL_EDITOR: "LEVEL_EDITOR",
};

const LevelTile = {
  EMPTY: 0,
  PLATFORM: 1,
};

const GRID = {
  COLS: 24,
  ROWS: 12,
};

const TILE_SIZE = 40;
const CANVAS_WIDTH = GRID.COLS * TILE_SIZE;
const CANVAS_HEIGHT = GRID.ROWS * TILE_SIZE;

const DEFAULT_LEVELS = [
  {
    name: "Harbor Run",
    spawn: { x: 2, y: GRID.ROWS - 3 },
    goal: { x: 22, y: GRID.ROWS - 3 },
    collectables: [
      { x: 5, y: GRID.ROWS - 5 },
      { x: 10, y: GRID.ROWS - 7 },
      { x: 14, y: GRID.ROWS - 6 },
      { x: 19, y: GRID.ROWS - 4 },
    ],
    grid: [
      "000000000000000000000000",
      "000000000000000000000000",
      "000000000000000000000000",
      "000000011110000000000000",
      "000000000000000111000000",
      "000000000000000111000000",
      "000000000001111111100000",
      "000011100000000000000000",
      "000011100001110000000000",
      "000011100000000000000000",
      "000000000000000000000000",
      "111111111111111111111111",
    ],
  },
  {
    name: "Night Pier",
    spawn: { x: 1, y: GRID.ROWS - 3 },
    goal: { x: 21, y: GRID.ROWS - 5 },
    collectables: [
      { x: 4, y: GRID.ROWS - 6 },
      { x: 8, y: GRID.ROWS - 7 },
      { x: 12, y: GRID.ROWS - 9 },
      { x: 17, y: GRID.ROWS - 6 },
      { x: 20, y: GRID.ROWS - 8 },
    ],
    grid: [
      "000000000000000000000000",
      "000000000000011110000000",
      "000000000000011110000000",
      "000011100000000000000000",
      "000011100000011111000000",
      "000011100000000000010000",
      "000000000000000000010000",
      "000000011110000000010000",
      "000000000000000000010000",
      "000000000000000000010000",
      "000000000000000000000000",
      "111111111111111111111111",
    ],
  },
  {
    name: "Beacon Loft",
    spawn: { x: 3, y: GRID.ROWS - 4 },
    goal: { x: 22, y: GRID.ROWS - 4 },
    collectables: [
      { x: 6, y: GRID.ROWS - 5 },
      { x: 9, y: GRID.ROWS - 6 },
      { x: 12, y: GRID.ROWS - 7 },
      { x: 16, y: GRID.ROWS - 6 },
      { x: 19, y: GRID.ROWS - 5 },
      { x: 21, y: GRID.ROWS - 7 },
    ],
    grid: [
      "000000000001110000000000",
      "000000000001110000000000",
      "000000011111111000000000",
      "000000000000001000000000",
      "000001110000001000000000",
      "000001110000001001111000",
      "000000000000000000000000",
      "000000011111000000000000",
      "000000010000011110000000",
      "000000010000000000000000",
      "000000000000000000000000",
      "111111111111111111111111",
    ],
  },
];

const LEVEL_TILE_COLORS = {
  [LevelTile.EMPTY]: "#02080f",
  [LevelTile.PLATFORM]: "#6bc4ff",
};

if (!GameStateManager || !createWorldSpace || !createWorldEditor) {
  throw new Error("Missing Koz Engine exports (gameStateManager/worldSpace/worldEditor).");
}

const world = createWorldSpace({
  cols: GRID.COLS,
  rows: GRID.ROWS,
  defaultCell: LevelTile.EMPTY,
});
const worldEditor = createWorldEditor({ world });

const gameStateManager = new GameStateManager();
gameStateManager.setTransitionRules({
  [GameStates.MAIN_MENU]: [GameStates.PLAY, GameStates.LEVEL_EDITOR],
  [GameStates.PLAY]: [GameStates.MAIN_MENU, GameStates.PAUSE, GameStates.LEVEL_EDITOR],
  [GameStates.PAUSE]: [GameStates.PLAY, GameStates.MAIN_MENU],
  [GameStates.LEVEL_EDITOR]: [GameStates.MAIN_MENU, GameStates.PLAY],
  "*": [GameStates.MAIN_MENU],
});

let currentLevelIndex = 0;
let selectedLevelIndex = 0;
let levelCollectableBlueprint = [];
let activeCollectables = new Set();
let goalCell = null;
let levelCompleted = false;
let customLevelActive = false;
let selectedBrush = LevelTile.PLATFORM;
let lastLevelExport = "";
let player = createPlayer();
const inputState = { left: false, right: false, jump: false };
let jumpQueued = false;

function createPlayer() {
  return {
    width: TILE_SIZE * 0.6,
    height: TILE_SIZE * 1.4,
    pos: { x: 0, y: 0 },
    vx: 0,
    vy: 0,
    grounded: false,
  };
}

function setup() {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.parent(document.body);
  pixelDensity(1);
  loadLevelByIndex(0);
  spawnPlayer();
  gameStateManager.addState(GameStates.MAIN_MENU);
  gameStateManager.addState(GameStates.PLAY);
  gameStateManager.addState(GameStates.PAUSE);
  gameStateManager.addState(GameStates.LEVEL_EDITOR);
  gameStateManager.onChange((from, to) => {
    if (typeof PlatformerGame?.onStateChange === "function") {
      PlatformerGame.onStateChange(to, from);
    }
  });
  gameStateManager.setState(GameStates.MAIN_MENU);
}

function draw() {
  background("#02080f");
  drawGrid();
  drawGoalMarker();
  drawCollectables();
  drawPlayer();
  drawGuidance();
  if (gameStateManager.is(GameStates.LEVEL_EDITOR)) {
    drawEditorOverlay();
  }
  if (gameStateManager.is(GameStates.PLAY)) {
    updatePlayerPhysics();
    processCollectables();
    checkGoalReached();
  } else if (gameStateManager.is(GameStates.PAUSE)) {
    drawPauseHint();
  }
}

function drawGrid() {
  stroke("#0f1f2f");
  for (let y = 0; y < GRID.ROWS; y++) {
    for (let x = 0; x < GRID.COLS; x++) {
      const tile = world.getCell(x, y);
      fill(LEVEL_TILE_COLORS[tile] || LEVEL_TILE_COLORS[LevelTile.EMPTY]);
      rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
}

function drawPlayer() {
  if (!player) return;
  fill("#f2f2f2");
  noStroke();
  rect(player.pos.x, player.pos.y, player.width, player.height, 4);
}

function drawGoalMarker() {
  if (!goalCell) return;
  const cx = goalCell.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = goalCell.y * TILE_SIZE + TILE_SIZE / 2;
  push();
  stroke("#ffda6b");
  strokeWeight(3);
  noFill();
  circle(cx, cy, TILE_SIZE * 0.8);
  pop();
}

function drawCollectables() {
  push();
  noStroke();
  fill("#ff6bd9");
  activeCollectables.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    circle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE * 0.35);
  });
  pop();
}

function drawGuidance() {
  push();
  fill("#ffffffcc");
  textSize(14);
  textAlign(LEFT, TOP);
  const progress = PlatformerGame.getLevelProgress();
  const collectLabel = progress.total
    ? `Collect ${progress.total - progress.remaining}/${progress.total}`
    : "No collectibles";
  text(`${collectLabel}`, 10, 10);
  text(`State: ${gameStateManager.getState()}`, 10, 30);
  if (gameStateManager.is(GameStates.PAUSE)) drawPauseHint();
  pop();
}

function drawPauseHint() {
  push();
  fill("#ffffffaa");
  textSize(18);
  textAlign(RIGHT, TOP);
  text("Paused", CANVAS_WIDTH - 10, 10);
  pop();
}

function drawEditorOverlay() {
  const cell = pointerToCell(mouseX, mouseY);
  if (!cell) return;
  fill("#ffffff55");
  noStroke();
  rect(cell.x * TILE_SIZE, cell.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
}

function updatePlayerPhysics() {
  const dt = deltaTime / 1000;
  player.vy += 1600 * dt;
  player.vx = 0;
  if (inputState.left) player.vx = -320;
  if (inputState.right) player.vx = 320;
  if (jumpQueued && player.grounded) {
    player.vy = -540;
    player.grounded = false;
  }
  jumpQueued = false;
  const desiredX = player.pos.x + player.vx * dt;
  const desiredY = player.pos.y + player.vy * dt;
  player.pos.x = clampHorizontal(desiredX);
  player.pos.y = clampVertical(desiredY);
}

function clampHorizontal(desiredX) {
  const minX = 0;
  const maxX = CANVAS_WIDTH - player.width;
  if (desiredX < minX) return minX;
  if (desiredX > maxX) return maxX;
  if (player.vx > 0) {
    const nextCol = Math.floor((desiredX + player.width) / TILE_SIZE);
    for (
      let row = Math.floor(player.pos.y / TILE_SIZE);
      row <= Math.floor((player.pos.y + player.height - 1) / TILE_SIZE);
      row++
    ) {
      if (isSolid(nextCol, row)) {
        return nextCol * TILE_SIZE - player.width - 0.1;
      }
    }
  } else if (player.vx < 0) {
    const nextCol = Math.floor(desiredX / TILE_SIZE);
    for (
      let row = Math.floor(player.pos.y / TILE_SIZE);
      row <= Math.floor((player.pos.y + player.height - 1) / TILE_SIZE);
      row++
    ) {
      if (isSolid(nextCol, row)) {
        return (nextCol + 1) * TILE_SIZE;
      }
    }
  }
  return desiredX;
}

function clampVertical(desiredY) {
  const maxY = CANVAS_HEIGHT - player.height;
  if (desiredY > maxY) {
    player.grounded = true;
    player.vy = 0;
    return maxY;
  }
  if (player.vy > 0) {
    const nextRow = Math.floor((desiredY + player.height) / TILE_SIZE);
    for (
      let col = Math.floor(player.pos.x / TILE_SIZE);
      col <= Math.floor((player.pos.x + player.width - 1) / TILE_SIZE);
      col++
    ) {
      if (isSolid(col, nextRow)) {
        player.grounded = true;
        player.vy = 0;
        return nextRow * TILE_SIZE - player.height - 0.1;
      }
    }
  } else if (player.vy < 0) {
    const nextRow = Math.floor(desiredY / TILE_SIZE);
    for (
      let col = Math.floor(player.pos.x / TILE_SIZE);
      col <= Math.floor((player.pos.x + player.width - 1) / TILE_SIZE);
      col++
    ) {
      if (isSolid(col, nextRow)) {
        player.vy = 0;
        return (nextRow + 1) * TILE_SIZE;
      }
    }
  }
  player.grounded = false;
  return desiredY;
}

function isSolid(col, row) {
  if (!world.inBounds(col, row)) return false;
  const tile = world.getCell(col, row);
  return tile === LevelTile.PLATFORM;
}

function processCollectables() {
  const cell = playerCenterCell();
  if (!cell) return;
  const key = coordKey(cell.x, cell.y);
  if (activeCollectables.has(key)) {
    activeCollectables.delete(key);
    notify("Collectible gathered");
  }
}

function playerCenterCell() {
  const cx = player.pos.x + player.width / 2;
  const cy = player.pos.y + player.height / 2;
  const col = Math.floor(cx / TILE_SIZE);
  const row = Math.floor(cy / TILE_SIZE);
  if (!world.inBounds(col, row)) return null;
  return { x: col, y: row };
}

function coordKey(x, y) {
  return `${x},${y}`;
}

function checkGoalReached() {
  if (!goalCell || activeCollectables.size > 0 || levelCompleted) return;
  const center = playerCenterCell();
  if (!center) return;
  if (coordKey(center.x, center.y) === coordKey(goalCell.x, goalCell.y)) {
    levelCompleted = true;
    notify("Level complete", "success");
    setTimeout(() => {
      levelCompleted = false;
      if (currentLevelIndex + 1 < DEFAULT_LEVELS.length) {
        loadLevelByIndex(currentLevelIndex + 1);
        spawnPlayer();
        startPlay();
      } else {
        notify("All levels cleared. Returning to menu.", "info");
        showMainMenu();
      }
    }, 1200);
  }
}

function notify(message, type = "info") {
  if (window.PlatformerUI?.notify) {
    window.PlatformerUI.notify(message, type);
  }
}

function pointerToCell(px, py) {
  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);
  if (world.inBounds(col, row)) {
    return { x: col, y: row };
  }
  return null;
}

function loadLevelByIndex(index) {
  if (index < 0 || index >= DEFAULT_LEVELS.length) return;
  const template = DEFAULT_LEVELS[index];
  applyLevelTemplate(template);
  currentLevelIndex = index;
  selectedLevelIndex = index;
}

function applyLevelTemplate(template) {
  if (!template || !Array.isArray(template.grid)) return;
  world.fillCells(LevelTile.EMPTY);
  template.grid.forEach((rowString, y) => {
    for (let x = 0; x < GRID.COLS; x++) {
      const char = rowString.charAt(x) || "0";
      world.setCell(x, y, char === "1" ? LevelTile.PLATFORM : LevelTile.EMPTY);
    }
  });
  setSpawn(template.spawn?.x || 0, template.spawn?.y || GRID.ROWS - 3);
  setGoal(template.goal);
  resetCollectables(template.collectables);
  customLevelActive = false;
  lastLevelExport = buildLevelExport();
}

function resetCollectables(list = []) {
  levelCollectableBlueprint = Array.isArray(list)
    ? list.map((entry) => ({ x: entry.x || 0, y: entry.y || 0 }))
    : [];
  activeCollectables = new Set(levelCollectableBlueprint.map((coord) => coordKey(coord.x, coord.y)));
  levelCompleted = false;
}

function setGoal(goal) {
  if (goal && Number.isInteger(goal.x) && Number.isInteger(goal.y)) {
    goalCell = { x: goal.x, y: goal.y };
  } else {
    goalCell = null;
  }
}

function spawnPlayer() {
  const spawn = getSpawnPoint();
  player = createPlayer();
  player.pos.x = spawn.x * TILE_SIZE + (TILE_SIZE - player.width) / 2;
  player.pos.y = spawn.y * TILE_SIZE - player.height;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  jumpQueued = false;
  inputState.left = false;
  inputState.right = false;
  inputState.jump = false;
}

function startPlay() {
  if (gameStateManager.is(GameStates.PAUSE)) {
    resumeGame();
    return;
  }
  spawnPlayer();
  gameStateManager.setState(GameStates.PLAY);
}

function pauseGame() {
  if (gameStateManager.is(GameStates.PLAY)) {
    gameStateManager.setState(GameStates.PAUSE);
  }
}

function resumeGame() {
  if (gameStateManager.is(GameStates.PAUSE)) {
    gameStateManager.setState(GameStates.PLAY);
  }
}

function togglePause() {
  if (gameStateManager.is(GameStates.PLAY)) {
    pauseGame();
  } else if (gameStateManager.is(GameStates.PAUSE)) {
    resumeGame();
  }
}

function showMainMenu() {
  gameStateManager.setState(GameStates.MAIN_MENU);
}

function openEditor() {
  gameStateManager.setState(GameStates.LEVEL_EDITOR);
}

function selectLevel(index) {
  loadLevelByIndex(index);
  notify(`Level ${index + 1} selected: ${DEFAULT_LEVELS[index].name}`);
}

function buildLevelExport() {
  const gridSnapshot = [];
  for (let y = 0; y < GRID.ROWS; y++) {
    const row = [];
    for (let x = 0; x < GRID.COLS; x++) {
      row.push(world.getCell(x, y));
    }
    gridSnapshot.push(row);
  }
  return JSON.stringify(
    {
      name: DEFAULT_LEVELS[currentLevelIndex]?.name || "Custom Level",
      grid: gridSnapshot,
      spawn: getSpawnPoint(),
      collectables: levelCollectableBlueprint.slice(),
      goal: goalCell,
    },
    null,
    2
  );
}

function importLevel(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.grid)) {
      parsed.grid.forEach((row, y) => {
        row.forEach((value, x) => {
          if (y < GRID.ROWS && x < GRID.COLS) {
            world.setCell(x, y, value === LevelTile.PLATFORM ? LevelTile.PLATFORM : LevelTile.EMPTY);
          }
        });
      });
    }
    if (parsed.spawn) {
      setSpawn(parsed.spawn.x, parsed.spawn.y);
    }
    setGoal(parsed.goal);
    resetCollectables(parsed.collectables);
    currentLevelIndex = null;
    selectedLevelIndex = null;
    lastLevelExport = buildLevelExport();
    customLevelActive = true;
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function setSpawn(x, y) {
  const spawn = world.listElements("spawn")[0];
  const spawnData = { kind: "spawn", x, y };
  if (spawn) {
    world.replaceElement(spawn.id, spawnData);
  } else {
    world.addElement(spawnData);
  }
}

function getSpawnPoint() {
  const spawn = world.listElements("spawn")[0];
  if (spawn) return { x: spawn.x, y: spawn.y };
  return { x: 1, y: GRID.ROWS - 3 };
}

function mousePressed() {
  if (gameStateManager.is(GameStates.LEVEL_EDITOR)) {
    const cell = pointerToCell(mouseX, mouseY);
    if (cell) {
      paintEditorCell(cell.x, cell.y);
    }
  }
}

function mouseDragged() {
  if (gameStateManager.is(GameStates.LEVEL_EDITOR)) {
    const cell = pointerToCell(mouseX, mouseY);
    if (cell) {
      paintEditorCell(cell.x, cell.y);
    }
  }
}

function paintEditorCell(col, row) {
  if (!world.inBounds(col, row)) return;
  if (PlatformerGame?.editorMode === "spawn") {
    setSpawn(col, row);
    lastLevelExport = buildLevelExport();
    return;
  }
  worldEditor.paintArea(col, row, selectedBrush, { radius: 0 });
  worldEditor.endStroke();
  lastLevelExport = buildLevelExport();
}

function keyPressed() {
  if (key === "a" || key === "A" || keyCode === LEFT_ARROW) {
    inputState.left = true;
  } else if (key === "d" || key === "D" || keyCode === RIGHT_ARROW) {
    inputState.right = true;
  } else if (key === "w" || key === "W" || key === " ") {
    if (!inputState.jump) jumpQueued = true;
    inputState.jump = true;
  }
  if (key === "Escape") {
    if (gameStateManager.is(GameStates.PLAY)) {
      pauseGame();
    } else if (gameStateManager.is(GameStates.PAUSE)) {
      resumeGame();
    } else {
      showMainMenu();
    }
  }
}

function keyReleased() {
  if (key === "a" || key === "A" || keyCode === LEFT_ARROW) {
    inputState.left = false;
  } else if (key === "d" || key === "D" || keyCode === RIGHT_ARROW) {
    inputState.right = false;
  } else if (key === "w" || key === "W" || key === " ") {
    inputState.jump = false;
  }
}

const PlatformerGame = {
  GameStates,
  brushTile: () => selectedBrush,
  setBrush: (tileId) => {
    selectedBrush = tileId === LevelTile.PLATFORM ? LevelTile.PLATFORM : LevelTile.EMPTY;
  },
  startPlay,
  openEditor,
  showMainMenu,
  resetLevel: () => {
    const index = Number.isInteger(selectedLevelIndex) ? selectedLevelIndex : 0;
    loadLevelByIndex(index);
  },
  exportLevel: () => {
    lastLevelExport = buildLevelExport();
    return lastLevelExport;
  },
  importLevel,
  getLevelSummary: () => ({
    name: DEFAULT_LEVELS[currentLevelIndex]?.name || "Custom",
    spawn: getSpawnPoint(),
    brush: selectedBrush,
  }),
  getLevelProgress: () => ({
    remaining: activeCollectables.size,
    total: levelCollectableBlueprint.length,
  }),
  selectLevel,
  getLevels: () =>
    DEFAULT_LEVELS.map((level, index) => ({
      index,
      name: level.name,
    })),
  getSelectedLevelIndex: () => (Number.isInteger(selectedLevelIndex) ? selectedLevelIndex : 0),
  pauseGame,
  resumeGame,
  togglePause,
  isPaused: () => gameStateManager.is(GameStates.PAUSE),
  onStateChange: null,
  editorMode: "draw",
  setEditorMode(mode) {
    this.editorMode = mode === "spawn" ? "spawn" : "draw";
  },
};

window.PlatformerGame = PlatformerGame;
