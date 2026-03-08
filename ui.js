uiManager.registerScreen("readyMenu", {
  validStates: ["READY"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "readyMenu";
    wrapper.className = "screen";

    const card = document.createElement("div");
    card.className = "ui-card";

    const title = document.createElement("h1");
    title.textContent = "War Roguelike Demo";

    const subtitle = document.createElement("p");
    subtitle.id = "ready-subtitle";
    subtitle.textContent = "Start a run, challenge mode, or feature tour.";

    const startBtn = document.createElement("button");
    startBtn.className = "menu-btn";
    startBtn.textContent = "Start Standard Run";
    startBtn.addEventListener("click", () => window.WarGameAPI?.startNewRun());

    const challengeBtn = document.createElement("button");
    challengeBtn.className = "menu-btn";
    challengeBtn.textContent = "Start Challenge Run";
    challengeBtn.addEventListener("click", () => window.WarGameAPI?.startChallengeRun());

    const loadBtn = document.createElement("button");
    loadBtn.id = "btn-load-run";
    loadBtn.className = "menu-btn";
    loadBtn.textContent = "Load Run";
    loadBtn.addEventListener("click", () => window.WarGameAPI?.loadRun());

    const tourBtn = document.createElement("button");
    tourBtn.className = "menu-btn";
    tourBtn.textContent = "Feature Tour";
    tourBtn.addEventListener("click", () => window.WarGameAPI?.startTour());

    const clearBtn = document.createElement("button");
    clearBtn.className = "menu-btn";
    clearBtn.textContent = "Clear Save";
    clearBtn.addEventListener("click", () => window.WarGameAPI?.clearSave());

    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(startBtn);
    card.appendChild(challengeBtn);
    card.appendChild(loadBtn);
    card.appendChild(tourBtn);
    card.appendChild(clearBtn);

    wrapper.appendChild(card);
    wrapper.show = () => {
      wrapper.style.display = "block";
      wrapper.style.opacity = "1";
      wrapper.style.transform = "translate(-50%, -50%) scale(1)";
    };
    wrapper.hide = () => {
      wrapper.style.display = "none";
    };
    wrapper.hide();

    document.body.appendChild(wrapper);
    return wrapper;
  },
  show: () => {
    const snap = window.WarGameSnapshot || {};
    const subtitle = document.getElementById("ready-subtitle");
    const loadBtn = document.getElementById("btn-load-run");
    if (subtitle) subtitle.textContent = snap.status || "Start a run, challenge mode, or feature tour.";
    if (loadBtn) loadBtn.disabled = !snap.hasSave;
  },
  update: () => {
    const snap = window.WarGameSnapshot || {};
    const subtitle = document.getElementById("ready-subtitle");
    const loadBtn = document.getElementById("btn-load-run");
    if (subtitle) subtitle.textContent = snap.status || "Start a run, challenge mode, or feature tour.";
    if (loadBtn) loadBtn.disabled = !snap.hasSave;
  },
  hide: () => {
    const w = document.getElementById("readyMenu");
    if (w) {
      w.style.opacity = "0";
      w.style.transform = "translate(-50%, -48%) scale(0.98)";
      uiManager.scheduleFadeHide("readyMenu", 220);
    }
  },
});

uiManager.registerScreen("hud", {
  validStates: ["RUNNING"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "hud";
    wrapper.className = "screen screen-hud";

    const card = document.createElement("div");
    card.className = "ui-card";

    const status = document.createElement("div");
    status.id = "hud-status";
    status.className = "status";

    const content = document.createElement("div");
    content.id = "run-hud";

    const actions = document.createElement("div");
    actions.className = "row actions-row";

    const playBtn = document.createElement("button");
    playBtn.id = "btn-play-round";
    playBtn.textContent = "Play Round";
    playBtn.addEventListener("click", () => window.WarGameAPI?.playRound());

    const autoBtn = document.createElement("button");
    autoBtn.id = "btn-auto-play";
    autoBtn.textContent = "Toggle Auto";
    autoBtn.addEventListener("click", () => window.WarGameAPI?.toggleAuto());

    const pauseBtn = document.createElement("button");
    pauseBtn.textContent = "Pause/Resume";
    pauseBtn.addEventListener("click", () => window.WarGameAPI?.pauseToggle());

    const readyBtn = document.createElement("button");
    readyBtn.textContent = "Back To Ready";
    readyBtn.addEventListener("click", () => window.WarGameAPI?.resetReady());

    actions.appendChild(playBtn);
    actions.appendChild(autoBtn);
    actions.appendChild(pauseBtn);
    actions.appendChild(readyBtn);

    const volumeRow = document.createElement("div");
    volumeRow.className = "volume-row";
    const volumeLabel = document.createElement("label");
    volumeLabel.textContent = "Volume";
    volumeLabel.setAttribute("for", "hud-volume");

    const volumeInput = document.createElement("input");
    volumeInput.id = "hud-volume";
    volumeInput.type = "range";
    volumeInput.min = "0";
    volumeInput.max = "1";
    volumeInput.step = "0.01";
    volumeInput.value = "0.45";
    volumeInput.addEventListener("input", () => {
      window.WarGameAPI?.setVolume(Number(volumeInput.value));
    });

    volumeRow.appendChild(volumeLabel);
    volumeRow.appendChild(volumeInput);

    const flags = document.createElement("div");
    flags.id = "feature-flags";
    flags.className = "flags";

    card.appendChild(status);
    card.appendChild(content);
    card.appendChild(actions);
    card.appendChild(volumeRow);
    card.appendChild(flags);

    wrapper.appendChild(card);
    wrapper.show = () => {
      wrapper.style.display = "block";
      wrapper.style.opacity = "1";
    };
    wrapper.hide = () => {
      wrapper.style.display = "none";
    };
    wrapper.hide();

    document.body.appendChild(wrapper);
    return wrapper;
  },
  show: () => {
    const snap = window.WarGameSnapshot || {};
    const status = document.getElementById("hud-status");
    const hud = document.getElementById("run-hud");
    const flags = document.getElementById("feature-flags");
    const playBtn = document.getElementById("btn-play-round");
    const autoBtn = document.getElementById("btn-auto-play");
    const volume = document.getElementById("hud-volume");

    if (playBtn) playBtn.disabled = snap.state !== "RUNNING";
    if (autoBtn) autoBtn.textContent = snap.autoPlay ? "Auto: ON" : "Auto: OFF";
    if (volume) volume.value = String(typeof snap.volume === "number" ? snap.volume : 0.45);

    if (status) {
      status.textContent = snap.status || "";
      status.className = `status status-${snap.statusLevel || "info"}`;
    }

    if (hud) {
      if (!snap.run) {
        hud.innerHTML = "<div>No active run.</div>";
      } else {
        const battle = snap.battle;
        const playerHpMax = battle?.maxPlayerHealth || snap.run.maxHealth;
        const enemyHpMax = battle?.maxEnemyHealth || battle?.enemyHealth || 1;
        const playerHpPct = battle ? Math.max(0, Math.min(100, (battle.playerHealth / Math.max(1, playerHpMax)) * 100)) : 0;
        const enemyHpPct = battle ? Math.max(0, Math.min(100, (battle.enemyHealth / Math.max(1, enemyHpMax)) * 100)) : 0;
        const totalCards = battle ? Math.max(1, battle.playerCards + battle.enemyCards) : 1;
        const playerCardsPct = battle ? Math.max(0, Math.min(100, (battle.playerCards / totalCards) * 100)) : 0;
        const enemyCardsPct = battle ? Math.max(0, Math.min(100, (battle.enemyCards / totalCards) * 100)) : 0;
        hud.innerHTML = `
          <div class="row"><span>Floor ${snap.run.floor}</span><span>Wins ${snap.run.wins}</span><span>Gold ${snap.run.gold}</span><span>${snap.run.challengeMode ? "Challenge" : "Standard"}</span></div>
          <div class="row"><span>Deck ${snap.run.deck.length}</span><span>Seed ${snap.run.seed}</span><span>${snap.autoPlay ? "Auto" : "Manual"}</span></div>
          ${battle ? `
          <div class="bar-group">
            <div class="bar-label">Player HP ${battle.playerHealth}/${playerHpMax}</div>
            <div class="meter"><span class="meter-fill hp-player" style="width:${playerHpPct}%"></span></div>
            <div class="bar-label">Enemy HP ${battle.enemyHealth}/${enemyHpMax} (${battle.enemyType})</div>
            <div class="meter"><span class="meter-fill hp-enemy" style="width:${enemyHpPct}%"></span></div>
            <div class="bar-label">Cards ${battle.playerCards} vs ${battle.enemyCards}</div>
            <div class="meter split">
              <span class="meter-fill cards-player" style="width:${playerCardsPct}%"></span>
              <span class="meter-fill cards-enemy" style="width:${enemyCardsPct}%"></span>
            </div>
          </div>
          <div class="row"><span>Round ${battle.round}</span></div>
          ` : ""}
          ${Array.isArray(snap.roundLog) && snap.roundLog.length ? `<div class="log animated-log">${snap.roundLog.map((line) => `<div>${line}</div>`).join("")}</div>` : ""}
        `;
      }
    }

    if (flags) {
      const featureFlags = snap.featureFlags || {};
      flags.innerHTML = `
        <span class="flag ${featureFlags.saveLoad ? "on" : "off"}">Save</span>
        <span class="flag ${featureFlags.visualFx ? "on" : "off"}">VFX</span>
        <span class="flag ${featureFlags.audio ? "on" : "off"}">Audio</span>
        <span class="flag ${featureFlags.ai ? "on" : "off"}">AI</span>
        <span class="flag ${featureFlags.events ? "on" : "off"}">Events</span>
        <span class="flag ${featureFlags.minigames ? "on" : "off"}">Minigames</span>
        <span class="flag ${featureFlags.worldSeededRng ? "on" : "off"}">World</span>
      `;
    }
  },
  update: () => {
    const snap = window.WarGameSnapshot || {};
    const status = document.getElementById("hud-status");
    const hud = document.getElementById("run-hud");
    const flags = document.getElementById("feature-flags");
    const playBtn = document.getElementById("btn-play-round");
    const autoBtn = document.getElementById("btn-auto-play");
    const volume = document.getElementById("hud-volume");
    if (playBtn) playBtn.disabled = snap.state !== "RUNNING";
    if (autoBtn) autoBtn.textContent = snap.autoPlay ? "Auto: ON" : "Auto: OFF";

    if (volume) volume.value = String(typeof snap.volume === "number" ? snap.volume : 0.45);

    if (status) {
      status.textContent = snap.status || "";
      status.className = `status status-${snap.statusLevel || "info"}`;
    }

    if (hud) {
      if (!snap.run) {
        hud.innerHTML = "<div>No active run.</div>";
      } else {
        const battle = snap.battle;
        const playerHpMax = battle?.maxPlayerHealth || snap.run.maxHealth;
        const enemyHpMax = battle?.maxEnemyHealth || battle?.enemyHealth || 1;
        const playerHpPct = battle ? Math.max(0, Math.min(100, (battle.playerHealth / Math.max(1, playerHpMax)) * 100)) : 0;
        const enemyHpPct = battle ? Math.max(0, Math.min(100, (battle.enemyHealth / Math.max(1, enemyHpMax)) * 100)) : 0;
        const totalCards = battle ? Math.max(1, battle.playerCards + battle.enemyCards) : 1;
        const playerCardsPct = battle ? Math.max(0, Math.min(100, (battle.playerCards / totalCards) * 100)) : 0;
        const enemyCardsPct = battle ? Math.max(0, Math.min(100, (battle.enemyCards / totalCards) * 100)) : 0;
        hud.innerHTML = `
          <div class="row"><span>Floor ${snap.run.floor}</span><span>Wins ${snap.run.wins}</span><span>Gold ${snap.run.gold}</span><span>${snap.run.challengeMode ? "Challenge" : "Standard"}</span></div>
          <div class="row"><span>Deck ${snap.run.deck.length}</span><span>Seed ${snap.run.seed}</span><span>${snap.autoPlay ? "Auto" : "Manual"}</span></div>
          ${battle ? `
          <div class="bar-group">
            <div class="bar-label">Player HP ${battle.playerHealth}/${playerHpMax}</div>
            <div class="meter"><span class="meter-fill hp-player" style="width:${playerHpPct}%"></span></div>
            <div class="bar-label">Enemy HP ${battle.enemyHealth}/${enemyHpMax} (${battle.enemyType})</div>
            <div class="meter"><span class="meter-fill hp-enemy" style="width:${enemyHpPct}%"></span></div>
            <div class="bar-label">Cards ${battle.playerCards} vs ${battle.enemyCards}</div>
            <div class="meter split">
              <span class="meter-fill cards-player" style="width:${playerCardsPct}%"></span>
              <span class="meter-fill cards-enemy" style="width:${enemyCardsPct}%"></span>
            </div>
          </div>
          <div class="row"><span>Round ${battle.round}</span></div>
          ` : ""}
          ${Array.isArray(snap.roundLog) && snap.roundLog.length ? `<div class="log animated-log">${snap.roundLog.map((line) => `<div>${line}</div>`).join("")}</div>` : ""}
        `;
      }
    }

    if (flags) {
      const featureFlags = snap.featureFlags || {};
      flags.innerHTML = `
        <span class="flag ${featureFlags.saveLoad ? "on" : "off"}">Save</span>
        <span class="flag ${featureFlags.visualFx ? "on" : "off"}">VFX</span>
        <span class="flag ${featureFlags.audio ? "on" : "off"}">Audio</span>
        <span class="flag ${featureFlags.ai ? "on" : "off"}">AI</span>
        <span class="flag ${featureFlags.events ? "on" : "off"}">Events</span>
        <span class="flag ${featureFlags.minigames ? "on" : "off"}">Minigames</span>
        <span class="flag ${featureFlags.worldSeededRng ? "on" : "off"}">World</span>
      `;
    }
  },
  hide: () => {
    const w = document.getElementById("hud");
    if (w) {
      w.style.opacity = "0";
      uiManager.scheduleFadeHide("hud", 180);
    }
  },
});

uiManager.registerScreen("shopMenu", {
  validStates: ["SHOP"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "shopMenu";
    wrapper.className = "screen screen-shop";

    const card = document.createElement("div");
    card.className = "ui-card";

    const title = document.createElement("h1");
    title.textContent = "Shop And Route";

    const gold = document.createElement("p");
    gold.id = "shop-gold";
    gold.textContent = "Gold: 0";

    const routeRow = document.createElement("div");
    routeRow.className = "route-row";

    const routeBattle = document.createElement("button");
    routeBattle.id = "route-battle";
    routeBattle.textContent = "Direct Battle";
    routeBattle.addEventListener("click", () => window.WarGameAPI?.selectRoute("battle"));

    const routeEvent = document.createElement("button");
    routeEvent.id = "route-event";
    routeEvent.textContent = "Random Event";
    routeEvent.addEventListener("click", () => window.WarGameAPI?.selectRoute("event"));

    const routeMini = document.createElement("button");
    routeMini.id = "route-minigame";
    routeMini.textContent = "Minigame Route";
    routeMini.addEventListener("click", () => window.WarGameAPI?.selectRoute("minigame"));

    routeRow.appendChild(routeBattle);
    routeRow.appendChild(routeEvent);
    routeRow.appendChild(routeMini);

    const items = document.createElement("div");
    items.id = "shop-items";
    items.className = "shop-items";

    const nextBtn = document.createElement("button");
    nextBtn.className = "menu-btn";
    nextBtn.textContent = "Continue";
    nextBtn.addEventListener("click", () => window.WarGameAPI?.continueRoute());

    card.appendChild(title);
    card.appendChild(gold);
    card.appendChild(routeRow);
    card.appendChild(items);
    card.appendChild(nextBtn);
    wrapper.appendChild(card);

    wrapper.show = () => {
      wrapper.style.display = "block";
      wrapper.style.opacity = "1";
      wrapper.style.transform = "translate(-50%, -50%) scale(1)";
    };
    wrapper.hide = () => {
      wrapper.style.display = "none";
    };

    wrapper.hide();
    document.body.appendChild(wrapper);
    return wrapper;
  },
  show: () => {
    const snap = window.WarGameSnapshot || {};
    const gold = document.getElementById("shop-gold");
    const list = document.getElementById("shop-items");
    if (gold) gold.textContent = snap.run ? `Gold: ${snap.run.gold}` : "Gold: 0";

    const rb = document.getElementById("route-battle");
    const re = document.getElementById("route-event");
    const rm = document.getElementById("route-minigame");
    if (rb) rb.classList.toggle("active", snap.route === "battle");
    if (re) re.classList.toggle("active", snap.route === "event");
    if (rm) rm.classList.toggle("active", snap.route === "minigame");

    if (!list) return;
    const offers = Array.isArray(snap.shopOffers) ? snap.shopOffers : [];
    const sig = `${snap.run ? snap.run.gold : 0}|${offers.map((offer) => `${offer.shopId}:${offer.bought ? 1 : 0}`).join(",")}`;
    if (list.dataset.sig === sig) return;
    list.dataset.sig = sig;

    list.innerHTML = "";
    for (const offer of offers) {
      const item = document.createElement("article");
      item.className = "shop-item";

      const name = document.createElement("h3");
      name.textContent = offer.name;

      const desc = document.createElement("p");
      desc.textContent = offer.desc;

      const cost = document.createElement("div");
      cost.textContent = `Cost: ${offer.cost}`;

      const buyBtn = document.createElement("button");
      buyBtn.textContent = offer.bought ? "Purchased" : "Buy";
      const cannotAfford = snap.run && snap.run.gold < offer.cost;
      buyBtn.disabled = !!offer.bought || !!cannotAfford;
      buyBtn.addEventListener("click", () => window.WarGameAPI?.buyItem(offer.shopId));

      item.appendChild(name);
      item.appendChild(desc);
      item.appendChild(cost);
      item.appendChild(buyBtn);
      list.appendChild(item);
    }
  },
  update: () => {
    const snap = window.WarGameSnapshot || {};
    const rb = document.getElementById("route-battle");
    const re = document.getElementById("route-event");
    const rm = document.getElementById("route-minigame");
    if (rb) rb.classList.toggle("active", snap.route === "battle");
    if (re) re.classList.toggle("active", snap.route === "event");
    if (rm) rm.classList.toggle("active", snap.route === "minigame");
  },
  hide: () => {
    const w = document.getElementById("shopMenu");
    if (w) {
      w.style.opacity = "0";
      w.style.transform = "translate(-50%, -48%) scale(0.98)";
      uiManager.scheduleFadeHide("shopMenu", 220);
    }
  },
});

uiManager.registerScreen("tourMenu", {
  validStates: ["TOUR"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "tourMenu";
    wrapper.className = "screen";

    const card = document.createElement("div");
    card.className = "ui-card";

    const title = document.createElement("h1");
    title.id = "tour-title";
    title.textContent = "Feature Tour";

    const body = document.createElement("p");
    body.id = "tour-body";
    body.textContent = "";

    const meta = document.createElement("p");
    meta.id = "tour-meta";
    meta.textContent = "";

    const nextBtn = document.createElement("button");
    nextBtn.className = "menu-btn";
    nextBtn.textContent = "Next";
    nextBtn.addEventListener("click", () => window.WarGameAPI?.nextTour());

    const endBtn = document.createElement("button");
    endBtn.className = "menu-btn";
    endBtn.textContent = "Exit Tour";
    endBtn.addEventListener("click", () => window.WarGameAPI?.endTour());

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(meta);
    card.appendChild(nextBtn);
    card.appendChild(endBtn);
    wrapper.appendChild(card);

    wrapper.show = () => {
      wrapper.style.display = "block";
      wrapper.style.opacity = "1";
    };
    wrapper.hide = () => {
      wrapper.style.display = "none";
    };

    wrapper.hide();
    document.body.appendChild(wrapper);
    return wrapper;
  },
  show: () => {
    const snap = window.WarGameSnapshot || {};
    const title = document.getElementById("tour-title");
    const body = document.getElementById("tour-body");
    const meta = document.getElementById("tour-meta");

    if (title) title.textContent = snap.tour?.current?.title || "Feature Tour";
    if (body) body.textContent = snap.tour?.current?.body || "";
    if (meta) meta.textContent = `Step ${(snap.tour?.step || 0) + 1} / ${snap.tour?.count || 1}`;
  },
  update: () => {
    const snap = window.WarGameSnapshot || {};
    const title = document.getElementById("tour-title");
    const body = document.getElementById("tour-body");
    const meta = document.getElementById("tour-meta");

    if (title) title.textContent = snap.tour?.current?.title || "Feature Tour";
    if (body) body.textContent = snap.tour?.current?.body || "";
    if (meta) meta.textContent = `Step ${(snap.tour?.step || 0) + 1} / ${snap.tour?.count || 1}`;
  },
  hide: () => {
    const w = document.getElementById("tourMenu");
    if (w) {
      w.style.opacity = "0";
      uiManager.scheduleFadeHide("tourMenu", 180);
    }
  },
});

uiManager.registerScreen("pauseMenu", {
  validStates: ["PAUSED"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "pauseMenu";
    wrapper.className = "screen";

    const card = document.createElement("div");
    card.className = "ui-card";

    const title = document.createElement("h1");
    title.textContent = "Paused";

    const resumeBtn = document.createElement("button");
    resumeBtn.className = "menu-btn";
    resumeBtn.textContent = "Resume";
    resumeBtn.addEventListener("click", () => window.WarGameAPI?.resume());

    card.appendChild(title);
    card.appendChild(resumeBtn);
    wrapper.appendChild(card);

    wrapper.show = () => {
      wrapper.style.display = "block";
      wrapper.style.opacity = "1";
    };
    wrapper.hide = () => {
      wrapper.style.display = "none";
    };

    wrapper.hide();
    document.body.appendChild(wrapper);
    return wrapper;
  },
  hide: () => {
    const w = document.getElementById("pauseMenu");
    if (w) {
      w.style.opacity = "0";
      uiManager.scheduleFadeHide("pauseMenu", 180);
    }
  },
});

uiManager.registerScreen("gameOverMenu", {
  validStates: ["GAMEOVER"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "gameOverMenu";
    wrapper.className = "screen";

    const card = document.createElement("div");
    card.className = "ui-card";

    const title = document.createElement("h1");
    title.textContent = "Run Over";

    const subtitle = document.createElement("p");
    subtitle.id = "gameover-subtitle";
    subtitle.textContent = "Start a new run, load save, or return to ready.";

    const newRunBtn = document.createElement("button");
    newRunBtn.className = "menu-btn";
    newRunBtn.textContent = "Start Standard Run";
    newRunBtn.addEventListener("click", () => window.WarGameAPI?.startNewRun());

    const challengeBtn = document.createElement("button");
    challengeBtn.className = "menu-btn";
    challengeBtn.textContent = "Start Challenge Run";
    challengeBtn.addEventListener("click", () => window.WarGameAPI?.startChallengeRun());

    const loadBtn = document.createElement("button");
    loadBtn.className = "menu-btn";
    loadBtn.textContent = "Load Save";
    loadBtn.addEventListener("click", () => window.WarGameAPI?.loadRun());

    const readyBtn = document.createElement("button");
    readyBtn.className = "menu-btn";
    readyBtn.textContent = "Back To Ready";
    readyBtn.addEventListener("click", () => window.WarGameAPI?.resetReady());

    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(newRunBtn);
    card.appendChild(challengeBtn);
    card.appendChild(loadBtn);
    card.appendChild(readyBtn);
    wrapper.appendChild(card);

    wrapper.show = () => {
      wrapper.style.display = "block";
      wrapper.style.opacity = "1";
    };
    wrapper.hide = () => {
      wrapper.style.display = "none";
    };

    wrapper.hide();
    document.body.appendChild(wrapper);
    return wrapper;
  },
  show: () => {
    const snap = window.WarGameSnapshot || {};
    const subtitle = document.getElementById("gameover-subtitle");
    if (!subtitle || !snap.run) return;
    subtitle.textContent = `Floors ${Math.max(0, snap.run.floor - 1)} | Wins ${snap.run.wins} | Gold ${snap.run.gold}`;
  },
  hide: () => {
    const w = document.getElementById("gameOverMenu");
    if (w) {
      w.style.opacity = "0";
      uiManager.scheduleFadeHide("gameOverMenu", 180);
    }
  },
});
