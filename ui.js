document.addEventListener("DOMContentLoaded", () => {
  if (typeof window.UIManager !== "function") return;

  const AppStates = {
    READY: "READY",
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

  let currentState = AppStates.READY;
  let currentTime = 0;

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
      <div class="ui-card">
        <h1>Koz Boilerplate</h1>
        <p>Minimal starter template. Wire your game logic in <code>game.js</code>.</p>
        <div class="row">
          <button id="startBtn">Start</button>
          <button id="resetBtn">Reset</button>
        </div>
        <p class="hint">Space = start, P = pause/resume, R = reset, Esc = ready</p>
      </div>
    </section>

    <section class="app-panel app-panel-hud" data-ui="hud">
      <div class="ui-card">
        <div class="status" id="hudStatus">State: READY</div>
        <div class="status" id="hudTime">Time: 0.0s</div>
        <div class="row">
          <button id="pauseBtn">Pause / Resume</button>
          <button id="hudResetBtn">Reset</button>
          <button id="readyBtn">Ready</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(shell);

  const menuPanel = bindScreenVisibility(shell.querySelector('[data-ui="menu"]'));
  const hudPanel = bindScreenVisibility(shell.querySelector('[data-ui="hud"]'));

  const hudStatus = shell.querySelector("#hudStatus");
  const hudTime = shell.querySelector("#hudTime");

  shell.querySelector("#startBtn").addEventListener("click", () => sendCommand(AppCommandTypes.START));
  shell.querySelector("#resetBtn").addEventListener("click", () => sendCommand(AppCommandTypes.RESET));
  shell.querySelector("#pauseBtn").addEventListener("click", () => sendCommand(AppCommandTypes.TOGGLE_PAUSE));
  shell.querySelector("#hudResetBtn").addEventListener("click", () => sendCommand(AppCommandTypes.RESET));
  shell.querySelector("#readyBtn").addEventListener("click", () => {
    sendCommand(AppCommandTypes.SET_STATE, { state: AppStates.READY });
  });

  function alignToCanvas() {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    shell.style.left = `${Math.round(rect.left)}px`;
    shell.style.top = `${Math.round(rect.top)}px`;
    shell.style.width = `${Math.round(rect.width)}px`;
    shell.style.height = `${Math.round(rect.height)}px`;
  }

  function refreshUiText() {
    hudStatus.textContent = `State: ${currentState}`;
    hudTime.textContent = `Time: ${currentTime.toFixed(1)}s`;
  }

  const uiManager = new window.UIManager();
  uiManager.registerScreen("menuPanel", {
    create: () => menuPanel,
    validStates: [AppStates.READY],
  });
  uiManager.registerScreen("hudPanel", {
    create: () => hudPanel,
    validStates: [AppStates.RUNNING, AppStates.PAUSED],
  });

  window.addEventListener(AppEvents.UI_SYNC, (event) => {
    const detail = event && event.detail ? event.detail : null;
    if (!detail) return;

    if (detail.state) currentState = detail.state;
    if (detail.appTime !== undefined) currentTime = Number(detail.appTime) || 0;

    refreshUiText();
    uiManager.onGameStateChange(currentState);
  });

  const timerId = setInterval(alignToCanvas, 120);
  window.addEventListener("beforeunload", () => clearInterval(timerId));
  window.addEventListener("resize", alignToCanvas);

  alignToCanvas();
  refreshUiText();
  uiManager.onGameStateChange(currentState);
  sendCommand(AppCommandTypes.SYNC);
});
