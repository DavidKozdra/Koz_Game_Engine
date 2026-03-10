(function initProjectSchemaLib(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createProjectSchemaApi() {

  const CURRENT_VERSION = 1;

  function createDefaultProject(options) {
    const opts = options || {};
    return {
      schemaVersion: CURRENT_VERSION,
      meta: {
        name: opts.name || "Untitled Project",
        version: "1.0.0",
        resolution: { width: opts.width || 960, height: opts.height || 540 },
        engineVersion: "0.1.0",
      },
      world: {
        cols: opts.cols || 30,
        rows: opts.rows || 20,
        defaultCell: opts.defaultCell !== undefined ? opts.defaultCell : null,
        grid: createDefaultGrid(opts.cols || 30, opts.rows || 20, opts.defaultCell !== undefined ? opts.defaultCell : null),
        elements: [],
        meta: {},
      },
      objects: [],
      animations: [],
      scripts: [],
      assets: [],
      build: {
        profile: "web-prod",
        pwa: false,
      },
      settings: {
        preferredEditor: "vscode",
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
    if (!project.world || typeof project.world !== "object") {
      errors.push("world is required and must be an object");
    } else {
      if (typeof project.world.cols !== "number" || project.world.cols < 1) {
        errors.push("world.cols must be a positive number");
      }
      if (typeof project.world.rows !== "number" || project.world.rows < 1) {
        errors.push("world.rows must be a positive number");
      }
      if (!Array.isArray(project.world.grid)) {
        errors.push("world.grid must be an array");
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
      return JSON.parse(JSON.stringify(data));
    }

    // Wrap legacy or missing-version data into v1
    const project = createDefaultProject({
      name: (data.meta && data.meta.name) || "Migrated Project",
    });

    // Preserve world data if it looks like serialized worldSpace
    if (data.world && typeof data.world.cols === "number") {
      project.world = JSON.parse(JSON.stringify(data.world));
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

    if (Array.isArray(data.objects)) project.objects = data.objects;
    if (Array.isArray(data.animations)) project.animations = data.animations;
    if (Array.isArray(data.scripts)) project.scripts = data.scripts;
    if (Array.isArray(data.assets)) project.assets = data.assets;
    if (data.build && typeof data.build === "object") project.build = data.build;

    project.schemaVersion = CURRENT_VERSION;
    return project;
  }

  // Generate a unique ID for objects, scripts, animations
  let _idCounter = 0;
  function generateId(prefix) {
    _idCounter++;
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + _idCounter;
  }

  function createGameObject(name, x, y, options) {
    const opts = options || {};
    return {
      id: opts.id || generateId("obj"),
      name: name || "Object",
      type: opts.type || "generic",
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
      },
    };
  }

  function createScript(name, source, options) {
    const opts = options || {};
    const lang = opts.language || 'javascript';
    const ext = lang === 'javascript' ? 'js' : lang === 'typescript' ? 'ts' : lang === 'lua' ? 'lua' : lang === 'python' ? 'py' : 'js';
    const safeName = (name || 'NewScript').toLowerCase().replace(/[^a-z0-9]/g, '_');
    return {
      id: opts.id || generateId("script"),
      name: name || "NewScript",
      filePath: opts.filePath || `scripts/${safeName}.${ext}`,
      language: lang,
      source: source || "function onInit(self, engine) {\n  // Called once when the game starts\n}\n\nfunction onUpdate(self, engine, dt) {\n  // Called every frame\n}\n",
    };
  }

  function getScriptFileName(script) {
    if (script.filePath) return script.filePath;
    const lang = script.language || 'javascript';
    const ext = lang === 'javascript' ? 'js' : lang === 'typescript' ? 'ts' : lang === 'lua' ? 'lua' : lang === 'python' ? 'py' : 'js';
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
    generateId: generateId,
    createGameObject: createGameObject,
    createScript: createScript,
    getScriptFileName: getScriptFileName,
    createAnimationClip: createAnimationClip,
  };
});
