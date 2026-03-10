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
    let animationClips = [];
    let running = false;
    let elapsed = 0;

    function loadProject(projectData) {
      project = projectData;
      worldSpace = adapters.projectToWorldSpace(createWorldSpace, project.world);
      gameObjects = adapters.projectToGameObjects(GameObjectCtor, project.objects);
      animationClips = project.animations || [];
      scripts = {};
      scriptInstances = [];

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
          const instance = createScriptInstance(scripts[legacyBinding.scriptId], obj);
          if (instance) scriptInstances.push(instance);
        }
        
        // Handle array of bindings
        if (Array.isArray(bindings)) {
          for (const binding of bindings) {
            if (binding && binding.active !== false && binding.scriptId && scripts[binding.scriptId]) {
              const instance = createScriptInstance(scripts[binding.scriptId], obj);
              if (instance) scriptInstances.push(instance);
            }
          }
        }
      }
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
    }

    function createEngineApi() {
      return {
        worldSpace: worldSpace,
        gameObjects: gameObjects,
        elapsed: elapsed,
        findObject: function findObject(id) {
          return gameObjects.find(function byId(o) { return o.id === id; }) || null;
        },
        findObjectsByType: function findObjectsByType(type) {
          return gameObjects.filter(function byType(o) { return o.type === type; });
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
