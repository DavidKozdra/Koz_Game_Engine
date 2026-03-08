document.addEventListener("DOMContentLoaded", () => {
  if (typeof window.UIManager !== "function") return;

  function withState(handler) {
    const manager = window.KozStateManager;
    if (!manager) return;
    handler(manager);
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

  shell.querySelector("#startBtn").addEventListener("click", () => {
    withState((manager) => manager.setState("RUNNING"));
  });
  shell.querySelector("#resetBtn").addEventListener("click", () => {
    withState((manager) => manager.setState("READY"));
  });
  shell.querySelector("#pauseBtn").addEventListener("click", () => {
    withState((manager) => {
      if (manager.is("RUNNING")) manager.setState("PAUSED");
      else if (manager.is("PAUSED")) manager.setState("RUNNING");
    });
  });
  shell.querySelector("#hudResetBtn").addEventListener("click", () => {
    withState((manager) => manager.setState("READY"));
  });
  shell.querySelector("#readyBtn").addEventListener("click", () => {
    withState((manager) => manager.setState("READY"));
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
    const manager = window.KozStateManager;
    const state = manager ? manager.getState() || "READY" : "READY";
    hudStatus.textContent = `State: ${state}`;
  }

  const uiManager = new window.UIManager();
  uiManager.registerScreen("menuPanel", {
    create: () => menuPanel,
    validStates: ["READY"],
  });
  uiManager.registerScreen("hudPanel", {
    create: () => hudPanel,
    validStates: ["RUNNING", "PAUSED"],
  });

  window.addEventListener("koz:state-change", (event) => {
    const detail = event && event.detail ? event.detail : null;
    if (!detail) return;

    refreshUiText();
    uiManager.onGameStateChange(detail.state || "READY");
  });

  const timerId = setInterval(alignToCanvas, 120);
  window.addEventListener("beforeunload", () => clearInterval(timerId));
  window.addEventListener("resize", alignToCanvas);

  alignToCanvas();
  refreshUiText();
  const manager = window.KozStateManager;
  uiManager.onGameStateChange(manager ? manager.getState() || "READY" : "READY");
});
