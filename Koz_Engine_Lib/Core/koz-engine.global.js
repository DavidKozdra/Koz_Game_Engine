(function initKozEngineGlobalBridge(root) {
  /**
   * Browser/global bridge for loading Koz Engine modules.
   * Provides CommonJS-like require semantics in the browser and publishes
   * selected APIs to the global namespace.
   * @param {Object} root - The global object (window or globalThis)
   */
  if (!root) return;
  if (typeof XMLHttpRequest !== "function") return;

  const engineNamespace = root.KozEngine = root.KozEngine || {};
  const moduleCache = new Map();

  function ensurePath(target, path) {
    let cursor = target;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      cursor[key] = cursor[key] || {};
      cursor = cursor[key];
    }
    return { parent: cursor, key: path[path.length - 1] };
  }

  function registerNamespace(path, api) {
    const engineTarget = ensurePath(engineNamespace, path);
    engineTarget.parent[engineTarget.key] = api;
  }

  function publishGlobal(name, value) {
    if (typeof name !== "string" || !name) return;
    if (root[name] === undefined) {
      root[name] = value;
    }
  }

  function loadCommonJsModule(path) {
    const normalizedPath = normalizePath(withJsExtension(path));
    if (moduleCache.has(normalizedPath)) return moduleCache.get(normalizedPath);

    const request = new XMLHttpRequest();
    request.open("GET", normalizedPath, false);
    request.send(null);

    if (!((request.status >= 200 && request.status < 300) || request.status === 0)) {
      throw new Error(`Failed to load engine module: ${normalizedPath} (${request.status})`);
    }

    const module = { exports: {} };
    const exports = module.exports;
    const evaluate = new Function(
      "module",
      "exports",
      "require",
      `${request.responseText}\n//# sourceURL=${normalizedPath}`
    );

    evaluate(module, exports, function bridgeRequire(id) {
      if (typeof id !== "string" || !id) {
        throw new Error("CommonJS require id must be a non-empty string");
      }
      if (id.startsWith("./") || id.startsWith("../")) {
        return loadCommonJsModule(resolveRelativePath(normalizedPath, id));
      }
      if (id.startsWith("Koz_Engine_Lib/")) {
        return loadCommonJsModule(id);
      }
      throw new Error(`CommonJS require is not supported in browser bridge: ${id}`);
    });

    moduleCache.set(normalizedPath, module.exports);
    return module.exports;
  }

  function withJsExtension(path) {
    return path.endsWith(".js") ? path : `${path}.js`;
  }

  function normalizePath(path) {
    const parts = [];
    const segments = String(path || "").split("/");
    for (const segment of segments) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        parts.pop();
        continue;
      }
      parts.push(segment);
    }
    return parts.join("/");
  }

  function dirname(path) {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf("/");
    return idx === -1 ? "" : normalized.slice(0, idx);
  }

  function resolveRelativePath(fromPath, requestPath) {
    const baseDir = dirname(fromPath);
    return normalizePath(`${baseDir}/${requestPath}`);
  }

  const moduleDefs = [
    {
      path: "Koz_Engine_Lib/AI/astar.js",
      register: ["AI", "astar"],
      globals: {
        aStar: (api) => api.aStar,
        MinHeap: (api) => api.MinHeap,
      },
    },
    {
      path: "Koz_Engine_Lib/Assets/atlasHelper.js",
      register: ["Assets", "atlasHelper"],
      globals: {
        AtlasManager: (api) => api.AtlasManager,
      },
    },
    {
      path: "Koz_Engine_Lib/World/seededRng.js",
      register: ["World", "seededRng"],
      globals: {
        BQSeededRNG: (api) => api.SeededRNG,
        BQRandom: (api) => function BQRandom(streamName) {
          return api.namedRandom(api.SeededRNG, streamName || "default");
        },
      },
    },
    {
      path: "Koz_Engine_Lib/World/worldSpace.js",
      register: ["World", "worldSpace"],
    },
    {
      path: "Koz_Engine_Lib/World/worldEditor.js",
      register: ["World", "worldEditor"],
    },
    {
      path: "Koz_Engine_Lib/World/worldGenerators.js",
      register: ["World", "worldGenerators"],
    },
    {
      path: "Koz_Engine_Lib/World/dungeonMaze.js",
      register: ["World", "dungeonMaze"],
    },
    {
      path: "Koz_Engine_Lib/Time/countdownTimer.js",
      register: ["Time", "countdownTimer"],
    },
    {
      path: "Koz_Engine_Lib/Core/gameStateManager.js",
      register: ["Core", "gameStateManager"],
      globals: {
        GameStateManager: (api) => api.GameStateManager,
      },
    },
    {
      path: "Koz_Engine_Lib/Core/spatialGrid.js",
      register: ["Core", "spatialGrid"],
      globals: {
        SpatialGrid: (api) => api.SpatialGrid,
      },
    },
    {
      path: "Koz_Engine_Lib/Core/uiScreenController.js",
      register: ["Core", "uiScreenController"],
    },
    {
      path: "Koz_Engine_Lib/SaveLoad/schemaRegistry.js",
      register: ["SaveLoad", "schemaRegistry"],
    },
    {
      path: "Koz_Engine_Lib/SaveLoad/storageDrivers.js",
      register: ["SaveLoad", "storageDrivers"],
    },
    {
      path: "Koz_Engine_Lib/SaveLoad/saveApi.js",
      register: ["SaveLoad", "saveApi"],
    },
    {
      path: "Koz_Engine_Lib/Time/dayNightCore.js",
      register: ["Time", "dayNightCore"],
    },
    {
      path: "Koz_Engine_Lib/Time/dayNightCycle.js",
      register: ["Time", "dayNightCycle"],
      globals: {
        DayNightCycle: (api) => api.DayNightCycle,
      },
    },
    {
      path: "Koz_Engine_Lib/Events/eventEngine.js",
      register: ["Events", "eventEngine"],
    },
    {
      path: "Koz_Engine_Lib/Events/eventSystem.js",
      register: ["Events", "eventSystem"],
      globals: {
        EventSystem: (api) => api.EventSystem,
      },
    },
    {
      path: "Koz_Engine_Lib/Events/tipTracker.js",
      register: ["Events", "tipTracker"],
    },
    {
      path: "Koz_Engine_Lib/UI/mobileInput.js",
      register: ["UI", "mobileInput"],
    },
    {
      path: "Koz_Engine_Lib/Economy/stagedAcquisition.js",
      register: ["Economy", "stagedAcquisition"],
    },
    {
      path: "Koz_Engine_Lib/Items/itemFactory.js",
      register: ["Items", "itemFactory"],
    },
    {
      path: "Koz_Engine_Lib/Minigames/manager.js",
      register: ["Minigames", "manager"],
    },
    {
      path: "Koz_Engine_Lib/Minigames/minigamesRuntime.js",
      register: ["Minigames", "runtime"],
      globals: {
        MinigameManager: (api) => api.MinigameManager,
        MinigameBase: (api) => api.MinigameBase,
        HagglingMinigame: (api) => api.HagglingMinigame,
        LockPickingMinigame: (api) => api.LockPickingMinigame,
        DicePokerMinigame: (api) => api.DicePokerMinigame,
        MemoryMatchMinigame: (api) => api.MemoryMatchMinigame,
        WheelOfFortuneMinigame: (api) => api.WheelOfFortuneMinigame,
        BluffMeterMinigame: (api) => api.BluffMeterMinigame,
        NavigationDodgeMinigame: (api) => api.NavigationDodgeMinigame,
        ShipRaceMinigame: (api) => api.ShipRaceMinigame,
        FishingMinigame: (api) => api.FishingMinigame,
        MiningMinigame: (api) => api.MiningMinigame,
        HarvestMinigame: (api) => api.HarvestMinigame,
        WoodcuttingMinigame: (api) => api.WoodcuttingMinigame,
        SandDigMinigame: (api) => api.SandDigMinigame,
      },
      afterLoad: function afterMinigames(api) {
        if (root.minigameManager === undefined) {
          root.minigameManager = null;
        }
      },
    },
    {
      path: "Koz_Engine_Lib/VisualFX/particleSystemCore.js",
      register: ["VisualFX", "particleSystemCore"],
    },
    {
      path: "Koz_Engine_Lib/VisualFX/particleSystem.js",
      register: ["VisualFX", "particleSystem"],
      globals: {
        ParticleSystem: (api) => api.ParticleSystem,
      },
      afterLoad: function afterParticleSystem(api) {
        if (root.particleSystem === undefined) {
          root.particleSystem = api.createParticleSystem();
        }
        registerNamespace(["VisualFX", "particleSystem"], {
          ParticleSystem: api.ParticleSystem,
          particleSystem: root.particleSystem,
        });
      },
    },
    {
      path: "Koz_Engine_Lib/UI/modalPrimitives.js",
      register: ["UI", "modalPrimitives"],
    },
    {
      path: "Koz_Engine_Lib/Events/notificationCenter.js",
      register: ["Events", "notificationCenter"],
    },
    {
      path: "Koz_Engine_Lib/Events/notificationManager.js",
      register: ["Events", "notificationManager"],
      globals: {
        NotificationManager: (api) => api.NotificationManager,
      },
    },
    {
      path: "Koz_Engine_Lib/UI/uiManager.js",
      register: ["UI", "uiManager"],
      globals: {
        UIManager: (api) => api.UIManager,
      },
    },
    {
      path: "Koz_Engine_Lib/Audio/musicSystem.js",
      register: ["Audio", "musicSystem"],
      globals: {
        MusicSystem: (api) => api.MusicSystem,
      },
    },
    {
      path: "Koz_Engine_Lib/Audio/soundRegistry.js",
      register: ["Audio", "soundRegistry"],
    },
  ];

  for (const def of moduleDefs) {
    const api = loadCommonJsModule(def.path);
    registerNamespace(def.register, api);

    if (def.globals) {
      for (const [name, factory] of Object.entries(def.globals)) {
        publishGlobal(name, factory(api));
      }
    }

    if (typeof def.afterLoad === "function") {
      def.afterLoad(api);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
