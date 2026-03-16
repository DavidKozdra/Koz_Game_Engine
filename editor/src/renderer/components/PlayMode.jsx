import React, { useRef, useEffect, useCallback } from 'react';
import { getCellType, normalizeCellTypeId } from '../state/projectModel.js';
import { buildWorldSparseIndex, queryWorldSparseIndex } from '../lib/worldSparseIndex.js';
import {
  createObjectSpatialIndex,
  queryObjectSpatialIndex,
  rebuildObjectSpatialIndex,
  syncObjectSpatialIndex,
} from '../lib/objectSpatialIndex.js';

const TAILWIND_RE = /@apply\s|@tailwind\s|@import\s+["']tailwindcss["']|@theme\s/;
let tailwindLoaded = false;
function needsTailwind(source) { return TAILWIND_RE.test(source); }
async function ensureTailwind() {
  if (tailwindLoaded) return;
  await import('@tailwindcss/browser');
  tailwindLoaded = true;
}

let sucraseTransform = null;
async function ensureSucrase() {
  if (sucraseTransform) return;
  const mod = await import('sucrase');
  sucraseTransform = mod.transform;
}
function transpileTS(source) {
  if (!sucraseTransform) return source;
  try {
    return sucraseTransform(source, { transforms: ['typescript'] }).code;
  } catch (e) {
    throw new Error(`TypeScript error: ${e.message}`);
  }
}

/**
 * In-editor play mode.
 * Runs the game in an iframe-like canvas overlay using p5.js-style runtime.
 * State is fully isolated — stopping restores the original project data.
 */

const CELL_SIZE = 24;
const PLAY_OBJECT_CULL_MARGIN = CELL_SIZE * 4;
const PLAY_RENDER_MODE_WEBGL_3D = 'webgl-3d';
const DEFAULT_SCENE_LIGHTING = {
  enabled: false,
  ambientColor: '#0b1220',
  ambientIntensity: 0.35,
  overlayOpacity: 0.82,
  fogColor: '#07111d',
  fogDensity: 0.65,
};
const DEFAULT_LIGHT_COMPONENT = {
  enabled: true,
  color: '#ffd27a',
  intensity: 1,
  radius: 180,
  falloff: 0.65,
  offsetX: 0,
  offsetY: 0,
  height: 18,
};

export function usePlayMode(project, onLog) {
  const stateRef = useRef(null);
  const canvasRef = useRef(null);
  const canvas2dRef = useRef(null);
  const canvas3dRef = useRef(null);
  const uiRootRef = useRef(null);
  const rafRef = useRef(null);
  const keysRef = useRef(new Set());
  const imageCacheRef = useRef(new Map());
  const globalsRef = useRef({
    hasKozUIManager: false,
    prevKozUIManager: undefined,
    hasUiManager: false,
    prevUiManager: undefined,
    hasSceneManager: false,
    prevSceneManager: undefined,
    hasLightingManager: false,
    prevLightingManager: undefined,
  });

  const isPlaying = stateRef.current !== null && stateRef.current.running;

  const syncCanvasMode = useCallback((renderMode) => {
    const use3d = renderMode === PLAY_RENDER_MODE_WEBGL_3D;
    const canvas2d = canvas2dRef.current;
    const canvas3d = canvas3dRef.current;
    if (canvas2d) {
      canvas2d.style.display = use3d ? 'none' : 'block';
      canvas2d.dataset.kozPlayCanvas = '2d';
      canvas2d.dataset.kozPlayActive = use3d ? 'false' : 'true';
    }
    if (canvas3d) {
      canvas3d.style.display = use3d ? 'block' : 'none';
      canvas3d.dataset.kozPlayCanvas = '3d';
      canvas3d.dataset.kozPlayActive = use3d ? 'true' : 'false';
    }
    canvasRef.current = use3d ? (canvas3d || canvas2d) : (canvas2d || canvas3d);
  }, []);

  const start = useCallback(async () => {
    if (!project) return;

    // Deep clone project as runtime snapshot (isolate from editor)
    const snapshot = JSON.parse(JSON.stringify(project));
    const scriptFactoryCache = new Map();

    const scripts = {};
    const cssStyleElements = new Map();
    const animClips = snapshot.animations || [];

    // Index scripts
    (snapshot.scripts || []).forEach(s => { scripts[s.id] = s; });
    const scriptingConfig = snapshot.scripting || { engines: { javascript: true } };
    const assetById = new Map((snapshot.assets || []).map((a) => [a.id, a]));
    const prefabById = new Map((snapshot.prefabs || []).map((prefab) => [prefab.id, prefab]));
    const warnedMissingAssets = new Set();

    // Lazily load Tailwind CSS browser compiler if any CSS script uses Tailwind syntax
    const hasTailwind = Object.values(scripts).some(s => s.language === 'css' && needsTailwind(s.source || ''));
    const hasTypeScript = Object.values(scripts).some(s => s.language === 'typescript');
    if (hasTailwind) await ensureTailwind();
    if (hasTypeScript) await ensureSucrase();

    // Build console interceptor
    const makeConsole = () => ({
      log: (...args) => onLog({ type: 'log', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
      warn: (...args) => onLog({ type: 'warn', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
      error: (...args) => onLog({ type: 'error', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
    });
    const sandboxConsole = makeConsole();
    const applyCssScript = (script) => {
      if (!script || !script.id || cssStyleElements.has(script.id)) return;
      if (typeof document === 'undefined') return;
      const target = document.head || document.documentElement || document.body;
      if (!target) return;
      const styleNode = document.createElement('style');
      if (tailwindLoaded) styleNode.setAttribute('type', 'text/tailwindcss');
      styleNode.setAttribute('data-koz-play-css-script', script.id);
      styleNode.textContent = String(script.source || '');
      target.appendChild(styleNode);
      cssStyleElements.set(script.id, styleNode);
    };
    const normalizeLookupValue = (value) => (typeof value === 'string' ? value.trim() : '');
    const findRuntimeObjectByName = (objects, value) => {
      const lookup = normalizeLookupValue(value);
      if (!lookup) return null;
      const lower = lookup.toLowerCase();
      const list = Array.isArray(objects) ? objects : [];
      let caseInsensitiveMatch = null;
      for (const obj of list) {
        if (!obj) continue;
        const fields = [obj.name, obj.prefabName];
        for (const field of fields) {
          if (typeof field !== 'string' || !field) continue;
          if (field === lookup) return obj;
          if (!caseInsensitiveMatch && field.toLowerCase() === lower) caseInsensitiveMatch = obj;
        }
      }
      return caseInsensitiveMatch;
    };
    const findRuntimeObjectById = (objects, value) => {
      const lookup = normalizeLookupValue(value);
      if (!lookup) return null;
      const lower = lookup.toLowerCase();
      const list = Array.isArray(objects) ? objects : [];
      const exactId = list.find((obj) => obj && obj.id === lookup);
      if (exactId) return exactId;
      let caseInsensitiveMatch = null;
      for (const obj of list) {
        if (!obj) continue;
        const fields = [obj.sourceObjectId, obj.prefabId];
        for (const field of fields) {
          if (typeof field !== 'string' || !field) continue;
          if (field === lookup) return obj;
          if (!caseInsensitiveMatch && field.toLowerCase() === lower) caseInsensitiveMatch = obj;
        }
        if (!caseInsensitiveMatch && typeof obj.id === 'string' && obj.id.toLowerCase() === lower) {
          caseInsensitiveMatch = obj;
        }
      }
      return caseInsensitiveMatch;
    };
    const findRuntimeObjectsByType = (objects, type) => {
      const lookup = normalizeLookupValue(type);
      if (!lookup) return [];
      const lower = lookup.toLowerCase();
      return (objects || []).filter((obj) => obj && typeof obj.type === 'string' && (obj.type === lookup || obj.type.toLowerCase() === lower));
    };
    const findRuntimeObject = (objects, value) => {
      const lookup = normalizeLookupValue(value);
      if (!lookup) return null;
      return (
        findRuntimeObjectByName(objects, lookup) ||
        findRuntimeObjectById(objects, lookup) ||
        findRuntimeObjectsByType(objects, lookup)[0] ||
        null
      );
    };
    const buildRuntimeObject = (obj) => {
      const t = (obj.components && obj.components.Transform) || {};
      const prefab = obj && obj.prefabId ? prefabById.get(obj.prefabId) : null;
      const tx = Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0);
      const ty = Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0);
      const tro = Number.isFinite(t.rotation) ? t.rotation : 0;
      const tsx = Number.isFinite(t.scaleX) ? t.scaleX : 1;
      const tsy = Number.isFinite(t.scaleY) ? t.scaleY : 1;
      const sw = (obj.components && obj.components.Sprite && obj.components.Sprite.width) || 32;
      const sh = (obj.components && obj.components.Sprite && obj.components.Sprite.height) || 32;
      return {
        id: obj.id, name: obj.name, type: obj.type,
        prefabId: obj.prefabId || null,
        prefabName: prefab && prefab.name ? prefab.name : null,
        sourceObjectId: prefab && prefab.sourceObjectId ? prefab.sourceObjectId : null,
        x: tx, y: ty,
        rotation: tro,
        scaleX: tsx,
        scaleY: tsy,
        width: sw * tsx,
        height: sh * tsy,
        color: (obj.components && obj.components.Sprite && obj.components.Sprite.color) || '#4ade80',
        components: JSON.parse(JSON.stringify(obj.components || {})),
      };
    };
    const clearSceneCss = () => {
      cssStyleElements.forEach((node) => {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      });
      cssStyleElements.clear();
    };
    const warnMissingSpriteAssets = (objects) => {
      (objects || []).forEach((obj) => {
        const sprite = (obj.components && obj.components.Sprite) || {};
        const ids = [];
        if (sprite.assetId) ids.push(sprite.assetId);
        if (Array.isArray(sprite.frameAssetIds)) ids.push(...sprite.frameAssetIds);
        ids.forEach((id) => {
          if (!id || warnedMissingAssets.has(id)) return;
          const asset = assetById.get(id);
          if (!asset) {
            warnedMissingAssets.add(id);
            onLog({ type: 'warn', message: `Missing sprite asset: ${id}`, time: new Date().toLocaleTimeString() });
          }
        });
      });
    };
    const compileScriptFactory = (script) => {
      if (!script || !script.id) return null;
      const source = String(script.source || '');
      const language = script.language || 'javascript';
      const cached = scriptFactoryCache.get(script.id);
      if (cached && cached.source === source && cached.language === language) return cached.factory;
      const jsSource = language === 'typescript' ? transpileTS(source) : source;
      const factory = new Function('return (function(self, props, console, keyIsDown, LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW, SPACE) { ' + jsSource + ' return { onInit: typeof onInit==="function"?onInit:null, onUpdate: typeof onUpdate==="function"?onUpdate:null }; })')();
      scriptFactoryCache.set(script.id, { source, language, factory });
      return factory;
    };

    const state = {
      running: true,
      elapsed: 0,
      projectSnapshot: snapshot,
      activeSceneId: snapshot.activeSceneId || (((snapshot.scenes || [])[0] || {}).id) || 'scene_main',
      scene: null,
      pendingSceneId: null,
      renderMode: resolvePlayRenderMode(snapshot, snapshot.activeSceneId),
      world: snapshot.world,
      sceneLighting: normalizePlaySceneLighting(null),
      gameObjects: [],
      assetById,
      scriptInstances: [],
      animClips,
      keys: keysRef.current,
      cameraConfig: snapshot.camera || {},
      viewX: 0,
      viewY: 0,
      worldSparse: null,
      objectSpatialIndex: createObjectSpatialIndex(),
      objectLayerOrder: buildPlayObjectLayerOrder(snapshot),
      cssStyleElements,
      _animStates: new Map(),
      _clipIndex: new Map((animClips || []).map((c) => [c.id, c])),
      _debug: {
        canvasSignature: '',
        missingCanvasLogged: false,
      },
    };
    state.storageApi = createPlayStorageApi(snapshot);
    state.particleSystem = createPlayParticleSystem(assetById, imageCacheRef);
    state.render3D = createInitialPlay3DState(state);
    stateRef.current = state;
    syncCanvasMode(state.renderMode);

    const uiManager = createKozUIManager({
      rootRef: uiRootRef,
      onLog,
      getContext: () => {
        const scene = resolveRuntimeScene(state);
        return {
          elapsed: state.elapsed,
          gameState: readGameState(),
          sceneId: scene.id,
          sceneName: scene.name,
        };
      },
    });
    state.uiManager = uiManager;
    globalsRef.current = {
      hasKozUIManager: Object.prototype.hasOwnProperty.call(window, 'KozUIManager'),
      prevKozUIManager: window.KozUIManager,
      hasUiManager: Object.prototype.hasOwnProperty.call(window, 'uiManager'),
      prevUiManager: window.uiManager,
      hasSceneManager: Object.prototype.hasOwnProperty.call(window, 'sceneManager'),
      prevSceneManager: window.sceneManager,
      hasLightingManager: Object.prototype.hasOwnProperty.call(window, 'lightingManager'),
      prevLightingManager: window.lightingManager,
    };
    window.KozUIManager = uiManager;
    window.uiManager = uiManager;
    const renderer3d = createPlay3DController({ stateRef, canvasRef });
    state.renderer3dController = renderer3d;
    const updateSceneLightingState = (runtimeState, lightingPatch) => {
      if (!runtimeState) return normalizePlaySceneLighting(lightingPatch);
      const managerObject = getPlayLightingManagerObject(runtimeState);
      const normalized = normalizePlaySceneLighting(lightingPatch);
      if (managerObject) {
        if (!managerObject.components) managerObject.components = {};
        managerObject.components.LightingManager = { ...normalized };
      } else {
        if (runtimeState.scene && typeof runtimeState.scene === 'object') {
          runtimeState.scene.lighting = JSON.parse(JSON.stringify(normalized));
        }
        const scenes = Array.isArray(runtimeState.projectSnapshot && runtimeState.projectSnapshot.scenes)
          ? runtimeState.projectSnapshot.scenes
          : [];
        const sceneEntry = scenes.find((entry) => entry && entry.id === runtimeState.activeSceneId);
        if (sceneEntry) sceneEntry.lighting = JSON.parse(JSON.stringify(normalized));
      }
      runtimeState.sceneLighting = resolvePlayLightingSettings(runtimeState, runtimeState.scene || null);
      if (runtimeState.scene && typeof runtimeState.scene === 'object' && runtimeState.sceneLighting.enabled === false && !managerObject) {
        runtimeState.scene.lighting = JSON.parse(JSON.stringify(runtimeState.sceneLighting));
      }
      const scenes = Array.isArray(runtimeState.projectSnapshot && runtimeState.projectSnapshot.scenes)
        ? runtimeState.projectSnapshot.scenes
        : [];
      const sceneEntry = scenes.find((entry) => entry && entry.id === runtimeState.activeSceneId);
      if (sceneEntry && !managerObject) sceneEntry.lighting = JSON.parse(JSON.stringify(runtimeState.sceneLighting));
      if (runtimeState.render3D) {
        runtimeState.render3D.meshDirty = true;
        runtimeState.render3D.lightingSignature = '';
      }
      return runtimeState.sceneLighting;
    };
    const createPlayAnimatorApi = (rs) => {
      const resolveId = (t) => !t ? null : typeof t === 'string' ? t : t.id || null;
      const findObj = (id) => id ? rs.gameObjects.find((o) => o.id === id) || null : null;
      const ensureState = (id) => {
        let s = rs._animStates.get(id);
        if (!s) { s = { clipId: null, localTime: 0, speed: 1, playing: false, paused: false }; rs._animStates.set(id, s); }
        return s;
      };
      return {
        play(target, clipId) {
          const id = resolveId(target);
          if (!id) return false;
          const clip = rs._clipIndex.get(clipId);
          if (!clip) return false;
          const s = ensureState(id);
          s.clipId = clipId; s.localTime = 0; s.playing = true; s.paused = false;
          return true;
        },
        stop(target) {
          const id = resolveId(target);
          const s = id && rs._animStates.get(id);
          if (s) { s.playing = false; s.paused = false; s.localTime = 0; }
        },
        pause(target) {
          const id = resolveId(target);
          const s = id && rs._animStates.get(id);
          if (s && s.playing) s.paused = true;
        },
        resume(target) {
          const id = resolveId(target);
          const s = id && rs._animStates.get(id);
          if (s && s.paused) s.paused = false;
        },
        setSpeed(target, speed) {
          const id = resolveId(target);
          if (!id) return;
          ensureState(id).speed = Number.isFinite(speed) ? speed : 1;
        },
        isPlaying(target) {
          const id = resolveId(target);
          const s = id && rs._animStates.get(id);
          return !!(s && s.playing && !s.paused);
        },
        getClipId(target) {
          const id = resolveId(target);
          const s = id && rs._animStates.get(id);
          return s ? s.clipId : null;
        },
        setFrame(target, index) {
          const obj = findObj(resolveId(target));
          if (obj) obj._frameIndex = Math.max(0, Math.floor(Number(index) || 0));
        },
        getFrame(target) {
          const obj = findObj(resolveId(target));
          return obj && typeof obj._frameIndex === 'number' ? obj._frameIndex : 0;
        },
        getFrameCount(target) {
          const obj = findObj(resolveId(target));
          if (!obj) return 0;
          const sprite = obj.components && obj.components.Sprite;
          const ids = sprite && Array.isArray(sprite.frameAssetIds) ? sprite.frameAssetIds : [];
          return ids.length > 0 ? ids.length : (sprite && sprite.assetId ? 1 : 0);
        },
        setFPS(target, fps) {
          const obj = findObj(resolveId(target));
          if (!obj) return;
          const sprite = obj.components && obj.components.Sprite;
          if (sprite) sprite.fps = Number.isFinite(fps) ? fps : 8;
        },
      };
    };
    const createEngineForState = (runtimeState) => {
      const engine = {
        gameObjects: runtimeState.gameObjects,
        elapsed: runtimeState.elapsed,
        sceneId: runtimeState.activeSceneId,
        uiManager: runtimeState.uiManager || null,
        audio: runtimeState.audioSystem ? runtimeState.audioSystem.api : null,
        storage: runtimeState.storageApi || null,
        save: runtimeState.storageApi || null,
        particles: runtimeState.particleSystem ? runtimeState.particleSystem.api : null,
        renderer3d: runtimeState.renderer3dController || null,
        sceneManager: runtimeState.sceneManager || null,
        lightingManager: runtimeState.lightingManager || null,
        lighting: runtimeState.lightingManager || null,
        findObject: (value) => findRuntimeObject(runtimeState.gameObjects, value),
        findObjectById: (value) => findRuntimeObjectById(runtimeState.gameObjects, value),
        findObjectsByType: (type) => findRuntimeObjectsByType(runtimeState.gameObjects, type),
        findObjectByType: (type) => findRuntimeObjectsByType(runtimeState.gameObjects, type)[0] || null,
        keyIsDown: (code) => keysRef.current.has(code),
        viewport: {
          width: canvasRef.current ? canvasRef.current.width : 960,
          height: canvasRef.current ? canvasRef.current.height : 540,
        },
        animator: createPlayAnimatorApi(runtimeState),
      };
      const worldMetrics = resolveWorldMetrics(runtimeState.world, CELL_SIZE);
      if (worldMetrics) engine.world = createPlayWorldApi(runtimeState.projectSnapshot || {}, runtimeState, worldMetrics);
      return engine;
    };
    const updateSceneManagerState = (runtimeState) => {
      if (!runtimeState || !runtimeState.sceneManager) return;
      runtimeState.sceneManager.activeSceneId = runtimeState.activeSceneId;
      runtimeState.sceneManager.currentSceneId = runtimeState.activeSceneId;
      runtimeState.sceneManager.activeScene = runtimeState.scene
        ? { id: runtimeState.scene.id, name: runtimeState.scene.name, renderMode: runtimeState.renderMode }
        : null;
    };
    const hydrateScene = (runtimeState, sceneId, runInit = true) => {
      if (!runtimeState || !runtimeState.projectSnapshot) return false;
      const scenes = Array.isArray(runtimeState.projectSnapshot.scenes) ? runtimeState.projectSnapshot.scenes : [];
      const nextScene = scenes.find((entry) => entry && entry.id === sceneId) || scenes[0] || {
        id: sceneId || runtimeState.activeSceneId || 'scene_main',
        name: 'Main Scene',
        renderMode: resolvePlayRenderMode(runtimeState.projectSnapshot, sceneId),
        world: runtimeState.projectSnapshot.world || {},
        objects: runtimeState.projectSnapshot.objects || [],
      };

      runtimeState.activeSceneId = nextScene.id;
      runtimeState.scene = nextScene;
      runtimeState.projectSnapshot.activeSceneId = nextScene.id;
      runtimeState.projectSnapshot.world = nextScene.world || runtimeState.projectSnapshot.world;
      runtimeState.projectSnapshot.objects = nextScene.objects || runtimeState.projectSnapshot.objects;
      runtimeState.world = JSON.parse(JSON.stringify(nextScene.world || runtimeState.projectSnapshot.world || {}));
      runtimeState.gameObjects.splice(0, runtimeState.gameObjects.length, ...((nextScene.objects || runtimeState.projectSnapshot.objects || []).map(buildRuntimeObject)));
      rebuildObjectSpatialIndex(runtimeState.objectSpatialIndex, runtimeState.gameObjects);
      runtimeState.sceneLighting = resolvePlayLightingSettings(runtimeState, nextScene);
      runtimeState.scriptInstances = [];
      runtimeState.pendingSceneId = null;
      runtimeState._animStates.clear();
      runtimeState._clipIndex = new Map((animClips || []).map((c) => [c.id, c]));
      if (runtimeState.particleSystem) runtimeState.particleSystem.clear();
      runtimeState.gameObjects.forEach((obj) => {
        const anim = obj.components && obj.components.Animator;
        if (anim && anim.clipId && runtimeState._clipIndex.has(anim.clipId)) {
          runtimeState._animStates.set(obj.id, { clipId: anim.clipId, localTime: 0, speed: 1, playing: !!anim.autoplay, paused: false });
        }
      });
      if (runtimeState.audioSystem && runtimeState.audioSystem.api) runtimeState.audioSystem.api.stopAll();
      clearSceneCss();
      if (runtimeState.uiManager && typeof runtimeState.uiManager.clear === 'function') runtimeState.uiManager.clear();
      if (runtimeState.render3D && runtimeState.render3D.runtime) destroyPlayWebGLRuntime(runtimeState.render3D.runtime);
      runtimeState.renderMode = resolvePlayRenderMode(runtimeState.projectSnapshot, nextScene.id);
      runtimeState.render3D = createInitialPlay3DState(runtimeState);
      syncCanvasMode(runtimeState.renderMode);

      runtimeState.gameObjects.forEach((obj) => {
        const bindings = obj.components.ScriptBindings || [];
        const legacy = obj.components.ScriptBinding;
        if (legacy && legacy.scriptId) bindings.push({ scriptId: legacy.scriptId, active: true, properties: {} });

        bindings.forEach((binding) => {
          if (!binding.active || !binding.scriptId || !scripts[binding.scriptId]) return;
          try {
            const language = scripts[binding.scriptId].language || 'javascript';
            if (language === 'css') {
              applyCssScript(scripts[binding.scriptId]);
              return;
            }
            const isTS = language === 'typescript';
            const enabled = language === 'javascript' || isTS || !!(scriptingConfig.engines && scriptingConfig.engines[language]);
            if (!enabled) {
              onLog({ type: 'warn', message: `Script "${scripts[binding.scriptId].name}" skipped (${language} runtime unavailable in play mode).`, time: new Date().toLocaleTimeString() });
              return;
            }
            const factory = compileScriptFactory(scripts[binding.scriptId]);
            const props = binding.properties ? JSON.parse(JSON.stringify(binding.properties)) : {};
            const hooks = factory(obj, props, sandboxConsole, (code) => keysRef.current.has(code), 37, 39, 38, 40, 32);
            runtimeState.scriptInstances.push({ obj, hooks, props });
          } catch (e) {
            onLog({ type: 'error', message: `Script compile error: ${e.message}`, time: new Date().toLocaleTimeString() });
          }
        });
      });

      warnMissingSpriteAssets(runtimeState.gameObjects);
      const baseCellLayer = ((((runtimeState.projectSnapshot || {}).layers || {}).cells || [])
        .filter((layer) => layer.visible !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0))[0] || { id: null }).id;
      runtimeState.worldSparse = buildWorldSparseIndex(runtimeState.world, (cell) => {
        if (normalizeCellTypeId(cell) === 'empty') return null;
        const type = getCellType(runtimeState.projectSnapshot, cell);
        return { type, layerId: type.layerId || baseCellLayer };
      });
      const initialCamera = resolvePlayCamera(runtimeState);
      const initialView = resolveDesiredView(
        runtimeState,
        initialCamera,
        0,
        true,
        canvasRef.current ? canvasRef.current.width : 960,
        canvasRef.current ? canvasRef.current.height : 540,
      );
      runtimeState.viewX = initialView.x;
      runtimeState.viewY = initialView.y;
      updateSceneManagerState(runtimeState);
      onLog({
        type: 'info',
        message: `Play hydrate | scene ${nextScene.id} | render ${runtimeState.renderMode} | objects ${runtimeState.gameObjects.length} | visible ${getVisiblePlayObjectCount(runtimeState)} | filled chunks ${runtimeState.worldSparse && runtimeState.worldSparse.chunks ? runtimeState.worldSparse.chunks.size : 0}`,
        time: new Date().toLocaleTimeString(),
      });

      if (runInit) {
        const engine = createEngineForState(runtimeState);
        runtimeState.scriptInstances.forEach((inst) => {
          if (!inst.hooks.onInit) return;
          try { inst.hooks.onInit(inst.obj, engine); }
          catch (e) { onLog({ type: 'error', message: `onInit error: ${e.message}`, time: new Date().toLocaleTimeString() }); }
        });
        if (runtimeState.audioSystem) runtimeState.audioSystem.autoplayFromComponents();
      }
      return true;
    };
    state.createEngine = () => createEngineForState(stateRef.current || state);
    state.hydrateScene = (sceneId, runInit = true) => hydrateScene(stateRef.current || state, sceneId, runInit);
    state.syncSceneManager = () => updateSceneManagerState(stateRef.current || state);
    state.audioSystem = createPlayAudioSystem({
      assetById,
      gameObjects: state.gameObjects,
      onLog,
      getNow: () => new Date().toLocaleTimeString(),
    });
    state.lightingManager = {
      isEnabled() {
        const runtimeState = stateRef.current;
        return !!(runtimeState && resolvePlayLightingSettings(runtimeState, runtimeState.scene).enabled);
      },
      getSettings() {
        const runtimeState = stateRef.current;
        return resolvePlayLightingSettings(runtimeState, runtimeState && runtimeState.scene);
      },
      getManagerObject() {
        return getPlayLightingManagerObject(stateRef.current);
      },
      setEnabled(enabled) {
        const runtimeState = stateRef.current;
        if (!runtimeState || !runtimeState.running) return false;
        updateSceneLightingState(runtimeState, {
          ...resolvePlayLightingSettings(runtimeState, runtimeState.scene),
          enabled: !!enabled,
        });
        return true;
      },
      setSettings(patch = {}) {
        const runtimeState = stateRef.current;
        if (!runtimeState || !runtimeState.running) return null;
        return updateSceneLightingState(runtimeState, {
          ...resolvePlayLightingSettings(runtimeState, runtimeState.scene),
          ...(patch || {}),
        });
      },
      getLights() {
        const runtimeState = stateRef.current;
        return getPlayActiveLights(runtimeState);
      },
      getLight(objectId) {
        const runtimeState = stateRef.current;
        if (!runtimeState || !objectId) return null;
        const obj = runtimeState.gameObjects.find((entry) => entry.id === objectId);
        return obj && obj.components && obj.components.Light ? normalizePlayLightComponent(obj.components.Light) : null;
      },
      setLight(objectId, patch = {}) {
        const runtimeState = stateRef.current;
        if (!runtimeState || !runtimeState.running || !objectId) return null;
        const obj = runtimeState.gameObjects.find((entry) => entry.id === objectId);
        if (!obj) return null;
        if (!obj.components) obj.components = {};
        obj.components.Light = normalizePlayLightComponent({
          ...normalizePlayLightComponent(obj.components.Light),
          ...(patch || {}),
        });
        if (runtimeState.render3D) {
          runtimeState.render3D.meshDirty = true;
          runtimeState.render3D.lightingSignature = '';
        }
        return { ...obj.components.Light };
      },
      refresh() {
        const runtimeState = stateRef.current;
        if (!runtimeState || !runtimeState.running) return false;
        if (runtimeState.render3D) {
          runtimeState.render3D.meshDirty = true;
          runtimeState.render3D.lightingSignature = '';
        }
        return true;
      },
    };
    const queueSceneOffset = (offset) => {
      const runtimeState = stateRef.current;
      if (!runtimeState || !runtimeState.running) return false;
      const scenes = Array.isArray(runtimeState.projectSnapshot && runtimeState.projectSnapshot.scenes)
        ? runtimeState.projectSnapshot.scenes.filter(Boolean)
        : [];
      if (!scenes.length) return false;
      const currentIndex = Math.max(0, scenes.findIndex((scene) => scene.id === runtimeState.activeSceneId));
      const nextIndex = currentIndex + offset;
      if (nextIndex < 0 || nextIndex >= scenes.length) return false;
      const nextScene = scenes[nextIndex];
      if (!nextScene || !nextScene.id) return false;
      runtimeState.pendingSceneId = nextScene.id;
      return true;
    };
    state.sceneManager = {
      activeSceneId: state.activeSceneId,
      currentSceneId: state.activeSceneId,
      activeScene: null,
      getActiveScene() {
        const runtimeState = stateRef.current;
        return runtimeState && runtimeState.scene
          ? { id: runtimeState.scene.id, name: runtimeState.scene.name, renderMode: runtimeState.renderMode }
          : null;
      },
      loadScene(sceneId) {
        const runtimeState = stateRef.current;
        if (!runtimeState || !runtimeState.running || !sceneId) return false;
        runtimeState.pendingSceneId = sceneId;
        return true;
      },
      loadSceneOffset(offset = 0) {
        if (!Number.isFinite(offset) || offset === 0) return false;
        return queueSceneOffset(Math.trunc(offset));
      },
      loadNextScene() {
        return queueSceneOffset(1);
      },
      loadPreviousScene() {
        return queueSceneOffset(-1);
      },
      reloadScene() {
        const runtimeState = stateRef.current;
        if (!runtimeState || !runtimeState.running) return false;
        runtimeState.pendingSceneId = runtimeState.activeSceneId;
        return true;
      },
    };
    window.sceneManager = state.sceneManager;
    window.lightingManager = state.lightingManager;
    onLog({
      type: 'info',
      message: `Play bootstrap | scene ${state.activeSceneId} | render ${state.renderMode} | scenes ${Array.isArray(snapshot.scenes) ? snapshot.scenes.length : 0} | top-level objects ${Array.isArray(snapshot.objects) ? snapshot.objects.length : 0} | canvas ${canvasRef.current ? 'ready' : 'pending mount'}`,
      time: new Date().toLocaleTimeString(),
    });
    state.hydrateScene(state.activeSceneId, true);

    onLog({ type: 'info', message: 'Play mode started', time: new Date().toLocaleTimeString() });
    startLoop();
  }, [project, onLog, syncCanvasMode]);

  const stop = useCallback(() => {
    const state = stateRef.current;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (state && state.uiManager && typeof state.uiManager.destroy === 'function') state.uiManager.destroy();
    if (state && state.cssStyleElements) {
      state.cssStyleElements.forEach((node) => {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      });
      state.cssStyleElements.clear();
    }
    if (state && state.audioSystem) {
      state.audioSystem.destroy();
    }
    if (state && state.particleSystem) {
      state.particleSystem.clear();
    }
    if (state && state.render3D && state.render3D.runtime) {
      destroyPlayWebGLRuntime(state.render3D.runtime);
      state.render3D.runtime = null;
    }
    if (typeof document !== 'undefined' && document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
    const saved = globalsRef.current;
    if (saved.hasKozUIManager) window.KozUIManager = saved.prevKozUIManager;
    else delete window.KozUIManager;
    if (saved.hasUiManager) window.uiManager = saved.prevUiManager;
    else delete window.uiManager;
    if (saved.hasSceneManager) window.sceneManager = saved.prevSceneManager;
    else delete window.sceneManager;
    if (saved.hasLightingManager) window.lightingManager = saved.prevLightingManager;
    else delete window.lightingManager;
    stateRef.current = null;
    onLog({ type: 'info', message: 'Play mode stopped', time: new Date().toLocaleTimeString() });
  }, [onLog]);

  const execute = useCallback((code) => {
    const state = stateRef.current;
    if (!state || !state.running) {
      onLog({ type: 'error', message: 'Cannot execute: game not running', time: new Date().toLocaleTimeString() });
      return;
    }
    try {
      const gameObjects = state.gameObjects;
      const elapsed = state.elapsed;
      const findObject = (id) => gameObjects.find(o => o.id === id) || null;
      const cmdConsole = {
        log: (...args) => onLog({ type: 'log', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
        warn: (...args) => onLog({ type: 'warn', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
        error: (...args) => onLog({ type: 'error', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
      };
      const fn = new Function('gameObjects', 'elapsed', 'findObject', 'console', code);
      fn(gameObjects, elapsed, findObject, cmdConsole);
    } catch (e) {
      onLog({ type: 'error', message: `Command error: ${e.message}`, time: new Date().toLocaleTimeString() });
    }
  }, [onLog]);

  function startLoop() {
    let lastTime = performance.now();

    function tick(now) {
      const state = stateRef.current;
      if (!state || !state.running) return;

      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;
      state.elapsed += dt;

      if (state.pendingSceneId && typeof state.hydrateScene === 'function') {
        state.hydrateScene(state.pendingSceneId, true);
      }

      // Evaluate per-object animations (driven by Animator component / engine.animator.play)
      state._animStates.forEach((animState, objId) => {
        if (!animState.playing || animState.paused) return;
        animState.localTime += dt * animState.speed;
        const clip = state._clipIndex.get(animState.clipId);
        if (!clip || !clip.tracks) return;
        const dur = clip.duration || 1;
        if (clip.loop) {
          animState.localTime = animState.localTime % dur;
        } else if (animState.localTime >= dur) {
          animState.localTime = dur;
          animState.playing = false;
        }
        clip.tracks.forEach(track => {
          if (track.targetObjectId !== objId) return;
          const obj = state.gameObjects.find(o => o.id === objId);
          if (!obj || !track.keyframes || track.keyframes.length === 0) return;
          obj[track.property] = sampleTrack(track, animState.localTime);
        });
      });
      // Evaluate unbound clips (tracks targeting objects without an anim state)
      state.animClips.forEach(clip => {
        if (!clip.tracks) return;
        const dur = clip.duration || 1;
        const t = clip.loop ? (state.elapsed % dur) : Math.min(state.elapsed, dur);
        clip.tracks.forEach(track => {
          if (state._animStates.has(track.targetObjectId)) return;
          const obj = state.gameObjects.find(o => o.id === track.targetObjectId);
          if (!obj || !track.keyframes || track.keyframes.length === 0) return;
          obj[track.property] = sampleTrack(track, t);
        });
      });

      // Engine API
      let runtimeScene = resolveRuntimeScene(state);
      if (runtimeScene.id && runtimeScene.id !== state.activeSceneId && typeof state.hydrateScene === 'function') {
        state.hydrateScene(runtimeScene.id, true);
        runtimeScene = resolveRuntimeScene(state);
      }
      state.activeSceneId = runtimeScene.id || state.activeSceneId;
      const engine = typeof state.createEngine === 'function'
        ? state.createEngine()
        : {
            gameObjects: state.gameObjects,
            elapsed: state.elapsed,
            sceneId: state.activeSceneId,
            uiManager: state.uiManager || null,
            audio: state.audioSystem ? state.audioSystem.api : null,
            storage: state.storageApi || null,
            save: state.storageApi || null,
            particles: state.particleSystem ? state.particleSystem.api : null,
            renderer3d: state.renderer3dController || null,
            sceneManager: state.sceneManager || null,
            lightingManager: state.lightingManager || null,
            lighting: state.lightingManager || null,
            findObject: (value) => findRuntimeObject(state.gameObjects, value),
            findObjectById: (value) => findRuntimeObjectById(state.gameObjects, value),
            findObjectsByType: (type) => findRuntimeObjectsByType(state.gameObjects, type),
            findObjectByType: (type) => findRuntimeObjectsByType(state.gameObjects, type)[0] || null,
            keyIsDown: (code) => keysRef.current.has(code),
            viewport: {
              width: canvasRef.current ? canvasRef.current.width : 960,
              height: canvasRef.current ? canvasRef.current.height : 540,
            },
          };

      const worldMetrics = engine.world || resolveWorldMetrics(state.world, CELL_SIZE);
      if (worldMetrics) {
        state.gameObjects.forEach((obj) => {
          if (Object.prototype.hasOwnProperty.call(obj, 'worldWidth')) obj.worldWidth = worldMetrics.width;
          if (Object.prototype.hasOwnProperty.call(obj, 'worldHeight')) obj.worldHeight = worldMetrics.height;
          if (Object.prototype.hasOwnProperty.call(obj, 'worldMinX')) obj.worldMinX = worldMetrics.minX;
          if (Object.prototype.hasOwnProperty.call(obj, 'worldMinY')) obj.worldMinY = worldMetrics.minY;
          if (Object.prototype.hasOwnProperty.call(obj, 'worldMaxX')) obj.worldMaxX = worldMetrics.maxX;
          if (Object.prototype.hasOwnProperty.call(obj, 'worldMaxY')) obj.worldMaxY = worldMetrics.maxY;
        });
      }

      // Snapshot positions before scripts so we can detect which was changed
      const prePositions = state.gameObjects.map((obj) => {
        const t = (obj.components && obj.components.Transform) || {};
        return {
          tx: t.x,
          ty: t.y,
          transformRotation: t.rotation,
          transformScaleX: t.scaleX,
          transformScaleY: t.scaleY,
        };
      });

      // Script updates
      state.scriptInstances.forEach(inst => {
        if (inst.hooks.onUpdate) {
          try { inst.hooks.onUpdate(inst.obj, engine, dt); }
          catch (e) { onLog({ type: 'error', message: `onUpdate error: ${e.message}`, time: new Date().toLocaleTimeString() }); }
        }
      });

      if (state.uiManager && typeof state.uiManager.updateAll === 'function') {
        try {
          state.uiManager.updateAll({ dt, elapsed: state.elapsed, sceneId: state.activeSceneId, gameState: readGameState() });
        } catch (e) {
          onLog({ type: 'error', message: `UI update error: ${e.message}`, time: new Date().toLocaleTimeString() });
        }
      }

      // Sync obj.x/y <-> Transform.x/y (scripts may update either)
      state.gameObjects.forEach((obj, i) => {
        const t = obj.components && obj.components.Transform;
        if (!t) return;
        const pre = prePositions[i];
        // If script changed Transform, prefer that; otherwise use obj.x/y
        if (Number.isFinite(t.x) && t.x !== pre.tx) obj.x = t.x;
        if (Number.isFinite(t.y) && t.y !== pre.ty) obj.y = t.y;
        if (Number.isFinite(t.rotation) && t.rotation !== pre.transformRotation) obj.rotation = t.rotation;
        if (Number.isFinite(t.scaleX) && t.scaleX !== pre.transformScaleX) obj.scaleX = t.scaleX;
        if (Number.isFinite(t.scaleY) && t.scaleY !== pre.transformScaleY) obj.scaleY = t.scaleY;
        // Keep both in sync
        t.x = obj.x;
        t.y = obj.y;
        t.rotation = obj.rotation;
        t.scaleX = obj.scaleX;
        t.scaleY = obj.scaleY;
        const sprite = (obj.components && obj.components.Sprite) || {};
        const spriteWidth = Number.isFinite(sprite.width) ? sprite.width : 32;
        const spriteHeight = Number.isFinite(sprite.height) ? sprite.height : 32;
        const scaleX = Number.isFinite(obj.scaleX) ? obj.scaleX : 1;
        const scaleY = Number.isFinite(obj.scaleY) ? obj.scaleY : 1;
        obj.width = spriteWidth * scaleX;
        obj.height = spriteHeight * scaleY;
      });

      resolveCellCollisions(state);
      state.gameObjects.forEach((obj) => {
        const t = obj.components && obj.components.Transform;
        if (!t) return;
        t.x = obj.x;
        t.y = obj.y;
      });
      syncObjectSpatialIndex(state.objectSpatialIndex, state.gameObjects);
      if (state.particleSystem) state.particleSystem.update(dt, state.gameObjects);

      // Render
      const camera = resolvePlayCamera(state);
      if (state.audioSystem) state.audioSystem.updateListener(camera, state.gameObjects);
      const viewW = canvasRef.current ? canvasRef.current.width : 960;
      const viewH = canvasRef.current ? canvasRef.current.height : 540;
      const desired = resolveDesiredView(state, camera, dt, false, viewW, viewH);
      const speed = Number.isFinite(camera.speed) ? Math.max(0.1, camera.speed) : 8;
      const maxSpeed = Number.isFinite(camera.maxSpeed) ? Math.max(60, camera.maxSpeed) : Infinity;
      state.viewX = smoothAxis(state.viewX || 0, desired.x, dt, speed, maxSpeed);
      state.viewY = smoothAxis(state.viewY || 0, desired.y, dt, speed, maxSpeed);
      state.sceneLighting = resolvePlayLightingSettings(state, state.scene);
      if (state.renderMode === PLAY_RENDER_MODE_WEBGL_3D && state.render3D) {
        const lightingSignature = buildPlayLightingSignature(state);
        if (lightingSignature !== state.render3D.lightingSignature) {
          state.render3D.lightingSignature = lightingSignature;
          state.render3D.meshDirty = true;
        }
      }
      renderFrame(state);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function renderFrame(state) {
    if (state && state.renderMode === PLAY_RENDER_MODE_WEBGL_3D) {
      renderFrame3D(state);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      if (state && state._debug && !state._debug.missingCanvasLogged) {
        state._debug.missingCanvasLogged = true;
        onLog({
          type: 'warn',
          message: `Play render skipped | active canvas missing | scene ${state.activeSceneId} | render ${state.renderMode}`,
          time: new Date().toLocaleTimeString(),
        });
      }
      return;
    }
    if (state && state._debug) state._debug.missingCanvasLogged = false;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const blankScene = isPlaySceneBlank(state);

    ctx.clearRect(0, 0, w, h);
    if (blankScene) {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#102033');
      bg.addColorStop(1, '#182f45');
      ctx.fillStyle = bg;
    } else {
      ctx.fillStyle = '#0b1220';
    }
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-(state.viewX || 0), -(state.viewY || 0));
    renderPlayWorldGuides(ctx, state, w, h, { layer: 'background' });

    // World
    const world = state.world;
    if (world && world.grid) {
      const proj = state.projectSnapshot || {};
      const rows = Number.isFinite(world.rows) ? world.rows : world.grid.length;
      const cols = Number.isFinite(world.cols) ? world.cols : ((world.grid[0] && world.grid[0].length) || 0);
      const offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
      const offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
      const viewX = Number.isFinite(state.viewX) ? state.viewX : 0;
      const viewY = Number.isFinite(state.viewY) ? state.viewY : 0;
      const viewMinX = Math.floor(viewX / CELL_SIZE) - 1;
      const viewMinY = Math.floor(viewY / CELL_SIZE) - 1;
      const viewMaxX = Math.ceil((viewX + w) / CELL_SIZE) + 1;
      const viewMaxY = Math.ceil((viewY + h) / CELL_SIZE) + 1;
      const worldMinX = offsetX;
      const worldMinY = offsetY;
      const worldMaxX = offsetX + cols - 1;
      const worldMaxY = offsetY + rows - 1;
      const drawMinX = Math.max(viewMinX, worldMinX);
      const drawMinY = Math.max(viewMinY, worldMinY);
      const drawMaxX = Math.min(viewMaxX, worldMaxX);
      const drawMaxY = Math.min(viewMaxY, worldMaxY);
      const cellLayers = ((proj.layers && proj.layers.cells) || [])
        .filter((layer) => layer.visible !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      if (drawMinX <= drawMaxX && drawMinY <= drawMaxY) {
        const visibleCells = queryWorldSparseIndex(state.worldSparse, drawMinX, drawMinY, drawMaxX, drawMaxY);
        const cellsByLayer = new Map();
        for (const entry of visibleCells) {
          if (!cellsByLayer.has(entry.layerId)) cellsByLayer.set(entry.layerId, []);
          cellsByLayer.get(entry.layerId).push(entry);
        }

        for (const layer of cellLayers) {
          const entries = cellsByLayer.get(layer.id);
          if (!entries || entries.length === 0) continue;
          for (const entry of entries) {
            const px = entry.x * CELL_SIZE;
            const py = entry.y * CELL_SIZE;
            renderPlayWorldCell(ctx, state, imageCacheRef.current, entry, px, py);
          }
        }
      }
    }

    renderPlayWorldElements(ctx, state);

    // Objects
    const visibleObjects = queryObjectSpatialIndex(
      state.objectSpatialIndex,
      (state.viewX || 0) - PLAY_OBJECT_CULL_MARGIN,
      (state.viewY || 0) - PLAY_OBJECT_CULL_MARGIN,
      (state.viewX || 0) + w + PLAY_OBJECT_CULL_MARGIN,
      (state.viewY || 0) + h + PLAY_OBJECT_CULL_MARGIN,
    );
    visibleObjects.sort((a, b) => {
      const ar = (a.components && a.components.Render) || {};
      const br = (b.components && b.components.Render) || {};
      const layerDelta = (state.objectLayerOrder.get(ar.layerId) || 0) - (state.objectLayerOrder.get(br.layerId) || 0);
      if (layerDelta !== 0) return layerDelta;
      return (ar.zIndex || 0) - (br.zIndex || 0);
    }).forEach(obj => {
      const render = (obj.components && obj.components.Render) || {};
      const sprite = (obj.components && obj.components.Sprite) || {};
      if (render.visible === false) return;
      
      const rotation = obj.rotation || 0;
      const scaleX = obj.scaleX || 1;
      const scaleY = obj.scaleY || 1;
      const baseWidth = (sprite.width || 32);
      const baseHeight = (sprite.height || 32);
      const w = baseWidth * scaleX;
      const h = baseHeight * scaleY;
      
      let drawn = false;
      const frameIds = Array.isArray(sprite.frameAssetIds) ? sprite.frameAssetIds : [];
      let frameId;
      if (typeof obj._frameIndex === 'number' && frameIds.length > 0) {
        frameId = frameIds[Math.min(obj._frameIndex, frameIds.length - 1)];
      } else if (frameIds.length > 0) {
        frameId = frameIds[Math.floor(state.elapsed * (sprite.fps || 8)) % frameIds.length];
      } else {
        frameId = sprite.assetId;
      }
      const asset = frameId ? state.assetById.get(frameId) : null;
      const sourceAsset = asset && asset.sourceAssetId ? state.assetById.get(asset.sourceAssetId) : null;
      const src = (sourceAsset && (sourceAsset.previewUrl || sourceAsset.url || sourceAsset.src))
        || (asset && (asset.previewUrl || asset.url || asset.src));
      
      ctx.save();
      ctx.translate(obj.x + w / 2, obj.y + h / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      
      if (src) {
        if (!imageCacheRef.current.has(src)) {
          const img = new Image();
          img.src = src;
          imageCacheRef.current.set(src, img);
        }
        const img = imageCacheRef.current.get(src);
        if (img && img.complete && img.naturalWidth > 0) {
          const rect = asset && asset.frameRect;
          if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.w) && Number.isFinite(rect.h)) {
            ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
          } else {
            ctx.drawImage(img, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
          }
          drawn = true;
        }
      }
      if (!drawn) {
        ctx.fillStyle = obj.color;
        ctx.fillRect(-baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
      }
      ctx.restore();
      /*
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
    //  ctx.fillText(obj.name, obj.x + obj.width / 2, obj.y - 3);
    */
    });

    if (state.particleSystem) state.particleSystem.renderWorld(ctx);

    ctx.restore();
    renderFrame2DLighting(ctx, state, w, h);
    if (state.particleSystem) state.particleSystem.renderScreen(ctx);
    ctx.save();
    ctx.translate(-(state.viewX || 0), -(state.viewY || 0));
    renderPlayWorldGuides(ctx, state, w, h, { layer: 'foreground' });
    ctx.restore();
    renderPlayBlankStageOverlay(ctx, state, w, h);
    renderPlayDebugHud(ctx, state, w, h, resolvePlayCamera(state));
  }

  function renderPlayWorldGuides(ctx, state, viewWidth, viewHeight, options = {}) {
    const metrics = resolveWorldMetrics(state && state.world, CELL_SIZE);
    if (!metrics) return;
    const layer = options.layer || 'background';
    const world = state && state.world;
    const blankScene = isPlaySceneBlank(state);

    const viewX = Number.isFinite(state && state.viewX) ? state.viewX : 0;
    const viewY = Number.isFinite(state && state.viewY) ? state.viewY : 0;
    const cellMinX = Math.max(metrics.offsetX, Math.floor(viewX / CELL_SIZE) - 1);
    const cellMinY = Math.max(metrics.offsetY, Math.floor(viewY / CELL_SIZE) - 1);
    const cellMaxX = Math.min(metrics.offsetX + metrics.cols, Math.ceil((viewX + viewWidth) / CELL_SIZE) + 1);
    const cellMaxY = Math.min(metrics.offsetY + metrics.rows, Math.ceil((viewY + viewHeight) / CELL_SIZE) + 1);

    ctx.save();
    if (layer === 'background') {
      ctx.fillStyle = blankScene ? 'rgba(125, 211, 252, 0.12)' : 'rgba(30, 41, 59, 0.45)';
      ctx.fillRect(metrics.minX, metrics.minY, metrics.width, metrics.height);
      for (let cellY = cellMinY; cellY < cellMaxY; cellY += 1) {
        for (let cellX = cellMinX; cellX < cellMaxX; cellX += 1) {
          const cell = readWorldCell(world, cellX, cellY);
          if (normalizeCellTypeId(cell) !== 'empty') continue;
          ctx.fillStyle = blankScene
            ? (((cellX + cellY) % 2 === 0) ? 'rgba(186, 230, 253, 0.18)' : 'rgba(125, 211, 252, 0.11)')
            : (((cellX + cellY) % 2 === 0) ? 'rgba(71, 85, 105, 0.18)' : 'rgba(51, 65, 85, 0.1)');
          ctx.fillRect(cellX * CELL_SIZE, cellY * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    } else {
      ctx.fillStyle = blankScene ? 'rgba(248, 250, 252, 0.035)' : 'rgba(15, 23, 42, 0.12)';
      ctx.fillRect(metrics.minX, metrics.minY, metrics.width, metrics.height);
    }
    ctx.strokeStyle = blankScene
      ? (layer === 'background' ? 'rgba(125, 211, 252, 0.82)' : 'rgba(250, 250, 250, 0.96)')
      : (layer === 'background' ? 'rgba(148, 163, 184, 0.52)' : 'rgba(226, 232, 240, 0.92)');
    ctx.lineWidth = layer === 'background' ? (blankScene ? 1.5 : 1) : (blankScene ? 2.5 : 2);
    ctx.setLineDash(layer === 'background' ? [10, 6] : [14, 8]);
    ctx.strokeRect(metrics.minX + 0.5, metrics.minY + 0.5, Math.max(0, metrics.width - 1), Math.max(0, metrics.height - 1));
    ctx.setLineDash([]);

    ctx.strokeStyle = blankScene
      ? (layer === 'background' ? 'rgba(186, 230, 253, 0.26)' : 'rgba(226, 232, 240, 0.42)')
      : (layer === 'background' ? 'rgba(71, 85, 105, 0.35)' : 'rgba(148, 163, 184, 0.32)');
    ctx.lineWidth = 1;
    for (let cellX = cellMinX; cellX <= cellMaxX; cellX += 1) {
      const x = cellX * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(x, metrics.minY);
      ctx.lineTo(x, metrics.maxY);
      ctx.stroke();
    }
    for (let cellY = cellMinY; cellY <= cellMaxY; cellY += 1) {
      const y = cellY * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(metrics.minX, y);
      ctx.lineTo(metrics.maxX, y);
      ctx.stroke();
    }

    ctx.strokeStyle = layer === 'background' ? 'rgba(250, 204, 21, 0.72)' : 'rgba(250, 204, 21, 0.95)';
    ctx.lineWidth = layer === 'background' ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.stroke();
    if (layer === 'foreground') {
      ctx.fillStyle = '#fde68a';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`World ${metrics.cols}x${metrics.rows}`, metrics.minX + 8, metrics.minY + 18);
      const visibleObjects = getVisiblePlayObjectCount(state);
      const hasFilledCells = hasPlayFilledCells(state);
      const worldElementCount = getPlayWorldElements(state).length;
      if (visibleObjects === 0 && !hasFilledCells && worldElementCount === 0) {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Empty Scene', metrics.minX + (metrics.width * 0.5), metrics.minY + (metrics.height * 0.5));
        ctx.font = '12px sans-serif';
        ctx.fillText('World guides are shown by the engine fallback renderer.', metrics.minX + (metrics.width * 0.5), metrics.minY + (metrics.height * 0.5) + 20);
      }
    }
    ctx.restore();
  }

  function renderPlayDebugHud(ctx, state, width, height, camera) {
    const metrics = resolveWorldMetrics(state && state.world, CELL_SIZE);
    const scene = resolveRuntimeScene(state);
    const lighting = normalizePlaySceneLighting(state && state.sceneLighting);
    const activeLights = getPlayActiveLights(state);
    const worldElementCount = getPlayWorldElements(state).length;
    const visibleObjects = getVisiblePlayObjectCount(state);
    const filledCellChunks = state && state.worldSparse && state.worldSparse.chunks ? state.worldSparse.chunks.size : 0;
    const lines = [
      `PLAY | ${scene.name || scene.id} | ${(state && state.renderMode) === PLAY_RENDER_MODE_WEBGL_3D ? '3D' : '2D'} | ${state && Number.isFinite(state.elapsed) ? state.elapsed.toFixed(1) : '0.0'}s`,
      metrics
        ? `World ${metrics.cols}x${metrics.rows} cells | ${Math.round(metrics.width)}x${Math.round(metrics.height)} px | offset ${metrics.offsetX}, ${metrics.offsetY}`
        : 'World unavailable',
      `Objects ${state && Array.isArray(state.gameObjects) ? state.gameObjects.length : 0} total | ${visibleObjects} visible | elements ${worldElementCount} | filled cell chunks ${filledCellChunks}`,
      `View ${Math.round(state && state.viewX || 0)}, ${Math.round(state && state.viewY || 0)} | canvas ${width}x${height}`,
      `Camera ${camera && camera.source === 'object' ? 'scene object' : 'engine fallback'}${camera && camera.objectId ? ` (${camera.objectId})` : ''} | target ${camera && camera.targetObjectId ? camera.targetObjectId : 'None'}`,
      `Lighting ${lighting.enabled ? 'ON' : 'OFF'} | active lights ${activeLights.length} | overlay ${Math.round((lighting.overlayOpacity || 0) * 100)}%`,
    ];

    if (visibleObjects === 0 && filledCellChunks === 0 && worldElementCount === 0) {
      lines.push('Empty scene: engine world guides and fallback camera are active.');
    }
    if (lighting.enabled && activeLights.length === 0) {
      lines.push('Lighting warning: no active light emitters are affecting the scene.');
    }

    const boxWidth = 430;
    const lineHeight = 16;
    const boxHeight = 14 + (lines.length * lineHeight);
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    ctx.fillRect(10, 10, boxWidth, boxHeight);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10.5, 10.5, boxWidth - 1, boxHeight - 1);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    lines.forEach((line, index) => {
      ctx.fillText(line, 18, 28 + (index * lineHeight));
    });
    ctx.restore();
  }

  function renderFrame3D(state) {
    const canvas = canvasRef.current;
    if (!canvas || !state || !state.render3D) return;
    let runtime = state.render3D.runtime;
    if (!runtime || runtime.canvas !== canvas || state.render3D.meshDirty) {
      if (runtime) destroyPlayWebGLRuntime(runtime);
      runtime = createPlayWebGLRuntime(canvas, state, onLog);
      state.render3D.runtime = runtime;
      state.render3D.meshDirty = false;
    }
    if (!runtime || !runtime.gl) return;

  const gl = runtime.gl;
  const w = canvas.width || 960;
  const h = canvas.height || 540;
  const camera = state.render3D.camera || {};
  const sceneLighting = normalizePlaySceneLighting(state && state.sceneLighting);
  const clear = parseHexColor(
    sceneLighting.enabled
      ? sceneLighting.fogColor
      : ((state.render3D.options && state.render3D.options.clearColor) || '#07111d'),
    [7, 17, 29],
  );
  const fogColor = parseHexColor(sceneLighting.fogColor || '#07111d', [7, 17, 29]);
  const fogDensity = sceneLighting.enabled ? clamp01(sceneLighting.fogDensity) : 0.65;
  const eye = [
    Number.isFinite(camera.x) ? camera.x : CELL_SIZE * 1.5,
      Number.isFinite(camera.y) ? camera.y : CELL_SIZE * 0.72,
      Number.isFinite(camera.z) ? camera.z : CELL_SIZE * 1.5,
    ];
    const yaw = Number.isFinite(camera.yaw) ? camera.yaw : 0;
    const pitch = Number.isFinite(camera.pitch) ? camera.pitch : 0;
    const look = [
      eye[0] + Math.cos(pitch) * Math.cos(yaw),
      eye[1] + Math.sin(pitch),
      eye[2] + Math.cos(pitch) * Math.sin(yaw),
    ];
    const near = 0.1;
    const far = Math.max(runtime.farPlane || 600, 600);
    const projection = createPerspectiveMatrix((Number.isFinite(camera.fov) ? camera.fov : 72) * Math.PI / 180, w / Math.max(1, h), near, far);
    const view = createLookAtMatrix(eye, look, [0, 1, 0]);

    gl.viewport(0, 0, w, h);
    gl.clearColor(clear[0] / 255, clear[1] / 255, clear[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(runtime.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.buffers.position);
    gl.enableVertexAttribArray(runtime.attributes.position);
    gl.vertexAttribPointer(runtime.attributes.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.buffers.color);
    gl.enableVertexAttribArray(runtime.attributes.color);
    gl.vertexAttribPointer(runtime.attributes.color, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(runtime.uniforms.projection, false, projection);
    gl.uniformMatrix4fv(runtime.uniforms.view, false, view);
    gl.uniform3f(runtime.uniforms.fogColor, fogColor[0] / 255, fogColor[1] / 255, fogColor[2] / 255);
    gl.uniform1f(runtime.uniforms.fogDensity, fogDensity);
    gl.drawArrays(gl.TRIANGLES, 0, runtime.vertexCount);
  }

  // Key tracking
  useEffect(() => {
    const handleDown = (e) => keysRef.current.add(e.keyCode);
    const handleUp = (e) => keysRef.current.delete(e.keyCode);
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (!state || !state.running) return;
    syncCanvasMode(state.renderMode);
    const canvas = canvasRef.current;
    const mode = state.renderMode === PLAY_RENDER_MODE_WEBGL_3D ? '3d' : '2d';
    const signature = canvas
      ? `${mode}:${canvas.width}x${canvas.height}:${canvas.dataset.kozPlayActive || 'unknown'}`
      : `${mode}:missing`;
    if (state._debug && state._debug.canvasSignature !== signature) {
      state._debug.canvasSignature = signature;
      onLog({
        type: canvas ? 'info' : 'warn',
        message: canvas
          ? `Play canvas attached | mode ${mode} | size ${canvas.width}x${canvas.height} | active ${canvas.dataset.kozPlayActive || 'unknown'}`
          : `Play canvas missing after mount sync | mode ${mode}`,
        time: new Date().toLocaleTimeString(),
      });
    }
  });

  return { canvasRef, canvas2dRef, canvas3dRef, uiRootRef, isPlaying, start, stop, execute };
}

function resolvePlayRenderMode(project, sceneId) {
  const scenes = Array.isArray(project && project.scenes) ? project.scenes : [];
  const targetSceneId = sceneId || (project && project.activeSceneId) || null;
  const scene = scenes.find((entry) => entry && entry.id === targetSceneId) || scenes[0] || null;
  const mode = (scene && scene.renderMode) || (project && project.meta && project.meta.renderMode);
  return mode === '3d' || mode === PLAY_RENDER_MODE_WEBGL_3D ? PLAY_RENDER_MODE_WEBGL_3D : '2d';
}

function createInitialPlay3DState(state) {
  const enabled = state && state.renderMode === PLAY_RENDER_MODE_WEBGL_3D;
  return {
    enabled,
    meshDirty: enabled,
    lightingSignature: '',
    runtime: null,
    camera: {
      x: CELL_SIZE * 1.5,
      y: CELL_SIZE * 0.72,
      z: CELL_SIZE * 1.5,
      yaw: 0,
      pitch: -0.08,
      fov: 72,
    },
    options: {
      clearColor: '#07111d',
      floorColor: '#111827',
      ceilingColor: '#1e3a5f',
      wallColor: '#fb923c',
      wallHeight: CELL_SIZE * 2.2,
      eyeHeight: CELL_SIZE * 0.72,
    },
  };
}

function buildPlayObjectLayerOrder(project) {
  const order = new Map();
  ((((project && project.layers) || {}).objects) || [])
    .filter((layer) => layer && layer.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((layer, index) => {
      if (layer && layer.id) order.set(layer.id, Number.isFinite(layer.order) ? layer.order : index);
    });
  return order;
}

function createPlayWorldApi(projectSnapshot, state, metrics) {
  const world = state && state.world;
  return {
    ...metrics,
    sampleCell(cellX, cellY) {
      return readWorldCell(world, cellX, cellY);
    },
    isSolidCell(cellX, cellY) {
      return isCollidableCell(projectSnapshot, readWorldCell(world, cellX, cellY));
    },
    worldToCell(worldX, worldY) {
      return {
        x: Math.floor((Number(worldX) || 0) / metrics.cellSize),
        y: Math.floor((Number(worldY) || 0) / metrics.cellSize),
      };
    },
  };
}

function createPlay3DController({ stateRef, canvasRef }) {
  function readState() {
    return stateRef && stateRef.current;
  }

  return {
    isEnabled() {
      const state = readState();
      return !!(state && state.renderMode === PLAY_RENDER_MODE_WEBGL_3D && state.render3D);
    },
    getCamera() {
      const state = readState();
      return state && state.render3D ? { ...(state.render3D.camera || {}) } : null;
    },
    setCamera(patch = {}) {
      const state = readState();
      if (!state || !state.render3D) return null;
      const next = { ...(state.render3D.camera || {}) };
      ['x', 'y', 'z', 'yaw', 'pitch', 'fov'].forEach((key) => {
        const value = patch[key];
        if (Number.isFinite(value)) next[key] = value;
      });
      state.render3D.camera = next;
      return { ...next };
    },
    setOptions(patch = {}) {
      const state = readState();
      if (!state || !state.render3D) return null;
      const prev = state.render3D.options || {};
      const next = { ...prev, ...patch };
      const changed = Object.keys(patch).some((key) => next[key] !== prev[key]);
      state.render3D.options = next;
      if (changed) state.render3D.meshDirty = true;
      return { ...state.render3D.options };
    },
    getOptions() {
      const state = readState();
      return state && state.render3D ? { ...(state.render3D.options || {}) } : null;
    },
    requestPointerLock() {
      if (typeof document === 'undefined') return;
      const canvas = canvasRef && canvasRef.current;
      if (canvas && typeof canvas.requestPointerLock === 'function') canvas.requestPointerLock();
    },
    exitPointerLock() {
      if (typeof document !== 'undefined' && document.exitPointerLock) document.exitPointerLock();
    },
  };
}

function readWorldCell(world, cellX, cellY) {
  if (!world || !Array.isArray(world.grid)) return null;
  const offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
  const lx = Math.floor(cellX) - offsetX;
  const ly = Math.floor(cellY) - offsetY;
  if (ly < 0 || lx < 0) return null;
  if (!world.grid[ly] || lx >= world.grid[ly].length) return null;
  return world.grid[ly][lx];
}

function parseHexColor(color, fallback = [255, 255, 255]) {
  if (typeof color !== 'string') return fallback.slice();
  const value = color.trim();
  if (!value.startsWith('#')) return fallback.slice();
  let hex = value.slice(1);
  if (hex.length === 3) hex = hex.split('').map((part) => part + part).join('');
  if (hex.length !== 6) return fallback.slice();
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return fallback.slice();
  return [r, g, b];
}

function shadeRgb(rgb, factor) {
  return rgb.map((value) => Math.max(0, Math.min(255, Math.round(value * factor))));
}

function normalizePlaySceneLighting(lighting) {
  const source = lighting && typeof lighting === 'object' ? lighting : {};
  return {
    enabled: source.enabled === true,
    ambientColor: typeof source.ambientColor === 'string' && source.ambientColor ? source.ambientColor : DEFAULT_SCENE_LIGHTING.ambientColor,
    ambientIntensity: clamp01(source.ambientIntensity ?? DEFAULT_SCENE_LIGHTING.ambientIntensity),
    overlayOpacity: clamp01(source.overlayOpacity ?? DEFAULT_SCENE_LIGHTING.overlayOpacity),
    fogColor: typeof source.fogColor === 'string' && source.fogColor ? source.fogColor : DEFAULT_SCENE_LIGHTING.fogColor,
    fogDensity: clamp01(source.fogDensity ?? DEFAULT_SCENE_LIGHTING.fogDensity),
  };
}

function getPlayLightingManagerObject(state) {
  const objects = Array.isArray(state && state.gameObjects) ? state.gameObjects : [];
  return objects.find((obj) => obj && obj.components && obj.components.LightingManager) || null;
}

function resolvePlayLightingSettings(state, sceneLike = null) {
  const managerObject = getPlayLightingManagerObject(state);
  if (managerObject && managerObject.components && managerObject.components.LightingManager) {
    return normalizePlaySceneLighting(managerObject.components.LightingManager);
  }
  return normalizePlaySceneLighting(null);
}

function normalizePlayLightComponent(light) {
  const source = light && typeof light === 'object' ? light : {};
  return {
    enabled: source.enabled !== false,
    color: typeof source.color === 'string' && source.color ? source.color : DEFAULT_LIGHT_COMPONENT.color,
    intensity: clamp01(source.intensity ?? DEFAULT_LIGHT_COMPONENT.intensity),
    radius: Number.isFinite(source.radius) ? Math.max(1, source.radius) : DEFAULT_LIGHT_COMPONENT.radius,
    falloff: clamp01(source.falloff ?? DEFAULT_LIGHT_COMPONENT.falloff),
    offsetX: Number.isFinite(source.offsetX) ? source.offsetX : DEFAULT_LIGHT_COMPONENT.offsetX,
    offsetY: Number.isFinite(source.offsetY) ? source.offsetY : DEFAULT_LIGHT_COMPONENT.offsetY,
    height: Number.isFinite(source.height) ? Math.max(0, source.height) : DEFAULT_LIGHT_COMPONENT.height,
  };
}

function rgbaString(rgb, alpha = 1) {
  const a = clamp01(alpha);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

function resolvePlayLightAnchor(obj, light) {
  const sprite = (obj && obj.components && obj.components.Sprite) || {};
  const width = Number.isFinite(obj && obj.width) ? obj.width : ((Number.isFinite(sprite.width) ? sprite.width : 32) * (Number.isFinite(obj && obj.scaleX) ? obj.scaleX : 1));
  const height = Number.isFinite(obj && obj.height) ? obj.height : ((Number.isFinite(sprite.height) ? sprite.height : 32) * (Number.isFinite(obj && obj.scaleY) ? obj.scaleY : 1));
  return {
    worldX: (Number(obj && obj.x) || 0) + (width * 0.5) + light.offsetX,
    worldY: (Number(obj && obj.y) || 0) + (height * 0.5) + light.offsetY,
  };
}

function getPlayActiveLights(state) {
  const objects = Array.isArray(state && state.gameObjects) ? state.gameObjects : [];
  return objects.map((obj) => {
    if (!obj || !obj.components || !obj.components.Light) return null;
    const light = normalizePlayLightComponent(obj.components.Light);
    if (light.enabled === false) return null;
    const anchor = resolvePlayLightAnchor(obj, light);
    return {
      id: obj.id,
      objectId: obj.id,
      color: light.color,
      rgb: parseHexColor(light.color, parseHexColor(DEFAULT_LIGHT_COMPONENT.color, [255, 210, 122])),
      intensity: light.intensity,
      radius: light.radius,
      falloff: light.falloff,
      offsetX: light.offsetX,
      offsetY: light.offsetY,
      height: light.height,
      worldX: anchor.worldX,
      worldY: anchor.worldY,
    };
  }).filter(Boolean);
}

function getPlayWorldElements(state) {
  const world = state && state.world;
  if (!world || !Array.isArray(world.elements)) return [];
  return world.elements.filter(Boolean);
}

function getVisiblePlayObjectCount(state) {
  return Array.isArray(state && state.gameObjects)
    ? state.gameObjects.filter((obj) => !obj || !obj.components || !obj.components.Render || obj.components.Render.visible !== false).length
    : 0;
}

function hasPlayFilledCells(state) {
  return !!(state && state.worldSparse && state.worldSparse.chunks && state.worldSparse.chunks.size > 0);
}

function isPlaySceneBlank(state) {
  return getVisiblePlayObjectCount(state) === 0 && !hasPlayFilledCells(state) && getPlayWorldElements(state).length === 0;
}

function renderPlayWorldCell(ctx, state, imageCache, entry, px, py) {
  let drawn = false;
  const imgAssetId = entry.type.imageAssetId;
  if (imgAssetId && state.assetById) {
    const asset = state.assetById.get(imgAssetId);
    const src = asset && (asset.previewUrl || asset.url || asset.src);
    if (src) {
      if (!imageCache.has(src)) {
        const img = new Image();
        img.src = src;
        imageCache.set(src, img);
      }
      const img = imageCache.get(src);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, px, py, CELL_SIZE, CELL_SIZE);
        drawn = true;
      }
    }
  }
  if (!drawn) {
    ctx.fillStyle = entry.type.color || '#475569';
    ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, 3);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.fillRect(px + 1, py + CELL_SIZE - 4, CELL_SIZE - 2, 3);
  }
  ctx.strokeStyle = entry.type.collision ? 'rgba(248, 250, 252, 0.42)' : 'rgba(226, 232, 240, 0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
}

function renderPlayWorldElements(ctx, state) {
  const elements = getPlayWorldElements(state);
  if (elements.length === 0) return;
  ctx.save();
  elements.forEach((el) => {
    const cellX = Number.isFinite(el && el.x) ? el.x : null;
    const cellY = Number.isFinite(el && el.y) ? el.y : null;
    if (!Number.isFinite(cellX) || !Number.isFinite(cellY)) return;
    const px = cellX * CELL_SIZE;
    const py = cellY * CELL_SIZE;
    const kind = String((el && el.kind) || 'element').trim();
    const badge = kind ? kind[0].toUpperCase() : 'E';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.92)';
    ctx.fillRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    ctx.strokeStyle = 'rgba(255, 251, 235, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 2.5, py + 2.5, CELL_SIZE - 5, CELL_SIZE - 5);
    ctx.fillStyle = '#fff7ed';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(badge, px + (CELL_SIZE * 0.5), py + (CELL_SIZE * 0.5) + 4);
  });
  ctx.restore();
}

function renderPlayBlankStageOverlay(ctx, state, width, height) {
  if (!isPlaySceneBlank(state)) return;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const panelWidth = Math.min(420, Math.max(260, width - 48));
  const panelHeight = 78;
  const panelX = Math.round(centerX - (panelWidth * 0.5));
  const panelY = Math.round(centerY - (panelHeight * 0.5));

  ctx.save();
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.52)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(20.5, 20.5, Math.max(0, width - 41), Math.max(0, height - 41));
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(250, 204, 21, 0.92)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 22, centerY);
  ctx.lineTo(centerX + 22, centerY);
  ctx.moveTo(centerX, centerY - 22);
  ctx.lineTo(centerX, centerY + 22);
  ctx.stroke();

  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Blank World', centerX, panelY + 30);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '12px sans-serif';
  ctx.fillText('The engine fallback renderer is active.', centerX, panelY + 51);
  ctx.fillText('Paint tiles, place objects, or add elements to populate the scene.', centerX, panelY + 67);
  ctx.restore();
}

function buildPlayLightingSignature(state) {
  const lighting = normalizePlaySceneLighting(state && state.sceneLighting);
  const lights = getPlayActiveLights(state)
    .map((light) => [
      light.id,
      Math.round(light.worldX * 10) / 10,
      Math.round(light.worldY * 10) / 10,
      Math.round(light.height * 10) / 10,
      light.color,
      Math.round(light.intensity * 100) / 100,
      Math.round(light.radius * 10) / 10,
      Math.round(light.falloff * 100) / 100,
    ].join(':'))
    .sort();
  return JSON.stringify({
    enabled: lighting.enabled,
    ambientColor: lighting.ambientColor,
    ambientIntensity: lighting.ambientIntensity,
    overlayOpacity: lighting.overlayOpacity,
    fogColor: lighting.fogColor,
    fogDensity: lighting.fogDensity,
    lights,
  });
}

function computePlayLightStrength(distance, radius, intensity, falloff) {
  const maxRadius = Math.max(1, Number(radius) || 1);
  const remaining = Math.max(0, 1 - ((Number(distance) || 0) / maxRadius));
  if (remaining <= 0) return 0;
  const exponent = 1 + ((1 - clamp01(falloff)) * 2.5);
  return clamp01(intensity) * Math.pow(remaining, exponent);
}

function applyPlay3DLighting(baseRgb, samplePoint, sceneLighting, lights) {
  const lighting = normalizePlaySceneLighting(sceneLighting);
  if (!lighting.enabled) return baseRgb.slice();
  const ambientRgb = parseHexColor(lighting.ambientColor, [11, 18, 32]);
  const ambient = clamp01(lighting.ambientIntensity);
  const next = [
    baseRgb[0] * (0.18 + ambient * 0.82) + ambientRgb[0] * (1 - ambient) * 0.08,
    baseRgb[1] * (0.18 + ambient * 0.82) + ambientRgb[1] * (1 - ambient) * 0.08,
    baseRgb[2] * (0.18 + ambient * 0.82) + ambientRgb[2] * (1 - ambient) * 0.08,
  ];
  (lights || []).forEach((light) => {
    const distance = Math.hypot(
      samplePoint[0] - light.worldX,
      samplePoint[1] - light.height,
      samplePoint[2] - light.worldY,
    );
    const strength = computePlayLightStrength(distance, light.radius, light.intensity, light.falloff);
    if (strength <= 0) return;
    next[0] += baseRgb[0] * strength * (0.28 + ((light.rgb[0] / 255) * 0.72));
    next[1] += baseRgb[1] * strength * (0.28 + ((light.rgb[1] / 255) * 0.72));
    next[2] += baseRgb[2] * strength * (0.28 + ((light.rgb[2] / 255) * 0.72));
  });
  return next.map((value) => Math.max(0, Math.min(255, Math.round(value))));
}

function renderFrame2DLighting(ctx, state, width, height) {
  const lighting = normalizePlaySceneLighting(state && state.sceneLighting);
  if (!lighting.enabled) return;
  const ambientRgb = parseHexColor(lighting.ambientColor, [11, 18, 32]);
  const lights = getPlayActiveLights(state);
  const worldElementCount = getPlayWorldElements(state).length;
  const visibleObjects = getVisiblePlayObjectCount(state);
  const hasFilledCells = hasPlayFilledCells(state);
  const isEffectivelyEmptyScene = lights.length === 0 && visibleObjects === 0 && !hasFilledCells && worldElementCount === 0;
  const baseOverlayAlpha = clamp01(lighting.overlayOpacity * (1 - (lighting.ambientIntensity * 0.6)));
  const overlayAlpha = isEffectivelyEmptyScene ? Math.min(baseOverlayAlpha, 0.28) : baseOverlayAlpha;

  ctx.save();
  ctx.fillStyle = rgbaString(ambientRgb, overlayAlpha);
  ctx.fillRect(0, 0, width, height);
  if (lights.length > 0) {
    ctx.globalCompositeOperation = 'destination-out';
    lights.forEach((light) => {
      const radius = Math.max(8, light.radius);
      const sx = light.worldX - (state.viewX || 0);
      const sy = light.worldY - (state.viewY || 0);
      const innerRadius = Math.max(0, radius * (0.12 + ((1 - light.falloff) * 0.18)));
      const alpha = clamp01(0.92 * light.intensity);
      const cutout = ctx.createRadialGradient(sx, sy, innerRadius, sx, sy, radius);
      cutout.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
      cutout.addColorStop(Math.min(0.68, 0.2 + (light.falloff * 0.48)), `rgba(0, 0, 0, ${alpha * 0.42})`);
      cutout.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = cutout;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'lighter';
    lights.forEach((light) => {
      const radius = Math.max(8, light.radius * 0.95);
      const sx = light.worldX - (state.viewX || 0);
      const sy = light.worldY - (state.viewY || 0);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
      glow.addColorStop(0, rgbaString(light.rgb, light.intensity * 0.24));
      glow.addColorStop(0.4, rgbaString(light.rgb, light.intensity * 0.14));
      glow.addColorStop(1, rgbaString(light.rgb, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

function pushColoredQuad(positions, colors, a, b, c, d, rgb) {
  positions.push(
    a[0], a[1], a[2],
    b[0], b[1], b[2],
    c[0], c[1], c[2],
    a[0], a[1], a[2],
    c[0], c[1], c[2],
    d[0], d[1], d[2],
  );
  for (let i = 0; i < 6; i += 1) {
    colors.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  }
}

function buildPlay3DMesh(state) {
  const positions = [];
  const colors = [];
  const world = state && state.world;
  const project = (state && state.projectSnapshot) || {};
  const render3D = state && state.render3D;
  const options = (render3D && render3D.options) || {};
  const sceneLighting = normalizePlaySceneLighting(state && state.sceneLighting);
  const activeLights = getPlayActiveLights(state);
  const metrics = resolveWorldMetrics(world, CELL_SIZE);
  if (!metrics) return { positions: new Float32Array(0), colors: new Float32Array(0), farPlane: 600 };

  const wallHeight = Number.isFinite(options.wallHeight) ? options.wallHeight : CELL_SIZE * 2.2;
  const floorColor = parseHexColor(options.floorColor || '#111827', [17, 24, 39]);
  const ceilingColor = parseHexColor(options.ceilingColor || '#1e3a5f', [30, 58, 95]);
  const defaultWall = parseHexColor(options.wallColor || '#fb923c', [251, 146, 60]);
  const minX = metrics.minX;
  const minZ = metrics.minY;
  const maxX = metrics.maxX;
  const maxZ = metrics.maxY;
  const floorLit = applyPlay3DLighting(floorColor, [(minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5], sceneLighting, []);
  const ceilingLit = applyPlay3DLighting(ceilingColor, [(minX + maxX) * 0.5, wallHeight, (minZ + maxZ) * 0.5], sceneLighting, []);

  pushColoredQuad(positions, colors, [minX, 0, minZ], [maxX, 0, minZ], [maxX, 0, maxZ], [minX, 0, maxZ], floorLit);
  pushColoredQuad(positions, colors, [minX, wallHeight, maxZ], [maxX, wallHeight, maxZ], [maxX, wallHeight, minZ], [minX, wallHeight, minZ], ceilingLit);

  for (let y = metrics.offsetY; y < metrics.offsetY + metrics.rows; y += 1) {
    for (let x = metrics.offsetX; x < metrics.offsetX + metrics.cols; x += 1) {
      const cell = readWorldCell(world, x, y);
      if (!isCollidableCell(project, cell)) continue;
      const type = getCellType(project, cell);
      const baseColor = parseHexColor((type && type.color) || options.wallColor || '#fb923c', defaultWall);
      const x0 = x * metrics.cellSize;
      const x1 = x0 + metrics.cellSize;
      const z0 = y * metrics.cellSize;
      const z1 = z0 + metrics.cellSize;
      if (!isCollidableCell(project, readWorldCell(world, x, y - 1))) {
        pushColoredQuad(
          positions,
          colors,
          [x0, 0, z0],
          [x1, 0, z0],
          [x1, wallHeight, z0],
          [x0, wallHeight, z0],
          applyPlay3DLighting(shadeRgb(baseColor, 1), [x0 + (metrics.cellSize * 0.5), wallHeight * 0.5, z0], sceneLighting, activeLights),
        );
      }
      if (!isCollidableCell(project, readWorldCell(world, x, y + 1))) {
        pushColoredQuad(
          positions,
          colors,
          [x1, 0, z1],
          [x0, 0, z1],
          [x0, wallHeight, z1],
          [x1, wallHeight, z1],
          applyPlay3DLighting(shadeRgb(baseColor, 0.82), [x0 + (metrics.cellSize * 0.5), wallHeight * 0.5, z1], sceneLighting, activeLights),
        );
      }
      if (!isCollidableCell(project, readWorldCell(world, x - 1, y))) {
        pushColoredQuad(
          positions,
          colors,
          [x0, 0, z1],
          [x0, 0, z0],
          [x0, wallHeight, z0],
          [x0, wallHeight, z1],
          applyPlay3DLighting(shadeRgb(baseColor, 0.7), [x0, wallHeight * 0.5, z0 + (metrics.cellSize * 0.5)], sceneLighting, activeLights),
        );
      }
      if (!isCollidableCell(project, readWorldCell(world, x + 1, y))) {
        pushColoredQuad(
          positions,
          colors,
          [x1, 0, z0],
          [x1, 0, z1],
          [x1, wallHeight, z1],
          [x1, wallHeight, z0],
          applyPlay3DLighting(shadeRgb(baseColor, 0.9), [x1, wallHeight * 0.5, z0 + (metrics.cellSize * 0.5)], sceneLighting, activeLights),
        );
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    farPlane: Math.max(metrics.width, metrics.height, wallHeight) * 3,
  };
}

function compilePlayShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(error);
  }
  return shader;
}

function createPlayProgram(gl, vertexSource, fragmentSource) {
  const vertex = compilePlayShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compilePlayShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program) || 'Unknown program link error';
    gl.deleteProgram(program);
    throw new Error(error);
  }
  return program;
}

function createPlayWebGLRuntime(canvas, state, onLog) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true });
  if (!gl) {
    if (onLog) onLog({ type: 'warn', message: 'WebGL is unavailable in play mode; falling back to 2D render.', time: new Date().toLocaleTimeString() });
    if (state) state.renderMode = '2d';
    return null;
  }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform mat4 uProjection;
    uniform mat4 uView;
    varying vec3 vColor;
    varying float vFogDepth;
    void main() {
      vec4 clip = uProjection * uView * vec4(aPosition, 1.0);
      gl_Position = clip;
      vColor = aColor;
      vFogDepth = clip.z / clip.w;
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vColor;
    varying float vFogDepth;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    void main() {
      float fog = smoothstep(0.15, 0.95, clamp((vFogDepth + 1.0) * 0.5, 0.0, 1.0));
      vec3 color = mix(vColor, uFogColor, fog * uFogDensity);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  try {
    const program = createPlayProgram(gl, vertexSource, fragmentSource);
    const mesh = buildPlay3DMesh(state);
    const position = gl.createBuffer();
    const color = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, color);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    return {
      canvas,
      gl,
      program,
      farPlane: mesh.farPlane,
      vertexCount: mesh.positions.length / 3,
      attributes: {
        position: gl.getAttribLocation(program, 'aPosition'),
        color: gl.getAttribLocation(program, 'aColor'),
      },
      uniforms: {
        projection: gl.getUniformLocation(program, 'uProjection'),
        view: gl.getUniformLocation(program, 'uView'),
        fogColor: gl.getUniformLocation(program, 'uFogColor'),
        fogDensity: gl.getUniformLocation(program, 'uFogDensity'),
      },
      buffers: { position, color },
    };
  } catch (error) {
    if (onLog) onLog({ type: 'error', message: `WebGL init error: ${error.message}`, time: new Date().toLocaleTimeString() });
    return null;
  }
}

function destroyPlayWebGLRuntime(runtime) {
  if (!runtime || !runtime.gl) return;
  const gl = runtime.gl;
  if (runtime.buffers) {
    if (runtime.buffers.position) gl.deleteBuffer(runtime.buffers.position);
    if (runtime.buffers.color) gl.deleteBuffer(runtime.buffers.color);
  }
  if (runtime.program) gl.deleteProgram(runtime.program);
}

function createPerspectiveMatrix(fovRadians, aspect, near, far) {
  const f = 1 / Math.tan(fovRadians / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / Math.max(0.0001, aspect), 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, (2 * far * near) * nf, 0,
  ]);
}

function createLookAtMatrix(eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len;
  zy /= len;
  zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len;
  xy /= len;
  xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const tx = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  const ty = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  const tz = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);

  return new Float32Array([
    xx, xy, xz, 0,
    yx, yy, yz, 0,
    zx, zy, zz, 0,
    tx, ty, tz, 1,
  ]);
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function slugifyStorageKey(value) {
  return String(value || 'koz-project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'koz-project';
}

function createPlayStorageApi(projectSnapshot) {
  const prefix = `koz:${slugifyStorageKey(projectSnapshot && projectSnapshot.meta && projectSnapshot.meta.name)}:`;
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;

  function key(name = 'save_slot') {
    return `${prefix}${String(name || 'save_slot')}`;
  }

  return {
    prefix,
    key,
    has(name = 'save_slot') {
      if (!storage) return false;
      try {
        return storage.getItem(key(name)) !== null;
      } catch (_err) {
        return false;
      }
    },
    read(name = 'save_slot') {
      if (!storage) return null;
      try {
        return storage.getItem(key(name));
      } catch (_err) {
        return null;
      }
    },
    write(name = 'save_slot', value = '') {
      if (!storage) return null;
      try {
        const nextValue = String(value ?? '');
        storage.setItem(key(name), nextValue);
        return nextValue;
      } catch (_err) {
        return null;
      }
    },
    remove(name = 'save_slot') {
      if (!storage) return false;
      try {
        storage.removeItem(key(name));
        return true;
      } catch (_err) {
        return false;
      }
    },
    load(name = 'save_slot') {
      const raw = this.read(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_err) {
        return null;
      }
    },
    save(payload, name = 'save_slot') {
      const raw = JSON.stringify(payload);
      this.write(name, raw);
      return payload;
    },
    clear(name = 'save_slot') {
      return this.remove(name);
    },
  };
}

function createPlayParticleSystem(assetById, imageCacheRef) {
  const particles = [];
  const emitterTimers = new Map();

  function resolveObject(target, objects) {
    if (!target) return null;
    if (typeof target === 'string') return (objects || []).find((obj) => obj.id === target) || null;
    if (typeof target === 'object' && target.id) return target;
    return null;
  }

  function randRange(min, max) { return min + Math.random() * (max - min); }

  function emitAt(x, y, config = {}) {
    const count = Math.max(1, Math.min(500, Math.floor(Number(config.count) || 24)));
    const direction = ((Number(config.direction) || 0) * Math.PI) / 180;
    const spread = (Math.max(0, Math.min(360, Number(config.spreadAngle) || 360)) * Math.PI) / 180;
    const drag = clamp01(Number(config.drag) || 0.98);
    const screen = config.worldSpace === false;
    const colors = Array.isArray(config.colors) && config.colors.length > 0 ? config.colors : null;
    const baseColor = config.color || '#fb923c';

    // Range-capable values: use min/max if provided, else fall back to single value
    const hasSpeedRange = Number.isFinite(config.speedMin) && Number.isFinite(config.speedMax);
    const speedLo = hasSpeedRange ? Math.max(0, config.speedMin) : null;
    const speedHi = hasSpeedRange ? Math.max(0, config.speedMax) : null;
    const baseSpeed = Math.max(0, Number(config.speed) || 80);

    const hasSizeRange = Number.isFinite(config.sizeMin) && Number.isFinite(config.sizeMax);
    const sizeLo = hasSizeRange ? Math.max(1, config.sizeMin) : null;
    const sizeHi = hasSizeRange ? Math.max(1, config.sizeMax) : null;
    const baseSize = Math.max(1, Number(config.size) || 4);

    const hasSizeEndRange = Number.isFinite(config.sizeEndMin) && Number.isFinite(config.sizeEndMax);
    const sizeEndLo = hasSizeEndRange ? Math.max(0, config.sizeEndMin) : null;
    const sizeEndHi = hasSizeEndRange ? Math.max(0, config.sizeEndMax) : null;
    const baseSizeEnd = Math.max(0, Number(config.sizeEnd) || 1);

    const hasLifeRange = Number.isFinite(config.lifeMin) && Number.isFinite(config.lifeMax);
    const lifeLo = hasLifeRange ? Math.max(50, config.lifeMin) / 1000 : null;
    const lifeHi = hasLifeRange ? Math.max(50, config.lifeMax) / 1000 : null;
    const baseLife = Math.max(50, Number(config.life) || 500) / 1000;

    const hasGravRange = Number.isFinite(config.gravityMin) && Number.isFinite(config.gravityMax);
    const gravLo = hasGravRange ? config.gravityMin : null;
    const gravHi = hasGravRange ? config.gravityMax : null;
    const baseGravity = Number(config.gravity) || 0;

    // Image particle support
    const imageId = config.image || null;

    // Rotation
    const baseRotation = ((Number(config.rotation) || 0) * Math.PI) / 180;
    const hasRotSpeedRange = Number.isFinite(config.rotationSpeedMin) && Number.isFinite(config.rotationSpeedMax);
    const rotSpeedLo = hasRotSpeedRange ? (config.rotationSpeedMin * Math.PI) / 180 : null;
    const rotSpeedHi = hasRotSpeedRange ? (config.rotationSpeedMax * Math.PI) / 180 : null;
    const baseRotSpeed = ((Number(config.rotationSpeed) || 0) * Math.PI) / 180;

    for (let i = 0; i < count; i += 1) {
      const angle = spread >= Math.PI * 2
        ? Math.random() * Math.PI * 2
        : (direction - (spread * 0.5)) + (Math.random() * spread);
      const speed = hasSpeedRange ? randRange(speedLo, speedHi) : baseSpeed * (0.35 + Math.random() * 0.85);
      const life = hasLifeRange ? randRange(lifeLo, lifeHi) : baseLife;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        sizeStart: hasSizeRange ? randRange(sizeLo, sizeHi) : baseSize,
        sizeEnd: hasSizeEndRange ? randRange(sizeEndLo, sizeEndHi) : baseSizeEnd,
        gravity: hasGravRange ? randRange(gravLo, gravHi) : baseGravity,
        drag,
        color: colors ? colors[Math.floor(Math.random() * colors.length)] : baseColor,
        screen,
        imageId,
        rot: baseRotation,
        rotSpeed: hasRotSpeedRange ? randRange(rotSpeedLo, rotSpeedHi) : baseRotSpeed,
      });
    }
    return count;
  }

  function emitObject(target, objects, overrides = {}) {
    const obj = resolveObject(target, objects);
    if (!obj) return 0;
    const emitter = (obj.components && obj.components.ParticleEmitter) || null;
    if (!emitter || emitter.enabled === false) return 0;
    const width = Number.isFinite(obj.width) ? obj.width : (((obj.components || {}).Sprite || {}).width || 32);
    const height = Number.isFinite(obj.height) ? obj.height : (((obj.components || {}).Sprite || {}).height || 32);
    return emitAt(
      (Number(obj.x) || 0) + (width * 0.5),
      (Number(obj.y) || 0) + (height * 0.5),
      { ...emitter, ...overrides },
    );
  }

  return {
    api: {
      burstAt(x, y, options = {}) {
        return emitAt(Number(x) || 0, Number(y) || 0, options);
      },
      emitObject(target, overrides = {}, objects = []) {
        return emitObject(target, objects, overrides);
      },
      clear() {
        particles.length = 0;
        emitterTimers.clear();
      },
      getCount() {
        return particles.length;
      },
    },
    clear() {
      particles.length = 0;
      emitterTimers.clear();
    },
    update(dt, objects = []) {
      const nextIds = new Set();
      objects.forEach((obj) => {
        const emitter = (obj.components && obj.components.ParticleEmitter) || null;
        if (!emitter || emitter.enabled === false || emitter.loop !== true) return;
        const interval = Math.max(0.1, (Math.max(100, Number(emitter.interval) || 1000)) / 1000);
        nextIds.add(obj.id);
        const timer = (emitterTimers.get(obj.id) ?? 0) - dt;
        if (timer <= 0) {
          emitObject(obj, objects);
          emitterTimers.set(obj.id, interval);
        } else {
          emitterTimers.set(obj.id, timer);
        }
      });
      Array.from(emitterTimers.keys()).forEach((id) => {
        if (!nextIds.has(id)) emitterTimers.delete(id);
      });
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.life -= dt;
        if (particle.life <= 0) {
          const lastIndex = particles.length - 1;
          if (i !== lastIndex) particles[i] = particles[lastIndex];
          particles.pop();
          continue;
        }
        const dragFactor = Math.pow(particle.drag, dt * 60);
        particle.vx *= dragFactor;
        particle.vy *= dragFactor;
        particle.vy += particle.gravity * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.rotSpeed) particle.rot += particle.rotSpeed * dt;
      }
    },
    renderWorld(ctx, offsetX = 0, offsetY = 0) {
      particles.forEach((particle) => {
        if (particle.screen) return;
        const progress = 1 - (particle.life / particle.maxLife);
        const size = particle.sizeStart + ((particle.sizeEnd - particle.sizeStart) * progress);
        const alpha = clamp01(particle.life / particle.maxLife);
        const px = particle.x - offsetX;
        const py = particle.y - offsetY;
        ctx.save();
        ctx.globalAlpha = alpha;
        if (particle.imageId) {
          const asset = assetById.get(particle.imageId);
          const src = asset && (asset.previewUrl || asset.url || asset.src);
          if (src) {
            if (!imageCacheRef.current.has(src)) {
              const img = new Image();
              img.src = src;
              imageCacheRef.current.set(src, img);
            }
            const img = imageCacheRef.current.get(src);
            if (img && img.complete && img.naturalWidth > 0) {
              ctx.translate(px, py);
              if (particle.rot) ctx.rotate(particle.rot);
              ctx.drawImage(img, -size * 0.5, -size * 0.5, size, size);
              ctx.restore();
              return;
            }
          }
        }
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.5, size * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    },
    renderScreen(ctx) {
      particles.forEach((particle) => {
        if (!particle.screen) return;
        const progress = 1 - (particle.life / particle.maxLife);
        const size = particle.sizeStart + ((particle.sizeEnd - particle.sizeStart) * progress);
        const alpha = clamp01(particle.life / particle.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        if (particle.imageId) {
          const asset = assetById.get(particle.imageId);
          const src = asset && (asset.previewUrl || asset.url || asset.src);
          if (src) {
            if (!imageCacheRef.current.has(src)) {
              const img = new Image();
              img.src = src;
              imageCacheRef.current.set(src, img);
            }
            const img = imageCacheRef.current.get(src);
            if (img && img.complete && img.naturalWidth > 0) {
              ctx.translate(particle.x, particle.y);
              if (particle.rot) ctx.rotate(particle.rot);
              ctx.drawImage(img, -size * 0.5, -size * 0.5, size, size);
              ctx.restore();
              return;
            }
          }
        }
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, Math.max(0.5, size * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    },
  };
}

function computePositionalVolume(distance, maxDistance) {
  const dist = Math.max(0, Number(distance) || 0);
  const maxDist = Math.max(0.0001, Number(maxDistance) || 0.0001);
  return Math.max(0, Math.min(1, 1 - (dist / maxDist)));
}

function createPlayAudioSystem({ assetById, gameObjects, onLog, getNow }) {
  let masterVolume = 1;
  let listenerX = 0;
  let listenerY = 0;
  let currentMusic = null;
  const handles = new Set();

  function resolveAudioSrc(assetId) {
    if (!assetId) return null;
    const asset = assetById.get(assetId);
    if (!asset) return null;
    return asset.previewUrl || asset.url || asset.src || null;
  }

  function resolveTarget(target) {
    if (!target) return null;
    if (typeof target === 'string') return gameObjects.find((obj) => obj.id === target) || null;
    if (typeof target === 'object' && target.id) return target;
    return null;
  }

  function applyHandleVolume(handle) {
    if (!handle || !handle.audio) return;
    let positional = 1;
    if (handle.maxDistance > 0 && handle.sourceObjectId) {
      const obj = gameObjects.find((entry) => entry.id === handle.sourceObjectId);
      if (obj) {
        const dx = (Number(obj.x) || 0) - listenerX;
        const dy = (Number(obj.y) || 0) - listenerY;
        const dist = Math.hypot(dx, dy);
        positional = computePositionalVolume(dist, handle.maxDistance);
      }
    }
    handle.audio.volume = clamp01(handle.baseVolume * masterVolume * positional);
  }

  function stopHandle(handle) {
    if (!handle) return;
    try {
      handle.audio.pause();
      handle.audio.currentTime = 0;
    } catch (_err) {
      // Ignore source stop errors.
    }
    handles.delete(handle);
    if (currentMusic === handle) currentMusic = null;
  }

  function play(assetId, options = {}) {
    if (typeof Audio === 'undefined') return null;
    const src = resolveAudioSrc(assetId);
    if (!src) {
      onLog({ type: 'warn', message: `Missing audio asset: ${assetId}`, time: getNow() });
      return null;
    }
    const handle = {
      audio: new Audio(src),
      assetId,
      baseVolume: clamp01(options.volume ?? 1),
      sourceObjectId: options.sourceObjectId || null,
      maxDistance: Number.isFinite(options.maxDistance) ? Math.max(0, options.maxDistance) : 0,
      category: options.category === 'music' ? 'music' : 'sfx',
    };
    handle.audio.loop = !!options.loop;
    handle.audio.preload = 'auto';
    handle.audio.addEventListener('ended', () => {
      if (!handle.audio.loop) handles.delete(handle);
      if (currentMusic === handle && !handle.audio.loop) currentMusic = null;
    });
    handles.add(handle);
    applyHandleVolume(handle);
    const playPromise = handle.audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        onLog({ type: 'warn', message: `Audio play blocked: ${err.message}`, time: getNow() });
      });
    }
    return handle;
  }

  const api = {
    play(assetId, options = {}) {
      return play(assetId, options);
    },
    playMusic(assetId, options = {}) {
      if (currentMusic) stopHandle(currentMusic);
      currentMusic = play(assetId, { ...options, loop: options.loop !== false, category: 'music' });
      return currentMusic;
    },
    stopMusic() {
      if (currentMusic) stopHandle(currentMusic);
      currentMusic = null;
    },
    playObjectSound(target, overrides = {}) {
      const obj = resolveTarget(target);
      if (!obj) return null;
      const sound = (obj.components && obj.components.Sound) || null;
      if (!sound || !sound.assetId) return null;
      const opts = {
        loop: overrides.loop !== undefined ? overrides.loop : !!sound.loop,
        volume: overrides.volume !== undefined ? overrides.volume : (Number.isFinite(sound.volume) ? sound.volume : 1),
        maxDistance: overrides.maxDistance !== undefined ? overrides.maxDistance : (Number.isFinite(sound.maxDistance) ? sound.maxDistance : 0),
        category: overrides.category || (sound.category === 'music' ? 'music' : 'sfx'),
        sourceObjectId: obj.id,
      };
      if (opts.category === 'music') return api.playMusic(sound.assetId, opts);
      return play(sound.assetId, opts);
    },
    stopObjectSound(target) {
      const obj = resolveTarget(target);
      if (!obj) return;
      Array.from(handles).forEach((handle) => {
        if (handle.sourceObjectId === obj.id) stopHandle(handle);
      });
    },
    stop(handle) {
      stopHandle(handle);
    },
    stopAll() {
      Array.from(handles).forEach((handle) => stopHandle(handle));
      currentMusic = null;
    },
    setMasterVolume(nextVolume) {
      masterVolume = clamp01(nextVolume);
      handles.forEach((handle) => applyHandleVolume(handle));
      return masterVolume;
    },
    getMasterVolume() {
      return masterVolume;
    },
  };

  return {
    api,
    autoplayFromComponents() {
      gameObjects.forEach((obj) => {
        const sound = (obj.components && obj.components.Sound) || null;
        if (!sound || !sound.assetId || !sound.autoplay) return;
        api.playObjectSound(obj);
      });
    },
    updateListener(camera, objects) {
      const targetId = camera && camera.targetObjectId;
      const target = targetId ? (objects || gameObjects).find((obj) => obj.id === targetId) : null;
      listenerX = target ? (Number(target.x) || 0) : (camera && Number(camera.originX)) || 0;
      listenerY = target ? (Number(target.y) || 0) : (camera && Number(camera.originY)) || 0;
      handles.forEach((handle) => applyHandleVolume(handle));
    },
    destroy() {
      api.stopAll();
    },
  };
}

function createKozUIManager({ rootRef, onLog, getContext }) {
  const screens = new Map();
  const layers = new Map();

  function resolveNode(node) {
    if (!node) return null;
    if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) return node;
    if (node.elt && typeof HTMLElement !== 'undefined' && node.elt instanceof HTMLElement) return node.elt;
    return null;
  }

  function getRoot() {
    const root = rootRef && rootRef.current;
    if (!root) return null;
    if (!root.style.position) root.style.position = 'absolute';
    if (!root.style.inset) root.style.inset = '0';
    if (!root.style.pointerEvents) root.style.pointerEvents = 'none';
    return root;
  }

  function ensureLayer(layerId, order = 0) {
    const id = layerId || 'default';
    if (layers.has(id)) return layers.get(id);
    const root = getRoot();
    if (!root) return null;
    const layer = document.createElement('div');
    layer.dataset.uiLayer = id;
    layer.style.position = 'absolute';
    layer.style.inset = '0';
    layer.style.zIndex = String(order);
    layer.style.pointerEvents = 'none';
    root.appendChild(layer);
    layers.set(id, layer);
    return layer;
  }

  function ensureContainer(screen) {
    if (screen.container) return screen.container;
    const root = getRoot();
    if (!root) return null;
    const ctx = getContext ? getContext() : {};
    let node = null;
    if (screen.def && typeof screen.def.create === 'function') {
      try {
        node = resolveNode(screen.def.create(ctx));
      } catch (e) {
        onLog({ type: 'error', message: `UI create error (${screen.id}): ${e.message}`, time: new Date().toLocaleTimeString() });
      }
    }
    if (!node) {
      node = document.createElement('div');
      node.textContent = screen.id;
    }
    if (!node.id) node.id = screen.id;
    node.dataset.uiScreen = screen.id;
    node.style.display = 'none';
    node.style.pointerEvents = node.style.pointerEvents || 'auto';
    if (Number.isFinite(screen.def && screen.def.zIndex)) node.style.zIndex = String(screen.def.zIndex);
    const layer = ensureLayer((screen.def && screen.def.layer) || 'default', (screen.def && screen.def.layerOrder) || 0);
    if (layer) layer.appendChild(node);
    screen.container = node;
    return node;
  }

  function isValidForScene(screen, ctx) {
    const def = screen.def || {};
    const validScenes = Array.isArray(def.validScenes) ? def.validScenes : null;
    if (!validScenes || validScenes.length === 0) return true;
    return validScenes.some((scene) => scene === ctx.sceneId || scene === ctx.sceneName);
  }

  function isValidForState(screen, ctx) {
    const def = screen.def || {};
    const validStates = Array.isArray(def.validStates) ? def.validStates : null;
    if (!validStates || validStates.length === 0) return true;
    return validStates.includes(ctx.gameState);
  }

  function shouldShow(screen, ctx) {
    if (!isValidForScene(screen, ctx)) return false;
    if (!isValidForState(screen, ctx)) return false;
    const def = screen.def || {};
    if (typeof def.isVisible === 'function') {
      try {
        return !!def.isVisible(ctx);
      } catch (e) {
        onLog({ type: 'error', message: `UI visibility error (${screen.id}): ${e.message}`, time: new Date().toLocaleTimeString() });
        return false;
      }
    }
    return true;
  }

  function showScreen(screen, ctx) {
    const node = ensureContainer(screen);
    if (!node) return;
    if (screen.fadeTimer) {
      clearTimeout(screen.fadeTimer);
      screen.fadeTimer = null;
    }
    node.style.display = '';
    if (!screen.visible && screen.def && typeof screen.def.show === 'function') {
      try { screen.def.show.call(screen, ctx); }
      catch (e) { onLog({ type: 'error', message: `UI show error (${screen.id}): ${e.message}`, time: new Date().toLocaleTimeString() }); }
    }
    screen.visible = true;
  }

  function hideScreen(screen, ctx) {
    if (!screen.container) {
      screen.visible = false;
      return;
    }
    if (screen.visible && screen.def && typeof screen.def.hide === 'function') {
      try { screen.def.hide.call(screen, ctx); }
      catch (e) { onLog({ type: 'error', message: `UI hide error (${screen.id}): ${e.message}`, time: new Date().toLocaleTimeString() }); }
    } else {
      screen.container.style.display = 'none';
    }
    screen.visible = false;
  }

  const api = {
    registerScreen(id, def = {}) {
      if (!id) return null;
      const existing = screens.get(id);
      if (existing && existing.container && existing.container.parentElement) {
        existing.container.parentElement.removeChild(existing.container);
      }
      if (existing && existing.fadeTimer) clearTimeout(existing.fadeTimer);
      const screen = { id, def, container: null, visible: false, fadeTimer: null };
      screens.set(id, screen);
      if (def.createOnRegister !== false) ensureContainer(screen);
      return api;
    },
    unregisterScreen(id) {
      const screen = screens.get(id);
      if (!screen) return;
      if (screen.fadeTimer) clearTimeout(screen.fadeTimer);
      if (screen.container && screen.container.parentElement) screen.container.parentElement.removeChild(screen.container);
      screens.delete(id);
    },
    scheduleFadeHide(id, delay = 200) {
      const screen = screens.get(id);
      if (!screen || !screen.container) return;
      if (screen.fadeTimer) clearTimeout(screen.fadeTimer);
      screen.fadeTimer = setTimeout(() => {
        if (!screen.visible && screen.container) screen.container.style.display = 'none';
      }, Math.max(0, delay || 0));
    },
    updateAll(extra = {}) {
      const ctx = { ...(getContext ? getContext() : {}), ...extra };
      screens.forEach((screen) => {
        const visible = shouldShow(screen, ctx);
        if (visible) showScreen(screen, ctx);
        else hideScreen(screen, ctx);
        if (visible && screen.def && typeof screen.def.update === 'function') {
          try { screen.def.update.call(screen, ctx); }
          catch (e) { onLog({ type: 'error', message: `UI update callback error (${screen.id}): ${e.message}`, time: new Date().toLocaleTimeString() }); }
        }
      });
    },
    getScreen(id) {
      const screen = screens.get(id);
      return screen ? (screen.container || null) : null;
    },
    clear() {
      screens.forEach((screen) => {
        if (screen.fadeTimer) clearTimeout(screen.fadeTimer);
        if (screen.container && screen.container.parentElement) {
          screen.container.parentElement.removeChild(screen.container);
        }
      });
      screens.clear();
      layers.forEach((layer) => {
        if (layer.parentElement) layer.parentElement.removeChild(layer);
      });
      layers.clear();
    },
    destroy() {
      api.clear();
    },
  };

  return api;
}

function resolveSceneName(projectSnapshot, sceneId) {
  const scenes = Array.isArray(projectSnapshot && projectSnapshot.scenes) ? projectSnapshot.scenes : [];
  const scene = scenes.find((entry) => entry.id === sceneId);
  return scene ? scene.name : sceneId;
}

function readGameState() {
  if (typeof window === 'undefined') return null;
  const gsm = window.gameStateManager;
  if (!gsm) return null;
  if (typeof gsm.getState === 'function') return gsm.getState();
  if (gsm.currentState !== undefined) return gsm.currentState;
  if (gsm.state !== undefined) return gsm.state;
  if (gsm.current !== undefined) return gsm.current;
  return null;
}

function resolveRuntimeScene(state) {
  const fallbackId = (state && state.activeSceneId) || 'scene_main';
  const fallbackName = resolveSceneName(state && state.projectSnapshot, fallbackId);
  if (typeof window === 'undefined' || !window.sceneManager) return { id: fallbackId, name: fallbackName };
  const sm = window.sceneManager;
  let active = null;
  if (typeof sm.getActiveScene === 'function') active = sm.getActiveScene();
  else if (sm.activeScene !== undefined) active = sm.activeScene;
  else if (sm.currentScene !== undefined) active = sm.currentScene;
  if (typeof active === 'string') {
    return { id: active, name: resolveSceneName(state && state.projectSnapshot, active) };
  }
  if (active && typeof active === 'object') {
    const id = active.id || active.sceneId || sm.activeSceneId || sm.currentSceneId || fallbackId;
    const name = active.name || resolveSceneName(state && state.projectSnapshot, id);
    return { id, name };
  }
  const id = sm.activeSceneId || sm.currentSceneId || fallbackId;
  return { id, name: resolveSceneName(state && state.projectSnapshot, id) };
}

function sampleTrack(track, time) {
  const kfs = track.keyframes;
  if (!kfs || kfs.length === 0) return 0;
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

function resolveWorldMetrics(world, cellSize = CELL_SIZE) {
  if (!world || !Array.isArray(world.grid)) return null;
  const rows = Number.isFinite(world.rows) ? world.rows : world.grid.length;
  const cols = Number.isFinite(world.cols) ? world.cols : ((world.grid[0] && world.grid[0].length) || 0);
  if (rows <= 0 || cols <= 0) return null;
  const offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
  const minX = offsetX * cellSize;
  const minY = offsetY * cellSize;
  const width = cols * cellSize;
  const height = rows * cellSize;
  return {
    cellSize,
    rows,
    cols,
    offsetX,
    offsetY,
    minX,
    minY,
    maxX: minX + width,
    maxY: minY + height,
    width,
    height,
  };
}

function resolveCellCollisions(state) {
  const world = state && state.world;
  if (!world || !Array.isArray(world.grid)) return;
  const rows = Number.isFinite(world.rows) ? world.rows : world.grid.length;
  const cols = Number.isFinite(world.cols) ? world.cols : ((world.grid[0] && world.grid[0].length) || 0);
  const offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
  if (rows <= 0 || cols <= 0) return;

  const project = state.projectSnapshot || {};
  const objects = Array.isArray(state.gameObjects) ? state.gameObjects : [];

  for (const obj of objects) {
    const collision = (obj.components && obj.components.Collision) || {};
    if (collision.enabled === false || collision.isTrigger) continue;

    let iterations = 0;
    while (iterations < 4) {
      iterations += 1;
      const rect = getColliderRect(obj);
      if (rect.w <= 0 || rect.h <= 0) break;

      const worldMinX = offsetX;
      const worldMinY = offsetY;
      const worldMaxX = offsetX + cols - 1;
      const worldMaxY = offsetY + rows - 1;

      const minX = Math.max(worldMinX, Math.floor(rect.x / CELL_SIZE));
      const minY = Math.max(worldMinY, Math.floor(rect.y / CELL_SIZE));
      const maxX = Math.min(worldMaxX, Math.floor((rect.x + rect.w - 1) / CELL_SIZE));
      const maxY = Math.min(worldMaxY, Math.floor((rect.y + rect.h - 1) / CELL_SIZE));
      if (minX > maxX || minY > maxY) break;

      let resolved = false;
      for (let y = minY; y <= maxY && !resolved; y += 1) {
        for (let x = minX; x <= maxX && !resolved; x += 1) {
          const ly = y - offsetY;
          const lx = x - offsetX;
          const cell = world.grid[ly] && world.grid[ly][lx];
          if (!isCollidableCell(project, cell)) continue;
          const tile = { x: x * CELL_SIZE, y: y * CELL_SIZE, w: CELL_SIZE, h: CELL_SIZE };
          const overlap = getOverlap(rect, tile);
          if (!overlap) continue;

          if (Math.abs(overlap.dx) <= Math.abs(overlap.dy)) {
            obj.x += overlap.dx;
            if (typeof obj.vx === 'number' && ((overlap.dx < 0 && obj.vx > 0) || (overlap.dx > 0 && obj.vx < 0))) {
              obj.vx = 0;
            }
          } else {
            obj.y += overlap.dy;
            if (typeof obj.vy === 'number' && ((overlap.dy < 0 && obj.vy > 0) || (overlap.dy > 0 && obj.vy < 0))) {
              obj.vy = 0;
            }
            if (overlap.dy < 0 && typeof obj.grounded === 'boolean') {
              obj.grounded = true;
            }
          }
          resolved = true;
        }
      }
      if (!resolved) break;
    }
  }
}

function getColliderRect(obj) {
  const collider = (obj && obj.components && obj.components.Collider) || {};
  const w = Number.isFinite(collider.width) ? collider.width : (Number.isFinite(obj.width) ? obj.width : 0);
  const h = Number.isFinite(collider.height) ? collider.height : (Number.isFinite(obj.height) ? obj.height : 0);
  const ox = Number.isFinite(collider.offsetX) ? collider.offsetX : (Number.isFinite(collider.x) ? collider.x : 0);
  const oy = Number.isFinite(collider.offsetY) ? collider.offsetY : (Number.isFinite(collider.y) ? collider.y : 0);
  return {
    x: (Number.isFinite(obj.x) ? obj.x : 0) + ox,
    y: (Number.isFinite(obj.y) ? obj.y : 0) + oy,
    w,
    h,
  };
}

function isCollidableCell(project, cell) {
  if (normalizeCellTypeId(cell) === 'empty') return false;
  const type = getCellType(project, cell);
  return !!(type && type.collision);
}

function getOverlap(a, b) {
  const overlapLeft = (a.x + a.w) - b.x;
  const overlapRight = (b.x + b.w) - a.x;
  const overlapTop = (a.y + a.h) - b.y;
  const overlapBottom = (b.y + b.h) - a.y;
  if (overlapLeft <= 0 || overlapRight <= 0 || overlapTop <= 0 || overlapBottom <= 0) return null;

  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;

  return {
    dx: ax < bx ? -overlapLeft : overlapRight,
    dy: ay < by ? -overlapTop : overlapBottom,
  };
}

function resolvePlayCamera(state) {
  const fallback = state.cameraConfig || {};
  const objects = Array.isArray(state.gameObjects) ? state.gameObjects : [];
  const metrics = resolveWorldMetrics(state.world, CELL_SIZE);
  const fallbackOriginX = Number.isFinite(fallback.originX)
    ? fallback.originX
    : (metrics ? metrics.minX + (metrics.width * 0.5) : 0);
  const fallbackOriginY = Number.isFinite(fallback.originY)
    ? fallback.originY
    : (metrics ? metrics.minY + (metrics.height * 0.5) : 0);
  const cameraObject = objects.find((o) => {
    const c = o && o.components && o.components.Camera;
    return c && c.enabled !== false;
  });

  const cameraComp = cameraObject ? (cameraObject.components.Camera || {}) : {};
  let targetObjectId = cameraComp.targetObjectId || fallback.targetObjectId || null;
  // Auto-detect player as target when none is explicitly set
  if (!targetObjectId) {
    const player = objects.find((o) => o.type === 'player');
    targetObjectId = player ? player.id : null;
  }

  if (!cameraObject) {
    return {
      ...fallback,
      source: 'engine-fallback',
      objectId: null,
      originX: fallbackOriginX,
      originY: fallbackOriginY,
      targetObjectId,
      offsetX: 0, offsetY: 0, followX: true, followY: true, clampToWorld: true,
    };
  }

  return {
    ...fallback,
    ...cameraComp,
    source: 'object',
    objectId: cameraObject.id,
    originX: Number.isFinite(cameraObject.x) ? cameraObject.x : 0,
    originY: Number.isFinite(cameraObject.y) ? cameraObject.y : 0,
    targetObjectId,
  };
}

function smoothAxis(current, target, dt, speed, maxSpeed) {
  if (!Number.isFinite(target)) return current;
  const alpha = 1 - Math.exp(-Math.max(0.1, speed) * Math.max(0.0001, dt));
  let next = current + (target - current) * alpha;
  if (Number.isFinite(maxSpeed)) {
    const delta = next - current;
    const maxStep = Math.max(1, maxSpeed) * Math.max(0.0001, dt);
    if (delta > maxStep) next = current + maxStep;
    if (delta < -maxStep) next = current - maxStep;
  }
  return next;
}

function resolveDesiredView(state, camera, dt, snapToTarget, viewW = 960, viewH = 540) {
  const objects = Array.isArray(state.gameObjects) ? state.gameObjects : [];
  const target = camera.targetObjectId ? objects.find((o) => o.id === camera.targetObjectId) : null;
  const offsetX = Number.isFinite(camera.offsetX) ? camera.offsetX : 0;
  const offsetY = Number.isFinite(camera.offsetY) ? camera.offsetY : 0;
  const lookAheadX = Number.isFinite(camera.lookAheadX) ? camera.lookAheadX : 0;
  const lookAheadY = Number.isFinite(camera.lookAheadY) ? camera.lookAheadY : 0;
  const deadZoneWidth = Math.max(0, Number.isFinite(camera.deadZoneWidth) ? camera.deadZoneWidth : 0);
  const deadZoneHeight = Math.max(0, Number.isFinite(camera.deadZoneHeight) ? camera.deadZoneHeight : 0);
  const visibleMargin = Math.max(0, Number.isFinite(camera.visibleMargin) ? camera.visibleMargin : 0);
  const followX = camera.followX !== false;
  const followY = camera.followY !== false;

  let desiredX = Number.isFinite(state.viewX) ? state.viewX : 0;
  let desiredY = Number.isFinite(state.viewY) ? state.viewY : 0;

  const focusCenterX = target
    ? (target.x + (target.width || 32) * 0.5 + offsetX + lookAheadX)
    : (Number.isFinite(camera.originX) ? camera.originX + offsetX + lookAheadX : desiredX + viewW * 0.5);
  const focusCenterY = target
    ? (target.y + (target.height || 32) * 0.5 + offsetY + lookAheadY)
    : (Number.isFinite(camera.originY) ? camera.originY + offsetY + lookAheadY : desiredY + viewH * 0.5);

  if (followX) {
    if (snapToTarget || deadZoneWidth <= 0) {
      desiredX = focusCenterX - viewW * 0.5;
    } else {
      const currentLeft = (state.viewX || 0) + viewW * 0.5 - deadZoneWidth * 0.5;
      const currentRight = (state.viewX || 0) + viewW * 0.5 + deadZoneWidth * 0.5;
      if (focusCenterX < currentLeft) desiredX = focusCenterX - (viewW * 0.5 - deadZoneWidth * 0.5);
      if (focusCenterX > currentRight) desiredX = focusCenterX - (viewW * 0.5 + deadZoneWidth * 0.5);
    }
  }
  if (followY) {
    if (snapToTarget || deadZoneHeight <= 0) {
      desiredY = focusCenterY - viewH * 0.5;
    } else {
      const currentTop = (state.viewY || 0) + viewH * 0.5 - deadZoneHeight * 0.5;
      const currentBottom = (state.viewY || 0) + viewH * 0.5 + deadZoneHeight * 0.5;
      if (focusCenterY < currentTop) desiredY = focusCenterY - (viewH * 0.5 - deadZoneHeight * 0.5);
      if (focusCenterY > currentBottom) desiredY = focusCenterY - (viewH * 0.5 + deadZoneHeight * 0.5);
    }
  }

  if (target) {
    const tx = Number.isFinite(target.x) ? target.x : 0;
    const ty = Number.isFinite(target.y) ? target.y : 0;
    const tw = Number.isFinite(target.width) ? target.width : 32;
    const th = Number.isFinite(target.height) ? target.height : 32;
    const left = desiredX + visibleMargin;
    const right = desiredX + viewW - visibleMargin;
    const top = desiredY + visibleMargin;
    const bottom = desiredY + viewH - visibleMargin;
    if (followX) {
      if (tx < left) desiredX = tx - visibleMargin;
      if (tx + tw > right) desiredX = tx + tw + visibleMargin - viewW;
    }
    if (followY) {
      if (ty < top) desiredY = ty - visibleMargin;
      if (ty + th > bottom) desiredY = ty + th + visibleMargin - viewH;
    }
  }

  if (camera.clampToWorld !== false) {
    const world = state.world || {};
    const rows = Number.isFinite(world.rows) ? world.rows : ((world.grid && world.grid.length) || 0);
    const cols = Number.isFinite(world.cols) ? world.cols : ((world.grid && world.grid[0] && world.grid[0].length) || 0);
    if (cols > 0 && rows > 0) {
      const ox = Number.isFinite(world.offsetX) ? world.offsetX : 0;
      const oy = Number.isFinite(world.offsetY) ? world.offsetY : 0;
      const minX = ox * CELL_SIZE;
      const minY = oy * CELL_SIZE;
      const maxX = (ox + cols) * CELL_SIZE - viewW;
      const maxY = (oy + rows) * CELL_SIZE - viewH;
      desiredX = maxX < minX ? minX - ((viewW - cols * CELL_SIZE) * 0.5) : Math.max(minX, Math.min(maxX, desiredX));
      desiredY = maxY < minY ? minY - ((viewH - rows * CELL_SIZE) * 0.5) : Math.max(minY, Math.min(maxY, desiredY));
    }
  }

  return { x: desiredX, y: desiredY };
}
