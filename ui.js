document.addEventListener("DOMContentLoaded", () => {
  let levelButtons = [];
  const menuOverlay = createMenuOverlay();
  const editorOverlay = createEditorOverlay();
  const pauseOverlay = createPauseOverlay();

  function updateOverlays(state) {
    menuOverlay.classList.toggle("visible", state === PlatformerGame.GameStates.MAIN_MENU);
    editorOverlay.classList.toggle("visible", state === PlatformerGame.GameStates.LEVEL_EDITOR);
    pauseOverlay.classList.toggle("visible", state === PlatformerGame.GameStates.PAUSE);
  }

  function updateSummary() {
    const summary = PlatformerGame.getLevelSummary();
    const levelName = document.querySelector("#levelNameValue");
    const spawnLabel = document.querySelector("#levelSpawnValue");
    const progressLabel = document.querySelector("#levelProgressValue");
    const progress = PlatformerGame.getLevelProgress();
    if (levelName) levelName.textContent = summary?.name || "Custom";
    if (spawnLabel) {
      const spawn = summary?.spawn;
      spawnLabel.textContent = spawn ? `${spawn.x}, ${spawn.y}` : "unset";
    }
    if (progressLabel) {
      progressLabel.textContent = progress.total
        ? `Collect ${progress.total - progress.remaining}/${progress.total}`
        : "No collectables configured";
    }
    refreshExportField();
    refreshLevelButtons();
    updatePauseProgress();
  }

  function refreshLevelButtons() {
    const selected = PlatformerGame.getSelectedLevelIndex();
    levelButtons.forEach((button) => {
      const idx = Number(button.dataset.levelIndex);
      button.classList.toggle("active", idx === selected);
    });
  }

  function refreshExportField() {
    const exportField = document.querySelector("#exportPayload");
    if (exportField) {
      exportField.value = PlatformerGame.exportLevel();
    }
  }

  function copyLatestPayload() {
    refreshExportField();
    const payload = PlatformerGame.exportLevel();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload);
    }
    showToast("Level JSON copied", "success");
  }

  function updatePauseProgress() {
    const progressLabel = pauseOverlay.querySelector("#pauseProgressValue");
    if (!progressLabel) return;
    const progress = PlatformerGame.getLevelProgress();
    progressLabel.textContent = progress.total
      ? `Collected ${progress.total - progress.remaining}/${progress.total}`
      : "No objectives yet";
  }

  PlatformerGame.onStateChange = (state) => {
    updateOverlays(state);
    updateSummary();
  };

  updateOverlays(PlatformerGame.GameStates.MAIN_MENU);
  updateSummary();
  window.PlatformerUI = { notify: showToast };

  function createMenuOverlay() {
    const wrapper = document.createElement("div");
    wrapper.id = "platformerMenu";
    wrapper.className = "overlay menu-overlay visible";
    wrapper.innerHTML = `
      <div class="panel menu-panel">
        <h1>Harbor Sprint</h1>
        <p>Three default levels, collectibles, and a goal doorway. Use the editor to customize new runs.</p>
        <div class="level-select">
          <h3>Choose a level</h3>
          <div class="level-buttons" id="levelButtons"></div>
        </div>
        <div class="button-row">
          <button id="playLevelBtn">Play Level</button>
          <button id="openEditorBtn">Level Editor</button>
        </div>
        <div class="button-row">
          <button id="copyLevelBtn">Copy Level JSON</button>
          <button id="resetLevelBtn">Reset to Template</button>
        </div>
        <div class="level-summary">
          <div>Name: <span id="levelNameValue"></span></div>
          <div>Spawn: <span id="levelSpawnValue"></span></div>
          <div class="level-progress"><span id="levelProgressValue"></span></div>
        </div>
        <textarea id="exportPayload" placeholder="Level JSON appears here"></textarea>
        <div class="import-row">
          <textarea id="importPayload" placeholder="Paste level JSON to import"></textarea>
          <button id="importPayloadBtn">Import</button>
        </div>
        <p class="mini-note">Collect every item, reach the goal pad, then continue to the next level. Escape toggles pause.</p>
      </div>
    `;

    document.body.appendChild(wrapper);
    const levelButtonsContainer = wrapper.querySelector("#levelButtons");
    levelButtons = PlatformerGame.getLevels().map((level) => {
      const button = document.createElement("button");
      button.textContent = `${level.index + 1}. ${level.name}`;
      button.dataset.levelIndex = level.index;
      button.addEventListener("click", () => {
        PlatformerGame.selectLevel(level.index);
        updateSummary();
      });
      levelButtonsContainer?.appendChild(button);
      return button;
    });

    wrapper.querySelector("#playLevelBtn")?.addEventListener("click", () => {
      PlatformerGame.startPlay();
    });
    wrapper.querySelector("#openEditorBtn")?.addEventListener("click", () => {
      PlatformerGame.openEditor();
    });
    wrapper.querySelector("#copyLevelBtn")?.addEventListener("click", () => {
      copyLatestPayload();
    });
    wrapper.querySelector("#resetLevelBtn")?.addEventListener("click", () => {
      PlatformerGame.resetLevel();
      updateSummary();
      copyLatestPayload();
    });
    wrapper.querySelector("#importPayloadBtn")?.addEventListener("click", () => {
      const textarea = wrapper.querySelector("#importPayload");
      if (!textarea) return;
      const result = PlatformerGame.importLevel(textarea.value);
      if (result.ok) {
        updateSummary();
        copyLatestPayload();
        showToast("Level imported", "success");
      } else {
        showToast(`Import failed: ${result.reason}`, "error");
      }
    });

    return wrapper;
  }

  function createEditorOverlay() {
    const wrapper = document.createElement("div");
    wrapper.id = "editorPanel";
    wrapper.className = "overlay editor-overlay";
    wrapper.innerHTML = `
      <div class="panel editor-panel">
        <h2>Level Editor</h2>
        <div class="button-row brush-row">
          <button data-brush="draw">Platform</button>
          <button data-brush="erase">Erase</button>
          <button data-brush="spawn">Set Spawn</button>
        </div>
        <div class="button-row">
          <button id="editorPlayBtn">Save & Play</button>
          <button id="editorMenuBtn">Back to Menu</button>
        </div>
        <p>Hold mouse and drag to paint tiles. Spawn mode places the player start when you click.</p>
        <p class="mini-note">Copy level JSON from the menu after editing to save your design.</p>
      </div>
    `;

    document.body.appendChild(wrapper);
    wrapper.querySelectorAll("[data-brush]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.getAttribute("data-brush");
        if (mode === "spawn") {
          PlatformerGame.setEditorMode("spawn");
        } else {
          PlatformerGame.setBrush(mode === "draw" ? 1 : 0);
          PlatformerGame.setEditorMode("draw");
        }
        wrapper.querySelectorAll("[data-brush]").forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");
      });
    });

    wrapper.querySelector("#editorPlayBtn")?.addEventListener("click", () => {
      PlatformerGame.startPlay();
    });
    wrapper.querySelector("#editorMenuBtn")?.addEventListener("click", () => {
      PlatformerGame.showMainMenu();
    });

    const defaultBrush = wrapper.querySelector("[data-brush='draw']");
    defaultBrush?.classList.add("active");
    PlatformerGame.setBrush(1);
    PlatformerGame.setEditorMode("draw");
    return wrapper;
  }

  function createPauseOverlay() {
    const wrapper = document.createElement("div");
    wrapper.id = "pauseOverlay";
    wrapper.className = "overlay pause-overlay";
    wrapper.innerHTML = `
      <div class="panel pause-panel">
        <h2>Paused</h2>
        <p id="pauseProgressValue">Collect objectives to continue.</p>
        <div class="button-row">
          <button id="resumeBtn">Resume</button>
          <button id="exitToMenuBtn">Exit to Menu</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
    wrapper.querySelector("#resumeBtn")?.addEventListener("click", () => {
      PlatformerGame.resumeGame();
    });
    wrapper.querySelector("#exitToMenuBtn")?.addEventListener("click", () => {
      PlatformerGame.showMainMenu();
    });
    return wrapper;
  }

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    setTimeout(() => {
      toast.classList.remove("visible");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, 2200);
  }
});
