(function initGameRuntimeLib(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createGameRuntimeApi() {

  /**
   * Creates a game runtime that loads and runs a project.
   * Designed to work both in the editor (play mode) and in exported builds.
   */
  function createGameRuntime(options) {
    const opts = options || {};
    const createWorldSpace = opts.createWorldSpace;
    const GameObjectCtor = opts.GameObject;
    const adapters = opts.adapters;

    let project = null;
    let worldSpace = null;
    let gameObjects = [];
    let scripts = {};
    let scriptInstances = [];
    let cssStyleElements = new Map();
    let animationClips = [];
    let audioService = null;
    let running = false;
    let elapsed = 0;

    function loadProject(projectData) {
      clearActiveCssStyles();
      project = projectData;
      worldSpace = adapters.projectToWorldSpace(createWorldSpace, project.world);
      gameObjects = adapters.projectToGameObjects(GameObjectCtor, project.objects);
      animationClips = project.animations || [];
      scripts = {};
      scriptInstances = [];
      audioService = createRuntimeAudioService(project.assets || [], gameObjects);

      // Index scripts by id
      if (Array.isArray(project.scripts)) {
        for (const script of project.scripts) {
          scripts[script.id] = script;
        }
      }

      // Create script instances for objects with ScriptBinding or ScriptBindings
      for (const obj of gameObjects) {
        const components = obj.meta && obj.meta.components;
        // Support both legacy singular (ScriptBinding) and array form (ScriptBindings)
        const legacyBinding = components && components.ScriptBinding;
        const bindings = components && components.ScriptBindings;
        
        // Handle legacy single binding
        if (legacyBinding && legacyBinding.scriptId && scripts[legacyBinding.scriptId]) {
          const boundScript = scripts[legacyBinding.scriptId];
          if (boundScript.language === "css") {
            applyCssScript(boundScript);
          } else {
            const instance = createScriptInstance(boundScript, obj);
            if (instance) scriptInstances.push(instance);
          }
        }
        
        // Handle array of bindings
        if (Array.isArray(bindings)) {
          for (const binding of bindings) {
            if (binding && binding.active !== false && binding.scriptId && scripts[binding.scriptId]) {
              const boundScript = scripts[binding.scriptId];
              if (boundScript.language === "css") {
                applyCssScript(boundScript);
              } else {
                const instance = createScriptInstance(boundScript, obj);
                if (instance) scriptInstances.push(instance);
              }
            }
          }
        }
      }
    }

    function applyCssScript(script) {
      if (!script || !script.id || cssStyleElements.has(script.id)) return;
      if (typeof document === "undefined") return;
      const target = document.head || document.documentElement || document.body;
      if (!target || typeof target.appendChild !== "function") return;
      const styleEl = document.createElement("style");
      styleEl.type = "text/css";
      styleEl.setAttribute("data-koz-script-id", script.id);
      styleEl.textContent = String(script.source || "");
      target.appendChild(styleEl);
      cssStyleElements.set(script.id, styleEl);
    }

    function clearActiveCssStyles() {
      cssStyleElements.forEach(function removeStyle(styleEl) {
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      });
      cssStyleElements = new Map();
    }

    function createScriptInstance(script, gameObject) {
      try {
        const sandbox = {
          self: gameObject,
          console: { log: console.log.bind(console), warn: console.warn.bind(console), error: console.error.bind(console) },
        };

        // Parse script functions from source
        const wrappedSource = `(function(self, console) {
          ${script.source}
          return { onInit: typeof onInit === 'function' ? onInit : null, onUpdate: typeof onUpdate === 'function' ? onUpdate : null };
        })`;

        const factory = new Function("return " + wrappedSource)();
        const hooks = factory(sandbox.self, sandbox.console);
        return {
          scriptId: script.id,
          gameObject: gameObject,
          hooks: hooks,
        };
      } catch (err) {
        console.error("Script compile error (" + script.name + "):", err.message);
        return null;
      }
    }

    function init() {
      running = true;
      elapsed = 0;
      if (audioService) audioService.autoplayFromComponents();

      const engine = createEngineApi();
      for (const instance of scriptInstances) {
        if (instance.hooks.onInit) {
          try {
            instance.hooks.onInit(instance.gameObject, engine);
          } catch (err) {
            console.error("Script onInit error:", err.message);
          }
        }
      }
    }

    function update(dt) {
      if (!running) return;
      elapsed += dt;

      // Evaluate animations
      for (const clip of animationClips) {
        evaluateClip(clip, elapsed);
      }

      // Run script updates
      const engine = createEngineApi();
      for (const instance of scriptInstances) {
        if (instance.hooks.onUpdate) {
          try {
            instance.hooks.onUpdate(instance.gameObject, engine, dt);
          } catch (err) {
            console.error("Script onUpdate error:", err.message);
          }
        }
      }
    }

    function evaluateClip(clip, time) {
      if (!clip.tracks || clip.tracks.length === 0) return;
      const duration = clip.duration || 1;
      const localTime = clip.loop ? (time % duration) : Math.min(time, duration);

      for (const track of clip.tracks) {
        const obj = gameObjects.find(function byId(o) { return o.id === track.targetObjectId; });
        if (!obj || !track.keyframes || track.keyframes.length === 0) continue;

        const value = sampleTrack(track, localTime);
        if (value !== null) {
          obj[track.property] = value;
        }
      }
    }

    function sampleTrack(track, time) {
      const kfs = track.keyframes;
      if (kfs.length === 0) return null;
      if (kfs.length === 1) return kfs[0].value;
      if (time <= kfs[0].time) return kfs[0].value;
      if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

      for (let i = 0; i < kfs.length - 1; i++) {
        if (time >= kfs[i].time && time <= kfs[i + 1].time) {
          const range = kfs[i + 1].time - kfs[i].time;
          const t = range > 0 ? (time - kfs[i].time) / range : 0;
          return kfs[i].value + (kfs[i + 1].value - kfs[i].value) * t;
        }
      }
      return kfs[kfs.length - 1].value;
    }

    function stop() {
      running = false;
      if (audioService) audioService.destroy();
      clearActiveCssStyles();
    }

    function createEngineApi() {
      return {
        worldSpace: worldSpace,
        gameObjects: gameObjects,
        elapsed: elapsed,
        audio: audioService ? audioService.api : null,
        findObject: function findObject(id) {
          return gameObjects.find(function byId(o) { return o.id === id; }) || null;
        },
        findObjectsByType: function findObjectsByType(type) {
          return gameObjects.filter(function byType(o) { return o.type === type; });
        },
      };
    }

    function createRuntimeAudioService(assets, objects) {
      let masterVolume = 1;
      let currentMusic = null;
      const handles = new Set();
      const assetById = new Map((Array.isArray(assets) ? assets : []).map((asset) => [asset.id, asset]));

      function clamp01(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 1;
        return Math.max(0, Math.min(1, n));
      }

      function resolveAudioSrc(assetId) {
        const asset = assetById.get(assetId);
        if (!asset) return null;
        return asset.previewUrl || asset.url || asset.src || null;
      }

      function resolveObject(target) {
        if (!target) return null;
        if (typeof target === "string") return objects.find((obj) => obj.id === target) || null;
        if (typeof target === "object" && target.id) return target;
        return null;
      }

      function stopHandle(handle) {
        if (!handle) return;
        try {
          handle.audio.pause();
          handle.audio.currentTime = 0;
        } catch (_err) {}
        handles.delete(handle);
        if (currentMusic === handle) currentMusic = null;
      }

      function play(assetId, options = {}) {
        if (typeof Audio === "undefined") return null;
        const src = resolveAudioSrc(assetId);
        if (!src) return null;
        const audio = new Audio(src);
        const handle = {
          audio,
          sourceObjectId: options.sourceObjectId || null,
          baseVolume: clamp01(options.volume ?? 1),
          category: options.category === "music" ? "music" : "sfx",
        };
        audio.loop = !!options.loop;
        audio.volume = clamp01(handle.baseVolume * masterVolume);
        audio.addEventListener("ended", function onEnded() {
          if (!audio.loop) handles.delete(handle);
          if (currentMusic === handle && !audio.loop) currentMusic = null;
        });
        handles.add(handle);
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(function ignoredPlaybackError() {});
        }
        return handle;
      }

      const api = {
        play: function playApi(assetId, options) {
          return play(assetId, options);
        },
        playMusic: function playMusicApi(assetId, options = {}) {
          if (currentMusic) stopHandle(currentMusic);
          currentMusic = play(assetId, { ...options, loop: options.loop !== false, category: "music" });
          return currentMusic;
        },
        stopMusic: function stopMusicApi() {
          if (currentMusic) stopHandle(currentMusic);
          currentMusic = null;
        },
        playObjectSound: function playObjectSoundApi(target, overrides = {}) {
          const obj = resolveObject(target);
          if (!obj) return null;
          const components = obj.meta && obj.meta.components;
          const sound = components && components.Sound;
          if (!sound || !sound.assetId) return null;
          const options = {
            loop: overrides.loop !== undefined ? overrides.loop : !!sound.loop,
            volume: overrides.volume !== undefined ? overrides.volume : (Number.isFinite(sound.volume) ? sound.volume : 1),
            category: overrides.category || (sound.category === "music" ? "music" : "sfx"),
            sourceObjectId: obj.id,
          };
          if (options.category === "music") return api.playMusic(sound.assetId, options);
          return play(sound.assetId, options);
        },
        stopObjectSound: function stopObjectSoundApi(target) {
          const obj = resolveObject(target);
          if (!obj) return;
          Array.from(handles).forEach(function eachHandle(handle) {
            if (handle.sourceObjectId === obj.id) stopHandle(handle);
          });
        },
        stop: function stopApi(handle) {
          stopHandle(handle);
        },
        stopAll: function stopAllApi() {
          Array.from(handles).forEach(function eachHandle(handle) {
            stopHandle(handle);
          });
          currentMusic = null;
        },
        setMasterVolume: function setMasterVolumeApi(value) {
          masterVolume = clamp01(value);
          handles.forEach(function eachHandle(handle) {
            handle.audio.volume = clamp01(handle.baseVolume * masterVolume);
          });
          return masterVolume;
        },
        getMasterVolume: function getMasterVolumeApi() {
          return masterVolume;
        },
      };

      return {
        api,
        autoplayFromComponents: function autoplayFromComponents() {
          objects.forEach(function eachObject(obj) {
            const components = obj.meta && obj.meta.components;
            const sound = components && components.Sound;
            if (!sound || !sound.assetId || !sound.autoplay) return;
            api.playObjectSound(obj);
          });
        },
        destroy: function destroy() {
          api.stopAll();
        },
      };
    }

    return {
      loadProject: loadProject,
      init: init,
      update: update,
      stop: stop,
      get project() { return project; },
      get worldSpace() { return worldSpace; },
      get gameObjects() { return gameObjects; },
      get running() { return running; },
      get elapsed() { return elapsed; },
    };
  }

  return {
    createGameRuntime: createGameRuntime,
  };
});
