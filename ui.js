document.addEventListener("DOMContentLoaded", () => {
  if (typeof window.UIManager !== "function") return;

  const AppStates = {
    MAIN_MENU: "MAIN_MENU",
    GAMEPLAY: "GAMEPLAY",
    PAUSED: "PAUSED",
  };
  const AppCommandTypes = {
    SET_STATE: "SET_STATE",
    START_MATCH: "START_MATCH",
    RESET_MATCH: "RESET_MATCH",
    TOGGLE_PAUSE: "TOGGLE_PAUSE",
    SYNC: "SYNC",
  };
  const AppEvents = {
    COMMAND: "koz:command",
    UI_SYNC: "koz:ui-sync",
  };
  let currentState = AppStates.MAIN_MENU;
  let currentWinnerLabel = "";
  let currentScores = { left: 0, right: 0 };

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
  shell.className = "pong-ui";
  shell.innerHTML = `
    <section class="pong-panel pong-panel-menu" data-ui="menu">
      <div class="ui-card ui-card-menu">
        <h1>PONG</h1>
        <p>First to 7 points wins</p>
        <div class="row menu-row">
          <button id="startMatchBtn">Start Match</button>
          <button id="menuResetBtn">Reset Match</button>
        </div>
        <p class="hint">W/S or Arrows move. P pauses. Esc menu. Space starts.</p>
        <div class="state-line" id="menuStatusLine"></div>
      </div>
    </section>

    <section class="pong-panel pong-panel-hud" data-ui="hud">
      <div class="ui-card ui-card-hud">
        <div class="ui-scoreboard">
          <div class="score-side">
            <span class="score-label">Player</span>
            <span class="score-value" id="scoreLeft">0</span>
          </div>
          <div class="score-divider">:</div>
          <div class="score-side">
            <span class="score-label">CPU</span>
            <span class="score-value" id="scoreRight">0</span>
          </div>
        </div>
        <div class="row">
          <button id="pauseResumeBtn">Pause/Resume</button>
          <button id="hudResetBtn">Reset</button>
          <button id="hudMenuBtn">Menu</button>
        </div>
      </div>
    </section>

    <section class="pong-panel pong-panel-pause" data-ui="pause">
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

  const menuStatusLine = shell.querySelector("#menuStatusLine");
  const scoreLeft = shell.querySelector("#scoreLeft");
  const scoreRight = shell.querySelector("#scoreRight");

  shell.querySelector("#startMatchBtn").addEventListener("click", () => sendCommand(AppCommandTypes.START_MATCH));
  shell.querySelector("#menuResetBtn").addEventListener("click", () => sendCommand(AppCommandTypes.RESET_MATCH));
  shell.querySelector("#pauseResumeBtn").addEventListener("click", () => sendCommand(AppCommandTypes.TOGGLE_PAUSE));
  shell.querySelector("#hudResetBtn").addEventListener("click", () => sendCommand(AppCommandTypes.RESET_MATCH));
  shell.querySelector("#hudMenuBtn").addEventListener("click", () => {
    sendCommand(AppCommandTypes.SET_STATE, { state: AppStates.MAIN_MENU });
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
    const winner = currentWinnerLabel;
    menuStatusLine.textContent = winner ? `${winner}. Start a new match.` : "Ready.";
    const s = currentScores;
    scoreLeft.textContent = String(s.left);
    scoreRight.textContent = String(s.right);
  }

  const uiManager = new window.UIManager();
  uiManager.registerScreen("mainMenuPanel", {
    create: () => menuPanel,
    validStates: [AppStates.MAIN_MENU],
  });
  uiManager.registerScreen("hudPanel", {
    create: () => hudPanel,
    validStates: [AppStates.GAMEPLAY, AppStates.PAUSED],
  });
  uiManager.registerScreen("pausePanel", {
    create: () => pausePanel,
    validStates: [AppStates.PAUSED],
  });

  window.addEventListener(AppEvents.UI_SYNC, (event) => {
    const detail = event && event.detail ? event.detail : null;
    if (!detail) return;
    if (detail.state) currentState = detail.state;
    if (detail.winnerLabel !== undefined) currentWinnerLabel = detail.winnerLabel;
    if (detail.scores) {
      currentScores = {
        left: Number(detail.scores.left) || 0,
        right: Number(detail.scores.right) || 0,
      };
    }
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
});
