(function initWarCore(root) {
  const SUITS = ["S", "H", "D", "C"];
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

  const ENEMY_ARCHETYPES = [
    { id: "raider", label: "Raider", hpScale: 1, cardScale: 0, intentBias: { aggro: -1.2, trick: 0.8, brace: 1.2 }, desc: "Balanced enemy with occasional tricks." },
    { id: "brute", label: "Brute", hpScale: 1.3, cardScale: 1, intentBias: { aggro: -2.4, trick: 1.8, brace: 2.5 }, desc: "High health and heavy hits." },
    { id: "duelist", label: "Duelist", hpScale: 0.95, cardScale: 1, intentBias: { aggro: 0.6, trick: -2.2, brace: 0.2 }, desc: "Leans on precision and tie manipulation." },
    { id: "warden", label: "Warden", hpScale: 1.15, cardScale: 0, intentBias: { aggro: 1.6, trick: 0.8, brace: -2.2 }, desc: "Defensive enemy that drags battles out." },
  ];

  const SHOP_BLUEPRINTS = [
    { id: "forge_low", name: "Low Forge", desc: "+1 power to 6 random cards value 6 or less.", cost: 8, apply(run, rng, api) { const low = run.deck.filter((c) => c.value <= 6); const picks = api.shuffle(low, rng).slice(0, 6); for (const c of picks) c.bonus += 1; } },
    { id: "flat_bonus", name: "Battle Standard", desc: "+1 power to every player draw.", cost: 14, apply(run) { run.flatBonus += 1; } },
    { id: "war_edge", name: "War Banner", desc: "+2 power during war tie-break cards.", cost: 10, apply(run) { run.warEdge += 2; } },
    { id: "cull_weak", name: "Cull Weak", desc: "Remove weakest card and heal 3 HP.", cost: 9, apply(run) { if (!run.deck.length) return; run.deck.sort((a, b) => (a.value + a.bonus) - (b.value + b.bonus)); run.deck.shift(); run.health = Math.min(run.maxHealth, run.health + 3); } },
    { id: "add_ace", name: "Smuggled Ace", desc: "Add a random Ace (+1 bonus).", cost: 12, apply(run, rng, api) { const suit = api.pick(SUITS, rng); run.deck.push({ id: `A${suit}_${Date.now()}`, rank: "A", suit, value: 14, bonus: 1 }); } },
    { id: "fortify", name: "Fortify", desc: "+4 max HP and heal 4 HP.", cost: 11, apply(run) { run.maxHealth += 4; run.health = Math.min(run.maxHealth, run.health + 4); } },
    { id: "gambit", name: "Gambit Lens", desc: "+2 low-card boost, -2 max HP.", cost: 7, apply(run) { run.lowCardBoost += 2; run.maxHealth = Math.max(10, run.maxHealth - 2); run.health = Math.min(run.health, run.maxHealth); } },
  ];

  const TOUR_STEPS = [
    { title: "Koz Engine Tour", body: "This demo combines Save/Load, Events, VisualFX, Audio, AI utilities, and minigames." },
    { title: "Responsive Canvas", body: "Canvas is fullscreen and resizes live to viewport. UI overlays are mobile-friendly." },
    { title: "Battle FX + Audio", body: "Card clashes trigger particle bursts, notifications, and synthesized SFX with engine volume control." },
    { title: "Roguelike Loop", body: "Each win opens shop + branch choices (battle/event/minigame). Enemy archetypes change behavior." },
    { title: "AI Showcase", body: "Enemy intent selection uses the AI MinHeap utility for weighted tactical decisions." },
  ];

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  class WarGameCore {
    constructor(options = {}) {
      this.gameStates = options.gameStates || {};
      this.getState = options.getState || (() => this.gameStates.READY);
      this.setState = options.setState || (() => {});
      this.onUiSync = options.onUiSync || (() => {});
      this.onNotify = options.onNotify || (() => {});
      this.onSfx = options.onSfx || (() => {});
      this.onFx = options.onFx || (() => {});
      this.saveStore = options.saveStore || null;
      this.modules = options.modules || {};

      this.run = null;
      this.battle = null;
      this.shop = null;
      this.roundLog = [];
      this.status = "";
      this.statusLevel = "info";
      this.autoPlay = false;
      this.autoTimer = 0;
      this.tourStep = 0;
    }

    pick(list, rng = Math.random) {
      if (!Array.isArray(list) || !list.length) return null;
      return list[Math.floor(rng() * list.length)];
    }

    shuffle(list, rng = Math.random) {
      const arr = list.slice();
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    }

    randomInt(rng, min, max) {
      const lo = Math.floor(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(rng() * (hi - lo + 1));
    }

    rngStream(name = "run") {
      const runtime = this.modules.seededRng;
      if (!runtime || typeof runtime.stream !== "function") return Math.random;
      const stream = runtime.stream(name);
      return () => stream.random();
    }

    runSeeded(seed) {
      const runtime = this.modules.seededRng;
      if (!runtime || typeof runtime.startRun !== "function") return;
      runtime.startRun(seed, { installGlobalMathRandom: false });
    }

    createBaseDeck() {
      const deck = [];
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          deck.push({ id: `${rank.label}${suit}_${deck.length}`, rank: rank.label, suit, value: rank.value, bonus: 0 });
        }
      }
      return deck;
    }

    createNewRun(challengeMode = false) {
      const seed = Math.floor(Date.now() % 2147483647);
      this.runSeeded(seed);
      return {
        version: 2,
        active: true,
        seed,
        floor: 1,
        wins: 0,
        gold: 0,
        maxHealth: challengeMode ? 26 : 30,
        health: challengeMode ? 26 : 30,
        deck: this.createBaseDeck(),
        flatBonus: 0,
        lowCardBoost: 0,
        warEdge: 0,
        challengeMode,
        enemyHistory: [],
        pathHistory: [],
        lastUpdatedAt: Date.now(),
      };
    }

    buildEnemyProfile(floor, challengeMode, rng) {
      const order = this.shuffle(ENEMY_ARCHETYPES, rng);
      const profile = order[floor % order.length];
      if (!challengeMode) return profile;
      return { ...profile, hpScale: profile.hpScale + 0.2, cardScale: profile.cardScale + 1, label: `${profile.label} Elite` };
    }

    buildEnemyDeck(floor, profile, rng) {
      const targetSize = Math.min(56, 20 + floor * 2 + profile.cardScale);
      const deck = [];
      for (let i = 0; i < targetSize; i += 1) {
        const rank = this.pick(RANKS, rng);
        const suit = this.pick(SUITS, rng);
        const scaling = Math.floor((floor - 1) / 4);
        deck.push({ id: `E${floor}_${i}`, rank: rank.label, suit, value: Math.min(16, rank.value + scaling), bonus: 0 });
      }
      return deck;
    }

    totalCards(drawPile, discardPile) {
      return drawPile.length + discardPile.length;
    }

    drawFromPile(drawPile, discardPile, rng) {
      if (!drawPile.length && discardPile.length) {
        const refill = this.shuffle(discardPile, rng);
        drawPile.push(...refill);
        discardPile.length = 0;
      }
      return drawPile.length ? drawPile.shift() : null;
    }

    cardPower(card, owner, isWar = false) {
      if (!this.run || !card) return 0;
      let power = card.value + (card.bonus || 0);
      if (owner === "player") {
        power += this.run.flatBonus;
        if (card.value <= 6) power += this.run.lowCardBoost;
        if (isWar) power += this.run.warEdge;
      }
      return power;
    }

    makeIntentQueue(playerPower) {
      const battle = this.battle;
      const profile = battle.enemyProfile;
      const hpDelta = battle.enemyHealth - battle.playerHealth;

      const intents = [
        { id: "aggro", label: "Aggro", modifier: 2, damageScale: 1.2, tieBias: 0, score: (battle.enemyHealth <= 8 ? -4 : 0) + (hpDelta < -4 ? -2 : 0) },
        { id: "trick", label: "Trick", modifier: playerPower >= 10 ? 1 : 2, damageScale: 1, tieBias: 2, score: (playerPower >= 10 ? -3 : -1) },
        { id: "brace", label: "Brace", modifier: -1, damageScale: 0.65, tieBias: 1, score: (hpDelta > 6 ? -3 : 1) },
      ];

      const weights = profile.intentBias || {};
      for (const intent of intents) intent.score += weights[intent.id] || 0;

      const Ctor = this.modules.minHeapCtor;
      if (typeof Ctor === "function") {
        const heap = new Ctor((entry) => entry.score);
        for (const intent of intents) heap.push(intent);
        return heap.pop();
      }

      intents.sort((a, b) => a.score - b.score);
      return intents[0];
    }

    startBattle() {
      if (!this.run) return;

      const rng = this.rngStream(`battle_${this.run.floor}`);
      const profile = this.buildEnemyProfile(this.run.floor, this.run.challengeMode, rng);
      const enemyDeck = this.shuffle(this.buildEnemyDeck(this.run.floor, profile, rng), rng);
      const playerDeck = this.shuffle(deepClone(this.run.deck), rng);

      this.battle = {
        floor: this.run.floor,
        round: 0,
        playerHealth: this.run.health,
        enemyHealth: Math.round((16 + this.run.floor * 3) * profile.hpScale),
        maxPlayerHealth: this.run.maxHealth,
        maxEnemyHealth: Math.round((16 + this.run.floor * 3) * profile.hpScale),
        playerDraw: playerDeck,
        playerDiscard: [],
        enemyDraw: enemyDeck,
        enemyDiscard: [],
        pot: [],
        over: false,
        winner: null,
        enemyProfile: profile,
        lastClash: null,
        damagePopups: [],
        hitFlashPlayer: 0,
        hitFlashEnemy: 0,
        cardAnim: { active: false, progress: 1, duration: 0.35, playerCard: null, enemyCard: null, war: false },
      };

      this.run.enemyHistory.push(profile.id);
      this.roundLog = [`Floor ${this.run.floor} - ${profile.label} appears.`];
      this.statusLevel = "info";
      this.status = profile.desc;
      this.onNotify(`Encounter: ${profile.label}`, "info");
      this.syncAndSave();
    }

    addLog(message) {
      this.roundLog.push(message);
      if (this.roundLog.length > 10) this.roundLog.shift();
    }

    resolveWarStep(rng, depth = 1) {
      const battle = this.battle;
      const playerFaceDown = this.drawFromPile(battle.playerDraw, battle.playerDiscard, rng);
      const enemyFaceDown = this.drawFromPile(battle.enemyDraw, battle.enemyDiscard, rng);
      if (playerFaceDown) battle.pot.push(playerFaceDown);
      if (enemyFaceDown) battle.pot.push(enemyFaceDown);

      const playerWar = this.drawFromPile(battle.playerDraw, battle.playerDiscard, rng);
      const enemyWar = this.drawFromPile(battle.enemyDraw, battle.enemyDiscard, rng);

      if (!playerWar || !enemyWar) {
        if (playerWar) battle.pot.push(playerWar);
        if (enemyWar) battle.pot.push(enemyWar);
        return {
          winner: !playerWar && enemyWar ? "enemy" : "player",
          playerPower: playerWar ? this.cardPower(playerWar, "player", true) : 0,
          enemyPower: enemyWar ? this.cardPower(enemyWar, "enemy", true) : 0,
          playerCard: playerWar || null,
          enemyCard: enemyWar || null,
          depth,
          intent: { id: "attrition", label: "Attrition", tieBias: 0, damageScale: 1, modifier: 0 },
        };
      }

      battle.pot.push(playerWar, enemyWar);
      const basePlayer = this.cardPower(playerWar, "player", true);
      const intent = this.makeIntentQueue(basePlayer);
      const playerPower = basePlayer;
      const enemyPower = this.cardPower(enemyWar, "enemy", true) + intent.tieBias;
      this.addLog(`War draw: ${playerWar.rank}${playerWar.suit}(${playerPower}) vs ${enemyWar.rank}${enemyWar.suit}(${enemyPower})`);

      if (playerPower === enemyPower) return this.resolveWarStep(rng, depth + 1);

      return { winner: playerPower > enemyPower ? "player" : "enemy", playerPower, enemyPower, playerCard: playerWar, enemyCard: enemyWar, depth, intent };
    }

    dealRoundDamage(winner, playerPower, enemyPower, intent) {
      const battle = this.battle;
      const scale = intent?.damageScale || 1;
      const raw = Math.max(1, Math.ceil(Math.abs(playerPower - enemyPower) / 3));
      const damage = Math.max(1, Math.round(raw * scale));

      if (winner === "player") {
        battle.enemyHealth = Math.max(0, battle.enemyHealth - damage);
        battle.playerDiscard.push(...battle.pot);
        battle.pot = [];
        battle.hitFlashEnemy = 0.45;
        battle.damagePopups.push({ target: "enemy", amount: damage, ttl: 0.9 });
        this.addLog(`You win and deal ${damage} damage.`);
        this.onFx("enemy-hit");
        this.onSfx("win");
      } else {
        battle.playerHealth = Math.max(0, battle.playerHealth - damage);
        battle.enemyDiscard.push(...battle.pot);
        battle.pot = [];
        battle.hitFlashPlayer = 0.45;
        battle.damagePopups.push({ target: "player", amount: damage, ttl: 0.9 });
        this.addLog(`Enemy ${intent?.label || "attack"} deals ${damage} damage.`);
        this.onFx("player-hit");
        this.onSfx("lose");
      }
    }

    completeBattle(victory) {
      if (!this.run || !this.battle) return;
      this.battle.over = true;

      if (victory) {
        const rewardGold = 6 + this.battle.floor * 2 + (this.run.challengeMode ? 2 : 0);
        this.run.gold += rewardGold;
        this.run.wins += 1;
        this.run.floor += 1;
        this.run.health = Math.min(this.run.maxHealth, this.battle.playerHealth + 2);
        this.statusLevel = "success";
        this.status = `Victory. +${rewardGold} gold. Choose your route.`;
        this.onNotify(`Floor cleared. +${rewardGold} gold`, "success");
        this.shop = {
          offers: this.generateShopOffers(this.run),
          routeOptions: ["battle", "event", "minigame"],
          selectedRoute: "battle",
          shopAnim: 0,
        };
        this.setState(this.gameStates.SHOP);
      } else {
        this.run.health = Math.max(0, this.battle.playerHealth);
        this.run.active = false;
        this.statusLevel = "error";
        this.status = `Defeat on floor ${this.battle.floor}.`;
        this.onNotify(this.status, "error");
        this.setState(this.gameStates.GAMEOVER);
      }

      this.run.lastUpdatedAt = Date.now();
      this.syncAndSave();
    }

    playRound() {
      const battle = this.battle;
      if (!battle || battle.over || this.getState() !== this.gameStates.RUNNING) return;

      const rng = this.rngStream(`round_${this.run.floor}_${battle.round}`);
      battle.round += 1;

      const playerCard = this.drawFromPile(battle.playerDraw, battle.playerDiscard, rng);
      const enemyCard = this.drawFromPile(battle.enemyDraw, battle.enemyDiscard, rng);

      if (!playerCard || !enemyCard) {
        const playerCardsLeft = this.totalCards(battle.playerDraw, battle.playerDiscard);
        const enemyCardsLeft = this.totalCards(battle.enemyDraw, battle.enemyDiscard);
        this.completeBattle(playerCardsLeft >= enemyCardsLeft);
        return;
      }

      battle.pot = [playerCard, enemyCard];
      const playerPower = this.cardPower(playerCard, "player");
      const intent = this.makeIntentQueue(playerPower);
      const enemyPower = this.cardPower(enemyCard, "enemy") + intent.modifier;

      battle.lastClash = { playerCard, enemyCard, playerPower, enemyPower, war: false, warDepth: 0, intent: intent.label };
      battle.cardAnim = { active: true, progress: 0, duration: 0.34, playerCard, enemyCard, war: false };

      this.addLog(`R${battle.round}: ${playerCard.rank}${playerCard.suit}(${playerPower}) vs ${enemyCard.rank}${enemyCard.suit}(${enemyPower}) [${intent.label}]`);
      this.onSfx("draw");

      if (playerPower === enemyPower) {
        this.addLog("Tie! War begins.");
        const warResult = this.resolveWarStep(rng);
        battle.lastClash = {
          playerCard: warResult.playerCard || playerCard,
          enemyCard: warResult.enemyCard || enemyCard,
          playerPower: warResult.playerPower,
          enemyPower: warResult.enemyPower,
          war: true,
          warDepth: warResult.depth || 1,
          intent: warResult.intent?.label || intent.label,
        };
        battle.cardAnim.war = true;
        this.dealRoundDamage(warResult.winner, warResult.playerPower, warResult.enemyPower, warResult.intent || intent);
      } else {
        const winner = playerPower > enemyPower ? "player" : "enemy";
        this.dealRoundDamage(winner, playerPower, enemyPower, intent);
      }

      if (battle.enemyHealth <= 0) this.completeBattle(true);
      else if (battle.playerHealth <= 0) this.completeBattle(false);
      else this.sync();

      this.saveRun();
    }

    generateShopOffers(run) {
      const rng = this.rngStream(`shop_${run.floor}`);
      return this.shuffle(SHOP_BLUEPRINTS, rng).slice(0, 4).map((item, idx) => ({
        shopId: `${item.id}_${run.floor}_${idx}`,
        id: item.id,
        name: item.name,
        desc: item.desc,
        cost: item.cost,
        bought: false,
      }));
    }

    buyShopItem(shopId) {
      if (!this.shop || !this.run || this.getState() !== this.gameStates.SHOP) return;

      const item = this.shop.offers.find((offer) => offer.shopId === shopId);
      if (!item) return;
      if (item.bought) {
        this.statusLevel = "warning";
        this.status = "Item already purchased.";
        this.sync();
        return;
      }
      if (this.run.gold < item.cost) {
        this.statusLevel = "warning";
        this.status = "Not enough gold.";
        this.sync();
        return;
      }

      const blueprint = SHOP_BLUEPRINTS.find((entry) => entry.id === item.id);
      if (!blueprint) return;

      this.run.gold -= item.cost;
      blueprint.apply(this.run, this.rngStream(`shop_buy_${this.run.floor}`), this);
      item.bought = true;
      this.shop.shopAnim = 0.01;
      this.statusLevel = "success";
      this.status = `Purchased: ${item.name}`;
      this.onFx("shop-buy");
      this.onNotify(this.status, "success");
      this.onSfx("shop");

      this.run.lastUpdatedAt = Date.now();
      this.syncAndSave();
    }

    selectRoute(route) {
      if (!this.shop || this.getState() !== this.gameStates.SHOP) return;
      if (!["battle", "event", "minigame"].includes(route)) return;
      this.shop.selectedRoute = route;
      this.statusLevel = "info";
      this.status = `Route selected: ${route}.`;
      this.sync();
    }

    applyEventRoute() {
      if (!this.run) return;
      const rng = this.rngStream(`event_${this.run.floor}_${this.run.wins}`);
      const outcomes = [
        () => {
          const gain = 6 + this.randomInt(rng, 0, 6);
          this.run.gold += gain;
          this.statusLevel = "success";
          this.status = `Event: Found cache. +${gain} gold.`;
        },
        () => {
          const hurt = 2 + this.randomInt(rng, 0, 3);
          this.run.health = Math.max(1, this.run.health - hurt);
          this.run.flatBonus += 1;
          this.statusLevel = "warning";
          this.status = `Event: Shrine drains ${hurt} HP, grants +1 draw power.`;
        },
        () => {
          const heal = 4 + this.randomInt(rng, 0, 2);
          this.run.health = Math.min(this.run.maxHealth, this.run.health + heal);
          this.statusLevel = "info";
          this.status = `Event: Field doctor restores ${heal} HP.`;
        },
      ];
      this.pick(outcomes, rng)();
      this.run.pathHistory.push("event");
      this.onNotify(this.status, this.statusLevel);
      this.onSfx("event");
    }

    applyMinigameRoute() {
      if (!this.run) return;
      const gain = 4 + this.randomInt(this.rngStream(`minigame_${this.run.floor}`), 0, 6);
      this.run.gold += gain;
      this.statusLevel = "success";
      this.status = `Minigame route complete. +${gain} gold.`;
      this.run.pathHistory.push("minigame");
      this.onNotify(this.status, "success");
    }

    continueRoute() {
      if (!this.run || this.getState() !== this.gameStates.SHOP) return;
      const route = this.shop?.selectedRoute || "battle";
      if (route === "event") this.applyEventRoute();
      else if (route === "minigame") this.applyMinigameRoute();

      this.shop = null;
      this.startBattle();
      this.setState(this.gameStates.RUNNING);
      this.syncAndSave();
    }

    beginTour() {
      this.tourStep = 0;
      this.status = "Feature tour started.";
      this.statusLevel = "info";
      this.setState(this.gameStates.TOUR);
      this.sync();
    }

    nextTourStep() {
      this.tourStep += 1;
      if (this.tourStep >= TOUR_STEPS.length) {
        this.tourStep = 0;
        this.status = "Tour complete.";
        this.statusLevel = "success";
        this.setState(this.gameStates.READY);
      }
      this.sync();
    }

    endTour() {
      this.tourStep = 0;
      this.setState(this.gameStates.READY);
      this.sync();
    }

    tick(dt) {
      if (this.battle) {
        if (this.battle.hitFlashPlayer > 0) this.battle.hitFlashPlayer = Math.max(0, this.battle.hitFlashPlayer - dt);
        if (this.battle.hitFlashEnemy > 0) this.battle.hitFlashEnemy = Math.max(0, this.battle.hitFlashEnemy - dt);
        if (Array.isArray(this.battle.damagePopups) && this.battle.damagePopups.length) {
          for (const popup of this.battle.damagePopups) popup.ttl -= dt;
          this.battle.damagePopups = this.battle.damagePopups.filter((popup) => popup.ttl > 0);
        }
      }

      if (this.autoPlay && this.getState() === this.gameStates.RUNNING) {
        this.autoTimer -= dt;
        if (this.autoTimer <= 0) {
          this.autoTimer = 0.55;
          this.playRound();
        }
      }
    }

    getSnapshot() {
      const music = this.modules.music;
      return {
        state: this.getState(),
        status: this.status,
        statusLevel: this.statusLevel,
        autoPlay: this.autoPlay,
        volume: music && typeof music.getVolume === "function" ? music.getVolume() : 0.45,
        run: this.run ? deepClone(this.run) : null,
        battle: this.battle
          ? {
              floor: this.battle.floor,
              round: this.battle.round,
              playerHealth: this.battle.playerHealth,
              enemyHealth: this.battle.enemyHealth,
              maxPlayerHealth: this.battle.maxPlayerHealth,
              maxEnemyHealth: this.battle.maxEnemyHealth,
              enemyType: this.battle.enemyProfile?.label || "Unknown",
              playerCards: this.totalCards(this.battle.playerDraw, this.battle.playerDiscard),
              enemyCards: this.totalCards(this.battle.enemyDraw, this.battle.enemyDiscard),
              damagePopups: deepClone(this.battle.damagePopups || []),
              hitFlashPlayer: this.battle.hitFlashPlayer || 0,
              hitFlashEnemy: this.battle.hitFlashEnemy || 0,
            }
          : null,
        shopOffers: this.shop?.offers ? deepClone(this.shop.offers) : [],
        route: this.shop?.selectedRoute || "battle",
        roundLog: deepClone(this.roundLog),
        hasSave: this.saveStore ? this.saveStore.has() : false,
        tour: {
          step: this.tourStep,
          count: TOUR_STEPS.length,
          current: TOUR_STEPS[this.tourStep] || TOUR_STEPS[0],
        },
        featureFlags: {
          saveLoad: true,
          visualFx: !!this.modules.vfx,
          events: !!this.modules.eventEngine,
          ai: !!this.modules.minHeapCtor,
          audio: !!this.modules.music,
          minigames: !!this.modules.minigames,
          worldSeededRng: !!this.modules.seededRng,
        },
      };
    }

    saveRun() {
      if (!this.run || !this.saveStore) return;
      this.saveStore.save({
        version: 2,
        savedAt: Date.now(),
        currentState: this.getState(),
        run: this.run ? deepClone(this.run) : null,
        battle: this.battle ? deepClone(this.battle) : null,
        shop: this.shop ? deepClone(this.shop) : null,
        roundLog: deepClone(this.roundLog),
        status: this.status,
        statusLevel: this.statusLevel,
        autoPlay: this.autoPlay,
        tourStep: this.tourStep,
      });
    }

    loadRun() {
      if (!this.saveStore) return false;
      const data = this.saveStore.load();
      if (!data || !data.run) {
        this.statusLevel = "warning";
        this.status = "No saved run found.";
        this.sync();
        return false;
      }

      this.run = data.run;
      this.battle = data.battle || null;
      this.shop = data.shop || null;
      this.roundLog = Array.isArray(data.roundLog) ? data.roundLog : [];
      this.status = data.status || "Run loaded.";
      this.statusLevel = data.statusLevel || "info";
      this.autoPlay = !!data.autoPlay;
      this.tourStep = data.tourStep || 0;

      if (!this.run.active) this.setState(this.gameStates.GAMEOVER);
      else if (data.currentState === this.gameStates.SHOP && this.shop) this.setState(this.gameStates.SHOP);
      else {
        if (!this.battle) this.startBattle();
        this.setState(this.gameStates.RUNNING);
      }

      this.sync();
      return true;
    }

    resetToReady() {
      this.run = null;
      this.battle = null;
      this.shop = null;
      this.roundLog = [];
      this.status = "";
      this.statusLevel = "info";
      this.autoPlay = false;
      this.autoTimer = 0;
      this.tourStep = 0;
      this.setState(this.gameStates.READY);
      this.sync();
    }

    setVolume(value) {
      const music = this.modules.music;
      if (!music || typeof music.setVolume !== "function") return;
      music.setVolume(value);
      this.statusLevel = "info";
      this.status = `Volume ${(music.getVolume() * 100).toFixed(0)}%`;
      this.sync();
    }

    dispatch(action, payload = {}) {
      switch (action) {
        case "start-new-run":
          this.run = this.createNewRun(false);
          this.shop = null;
          this.autoPlay = false;
          this.startBattle();
          this.setState(this.gameStates.RUNNING);
          break;
        case "start-challenge-run":
          this.run = this.createNewRun(true);
          this.shop = null;
          this.autoPlay = false;
          this.startBattle();
          this.setState(this.gameStates.RUNNING);
          break;
        case "load-run":
          this.loadRun();
          break;
        case "play-round":
          this.playRound();
          break;
        case "buy-item":
          this.buyShopItem(payload.shopId);
          break;
        case "select-route":
          this.selectRoute(payload.route);
          break;
        case "continue-route":
          this.continueRoute();
          break;
        case "pause-toggle":
          if (this.getState() === this.gameStates.RUNNING) this.setState(this.gameStates.PAUSED);
          else if (this.getState() === this.gameStates.PAUSED) this.setState(this.gameStates.RUNNING);
          break;
        case "resume":
          if (this.getState() === this.gameStates.PAUSED) this.setState(this.gameStates.RUNNING);
          break;
        case "reset-ready":
          this.resetToReady();
          break;
        case "clear-save":
          if (this.saveStore) this.saveStore.clear();
          this.statusLevel = "success";
          this.status = "Save cleared.";
          break;
        case "toggle-auto":
          this.autoPlay = !this.autoPlay;
          this.autoTimer = 0;
          this.statusLevel = "info";
          this.status = `Auto play ${this.autoPlay ? "enabled" : "disabled"}.`;
          break;
        case "set-volume":
          this.setVolume(payload.value);
          break;
        case "tour-start":
          this.beginTour();
          break;
        case "tour-next":
          this.nextTourStep();
          break;
        case "tour-end":
          this.endTour();
          break;
        default:
          break;
      }
      this.sync();
    }

    sync() {
      const snapshot = this.getSnapshot();
      root.WarGameSnapshot = snapshot;
      this.onUiSync(snapshot);
    }

    syncAndSave() {
      this.sync();
      this.saveRun();
    }
  }

  root.WarGameCore = WarGameCore;
  root.WarCoreData = {
    SUITS,
    TOUR_STEPS,
  };
})(typeof window !== "undefined" ? window : globalThis);
