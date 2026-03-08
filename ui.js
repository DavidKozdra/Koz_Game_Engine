uiManager.registerScreen("readyMenu", {
  validStates: ["READY"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "readyMenu";
    wrapper.className = "screen";

    const card = document.createElement("div");
    card.className = "ui-card";

    const title = document.createElement("h1");
    title.textContent = "War Roguelike";

    const subtitle = document.createElement("p");
    subtitle.id = "ready-subtitle";
    subtitle.textContent = "Start a new run or load your save.";

    const startBtn = document.createElement("button");
    startBtn.className = "menu-btn";
    startBtn.textContent = "Start New Run";
    startBtn.addEventListener("click", () => window.WarGameAPI?.startNewRun());

    const loadBtn = document.createElement("button");
    loadBtn.id = "btn-load-run";
    loadBtn.className = "menu-btn";
    loadBtn.textContent = "Load Run";
    loadBtn.addEventListener("click", () => window.WarGameAPI?.loadRun());

    const clearBtn = document.createElement("button");
    clearBtn.className = "menu-btn";
    clearBtn.textContent = "Clear Save";
    clearBtn.addEventListener("click", () => window.WarGameAPI?.clearSave());

    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(startBtn);
    card.appendChild(loadBtn);
    card.appendChild(clearBtn);
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
    const subtitle = document.getElementById("ready-subtitle");
    const loadBtn = document.getElementById("btn-load-run");
    if (subtitle) subtitle.textContent = snap.status || "Start a new run or load your save.";
    if (loadBtn) loadBtn.disabled = !snap.hasSave;
  },
  update: () => {
    const snap = window.WarGameSnapshot || {};
    const subtitle = document.getElementById("ready-subtitle");
    const loadBtn = document.getElementById("btn-load-run");
    if (subtitle) subtitle.textContent = snap.status || "Start a new run or load your save.";
    if (loadBtn) loadBtn.disabled = !snap.hasSave;
  },
  hide: () => {
    const w = document.getElementById("readyMenu");
    if (w) {
      w.style.opacity = "0";
      uiManager.scheduleFadeHide("readyMenu", 180);
    }
  },
});

uiManager.registerScreen("hud", {
  validStates: ["RUNNING", "SHOP", "PAUSED", "GAMEOVER"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "hud";
    wrapper.className = "screen screen-hud";

    const card = document.createElement("div");
    card.className = "ui-card";

    const content = document.createElement("div");
    content.id = "run-hud";

    const actions = document.createElement("div");
    actions.className = "row";

    const playBtn = document.createElement("button");
    playBtn.id = "btn-play-round";
    playBtn.textContent = "Play Round";
    playBtn.addEventListener("click", () => window.WarGameAPI?.playRound());

    const pauseBtn = document.createElement("button");
    pauseBtn.textContent = "Pause/Resume";
    pauseBtn.addEventListener("click", () => window.WarGameAPI?.pauseToggle());

    const readyBtn = document.createElement("button");
    readyBtn.textContent = "Back To Ready";
    readyBtn.addEventListener("click", () => window.WarGameAPI?.resetReady());

    actions.appendChild(playBtn);
    actions.appendChild(pauseBtn);
    actions.appendChild(readyBtn);

    card.appendChild(content);
    card.appendChild(actions);
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
    const hud = document.getElementById("run-hud");
    const playBtn = document.getElementById("btn-play-round");
    if (playBtn) playBtn.disabled = snap.state !== "RUNNING";
    if (!hud) return;

    if (!snap.run) {
      hud.innerHTML = "<div class='status'>No active run.</div>";
      return;
    }

    let html = `
      <div class="status">${snap.status || ""}</div>
      <div class="row"><span>Floor ${snap.run.floor}</span><span>Wins ${snap.run.wins}</span><span>Gold ${snap.run.gold}</span></div>
      <div class="row"><span>HP ${snap.run.health}/${snap.run.maxHealth}</span><span>Deck ${snap.run.deck.length}</span></div>
    `;

    if (snap.battle) {
      html += `
        <div class="row"><span>Round ${snap.battle.round}</span><span>Enemy HP ${snap.battle.enemyHealth}</span></div>
        <div class="row"><span>Your cards ${snap.battle.playerCards}</span><span>Enemy cards ${snap.battle.enemyCards}</span></div>
      `;
    }

    if (Array.isArray(snap.roundLog) && snap.roundLog.length) {
      html += `<div class="log">${snap.roundLog.map((line) => `<div>${line}</div>`).join("")}</div>`;
    }

    hud.innerHTML = html;
  },
  update: () => {
    const snap = window.WarGameSnapshot || {};
    const hud = document.getElementById("run-hud");
    const playBtn = document.getElementById("btn-play-round");
    if (playBtn) playBtn.disabled = snap.state !== "RUNNING";
    if (!hud) return;

    if (!snap.run) {
      hud.innerHTML = "<div class='status'>No active run.</div>";
      return;
    }

    let html = `
      <div class="status">${snap.status || ""}</div>
      <div class="row"><span>Floor ${snap.run.floor}</span><span>Wins ${snap.run.wins}</span><span>Gold ${snap.run.gold}</span></div>
      <div class="row"><span>HP ${snap.run.health}/${snap.run.maxHealth}</span><span>Deck ${snap.run.deck.length}</span></div>
    `;

    if (snap.battle) {
      html += `
        <div class="row"><span>Round ${snap.battle.round}</span><span>Enemy HP ${snap.battle.enemyHealth}</span></div>
        <div class="row"><span>Your cards ${snap.battle.playerCards}</span><span>Enemy cards ${snap.battle.enemyCards}</span></div>
      `;
    }

    if (Array.isArray(snap.roundLog) && snap.roundLog.length) {
      html += `<div class="log">${snap.roundLog.map((line) => `<div>${line}</div>`).join("")}</div>`;
    }

    hud.innerHTML = html;
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
    title.textContent = "Shop";

    const gold = document.createElement("p");
    gold.id = "shop-gold";
    gold.textContent = "Gold: 0";

    const items = document.createElement("div");
    items.id = "shop-items";
    items.className = "shop-items";

    const nextBtn = document.createElement("button");
    nextBtn.className = "menu-btn";
    nextBtn.textContent = "Continue To Next Battle";
    nextBtn.addEventListener("click", () => window.WarGameAPI?.nextBattle());

    card.appendChild(title);
    card.appendChild(gold);
    card.appendChild(items);
    card.appendChild(nextBtn);
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
    const gold = document.getElementById("shop-gold");
    const list = document.getElementById("shop-items");
    if (gold) gold.textContent = snap.run ? `Gold: ${snap.run.gold}` : "Gold: 0";
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
    const gold = document.getElementById("shop-gold");
    const list = document.getElementById("shop-items");
    if (gold) gold.textContent = snap.run ? `Gold: ${snap.run.gold}` : "Gold: 0";
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
  hide: () => {
    const w = document.getElementById("shopMenu");
    if (w) {
      w.style.opacity = "0";
      uiManager.scheduleFadeHide("shopMenu", 180);
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
    subtitle.textContent = "Start a new run, load save, or return to ready.";

    const newRunBtn = document.createElement("button");
    newRunBtn.className = "menu-btn";
    newRunBtn.textContent = "Start New Run";
    newRunBtn.addEventListener("click", () => window.WarGameAPI?.startNewRun());

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
  hide: () => {
    const w = document.getElementById("gameOverMenu");
    if (w) {
      w.style.opacity = "0";
      uiManager.scheduleFadeHide("gameOverMenu", 180);
    }
  },
});
