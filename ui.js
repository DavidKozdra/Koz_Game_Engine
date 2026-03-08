uiManager.registerScreen("readyMenu", {
  validStates: ["READY"],
  create: () => {
    const wrapper = createDiv().id("readyMenu").class("screen");
    createElement("h2", "PONG Gaming !").parent(wrapper);
    createElement("p", "First to 7 points.").parent(wrapper);

    createButton("Start Match")
      .parent(wrapper)
      .addClass("menu-btn")
      .mousePressed(() => gameStateManager.setState("RUNNING"));

    return wrapper;
  },
  show: () => {
    const w = select("#readyMenu");
    if (w) {
      w.show();
      w.style("opacity", "1");
    }
  },
  hide: () => {
    const w = select("#readyMenu");
    if (w) {
      w.style("opacity", "0");
      uiManager.scheduleFadeHide("readyMenu", 180);
    }
  },
});

uiManager.registerScreen("pauseMenu", {
  validStates: ["PAUSED"],
  create: () => {
    const wrapper = createDiv().id("pauseMenu").class("screen");
    createElement("h2", "Game Paused").parent(wrapper);

    createButton("Resume")
      .parent(wrapper)
      .addClass("menu-btn")
      .mousePressed(() => gameStateManager.setState("RUNNING"));

    createButton("Restart Match")
      .parent(wrapper)
      .addClass("menu-btn")
      .mousePressed(() => gameStateManager.setState("READY"));

    return wrapper;
  },
  show: () => {
    const w = select("#pauseMenu");
    if (w) {
      w.show();
      w.style("opacity", "1");
    }
  },
  hide: () => {
    const w = select("#pauseMenu");
    if (w) {
      w.style("opacity", "0");
      uiManager.scheduleFadeHide("pauseMenu", 180);
    }
  },
});
