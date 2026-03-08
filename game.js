let state = null;

const GameStates = {
  READY: "READY",
  RUNNING: "RUNNING",
  SHOP: "SHOP",
  PAUSED: "PAUSED",
  GAMEOVER: "GAMEOVER",
};

const SAVE_KEY = "koz_war_roguelike_run_v1";
const SUITS = ["S", "H", "D", "C"];
const SUIT_SYMBOLS = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANKS = [
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
  { label: "6", value: 6 },
  { label: "7", value: 7 },
  { label: "8", value: 8 },
  { label: "9", value: 9 },
  { label: "10", value: 10 },
  { label: "J", value: 11 },
  { label: "Q", value: 12 },
  { label: "K", value: 13 },
  { label: "A", value: 14 },
];
const SHOP_BLUEPRINTS = [
  {
    id: "forge_low",
    name: "Low Forge",
    desc: "+1 power to 6 random cards with value 6 or less.",
    cost: 8,
    apply(run) {
      const lowCards = run.deck.filter((card) => card.value <= 6);
      const picks = shuffle(lowCards).slice(0, 6);
      for (const card of picks) card.bonus += 1;
    },
  },
  {
    id: "flat_bonus",
    name: "Battle Standard",
    desc: "+1 power to every card you draw.",
    cost: 14,
    apply(run) {
      run.flatBonus += 1;
    },
  },
  {
    id: "war_edge",
    name: "War Banner",
    desc: "+2 power during war tie-break cards.",
    cost: 10,
    apply(run) {
      run.warEdge += 2;
    },
  },
  {
    id: "cull_weak",
    name: "Cull Weak",
    desc: "Remove your weakest card and heal 3 HP.",
    cost: 9,
    apply(run) {
      if (!run.deck.length) return;
      run.deck.sort((a, b) => (a.value + a.bonus) - (b.value + b.bonus));
      run.deck.shift();
      run.health = Math.min(run.maxHealth, run.health + 3);
    },
  },
  {
    id: "add_ace",
    name: "Smuggled Ace",
    desc: "Add an Ace with +1 bonus.",
    cost: 12,
    apply(run) {
      const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
      run.deck.push({
        id: `A${suit}_${Date.now()}`,
        rank: "A",
        suit,
        value: 14,
        bonus: 1,
      });
    },
  },
  {
    id: "fortify",
    name: "Fortify",
    desc: "+4 max HP and heal 4.",
    cost: 11,
    apply(run) {
      run.maxHealth += 4;
      run.health = Math.min(run.maxHealth, run.health + 4);
    },
  },
];

const game = {
  run: null,
  battle: null,
  shop: null,
  roundLog: [],
  status: "",
  save: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function ensureSaveSystem() {
  if (game.save) return game.save;

  const SaveCtor = window.KozEngine?.SaveLoad?.saveApi?.SaveAPI;
  const driverFactory = window.KozEngine?.SaveLoad?.storageDrivers;

  if (typeof SaveCtor === "function" && driverFactory) {
    let driver = null;
    try {
      driver = driverFactory.createLocalStorageDriver(window.localStorage);
    } catch (_err) {
      driver = driverFactory.createMemoryDriver();
    }

    const api = new SaveCtor({ key: SAVE_KEY, driver });
    game.save = {
      has: () => api.has(),
      load: () => api.load(),
      save: (payload) => api.save(payload),
      clear: () => api.delete(),
    };
    return game.save;
  }

  game.save = {
    has: () => localStorage.getItem(SAVE_KEY) !== null,
    load: () => {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    save: (payload) => {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    },
    clear: () => localStorage.removeItem(SAVE_KEY),
  };
  return game.save;
}

function createBaseDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank.label}${suit}_${deck.length}`,
        rank: rank.label,
        suit,
        value: rank.value,
        bonus: 0,
      });
    }
  }
  return deck;
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function createNewRun() {
  return {
    version: 1,
    active: true,
    floor: 1,
    wins: 0,
    gold: 0,
    maxHealth: 30,
    health: 30,
    deck: createBaseDeck(),
    flatBonus: 0,
    lowCardBoost: 0,
    warEdge: 0,
    rerollUsed: false,
    lastUpdatedAt: Date.now(),
  };
}

function buildEnemyDeck(floor) {
  const targetSize = Math.min(52, 20 + floor * 2);
  const deck = [];
  for (let i = 0; i < targetSize; i += 1) {
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const scaling = Math.floor((floor - 1) / 4);
    deck.push({
      id: `E${floor}_${i}`,
      rank: rank.label,
      suit,
      value: Math.min(16, rank.value + scaling),
      bonus: 0,
    });
  }
  return deck;
}

function cardPower(card, owner, isWar = false) {
  const run = game.run;
  if (!run || !card) return 0;

  let power = card.value + (card.bonus || 0);
  if (owner === "player") {
    power += run.flatBonus;
    if (card.value <= 6) power += run.lowCardBoost;
    if (isWar) power += run.warEdge;
  }
  return power;
}

function totalCards(drawPile, discardPile) {
  return drawPile.length + discardPile.length;
}

function drawCard(drawPile, discardPile) {
  if (!drawPile.length && discardPile.length) {
    const refill = shuffle(discardPile);
    drawPile.push(...refill);
    discardPile.length = 0;
  }
  return drawPile.length ? drawPile.shift() : null;
}

function startBattle() {
  if (!game.run) return;

  const floor = game.run.floor;
  const enemyDeck = shuffle(buildEnemyDeck(floor));
  const playerDeck = shuffle(clone(game.run.deck));

  game.battle = {
    floor,
    round: 0,
    playerHealth: game.run.health,
    enemyHealth: 16 + floor * 3,
    playerDraw: playerDeck,
    playerDiscard: [],
    enemyDraw: enemyDeck,
    enemyDiscard: [],
    pot: [],
    over: false,
    winner: null,
    lastClash: null,
  };

  game.roundLog = [`Floor ${floor} battle started.`];
  game.status = "Draw cards to attack. Higher card wins the clash.";
  emitUiSync();
  saveRun();
}

function addLog(message) {
  game.roundLog.push(message);
  if (game.roundLog.length > 8) game.roundLog.shift();
}

function resolveWarStep(depth = 1) {
  const battle = game.battle;

  const playerFaceDown = drawCard(battle.playerDraw, battle.playerDiscard);
  const enemyFaceDown = drawCard(battle.enemyDraw, battle.enemyDiscard);

  if (playerFaceDown) battle.pot.push(playerFaceDown);
  if (enemyFaceDown) battle.pot.push(enemyFaceDown);

  const playerWar = drawCard(battle.playerDraw, battle.playerDiscard);
  const enemyWar = drawCard(battle.enemyDraw, battle.enemyDiscard);

  if (!playerWar || !enemyWar) {
    if (playerWar) battle.pot.push(playerWar);
    if (enemyWar) battle.pot.push(enemyWar);
    return {
      winner: !playerWar && enemyWar ? "enemy" : "player",
      playerPower: playerWar ? cardPower(playerWar, "player", true) : 0,
      enemyPower: enemyWar ? cardPower(enemyWar, "enemy", true) : 0,
      playerCard: playerWar || null,
      enemyCard: enemyWar || null,
      depth,
    };
  }

  battle.pot.push(playerWar, enemyWar);

  const playerPower = cardPower(playerWar, "player", true);
  const enemyPower = cardPower(enemyWar, "enemy", true);

  addLog(`War draw: ${playerWar.rank}${playerWar.suit}(${playerPower}) vs ${enemyWar.rank}${enemyWar.suit}(${enemyPower})`);

  if (playerPower === enemyPower) {
    return resolveWarStep(depth + 1);
  }

  return {
    winner: playerPower > enemyPower ? "player" : "enemy",
    playerPower,
    enemyPower,
    playerCard: playerWar,
    enemyCard: enemyWar,
    depth,
  };
}

function dealRoundDamage(winner, playerPower, enemyPower) {
  const battle = game.battle;
  const damage = Math.max(1, Math.ceil(Math.abs(playerPower - enemyPower) / 3));

  if (winner === "player") {
    battle.enemyHealth = Math.max(0, battle.enemyHealth - damage);
    battle.playerDiscard.push(...battle.pot);
    battle.pot = [];
    addLog(`You win the clash and deal ${damage} damage.`);
  } else {
    battle.playerHealth = Math.max(0, battle.playerHealth - damage);
    battle.enemyDiscard.push(...battle.pot);
    battle.pot = [];
    addLog(`Enemy wins the clash and deals ${damage} damage.`);
  }
}

function completeBattle(victory) {
  const run = game.run;
  const battle = game.battle;
  if (!run || !battle) return;

  battle.over = true;

  if (victory) {
    const rewardGold = 6 + battle.floor * 2;
    run.gold += rewardGold;
    run.wins += 1;
    run.floor += 1;
    run.health = Math.min(run.maxHealth, battle.playerHealth + 2);

    game.status = `Victory. You earned ${rewardGold} gold.`;
    addLog(`Battle won. Proceed to shop.`);
    game.shop = { offers: generateShopOffers(run) };
    state.setState(GameStates.SHOP);
  } else {
    run.health = Math.max(0, battle.playerHealth);
    run.active = false;
    game.status = `Defeat on floor ${battle.floor}.`;
    addLog("Run ended.");
    state.setState(GameStates.GAMEOVER);
  }

  run.lastUpdatedAt = Date.now();
  emitUiSync();
  saveRun();
}

function playRound() {
  const battle = game.battle;
  if (!battle || battle.over || !state.is(GameStates.RUNNING)) return;

  battle.round += 1;

  const playerCard = drawCard(battle.playerDraw, battle.playerDiscard);
  const enemyCard = drawCard(battle.enemyDraw, battle.enemyDiscard);

  if (!playerCard || !enemyCard) {
    const playerCardsLeft = totalCards(battle.playerDraw, battle.playerDiscard);
    const enemyCardsLeft = totalCards(battle.enemyDraw, battle.enemyDiscard);
    completeBattle(playerCardsLeft >= enemyCardsLeft);
    return;
  }

  battle.pot = [playerCard, enemyCard];

  const playerPower = cardPower(playerCard, "player");
  const enemyPower = cardPower(enemyCard, "enemy");
  battle.lastClash = {
    playerCard,
    enemyCard,
    playerPower,
    enemyPower,
    war: false,
    warDepth: 0,
  };
  addLog(`Round ${battle.round}: ${playerCard.rank}${playerCard.suit}(${playerPower}) vs ${enemyCard.rank}${enemyCard.suit}(${enemyPower})`);

  if (playerPower === enemyPower) {
    addLog("Tie! War begins.");
    const warResult = resolveWarStep();
    battle.lastClash = {
      playerCard: warResult.playerCard || playerCard,
      enemyCard: warResult.enemyCard || enemyCard,
      playerPower: warResult.playerPower,
      enemyPower: warResult.enemyPower,
      war: true,
      warDepth: warResult.depth || 1,
    };
    dealRoundDamage(warResult.winner, warResult.playerPower, warResult.enemyPower);
  } else {
    const winner = playerPower > enemyPower ? "player" : "enemy";
    dealRoundDamage(winner, playerPower, enemyPower);
  }

  if (battle.enemyHealth <= 0) completeBattle(true);
  else if (battle.playerHealth <= 0) completeBattle(false);
  else emitUiSync();

  saveRun();
}

function generateShopOffers(run) {
  return shuffle(SHOP_BLUEPRINTS).slice(0, 3).map((item, idx) => ({
    shopId: `${item.id}_${run.floor}_${idx}`,
    id: item.id,
    name: item.name,
    desc: item.desc,
    cost: item.cost,
    bought: false,
  }));
}

function buyShopItem(shopId) {
  if (!game.shop || !game.run || !state.is(GameStates.SHOP)) return;

  const item = game.shop.offers.find((offer) => offer.shopId === shopId);
  if (!item) return;

  if (item.bought) {
    game.status = "Item already purchased.";
    emitUiSync();
    return;
  }

  if (game.run.gold < item.cost) {
    game.status = "Not enough gold.";
    emitUiSync();
    return;
  }

  const blueprint = SHOP_BLUEPRINTS.find((entry) => entry.id === item.id);
  if (!blueprint || typeof blueprint.apply !== "function") {
    game.status = "Item configuration missing.";
    emitUiSync();
    return;
  }

  game.run.gold -= item.cost;
  blueprint.apply(game.run);
  item.bought = true;
  game.status = `Purchased: ${item.name}`;

  game.run.lastUpdatedAt = Date.now();
  emitUiSync();
  saveRun();
}

function nextBattleFromShop() {
  if (!game.run || !state.is(GameStates.SHOP)) return;
  game.shop = null;
  startBattle();
  state.setState(GameStates.RUNNING);
  emitUiSync();
  saveRun();
}

function snapshot() {
  return {
    version: 1,
    savedAt: Date.now(),
    currentState: state ? state.getState() : GameStates.READY,
    run: game.run ? clone(game.run) : null,
    battle: game.battle ? clone(game.battle) : null,
    shop: game.shop ? clone(game.shop) : null,
    roundLog: clone(game.roundLog),
    status: game.status,
  };
}

function saveRun() {
  try {
    const store = ensureSaveSystem();
    store.save(snapshot());
  } catch (_err) {
    // Keep gameplay running if persistence is unavailable.
  }
}

function restoreFromSave(data) {
  if (!data || !data.run) return false;

  game.run = data.run;
  game.battle = data.battle || null;
  game.shop = data.shop || null;
  game.roundLog = Array.isArray(data.roundLog) ? data.roundLog : [];
  game.status = data.status || "Run loaded.";

  if (!game.run.active) {
    state.setState(GameStates.GAMEOVER);
  } else if (data.currentState === GameStates.SHOP && game.shop) {
    state.setState(GameStates.SHOP);
  } else {
    if (!game.battle) startBattle();
    state.setState(GameStates.RUNNING);
  }

  emitUiSync();
  return true;
}

function loadRun() {
  try {
    const store = ensureSaveSystem();
    const data = store.load();
    if (!data || !data.run) {
      game.status = "No saved run found.";
      emitUiSync();
      return false;
    }
    return restoreFromSave(data);
  } catch (_err) {
    game.status = "Unable to load save.";
    emitUiSync();
    return false;
  }
}

function resetToReady() {
  game.run = null;
  game.battle = null;
  game.shop = null;
  game.roundLog = [];
  game.status = "";
  if (state) state.setState(GameStates.READY);
  emitUiSync();
}

function dispatchCommand(action, payload = {}) {
  switch (action) {
    case "start-new-run": {
      game.run = createNewRun();
      game.shop = null;
      startBattle();
      state.setState(GameStates.RUNNING);
      break;
    }
    case "load-run": {
      loadRun();
      break;
    }
    case "play-round": {
      playRound();
      break;
    }
    case "buy-item": {
      buyShopItem(payload.shopId);
      break;
    }
    case "next-battle": {
      nextBattleFromShop();
      break;
    }
    case "pause-toggle": {
      if (state.is(GameStates.RUNNING)) state.setState(GameStates.PAUSED);
      else if (state.is(GameStates.PAUSED)) state.setState(GameStates.RUNNING);
      break;
    }
    case "resume": {
      if (state.is(GameStates.PAUSED)) state.setState(GameStates.RUNNING);
      break;
    }
    case "reset-ready": {
      resetToReady();
      break;
    }
    case "clear-save": {
      try {
        ensureSaveSystem().clear();
        game.status = "Save cleared.";
      } catch (_err) {
        game.status = "Failed to clear save.";
      }
      emitUiSync();
      break;
    }
    default:
      break;
  }

  emitUiSync();
}

function emitUiSync() {
  const battle = game.battle;
  const currentState = state ? state.getState() : GameStates.READY;

  const detail = {
    state: currentState,
    hasSave: (() => {
      try {
        return ensureSaveSystem().has();
      } catch (_err) {
        return false;
      }
    })(),
    status: game.status,
    run: game.run ? clone(game.run) : null,
    battle: battle
      ? {
          floor: battle.floor,
          round: battle.round,
          playerHealth: battle.playerHealth,
          enemyHealth: battle.enemyHealth,
          playerCards: totalCards(battle.playerDraw, battle.playerDiscard),
          enemyCards: totalCards(battle.enemyDraw, battle.enemyDiscard),
        }
      : null,
    shopOffers: game.shop?.offers ? clone(game.shop.offers) : [],
    roundLog: clone(game.roundLog),
  };

  window.WarGameSnapshot = detail;
  window.dispatchEvent(new CustomEvent("koz:ui-sync", { detail }));
}

function exposeGameApi() {
  window.WarGameAPI = {
    startNewRun: () => dispatchCommand("start-new-run"),
    loadRun: () => dispatchCommand("load-run"),
    playRound: () => dispatchCommand("play-round"),
    buyItem: (shopId) => dispatchCommand("buy-item", { shopId }),
    nextBattle: () => dispatchCommand("next-battle"),
    pauseToggle: () => dispatchCommand("pause-toggle"),
    resume: () => dispatchCommand("resume"),
    resetReady: () => dispatchCommand("reset-ready"),
    clearSave: () => dispatchCommand("clear-save"),
    getSnapshot: () => clone(window.WarGameSnapshot || {}),
  };
}

function drawReadyScreen() {
  background("#071018");
  fill("#e6edf5");
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(44);
  text("War Roguelike", width / 2, 118);

  textSize(18);
  fill("#9fb4c8");
  text("Win battles, visit the shop, and push floors until your run breaks.", width / 2, 168);
  text("UI buttons handle gameplay. Hotkeys: Space round | P pause | R ready", width / 2, 198);
}

function drawRunningScreen() {
  background("#0b1a22");

  fill("#dfeaf4");
  noStroke();
  textAlign(LEFT, TOP);
  textSize(18);
  text(`State: ${state.getState()}`, 18, 14);

  if (!game.run || !game.battle) {
    textSize(16);
    fill("#9fb4c8");
    text("No active run. Use Start New Run from the menu.", 18, 50);
    return;
  }

  const battle = game.battle;
  textSize(16);
  fill("#9fb4c8");
  text(`Floor ${game.run.floor} | Gold ${game.run.gold} | Deck ${game.run.deck.length}`, 18, 46);
  text(`HP ${battle.playerHealth}/${game.run.maxHealth} vs Enemy ${battle.enemyHealth}`, 18, 72);
  text(`Cards ${totalCards(battle.playerDraw, battle.playerDiscard)} vs ${totalCards(battle.enemyDraw, battle.enemyDiscard)}`, 18, 96);

  fill("#e6edf5");
  textSize(15);
  text("Recent battle log", 18, 132);

  textSize(14);
  fill("#b4c7d8");
  for (let i = 0; i < game.roundLog.length; i += 1) {
    text(`- ${game.roundLog[i]}`, 18, 158 + i * 22);
  }

  const clash = battle.lastClash;
  if (clash && clash.playerCard && clash.enemyCard) {
    drawCardFace(520, 170, 150, 210, clash.playerCard, clash.playerPower, "You");
    drawCardFace(700, 170, 150, 210, clash.enemyCard, clash.enemyPower, "Enemy");
    if (clash.war) {
      fill("#f5d08a");
      textSize(14);
      textAlign(CENTER, TOP);
      text(`WAR x${clash.warDepth}`, 685, 390);
    }
  }
}

function drawCardFace(x, y, w, h, card, power, label) {
  stroke(215, 229, 241, 70);
  strokeWeight(2);
  fill(244, 248, 252, 245);
  rect(x, y, w, h, 12);

  const isRed = card.suit === "H" || card.suit === "D";
  fill(isRed ? "#b22f2f" : "#1d2f44");
  noStroke();
  textAlign(LEFT, TOP);
  textSize(20);
  text(`${card.rank}${SUIT_SYMBOLS[card.suit] || card.suit}`, x + 12, y + 10);

  textAlign(CENTER, CENTER);
  textSize(32);
  text(`${power}`, x + w / 2, y + h / 2 + 2);

  textAlign(CENTER, TOP);
  textSize(14);
  fill("#2d3f52");
  text(label, x + w / 2, y + h + 8);
}

function drawShopScreen() {
  background("#1f1a11");
  fill("#f1e7d3");
  noStroke();
  textAlign(LEFT, TOP);
  textSize(20);
  text("Shop", 18, 16);

  if (!game.run) return;

  textSize(16);
  fill("#d7bf90");
  text(`Gold: ${game.run.gold} | Floor cleared: ${game.run.floor - 1}`, 18, 48);
  text("Buy upgrades in the UI panel, then continue to next battle.", 18, 72);

  fill("#ecd5a5");
  text(`Run HP: ${game.run.health}/${game.run.maxHealth} | Deck: ${game.run.deck.length}`, 18, 96);
}

function drawPausedOverlay() {
  fill(3, 8, 14, 168);
  rect(0, 0, width, height);
  fill("#e6edf5");
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(32);
  text("Paused", width / 2, height / 2);
}

function drawGameOverScreen() {
  background("#20090d");
  fill("#f4d8dd");
  noStroke();
  textAlign(CENTER, TOP);
  textSize(40);
  text("Run Over", width / 2, 80);

  if (!game.run) return;

  textSize(20);
  fill("#e9b9c3");
  text(`Floors cleared: ${Math.max(0, game.run.floor - 1)}`, width / 2, 150);
  text(`Wins: ${game.run.wins} | Gold banked: ${game.run.gold}`, width / 2, 182);
  text("Start a new run or load a previous save from the UI.", width / 2, 214);
}

function setup() {
  const canvas = createCanvas(960, 540);
  canvas.parent(document.body);
  pixelDensity(1);
  textFont("Trebuchet MS");

  state = ensureStateManager();

  const neededStates = [
    GameStates.READY,
    GameStates.RUNNING,
    GameStates.SHOP,
    GameStates.PAUSED,
    GameStates.GAMEOVER,
  ];
  for (const stateId of neededStates) {
    if (!state.states?.[stateId]) state.addState(stateId, {});
  }

  state.setTransitionRules({
    [GameStates.READY]: [GameStates.RUNNING],
    [GameStates.RUNNING]: [GameStates.PAUSED, GameStates.SHOP, GameStates.GAMEOVER, GameStates.READY],
    [GameStates.SHOP]: [GameStates.RUNNING, GameStates.GAMEOVER, GameStates.READY],
    [GameStates.PAUSED]: [GameStates.RUNNING, GameStates.READY],
    [GameStates.GAMEOVER]: [GameStates.READY, GameStates.RUNNING],
    "*": [GameStates.READY],
  });

  state.onChange((_from, _to) => {
    emitUiSync();
  });

  if (!state.getState()) state.setState(GameStates.READY);

  exposeGameApi();

  emitUiSync();
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

  if (state.is(GameStates.RUNNING)) {
    drawRunningScreen();
    return;
  }

  if (state.is(GameStates.SHOP)) {
    drawShopScreen();
    return;
  }

  if (state.is(GameStates.PAUSED)) {
    drawRunningScreen();
    drawPausedOverlay();
    return;
  }

  if (state.is(GameStates.GAMEOVER)) {
    drawGameOverScreen();
    return;
  }

  drawReadyScreen();
}

function keyPressed() {
  const k = key.toLowerCase();

  if (k === " ") {
    if (state && state.is(GameStates.RUNNING)) playRound();
    return;
  }

  if (k === "p") {
    dispatchCommand("pause-toggle");
    return;
  }

  if (k === "r") {
    dispatchCommand("reset-ready");
    return;
  }

  if (keyCode === ESCAPE) dispatchCommand("reset-ready");
}
