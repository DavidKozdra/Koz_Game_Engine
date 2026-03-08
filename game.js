const AppStates = {
  MAIN_MENU: "MAIN_MENU",
  GAMEPLAY: "GAMEPLAY",
  PAUSED: "PAUSED",
  LEVEL_EDITOR: "LEVEL_EDITOR",
};

const GRID = {
  cols: 24,
  rows: 14,
  tileSize: 36,
};

const CANVAS = {
  width: GRID.cols * GRID.tileSize,
  height: GRID.rows * GRID.tileSize,
};

const CellType = {
  EMPTY: "empty",
  SOLID: "solid",
};

let kozRuntime = null;
let world = null;
let worldEditor = null;
let gameStateManager = null;

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

function setup() {
  const canvas = createCanvas(CANVAS.width, CANVAS.height);
  canvas.parent(document.body);
  pixelDensity(1);
  initializeAppRuntime();
  gameStateManager.setState(AppStates.MAIN_MENU);
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
  }
}


