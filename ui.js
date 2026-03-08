uiManager.registerScreen("readyMenu", {
  validStates: ["READY"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "readyMenu";
    wrapper.className = "screen";

    const title = document.createElement("h2");
    title.textContent = "PONG Gaming !";
    wrapper.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.textContent = "First to 12 points.";
    wrapper.appendChild(subtitle);

    const startBtn = document.createElement("button");
    startBtn.className = "menu-btn";
    startBtn.textContent = "Start Match";
    startBtn.addEventListener("click", () => gameStateManager.setState("RUNNING"));
    wrapper.appendChild(startBtn);

    wrapper.show = () => { wrapper.style.display = "block"; };
    wrapper.hide = () => { wrapper.style.display = "none"; };
    wrapper.hide();
    document.body.appendChild(wrapper);

    return wrapper;
  },
  show: () => {
    const w = document.getElementById("readyMenu");
    if (w) {
      w.show();
      w.style.opacity = "1";
    }
  },
  hide: () => {
    const w = document.getElementById("readyMenu");
    if (w) {
      w.style.opacity = "0";
      uiManager.scheduleFadeHide("readyMenu", 180);
    }
  },
});

uiManager.registerScreen("pauseMenu", {
  validStates: ["PAUSED"],
  create: () => {
    const wrapper = document.createElement("section");
    wrapper.id = "pauseMenu";
    wrapper.className = "screen";

    const title = document.createElement("h2");
    title.textContent = "Game Paused";
    wrapper.appendChild(title);

    const resumeBtn = document.createElement("button");
    resumeBtn.className = "menu-btn";
    resumeBtn.textContent = "Resume";
    resumeBtn.addEventListener("click", () => gameStateManager.setState("RUNNING"));
    wrapper.appendChild(resumeBtn);

    const restartBtn = document.createElement("button");
    restartBtn.className = "menu-btn";
    restartBtn.textContent = "Restart Match";
    restartBtn.addEventListener("click", () => gameStateManager.setState("READY"));
    wrapper.appendChild(restartBtn);

    wrapper.show = () => { wrapper.style.display = "block"; };
    wrapper.hide = () => { wrapper.style.display = "none"; };
    wrapper.hide();
    document.body.appendChild(wrapper);

    return wrapper;
  },
  show: () => {
    const w = document.getElementById("pauseMenu");
    if (w) {
      w.show();
      w.style.opacity = "1";
    }
  },
  hide: () => {
    const w = document.getElementById("pauseMenu");
    if (w) {
      w.style.opacity = "0";
      uiManager.scheduleFadeHide("pauseMenu", 180);
    }
  },
});
