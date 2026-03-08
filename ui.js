document.addEventListener("DOMContentLoaded", () => {
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

  app.onStateChange = updateState;
  updateState();
});
