// ============================
// SETTINGS MENU (moved out of ui.js)
// ============================
const SETTINGS_TAB_DEFS = [
  { label: "Audio", key: "audio" },
  { label: "Game", key: "game" },
  { label: "Controls", key: "controls" },
  { label: "Accessibility", key: "visual" },
];
const SETTINGS_DEFAULT_VOLUME = 0.5;
const SETTINGS_AI_ROWS = [
  { label:"Active AI Radius", id:"aiRadiusSlider",  min:40,  max:200, step:10,  key:"pref_ai_radius",  def:80  },
  { label:"AI Frame Skip",    id:"aiSkipSlider",    min:4,   max:32,  step:4,   key:"pref_ai_skip",    def:8   },
  { label:"Spawn Rate",       id:"spawnRateSlider", min:0.5, max:2.0, step:0.1, key:"pref_spawn_rate", def:1.0 },
];

function _applySettingsTabState(tabKey) {
  window._settingsTab = tabKey;
  window.BQTabs?.applyTabState({
    tab: tabKey,
    defs: SETTINGS_TAB_DEFS,
    btnSelector: ".settings-tab-btn",
    panelPrefix: "settingsTab_",
    activeClass: "settings-tab-active",
    dataAttr: "data-tab",
  });
}

function _readBoolPref(key, fallback = true) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw === "true";
}

function _applyAccessibilityPrefs() {
  const body = document.body;
  if (!body) return;
  body.classList.toggle("acc-reduce-motion", _readBoolPref("pref_acc_reduce_motion", false));
  body.classList.toggle("acc-high-contrast", _readBoolPref("pref_acc_high_contrast", false));
  body.classList.toggle("acc-large-text", _readBoolPref("pref_acc_large_text", false));
  body.classList.toggle("acc-large-ui", _readBoolPref("pref_acc_large_ui", false));
}

window.applyAccessibilityPrefs = _applyAccessibilityPrefs;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _applyAccessibilityPrefs, { once: true });
} else {
  _applyAccessibilityPrefs();
}

function _setVolumeSlidersFromPrefs() {
  const music = window.BQUI?.readNumberPref("music_vol", SETTINGS_DEFAULT_VOLUME) ?? SETTINGS_DEFAULT_VOLUME;
  const game = window.BQUI?.readNumberPref("game_vol", SETTINGS_DEFAULT_VOLUME) ?? SETTINGS_DEFAULT_VOLUME;
  select("#musicSlider")?.value(music);
  select("#gameSlider")?.value(game);
}

function _syncAISlidersFromPrefs() {
  for (const d of SETTINGS_AI_ROWS) {
    const val = window.BQUI?.readNumberPref(d.key, d.def) ?? d.def;
    const sl = select(`#${d.id}`);
    if (sl) {
      sl.value(val);
      sl.elt.oninput = () => saveAISettings();
    }
    const lbl = document.getElementById(`${d.id}Val`);
    if (lbl) lbl.textContent = val.toFixed(1);
  }
}

uiManager.registerScreen("settingsMenu", {
  validStates: [GameStates.SETTINGS],

  create: () => {
    const wrapper = createDiv().id("settingsMenu").class("screen");
    wrapper.style("max-width", "560px").style("max-height", "90vh").style("overflow-y", "hidden");

    createElement("h2", "Settings").parent(wrapper);

    // ── Tab Bar ──
    const tabBar = createDiv().class("settings-tab-bar").parent(wrapper);

    for (const t of SETTINGS_TAB_DEFS) {
      createButton(t.label)
        .parent(tabBar)
        .addClass("settings-tab-btn")
        .attribute("data-tab", t.key)
        .mousePressed(() => _applySettingsTabState(t.key));
    }

    // ══════════════════════════════════
    //  TAB: Audio
    // ══════════════════════════════════
    const audioPanel = createDiv().id("settingsTab_audio").class("settings-tab-panel").parent(wrapper);

    // ── Audio ──
    const audioSection = createDiv().addClass("config-section").parent(audioPanel);
    createElement("h3", "Audio").parent(audioSection).style("margin-bottom", "8px");

    const musicRow = createDiv().addClass("settings-slider-row").parent(audioSection);
    createSpan("Music").addClass("settings-slider-label").parent(musicRow);
    createSlider(0, 1, 0.5, 0.01).id("musicSlider").addClass("size-slider").parent(musicRow);

    const sfxRow = createDiv().addClass("settings-slider-row").parent(audioSection);
    createSpan("Sound").addClass("settings-slider-label").parent(sfxRow);
    createSlider(0, 1, 0.5, 0.01).id("gameSlider").addClass("size-slider").parent(sfxRow);

    // (Game Speed moved to Game tab)

    // ══════════════════════════════════
    //  TAB: Game
    // ══════════════════════════════════
    const gamePanel = createDiv().id("settingsTab_game").class("settings-tab-panel").parent(wrapper);

    // ── Game & Performance ──
    const aiSection = createDiv().addClass("config-section").parent(gamePanel);
    createElement("h3", "Game & Performance").parent(aiSection).style("margin-bottom","8px");
    for (const row of SETTINGS_AI_ROWS) {
      const r = createDiv().addClass("settings-slider-row").parent(aiSection);
      createSpan(row.label).addClass("settings-slider-label").parent(r);
      createSpan("").id(`${row.id}Val`).addClass("settings-slider-val").style("min-width","30px").style("text-align","right").parent(r);
      createSlider(row.min, row.max, row.def, row.step).id(row.id).addClass("size-slider").parent(r);
    }

    // ── Game Speed (moved here from Audio tab) ──
    const speedSection = createDiv().addClass("config-section").parent(gamePanel);
    createElement("h3", "Game Speed").parent(speedSection).style("margin-bottom", "8px");
    const speedSelect = createSelect().id("speedSelect").parent(speedSection).addClass("setting-select");
    speedSelect.option("0.25×", 0);
    speedSelect.option("0.5×", 1);
    speedSelect.option("1× (Normal)", 2);
    speedSelect.option("2×", 3);
    speedSelect.option("4×", 4);
    speedSelect.selected("1× (Normal)");
    speedSelect.changed(() => {
      const idx = parseInt(speedSelect.value(), 10);
      if (typeof SPEED_STEPS !== 'undefined') {
        gameSpeedIndex = idx;
        gameSpeed = SPEED_STEPS[idx];
        syncSpeedDisplay();
      }
    });

    // ── Data Management ──
    const dataSection = createDiv().addClass("config-section").parent(gamePanel).style("margin-top", "12px").style("border-color", "#6b2020");
    createElement("h3", "Data Management").parent(dataSection).style("margin-bottom", "8px").style("color", "#e74c3c");
    createP("Permanently remove saves and local settings.").parent(dataSection).style("margin", "0 0 8px").style("font-size", "12px").style("color", "#b0b0b0");

    const dataBtnRow = createDiv().addClass("data-btn-row").parent(dataSection);

    const toastDataMsg = (msg, type = "info") => window.BQUI?.notify(msg, type, 7000);

    const copyBtn = createButton("Copy Save Data")
      .parent(dataBtnRow)
      .addClass("settings-btn")
      .mousePressed(async function () {
        if (typeof SaveSystem === 'undefined') return;
        const out = SaveSystem.exportSaveData();
        if (!out.ok) {
          toastDataMsg("No save found to copy.", "warning");
          return;
        }
        const payload = out.data;
        let copied = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(payload);
            copied = true;
          }
        } catch (e) {
          console.warn('Clipboard copy failed:', e);
        }
        if (!copied) {
          window.prompt("Copy this save data:", payload);
          toastDataMsg("Clipboard blocked. Save data is shown in a prompt for manual copy.", "info");
        } else {
          toastDataMsg("Save data copied. Paste it anywhere to back up, or use Import Save Data to restore.", "success");
          // Visual feedback: flash effect
          copyBtn.addClass("flash-success");
          setTimeout(() => copyBtn.removeClass("flash-success"), 500);
        }
      });

    createButton("Import Save Data")
      .parent(dataBtnRow)
      .addClass("settings-btn")
      .mousePressed(async () => {
        if (typeof SaveSystem === 'undefined') return;
        let incoming = "";
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            incoming = (await navigator.clipboard.readText()) || "";
          }
        } catch (_e) {}
        const pasted = window.prompt("Paste save data token (BQ_SAVE_V1:...) or raw JSON:", incoming || "");
        if (pasted === null) return;
        const res = SaveSystem.importSaveData(pasted);
        if (!res.ok) {
          const msg = (res.reason === 'bad_version')
            ? "Save data version is not supported."
            : "Invalid save data. Import failed.";
          toastDataMsg(msg, "error");
          return;
        }
        toastDataMsg("Save data imported successfully.", "success");
        if (confirm("Import successful. Load this save now?")) {
          if (typeof loadExistingGame === 'function') loadExistingGame();
        }
      });

    createButton("Clear All Saved Data")
      .parent(dataBtnRow)
      .addClass("danger-btn")
      .mousePressed(() => {
        if (confirm("Are you sure? This will delete all saved settings and game data.")) {
          localStorage.clear();
          select("#musicSlider")?.value(0.5);
          select("#gameSlider")?.value(0.5);
          if (typeof sound !== "undefined") {
            if (sound.setMusicVolume) sound.setMusicVolume(0.5);
            if (sound.setGameVolume) sound.setGameVolume(0.5);
          }
          resetKeyBindings();
          buildKeybindRows();

          window.location.reload();
        }
      });

    // ══════════════════════════════════
    //  TAB: Controls
    // ══════════════════════════════════
    const controlsPanel = createDiv().id("settingsTab_controls").class("settings-tab-panel").parent(wrapper);

    // ── Controls ──
    const controlsSection = createDiv().addClass("config-section").parent(controlsPanel);
    createElement("h3", "Controls").parent(controlsSection).style("margin-bottom", "8px");

    const keybindGrid = createDiv().id("keybindGrid").addClass("keybind-grid").parent(controlsSection);

    // Build keybinding rows (will be populated/refreshed in show())
    function buildKeybindRows() {
      const grid = document.getElementById("keybindGrid");
      if (!grid) return;
      grid.innerHTML = "";

      const actions = Object.keys(keyBindings);
      for (const action of actions) {
        const binding = keyBindings[action];

        const row = document.createElement("div");
        row.className = "keybind-row";

        const label = document.createElement("span");
        label.className = "keybind-label";
        label.textContent = binding.label;
        row.appendChild(label);

        const keyDisplay = document.createElement("button");
        keyDisplay.className = "keybind-btn";
        keyDisplay.textContent = getActionDisplay(action);
        keyDisplay.title = "Click to rebind, then press a new key";
        keyDisplay.addEventListener("click", (e) => {
          e.stopPropagation();
          // Enter listening mode
          keyDisplay.textContent = "Press a key...";
          keyDisplay.classList.add("keybind-listening");

          function onKey(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            const code = ev.keyCode;
            // Set this action to the single pressed key
            keyBindings[action].keys = [code];
            keyBindings[action].display = _keyCodeToName(code);
            saveKeyBindings();
            keyDisplay.textContent = getActionDisplay(action);
            keyDisplay.classList.remove("keybind-listening");
            document.removeEventListener("keydown", onKey, true);
            window.BQUI?.notify(`${binding.label} bound to ${_keyCodeToName(code)}`, "info");
          }
          document.addEventListener("keydown", onKey, true);
        });
        row.appendChild(keyDisplay);

        grid.appendChild(row);
      }
    }

    // Expose for refresh
    window._buildKeybindRows = buildKeybindRows;

    // Reset controls button
    const controlsBtnRow = createDiv().style("margin-top", "8px").style("text-align", "center").parent(controlsSection);
    const resetKeysBtn = document.createElement("button");
    resetKeysBtn.className = "settings-btn";
    resetKeysBtn.textContent = "Reset to Defaults";
    resetKeysBtn.style.width = "auto";
    resetKeysBtn.style.display = "inline-block";
    resetKeysBtn.style.padding = "6px 16px";
    resetKeysBtn.style.fontSize = "0.85em";
    resetKeysBtn.addEventListener("click", () => {
      resetKeyBindings();
      buildKeybindRows();
      window.BQUI?.notify("Controls reset to defaults", "info");
    });
    controlsBtnRow.elt.appendChild(resetKeysBtn);

    // ══════════════════════════════════
    //  TAB: Visual
    // ══════════════════════════════════
    const visualPanel = createDiv().id("settingsTab_visual").class("settings-tab-panel").parent(wrapper);

    // ── Visual Effects ──
    const effectsSection = createDiv().addClass("config-section").parent(visualPanel);
    createElement("h3", "Visual Effects").parent(effectsSection).style("margin-bottom", "8px");
    const effectsRow = createDiv().addClass("settings-row").parent(effectsSection);
    createSpan("Enable Combat Effects").addClass("settings-slider-label").parent(effectsRow);
    const enabled = _readBoolPref("pref_combat_effects", true);
    const effectsToggle = createCheckbox('', enabled).id('combatEffectsToggle').parent(effectsRow);
    effectsToggle.changed(() => {
      const v = document.getElementById('combatEffectsToggle').checked;
      localStorage.setItem('pref_combat_effects', v ? 'true' : 'false');
    });

    const intensityRow = createDiv().addClass("settings-row").parent(effectsSection);
    createSpan("Effects Intensity").addClass("settings-slider-label").parent(intensityRow);
    const intensitySelect = createSelect().id('combatEffectsIntensity').parent(intensityRow).addClass('setting-select');
    intensitySelect.option('Subtle', 'subtle');
    intensitySelect.option('Medium', 'medium');
    intensitySelect.option('Heavy', 'heavy');
    const cur = localStorage.getItem('pref_combat_effects_intensity') || 'medium';
    intensitySelect.selected(cur);
    intensitySelect.changed(() => {
      localStorage.setItem('pref_combat_effects_intensity', intensitySelect.value());
    });

    // ── Accessibility ──
    const accessibilitySection = createDiv().addClass("config-section").parent(visualPanel);
    createElement("h3", "Accessibility").parent(accessibilitySection).style("margin-bottom", "8px");
    createP("Adjust motion, contrast, text, and control sizing for readability and comfort.")
      .parent(accessibilitySection)
      .style("margin", "0 0 10px")
      .style("font-size", "12px")
      .style("color", "#b5c2cf");

    function addAccToggle(label, key) {
      const row = createDiv().addClass("settings-row").parent(accessibilitySection);
      createSpan(label).addClass("settings-slider-label").parent(row);
      const toggle = createCheckbox("", _readBoolPref(key, false)).parent(row);
      toggle.changed(() => {
        localStorage.setItem(key, toggle.checked() ? "true" : "false");
        _applyAccessibilityPrefs();
      });
    }

    addAccToggle("Reduce Motion", "pref_acc_reduce_motion");
    addAccToggle("High Contrast UI", "pref_acc_high_contrast");
    addAccToggle("Larger Text", "pref_acc_large_text");
    addAccToggle("Larger UI Controls", "pref_acc_large_ui");

    // ── Back button (always visible, outside tabs) ──
    createButton("Back")
      .parent(wrapper)
      .addClass("settings-btn")
      .mousePressed(() => {
        gameStateManager.setState(gameStateManager.prev);
      });

    return wrapper;
  },

  show: () => {
    const m = select("#settingsMenu");
    if (m) {
      m.show();
      m.style("opacity", "1");

      // ── Activate correct tab ──
      const tab = window._settingsTab || "audio";
      _applySettingsTabState(tab);

      // ── Sync Audio tab ──
      _setVolumeSlidersFromPrefs();
      const ms = select("#musicSlider");
      const gs = select("#gameSlider");
      if (ms) ms.elt.oninput = () => saveSettings();
      if (gs) gs.elt.oninput = () => saveSettings();
      // Sync speed selector
      if (typeof gameSpeedIndex !== 'undefined') {
        select("#speedSelect")?.value(gameSpeedIndex);
      }

      // ── Sync Controls tab ──
      if (typeof _buildKeybindRows === 'function') _buildKeybindRows();

      // ── Sync World tab ──
      _syncAISlidersFromPrefs();
      _applyAccessibilityPrefs();
    }
  },

  hide: () => {
    const m = select("#settingsMenu");
    if (m) { m.style("opacity", "0"); uiManager.scheduleFadeHide("settingsMenu", 200); }
  }
});
