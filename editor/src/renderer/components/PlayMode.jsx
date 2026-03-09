import React, { useRef, useEffect, useCallback } from 'react';
import { getCellType, normalizeCellTypeId } from '../state/projectModel.js';

/**
 * In-editor play mode.
 * Runs the game in an iframe-like canvas overlay using p5.js-style runtime.
 * State is fully isolated — stopping restores the original project data.
 */

const CELL_SIZE = 24;

export function usePlayMode(project, onLog) {
  const stateRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const keysRef = useRef(new Set());
  const imageCacheRef = useRef(new Map());

  const isPlaying = stateRef.current !== null && stateRef.current.running;

  const start = useCallback(() => {
    if (!project) return;

    // Deep clone project as runtime snapshot (isolate from editor)
    const snapshot = JSON.parse(JSON.stringify(project));

    const gameObjects = [];
    const scripts = {};
    const scriptInstances = [];
    const animClips = snapshot.animations || [];

    // Load objects
    (snapshot.objects || []).forEach(obj => {
      const t = (obj.components && obj.components.Transform) || {};
      gameObjects.push({
        id: obj.id, name: obj.name, type: obj.type,
        x: t.x || obj.x || 0, y: t.y || obj.y || 0,
        width: (obj.components && obj.components.Sprite && obj.components.Sprite.width) || 32,
        height: (obj.components && obj.components.Sprite && obj.components.Sprite.height) || 32,
        color: (obj.components && obj.components.Sprite && obj.components.Sprite.color) || '#4ade80',
        components: obj.components || {},
      });
    });

    // Index scripts
    (snapshot.scripts || []).forEach(s => { scripts[s.id] = s; });
    const scriptingConfig = snapshot.scripting || { engines: { javascript: true } };
    const assetById = new Map((snapshot.assets || []).map((a) => [a.id, a]));
    const warnedMissingAssets = new Set();

    // Build console interceptor
    const makeConsole = () => ({
      log: (...args) => onLog({ type: 'log', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
      warn: (...args) => onLog({ type: 'warn', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
      error: (...args) => onLog({ type: 'error', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
    });
    const sandboxConsole = makeConsole();

    // Bind scripts to objects (supports multiple bindings per object)
    gameObjects.forEach(obj => {
      const bindings = obj.components.ScriptBindings || [];
      // Legacy single binding support
      const legacy = obj.components.ScriptBinding;
      if (legacy && legacy.scriptId) bindings.push({ scriptId: legacy.scriptId, active: true, properties: {} });

      bindings.forEach(binding => {
        if (!binding.active || !binding.scriptId || !scripts[binding.scriptId]) return;
        try {
          const src = scripts[binding.scriptId].source;
          const language = scripts[binding.scriptId].language || 'javascript';
          const enabled = language === 'javascript' || !!(scriptingConfig.engines && scriptingConfig.engines[language]);
          if (!enabled || language !== 'javascript') {
            onLog({ type: 'warn', message: `Script "${scripts[binding.scriptId].name}" skipped (${language} runtime unavailable in play mode).`, time: new Date().toLocaleTimeString() });
            return;
          }
          const factory = new Function('return (function(self, props, console, keyIsDown, LEFT_ARROW, RIGHT_ARROW, UP_ARROW) { ' + src + ' return { onInit: typeof onInit==="function"?onInit:null, onUpdate: typeof onUpdate==="function"?onUpdate:null }; })')();
          const props = binding.properties ? JSON.parse(JSON.stringify(binding.properties)) : {};
          const hooks = factory(obj, props, sandboxConsole, (code) => keysRef.current.has(code), 37, 39, 38);
          scriptInstances.push({ obj, hooks, props });
        } catch (e) {
          onLog({ type: 'error', message: `Script compile error: ${e.message}`, time: new Date().toLocaleTimeString() });
        }
      });
    });

    gameObjects.forEach((obj) => {
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

    const state = {
      running: true,
      elapsed: 0,
      projectSnapshot: snapshot,
      world: snapshot.world,
      gameObjects,
      assetById,
      scriptInstances,
      animClips,
      keys: keysRef.current,
      cameraConfig: snapshot.camera || {},
      viewX: 0,
      viewY: 0,
    };

    // Engine API for scripts
    const engine = {
      gameObjects,
      elapsed: 0,
      findObject: (id) => gameObjects.find(o => o.id === id) || null,
      findObjectsByType: (type) => gameObjects.filter(o => o.type === type),
      keyIsDown: (code) => keysRef.current.has(code),
    };

    // Run onInit
    scriptInstances.forEach(inst => {
      if (inst.hooks.onInit) {
        try { inst.hooks.onInit(inst.obj, engine); }
        catch (e) { onLog({ type: 'error', message: `onInit error: ${e.message}`, time: new Date().toLocaleTimeString() }); }
      }
    });

    onLog({ type: 'info', message: 'Play mode started', time: new Date().toLocaleTimeString() });

    stateRef.current = state;
    startLoop();
  }, [project, onLog]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
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

      // Evaluate animations
      state.animClips.forEach(clip => {
        if (!clip.tracks) return;
        const dur = clip.duration || 1;
        const t = clip.loop ? (state.elapsed % dur) : Math.min(state.elapsed, dur);
        clip.tracks.forEach(track => {
          const obj = state.gameObjects.find(o => o.id === track.targetObjectId);
          if (!obj || !track.keyframes || track.keyframes.length === 0) return;
          obj[track.property] = sampleTrack(track, t);
        });
      });

      // Engine API
      const engine = {
        gameObjects: state.gameObjects,
        elapsed: state.elapsed,
        findObject: (id) => state.gameObjects.find(o => o.id === id) || null,
        keyIsDown: (code) => keysRef.current.has(code),
      };

      // Script updates
      state.scriptInstances.forEach(inst => {
        if (inst.hooks.onUpdate) {
          try { inst.hooks.onUpdate(inst.obj, engine, dt); }
          catch (e) { onLog({ type: 'error', message: `onUpdate error: ${e.message}`, time: new Date().toLocaleTimeString() }); }
        }
      });

      // Render
      const camera = state.cameraConfig || {};
      const camTarget = camera.targetObjectId ? state.gameObjects.find((o) => o.id === camera.targetObjectId) : null;
      if (camTarget) {
        const speed = Number.isFinite(camera.speed) ? camera.speed : 8;
        state.viewX = (state.viewX || 0) + (camTarget.x - (state.viewX || 0)) * Math.min(dt * speed, 1);
        state.viewY = (state.viewY || 0) + (camTarget.y - (state.viewY || 0)) * Math.min(dt * speed, 1);
      }
      renderFrame(state);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function renderFrame(state) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-(state.viewX || 0), -(state.viewY || 0));

    // World
    const world = state.world;
    if (world && world.grid) {
      const proj = state.projectSnapshot || {};
      const cellLayers = ((proj.layers && proj.layers.cells) || [])
        .filter((layer) => layer.visible !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      for (const layer of cellLayers) {
        for (let y = 0; y < world.rows; y++) {
          for (let x = 0; x < world.cols; x++) {
            const cell = world.grid[y] && world.grid[y][x];
            if (normalizeCellTypeId(cell) === 'empty') continue;
            const type = getCellType(proj, cell);
            if ((type.layerId || cellLayers[0].id) !== layer.id) continue;
            ctx.fillStyle = type.color || '#334155';
            ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
          }
        }
      }
    }

    // Objects
    const proj = state.projectSnapshot || {};
    const objectLayers = ((proj.layers && proj.layers.objects) || [])
      .filter((layer) => layer.visible !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    state.gameObjects.slice().sort((a, b) => {
      const ar = (a.components && a.components.Render) || {};
      const br = (b.components && b.components.Render) || {};
      const ao = objectLayers.find((l) => l.id === ar.layerId);
      const bo = objectLayers.find((l) => l.id === br.layerId);
      const layerDelta = ((ao && ao.order) || 0) - ((bo && bo.order) || 0);
      if (layerDelta !== 0) return layerDelta;
      return (ar.zIndex || 0) - (br.zIndex || 0);
    }).forEach(obj => {
      const render = (obj.components && obj.components.Render) || {};
      const sprite = (obj.components && obj.components.Sprite) || {};
      if (render.visible === false) return;
      let drawn = false;
      const frameIds = Array.isArray(sprite.frameAssetIds) ? sprite.frameAssetIds : [];
      const frameId = frameIds.length > 0
        ? frameIds[Math.floor(state.elapsed * (sprite.fps || 8)) % frameIds.length]
        : sprite.assetId;
      const asset = frameId ? state.assetById.get(frameId) : null;
      const sourceAsset = asset && asset.sourceAssetId ? state.assetById.get(asset.sourceAssetId) : null;
      const src = (sourceAsset && (sourceAsset.previewUrl || sourceAsset.url || sourceAsset.src))
        || (asset && (asset.previewUrl || asset.url || asset.src));
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
            ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, obj.x, obj.y, obj.width, obj.height);
          } else {
            ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
          }
          drawn = true;
        }
      }
      if (!drawn) {
        ctx.fillStyle = obj.color;
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      }
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(obj.name, obj.x + obj.width / 2, obj.y - 3);
    });

    ctx.restore();

    // HUD
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`PLAY MODE | ${state.elapsed.toFixed(1)}s`, 8, 16);
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

  return { canvasRef, isPlaying, start, stop, execute };
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
