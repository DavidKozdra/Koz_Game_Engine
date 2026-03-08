document.addEventListener("DOMContentLoaded", () => {
<<<<<<< Updated upstream
  const shell = document.createElement("div");
  shell.className = "boilerplate-ui";
  shell.innerHTML = `
    <div class="ui-card">
      <h1>Koz Boilerplate</h1>
      <p>Minimal scaffold using Koz Engine state + world systems.</p>
      <div class="row">
        <button data-state="MAIN_MENU">Menu</button>
        <button data-state="GAMEPLAY">Gameplay</button>
        <button data-state="LEVEL_EDITOR">Editor</button>
        <button id="togglePauseBtn">Pause/Resume</button>
      </div>
      <div class="row">
        <button id="brushSolidBtn">Brush: Solid</button>
        <button id="brushEmptyBtn">Brush: Empty</button>
        <button id="resetWorldBtn">Reset Grid</button>
      </div>
      <p class="hint">Hotkeys: 1 menu, 2 gameplay, 3 editor, P pause, Esc menu.</p>
      <div class="state-line">Current state: <span id="currentStateText"></span></div>
    </div>
  `;
  document.body.appendChild(shell);

  shell.querySelectorAll("[data-state]").forEach((button) => {
    button.addEventListener("click", () => {
      const state = button.getAttribute("data-state");
      app.setState(app.AppStates[state]);
    });
=======
  if (typeof window.UIManager !== "function") return;

  const AppStates = {
    MAIN_MENU: "MAIN_MENU",
    RUNNING: "RUNNING",
    PAUSED: "PAUSED",
  };
  const AppCommandTypes = {
    SET_STATE: "SET_STATE",
    START: "START",
    RESET: "RESET",
    TOGGLE_PAUSE: "TOGGLE_PAUSE",
    SYNC: "SYNC",
  };
  const AppEvents = {
    COMMAND: "koz:command",
    UI_SYNC: "koz:ui-sync",
  };

  let currentState = AppStates.MAIN_MENU;
  let currentStatus = "Ready.";
  let isTouchingTarget = false;

  function sendCommand(type, extra = {}) {
    window.dispatchEvent(
      new CustomEvent(AppEvents.COMMAND, {
        detail: { type, ...extra },
      })
    );
  }

  function bindScreenVisibility(node) {
    node.show = () => {
      node.style.display = "";
    };
    node.hide = () => {
      node.style.display = "none";
    };
    node.hide();
    return node;
  }

  const shell = document.createElement("div");
  shell.className = "app-ui";
  shell.innerHTML = `
    <section class="app-panel app-panel-menu" data-ui="menu">
      <div class="ui-card ui-card-menu">
        <h1>Boilerplate</h1>
        <p>Minimal state + input + collision scaffold.</p>
        <div class="row">
          <button id="startBtn">Start</button>
          <button id="resetBtn">Reset</button>
        </div>
        <p class="hint">WASD/Arrows move. P pauses. Esc menu. Space starts.</p>
        <div class="state-line" id="statusLine">Ready.</div>
      </div>
    </section>

    <section class="app-panel app-panel-hud" data-ui="hud">
      <div class="ui-card ui-card-hud">
        <div class="hud-line">
          <span class="hud-label">State</span>
          <span class="hud-value" id="hudState">MAIN_MENU</span>
        </div>
        <div class="hud-line">
          <span class="hud-label">Status</span>
          <span class="hud-value" id="hudStatus">Ready.</span>
        </div>
        <div class="hud-line">
          <span class="hud-label">Touching Target</span>
          <span class="hud-value" id="hudTouching">No</span>
        </div>
        <div class="row">
          <button id="pauseResumeBtn">Pause/Resume</button>
          <button id="hudResetBtn">Reset</button>
          <button id="menuBtn">Menu</button>
        </div>
      </div>
    </section>

    <section class="app-panel app-panel-pause" data-ui="pause">
      <div class="ui-card ui-card-pause">
        <h2>Paused</h2>
        <p>Press P to resume</p>
      </div>
    </section>
  `;
  document.body.appendChild(shell);

  const menuPanel = bindScreenVisibility(shell.querySelector('[data-ui="menu"]'));
  const hudPanel = bindScreenVisibility(shell.querySelector('[data-ui="hud"]'));
  const pausePanel = bindScreenVisibility(shell.querySelector('[data-ui="pause"]'));

  const statusLine = shell.querySelector("#statusLine");
  const hudState = shell.querySelector("#hudState");
  const hudStatus = shell.querySelector("#hudStatus");
  const hudTouching = shell.querySelector("#hudTouching");

  shell.querySelector("#startBtn").addEventListener("click", () => sendCommand(AppCommandTypes.START));
  shell.querySelector("#resetBtn").addEventListener("click", () => sendCommand(AppCommandTypes.RESET));
  shell.querySelector("#pauseResumeBtn").addEventListener("click", () => sendCommand(AppCommandTypes.TOGGLE_PAUSE));
  shell.querySelector("#hudResetBtn").addEventListener("click", () => sendCommand(AppCommandTypes.RESET));
  shell.querySelector("#menuBtn").addEventListener("click", () => {
    sendCommand(AppCommandTypes.SET_STATE, { state: AppStates.MAIN_MENU });
>>>>>>> Stashed changes
  });
  shell.querySelector("#togglePauseBtn").addEventListener("click", () => app.togglePause());
  shell.querySelector("#brushSolidBtn").addEventListener("click", () => app.setBrushSolid());
  shell.querySelector("#brushEmptyBtn").addEventListener("click", () => app.setBrushEmpty());
  shell.querySelector("#resetWorldBtn").addEventListener("click", () => app.resetWorld());

  const stateText = shell.querySelector("#currentStateText");
  function updateState() {
    const readyLabel = app.isReady() ? app.getCurrentState() : "UNINITIALIZED";
    stateText.textContent = readyLabel;
  }

<<<<<<< Updated upstream
  app.onStateChange = updateState;
  updateState();
=======
  function refreshUiText() {
    statusLine.textContent = currentStatus || "Ready.";
    hudState.textContent = currentState;
    hudStatus.textContent = currentStatus || "Ready.";
    hudTouching.textContent = isTouchingTarget ? "Yes" : "No";
  }

  const uiManager = new window.UIManager();
  uiManager.registerScreen("mainMenuPanel", {
    create: () => menuPanel,
    validStates: [AppStates.MAIN_MENU],
  });
  uiManager.registerScreen("hudPanel", {
    create: () => hudPanel,
    validStates: [AppStates.RUNNING, AppStates.PAUSED],
  });
  uiManager.registerScreen("pausePanel", {
    create: () => pausePanel,
    validStates: [AppStates.PAUSED],
  });

  window.addEventListener(AppEvents.UI_SYNC, (event) => {
    const detail = event && event.detail ? event.detail : null;
    if (!detail) return;
    if (detail.state) currentState = detail.state;
    if (typeof detail.statusText === "string") currentStatus = detail.statusText;
    if (detail.flags) isTouchingTarget = Boolean(detail.flags.isTouchingTarget);
    refreshUiText();
    uiManager.onGameStateChange(currentState);
  });

  const timerId = setInterval(() => {
    alignToCanvas();
  }, 120);

  window.addEventListener("beforeunload", () => clearInterval(timerId));
  window.addEventListener("resize", alignToCanvas);

  alignToCanvas();
  refreshUiText();
  uiManager.onGameStateChange(currentState);
  sendCommand(AppCommandTypes.SYNC);
>>>>>>> Stashed changes
});
