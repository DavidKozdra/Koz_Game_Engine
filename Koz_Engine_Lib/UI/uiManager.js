let UIScreenControllerCtor = null;
if (typeof require === "function") {
  try {
    ({ UIScreenController: UIScreenControllerCtor } = require("../Core/uiScreenController"));
  } catch (_err) {}
}

(function initUIManagerLib(root, factory) {
  const api = factory(root);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createUIManagerApi(root) {
  class UIManager {
    constructor(options = {}) {
      const opts = options || {};
      const Controller = opts.controllerClass || opts.UIScreenController || UIScreenControllerCtor;
      this._controller = opts.controller || (
        (typeof Controller === "function")
          ? new Controller(opts.logger || console)
          : null
      );

      // Fallback to preserve behavior if core screen controller is unavailable.
      if (!this._controller) {
        this._controller = {
          screens: {},
          activeScreens: new Set(),
          currentState: null,
          _fadeTimers: {},
          registerScreen: function (name, spec) {
            this.screens[name] = {
              initialized: false,
              container: null,
              create: spec.create,
              show: spec.show || (() => {}),
              hide: spec.hide || (() => {}),
              update: spec.update || (() => {}),
              validStates: spec.validStates || [],
            };
          },
          _cancelFade: function (name) {
            if (this._fadeTimers[name]) {
              clearTimeout(this._fadeTimers[name]);
              delete this._fadeTimers[name];
            }
          },
          scheduleFadeHide: function (name, delay = 200) {
            this._cancelFade(name);
            const s = this.screens[name];
            if (!s || !s.container) return;
            this._fadeTimers[name] = setTimeout(() => {
              s.container.hide();
              delete this._fadeTimers[name];
            }, delay);
          },
          onStateChange: function (newState) {
            this.currentState = newState;
            for (const n in this.screens) {
              const s = this.screens[n];
              const should = s.validStates.includes(newState);
              if (should) {
                this._cancelFade(n);
                if (!s.initialized) {
                  s.container = s.create();
                  s.initialized = true;
                }
                s.container.show();
                try { s.show(); } catch (_e) { s.container.hide(); continue; }
                this.activeScreens.add(n);
              } else if (s.initialized) {
                try { s.hide(); } catch (_e) {}
                if (!this._fadeTimers[n]) s.container.hide();
                this.activeScreens.delete(n);
              }
            }
          },
          hideAll: function () {
            for (const n of this.activeScreens) this.hideScreen(n);
            this.activeScreens.clear();
          },
          hideScreen: function (name) {
            const s = this.screens[name];
            if (s && s.container) {
              this._cancelFade(name);
              try { s.hide(); } catch (_e) {}
              s.container.hide();
              this.activeScreens.delete(name);
            }
          },
          showScreen: function (name) {
            const s = this.screens[name];
            if (!s) return;
            this._cancelFade(name);
            if (!s.initialized) {
              s.container = s.create();
              s.initialized = true;
            }
            s.container.show();
            try { s.show(); } catch (_e) { s.container.hide(); return; }
            this.activeScreens.add(name);
          },
          updateAll: function () {
            const active = [...this.activeScreens];
            for (const n of active) {
              const s = this.screens[n];
              if (s && s.update) {
                try { s.update(); } catch (_e) {}
              }
            }
          },
        };
      }

      this.screens = this._controller.screens;
      this.activeScreens = this._controller.activeScreens;
      this.currentState = this._controller.currentState;
    }

    registerScreen(name, { create, show = () => {}, hide = () => {}, update = () => {}, validStates = [] }) {
      this._controller.registerScreen(name, { create, show, hide, update, validStates });
    }

    _cancelFade(name) {
      this._controller._cancelFade(name);
    }

    scheduleFadeHide(name, delay = 200) {
      this._controller.scheduleFadeHide(name, delay);
    }

    onGameStateChange(newState) {
      this._controller.onStateChange(newState);
      this.currentState = this._controller.currentState;
    }

    hideAll() {
      this._controller.hideAll();
    }

    hideScreen(name) {
      this._controller.hideScreen(name);
    }

    showScreen(name) {
      this._controller.showScreen(name);
    }

    updateAll() {
      this._controller.updateAll();
    }
  }

  return { UIManager };
});
