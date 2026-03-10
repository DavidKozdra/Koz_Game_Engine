(function initProjectSchemaLib(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createProjectSchemaApi() {

  const CURRENT_VERSION = 1;
  const DEFAULT_SCENE_ID = "scene_main";

  function deepClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function createDefaultWorld(cols, rows, defaultCell) {
    const safeCols = cols || 30;
    const safeRows = rows || 20;
    return {
      cols: safeCols,
      rows: safeRows,
      defaultCell: defaultCell !== undefined ? defaultCell : null,
      grid: createDefaultGrid(safeCols, safeRows, defaultCell !== undefined ? defaultCell : null),
      elements: [],
      meta: {},
    };
  }

  function createScene(id, name, world, objects) {
    return {
      id: id || DEFAULT_SCENE_ID,
      name: name || "Main Scene",
      world: world || createDefaultWorld(30, 20, null),
      objects: Array.isArray(objects) ? objects : [],
    };
  }

  function normalizeScene(scene, index, fallbackWorld, fallbackObjects) {
    const source = scene && typeof scene === "object" ? scene : {};
    return {
      ...deepClone(source),
      id: source.id || (index === 0 ? DEFAULT_SCENE_ID : "scene_" + index),
      name: source.name || (index === 0 ? "Main Scene" : "Scene " + (index + 1)),
      world: source.world && typeof source.world === "object"
        ? source.world
        : (fallbackWorld && typeof fallbackWorld === "object" ? fallbackWorld : createDefaultWorld(30, 20, null)),
      objects: Array.isArray(source.objects)
        ? source.objects
        : (Array.isArray(fallbackObjects) ? fallbackObjects : []),
    };
  }

  function normalizeProjectScenes(project) {
    const source = project && typeof project === "object" ? project : {};
    const fallbackWorld = source.world && typeof source.world === "object"
      ? source.world
      : createDefaultWorld(30, 20, null);
    const fallbackObjects = Array.isArray(source.objects) ? source.objects : [];
    let scenes = [];

    if (Array.isArray(source.scenes) && source.scenes.length > 0) {
      scenes = source.scenes.map(function mapScene(scene, index) {
        return normalizeScene(scene, index, fallbackWorld, fallbackObjects);
      });
    } else {
      scenes = [
        createScene(source.activeSceneId || DEFAULT_SCENE_ID, "Main Scene", fallbackWorld, fallbackObjects),
      ];
    }

    const activeScene = scenes.find(function findScene(scene) {
      return scene && scene.id === source.activeSceneId;
    }) || scenes[0];

    source.scenes = scenes;
    source.activeSceneId = activeScene ? activeScene.id : DEFAULT_SCENE_ID;
    source.world = activeScene ? activeScene.world : fallbackWorld;
    source.objects = activeScene ? activeScene.objects : fallbackObjects;

    return source;
  }

  function validateWorld(world, prefix, errors) {
    if (!world || typeof world !== "object") {
      errors.push(prefix + " must be an object");
      return;
    }
    if (typeof world.cols !== "number" || world.cols < 1) {
      errors.push(prefix + ".cols must be a positive number");
    }
    if (typeof world.rows !== "number" || world.rows < 1) {
      errors.push(prefix + ".rows must be a positive number");
    }
    if (!Array.isArray(world.grid)) {
      errors.push(prefix + ".grid must be an array");
    }
  }

  function createDefaultProject(options) {
    const opts = options || {};
    const defaultWorld = createDefaultWorld(opts.cols || 30, opts.rows || 20, opts.defaultCell);
    const defaultObjects = [];
    const defaultScene = createScene(opts.sceneId || DEFAULT_SCENE_ID, opts.sceneName || "Main Scene", defaultWorld, defaultObjects);
    return {
      schemaVersion: CURRENT_VERSION,
      meta: {
        name: opts.name || "Untitled Project",
        version: "1.0.0",
        resolution: { width: opts.width || 960, height: opts.height || 540 },
        engineVersion: "0.1.0",
      },
      world: defaultWorld,
      objects: defaultObjects,
      scenes: [defaultScene],
      activeSceneId: defaultScene.id,
      animations: [],
      scripts: [],
      assets: [],
      build: {
        profile: "web-prod",
        pwa: false,
      },
      settings: {
        preferredEditor: "vscode",
        editorCommand: "",
        editorArgs: [],
        autoSaveScripts: true,
        formatOnSave: false,
        confirmBeforeScriptDelete: true,
      },
    };
  }

  function createDefaultGrid(cols, rows, defaultCell) {
    const grid = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        row.push(defaultCell !== undefined ? JSON.parse(JSON.stringify(defaultCell)) : null);
      }
      grid.push(row);
    }
    return grid;
  }

  function validate(project) {
    const errors = [];
    if (!project || typeof project !== "object") {
      return { valid: false, errors: ["Project must be an object"] };
    }
    if (project.schemaVersion !== CURRENT_VERSION) {
      errors.push("schemaVersion must be " + CURRENT_VERSION);
    }
    if (!project.meta || typeof project.meta !== "object") {
      errors.push("meta is required and must be an object");
    } else {
      if (typeof project.meta.name !== "string") errors.push("meta.name must be a string");
      if (!project.meta.resolution || typeof project.meta.resolution.width !== "number") {
        errors.push("meta.resolution.width must be a number");
      }
      if (!project.meta.resolution || typeof project.meta.resolution.height !== "number") {
        errors.push("meta.resolution.height must be a number");
      }
    }

    validateWorld(project.world, "world", errors);

    if (!Array.isArray(project.scenes) || project.scenes.length === 0) {
      errors.push("scenes must be a non-empty array");
    } else {
      project.scenes.forEach(function validateScene(scene, index) {
        if (!scene || typeof scene !== "object") {
          errors.push("scenes[" + index + "] must be an object");
          return;
        }
        if (typeof scene.id !== "string" || !scene.id) {
          errors.push("scenes[" + index + "].id must be a non-empty string");
        }
        if (typeof scene.name !== "string" || !scene.name) {
          errors.push("scenes[" + index + "].name must be a non-empty string");
        }
        validateWorld(scene.world, "scenes[" + index + "].world", errors);
        if (!Array.isArray(scene.objects)) {
          errors.push("scenes[" + index + "].objects must be an array");
        }
      });
      if (typeof project.activeSceneId !== "string" || !project.activeSceneId) {
        errors.push("activeSceneId must be a non-empty string");
      } else if (!project.scenes.some(function hasActiveScene(scene) { return scene && scene.id === project.activeSceneId; })) {
        errors.push("activeSceneId must reference an existing scene");
      }
    }

    if (!Array.isArray(project.objects)) errors.push("objects must be an array");
    if (!Array.isArray(project.animations)) errors.push("animations must be an array");
    if (!Array.isArray(project.scripts)) errors.push("scripts must be an array");
    if (!Array.isArray(project.assets)) errors.push("assets must be an array");
    if (!project.build || typeof project.build !== "object") {
      errors.push("build is required and must be an object");
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function migrate(data) {
    if (!data || typeof data !== "object") {
      return createDefaultProject();
    }
    if (data.schemaVersion === CURRENT_VERSION) {
      return normalizeProjectScenes(deepClone(data));
    }

    // Wrap legacy or missing-version data into v1
    const project = createDefaultProject({
      name: (data.meta && data.meta.name) || "Migrated Project",
    });

    // Preserve world data if it looks like serialized worldSpace
    if (data.world && typeof data.world.cols === "number") {
      project.world = deepClone(data.world);
    } else if (data.cols && data.grid) {
      // Raw worldSpace serialization at top level
      project.world = {
        cols: data.cols,
        rows: data.rows,
        defaultCell: data.defaultCell !== undefined ? data.defaultCell : null,
        grid: data.grid,
        elements: data.elements || [],
        meta: data.meta || {},
      };
    }

    if (typeof data.activeSceneId === "string" && data.activeSceneId) project.activeSceneId = data.activeSceneId;
    if (Array.isArray(data.objects)) project.objects = deepClone(data.objects);
    if (Array.isArray(data.scenes) && data.scenes.length > 0) {
      project.scenes = deepClone(data.scenes);
    } else {
      project.scenes = [createScene(project.activeSceneId || DEFAULT_SCENE_ID, "Main Scene", project.world, project.objects)];
    }
    if (Array.isArray(data.animations)) project.animations = deepClone(data.animations);
    if (Array.isArray(data.scripts)) project.scripts = deepClone(data.scripts);
    if (Array.isArray(data.assets)) project.assets = deepClone(data.assets);
    if (data.build && typeof data.build === "object") project.build = deepClone(data.build);
    if (data.settings && typeof data.settings === "object") {
      project.settings = {
        ...project.settings,
        ...deepClone(data.settings),
      };
    }

    project.schemaVersion = CURRENT_VERSION;
    return normalizeProjectScenes(project);
  }

  // Generate a unique ID for objects, scripts, animations
  let _idCounter = 0;
  function generateId(prefix) {
    _idCounter++;
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + _idCounter;
  }

  function createGameObject(name, x, y, options) {
    const opts = options || {};
    const type = opts.type || "generic";
    const isAudioType = type === "audio_source" || type === "music_source";
    return {
      id: opts.id || generateId("obj"),
      name: name || "Object",
      type,
      x: x || 0,
      y: y || 0,
      components: {
        Transform: { x: x || 0, y: y || 0, rotation: 0, scaleX: 1, scaleY: 1 },
        Grid: { cols: opts.cols || 10, rows: opts.rows || 10, cellSize: opts.cellSize || 24, visible: true, layerId: null },
        Sprite: { assetId: null, color: opts.color || "#4ade80", width: opts.width || 32, height: opts.height || 32 },
        Collider: { shape: "rect", width: opts.width || 32, height: opts.height || 32 },
        ScriptBinding: { scriptId: null },
        ScriptBindings: [],
        Animator: { clipId: null },
        ...(isAudioType
          ? {
              Sound: {
                assetId: null,
                category: type === "music_source" ? "music" : "sfx",
                autoplay: type === "music_source",
                loop: type === "music_source",
                volume: 1,
                maxDistance: type === "music_source" ? 0 : 320,
              },
            }
          : {}),
      },
    };
  }

  function createScript(name, source, options) {
    const opts = options || {};
    const lang = opts.language || 'javascript';
    const ext = lang === 'javascript' ? 'js' : lang === 'typescript' ? 'ts' : lang === 'lua' ? 'lua' : lang === 'python' ? 'py' : lang === 'css' ? 'css' : 'js';
    const safeName = (name || 'NewScript').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const defaultSource = lang === 'css'
      ? "/* Loaded when bound to an active component */\n#ui-root {\n  pointer-events: none;\n}\n"
      : "function onInit(self, engine) {\n  // Called once when the game starts\n}\n\nfunction onUpdate(self, engine, dt) {\n  // Called every frame\n}\n";
    return {
      id: opts.id || generateId("script"),
      name: name || "NewScript",
      filePath: opts.filePath || `scripts/${safeName}.${ext}`,
      language: lang,
      source: source || defaultSource,
    };
  }

  function getScriptFileName(script) {
    if (script.filePath) return script.filePath;
    const lang = script.language || 'javascript';
    const ext = lang === 'javascript' ? 'js' : lang === 'typescript' ? 'ts' : lang === 'lua' ? 'lua' : lang === 'python' ? 'py' : lang === 'css' ? 'css' : 'js';
    const safeName = (script.name || 'NewScript').toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `scripts/${safeName}.${ext}`;
  }

  function createAnimationClip(name, options) {
    const opts = options || {};
    return {
      id: generateId("anim"),
      name: name || "NewClip",
      duration: opts.duration || 1.0,
      loop: opts.loop !== false,
      tracks: [],
    };
  }

  return {
    CURRENT_VERSION: CURRENT_VERSION,
    createDefaultProject: createDefaultProject,
    validate: validate,
    migrate: migrate,
    createScene: createScene,
    generateId: generateId,
    createGameObject: createGameObject,
    createScript: createScript,
    getScriptFileName: getScriptFileName,
    createAnimationClip: createAnimationClip,
  };
});
