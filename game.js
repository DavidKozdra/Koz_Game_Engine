let app = null;

const GameStates = {
  READY: "READY",
  RUNNING: "RUNNING",
  SHOP: "SHOP",
  PAUSED: "PAUSED",
  GAMEOVER: "GAMEOVER",
  TOUR: "TOUR",
};

const SAVE_KEY = "koz_war_roguelike_run_v2";

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

function createSaveStore() {
  const SaveCtor = window.KozEngine?.SaveLoad?.saveApi?.SaveAPI;
  const drivers = window.KozEngine?.SaveLoad?.storageDrivers;
  if (typeof SaveCtor !== "function" || !drivers) {
    throw new Error("Engine SaveLoad module unavailable.");
  }

  const driver = drivers.createLocalStorageDriver(window.localStorage);
  const api = new SaveCtor({ key: SAVE_KEY, driver });

  return {
    has: () => api.has(),
    load: () => api.load(),
    save: (payload) => api.save(payload),
    clear: () => api.delete(),
  };
}

function resolveAudioContext() {
  try {
    if (typeof window.getAudioContext === "function") return window.getAudioContext();
  } catch (_err) {
    // no-op
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return typeof Ctx === "function" ? new Ctx() : null;
}

class WarGameApp {
  constructor() {
    this.state = ensureStateManager();
    this.saveStore = createSaveStore();
    this.modules = this.bootModules();
    this.renderer = new window.WarRenderer();

    this.core = new window.WarGameCore({
      gameStates: GameStates,
      getState: () => this.state.getState(),
      setState: (next) => this.state.setState(next),
      saveStore: this.saveStore,
      modules: this.modules,
      onUiSync: (snapshot) => this.emitUiSync(snapshot),
      onNotify: (message, type) => this.notify(message, type),
      onSfx: (kind) => this.playSfx(kind),
      onFx: (kind) => this.playFx(kind),
    });

    this.configureStateFlow();
    this.exposeApi();
    this.core.sync();
  }

  bootModules() {
    const modules = {
      seededRng: window.KozEngine?.World?.seededRng?.SeededRNG || null,
      eventEngine: window.KozEngine?.Events?.eventEngine || null,
      minHeapCtor: window.KozEngine?.AI?.astar?.MinHeap || null,
      vfx: window.particleSystem || null,
      notificationManager: null,
      music: null,
      minigames: null,
      audioContext: resolveAudioContext(),
    };

    const NotificationCtor = window.KozEngine?.Events?.notificationManager?.NotificationManager || window.NotificationManager;
    if (typeof NotificationCtor === "function") modules.notificationManager = new NotificationCtor();

    const MusicCtor = window.KozEngine?.Audio?.musicSystem?.MusicSystem || window.MusicSystem;
    if (typeof MusicCtor === "function") {
      modules.music = new MusicCtor(null, [], {
        storage: window.localStorage,
        storageKey: "koz_war_music_volume",
        defaultVolume: 0.45,
        audioContext: modules.audioContext,
      });
    }

    const MinigameCtor = window.KozEngine?.Minigames?.runtime?.MinigameManager || window.MinigameManager;
    if (typeof MinigameCtor === "function") modules.minigames = new MinigameCtor();

    return modules;
  }

  configureStateFlow() {
    const neededStates = [
      GameStates.READY,
      GameStates.RUNNING,
      GameStates.SHOP,
      GameStates.PAUSED,
      GameStates.GAMEOVER,
      GameStates.TOUR,
    ];

    for (const stateId of neededStates) {
      if (!this.state.states?.[stateId]) this.state.addState(stateId, {});
    }

    this.state.setTransitionRules({
      [GameStates.READY]: [GameStates.RUNNING, GameStates.TOUR],
      [GameStates.RUNNING]: [GameStates.PAUSED, GameStates.SHOP, GameStates.GAMEOVER, GameStates.READY],
      [GameStates.SHOP]: [GameStates.RUNNING, GameStates.GAMEOVER, GameStates.READY],
      [GameStates.PAUSED]: [GameStates.RUNNING, GameStates.READY],
      [GameStates.GAMEOVER]: [GameStates.READY, GameStates.RUNNING],
      [GameStates.TOUR]: [GameStates.READY],
      "*": [GameStates.READY],
    });

    this.state.onChange((_from, to) => {
      this.playSfx("state");
      if (to === GameStates.SHOP) this.notify("Shop unlocked.", "info");
      if (to === GameStates.GAMEOVER) this.notify("Run failed.", "error");
      this.core.sync();
    });

    if (!this.state.getState()) this.state.setState(GameStates.READY);
  }

  notify(message, type = "info") {
    const manager = this.modules.notificationManager;
    if (manager && typeof manager.log === "function") {
      manager.log(message, type, 2600);
    }
  }

  playFx(kind) {
    const ps = this.modules.vfx;
    if (!ps || typeof ps.spawnBurst !== "function") return;

    let x = width * 0.5;
    let y = height * 0.5;
    let color = "#8ec5ff";

    if (kind === "enemy-hit") {
      x = width * 0.7;
      y = height * 0.42;
      color = "#7fd6a6";
    } else if (kind === "player-hit") {
      x = width * 0.3;
      y = height * 0.42;
      color = "#ff8c8c";
    } else if (kind === "shop-buy") {
      x = width * 0.52;
      y = height * 0.56;
      color = "#ffd879";
    }

    ps.spawnBurst(x, y, {
      count: 22,
      speed: 140,
      life: 520,
      size: 6,
      color,
      drag: 0.94,
      gravity: 20,
      screen: true,
    });
  }

  playSfx(kind) {
    const audioCtx = this.modules.audioContext;
    if (!audioCtx) return;

    const music = this.modules.music;
    const volume = music && typeof music.getVolume === "function" ? music.getVolume() : 0.4;
    const map = {
      draw: [360, 0.06],
      win: [640, 0.14],
      lose: [160, 0.14],
      shop: [460, 0.08],
      event: [520, 0.1],
      state: [300, 0.06],
    };
    const [freq, time] = map[kind] || map.state;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = kind === "lose" ? "sawtooth" : "triangle";
    osc.frequency.value = freq;
    gain.gain.value = 0;

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    gain.gain.linearRampToValueAtTime(0.03 + volume * 0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + time);

    osc.start(now);
    osc.stop(now + time + 0.02);
  }

  emitUiSync(snapshot) {
    window.WarGameSnapshot = snapshot;
    window.dispatchEvent(new CustomEvent("koz:ui-sync", { detail: snapshot }));
  }

  exposeApi() {
    window.WarGameAPI = {
      startNewRun: () => this.core.dispatch("start-new-run"),
      startChallengeRun: () => this.core.dispatch("start-challenge-run"),
      loadRun: () => this.core.dispatch("load-run"),
      playRound: () => this.core.dispatch("play-round"),
      buyItem: (shopId) => this.core.dispatch("buy-item", { shopId }),
      continueRoute: () => this.core.dispatch("continue-route"),
      selectRoute: (route) => this.core.dispatch("select-route", { route }),
      pauseToggle: () => this.core.dispatch("pause-toggle"),
      resume: () => this.core.dispatch("resume"),
      resetReady: () => this.core.dispatch("reset-ready"),
      clearSave: () => this.core.dispatch("clear-save"),
      toggleAuto: () => this.core.dispatch("toggle-auto"),
      setVolume: (value) => this.core.dispatch("set-volume", { value }),
      startTour: () => this.core.dispatch("tour-start"),
      nextTour: () => this.core.dispatch("tour-next"),
      endTour: () => this.core.dispatch("tour-end"),
      getSnapshot: () => JSON.parse(JSON.stringify(window.WarGameSnapshot || {})),
    };
  }

  update(dt) {
    this.core.tick(dt);

    const ps = this.modules.vfx;
    if (ps && typeof ps.update === "function") ps.update(dt * 1000);

    const minigames = this.modules.minigames;
    if (minigames && typeof minigames.update === "function") minigames.update(dt * 1000);
  }

  render(dt) {
    this.renderer.draw(this.core, this.state.getState(), dt, GameStates);

    const ps = this.modules.vfx;
    if (ps && typeof ps.renderToScreen === "function") ps.renderToScreen();
    else if (ps && typeof ps.render === "function") ps.render();

    const minigames = this.modules.minigames;
    if (minigames && typeof minigames.render === "function") minigames.render();
  }

  keyPressed() {
    const k = key.toLowerCase();
    if (k === " ") {
      if (this.state.is(GameStates.RUNNING)) this.core.dispatch("play-round");
      else if (this.state.is(GameStates.TOUR)) this.core.dispatch("tour-next");
      return;
    }
    if (k === "a") {
      this.core.dispatch("toggle-auto");
      return;
    }
    if (k === "p") {
      this.core.dispatch("pause-toggle");
      return;
    }
    if (k === "r") {
      this.core.dispatch("reset-ready");
      return;
    }
    if (keyCode === ESCAPE) this.core.dispatch("reset-ready");
  }
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent(document.body);
  pixelDensity(1);
  textFont("Trebuchet MS");
  app = new WarGameApp();
}

function draw() {
  if (!app) {
    background("#111827");
    fill("#f9fafb");
    noStroke();
    textSize(16);
    textAlign(LEFT, TOP);
    text("Waiting for game bootstrap...", 12, 12);
    return;
  }

  const dt = Math.min(deltaTime / 1000, 0.05);
  app.update(dt);
  app.render(dt);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function keyPressed() {
  if (app) app.keyPressed();
}
