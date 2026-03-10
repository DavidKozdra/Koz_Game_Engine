import React, { useRef, useEffect, useCallback } from 'react';
import { getCellType, normalizeCellTypeId } from '../state/projectModel.js';
import { buildWorldSparseIndex, queryWorldSparseIndex } from '../lib/worldSparseIndex.js';

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
      const tx = Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0);
      const ty = Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0);
      gameObjects.push({
        id: obj.id, name: obj.name, type: obj.type,
        x: tx, y: ty,
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
          const factory = new Function('return (function(self, props, console, keyIsDown, LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW, SPACE) { ' + src + ' return { onInit: typeof onInit==="function"?onInit:null, onUpdate: typeof onUpdate==="function"?onUpdate:null }; })')();
          const props = binding.properties ? JSON.parse(JSON.stringify(binding.properties)) : {};
          const hooks = factory(obj, props, sandboxConsole, (code) => keysRef.current.has(code), 37, 39, 38, 40, 32);
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
      worldSparse: null,
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

    const baseCellLayer = (((snapshot.layers || {}).cells || [])
      .filter((layer) => layer.visible !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0))[0] || { id: null }).id;
    state.worldSparse = buildWorldSparseIndex(state.world, (cell) => {
      if (normalizeCellTypeId(cell) === 'empty') return null;
      const type = getCellType(snapshot, cell);
      return { type, layerId: type.layerId || baseCellLayer };
    });

    const initialCamera = resolvePlayCamera(state);
    const initialView = resolveDesiredView(
      state,
      initialCamera,
      0,
      true,
      canvasRef.current ? canvasRef.current.width : 960,
      canvasRef.current ? canvasRef.current.height : 540,
    );
    state.viewX = initialView.x;
    state.viewY = initialView.y;

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

      // Snapshot positions before scripts so we can detect which was changed
      const prePositions = state.gameObjects.map((obj) => {
        const t = (obj.components && obj.components.Transform) || {};
        return { x: obj.x, y: obj.y, tx: t.x, ty: t.y };
      });

      // Script updates
      state.scriptInstances.forEach(inst => {
        if (inst.hooks.onUpdate) {
          try { inst.hooks.onUpdate(inst.obj, engine, dt); }
          catch (e) { onLog({ type: 'error', message: `onUpdate error: ${e.message}`, time: new Date().toLocaleTimeString() }); }
        }
      });

      // Sync obj.x/y <-> Transform.x/y (scripts may update either)
      state.gameObjects.forEach((obj, i) => {
        const t = obj.components && obj.components.Transform;
        if (!t) return;
        const pre = prePositions[i];
        // If script changed Transform, prefer that; otherwise use obj.x/y
        if (Number.isFinite(t.x) && t.x !== pre.tx) obj.x = t.x;
        if (Number.isFinite(t.y) && t.y !== pre.ty) obj.y = t.y;
        // Keep both in sync
        t.x = obj.x;
        t.y = obj.y;
      });

      resolveCellCollisions(state);

      // Render
      const camera = resolvePlayCamera(state);
      const viewW = canvasRef.current ? canvasRef.current.width : 960;
      const viewH = canvasRef.current ? canvasRef.current.height : 540;
      const desired = resolveDesiredView(state, camera, dt, false, viewW, viewH);
      const speed = Number.isFinite(camera.speed) ? Math.max(0.1, camera.speed) : 8;
      const maxSpeed = Number.isFinite(camera.maxSpeed) ? Math.max(60, camera.maxSpeed) : Infinity;
      state.viewX = smoothAxis(state.viewX || 0, desired.x, dt, speed, maxSpeed);
      state.viewY = smoothAxis(state.viewY || 0, desired.y, dt, speed, maxSpeed);
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
            let drawn = false;
            const imgAssetId = entry.type.imageAssetId;
            if (imgAssetId && state.assetById) {
              const asset = state.assetById.get(imgAssetId);
              const src = asset && (asset.previewUrl || asset.url || asset.src);
              if (src) {
                if (!imageCacheRef.current.has(src)) {
                  const img = new Image();
                  img.src = src;
                  imageCacheRef.current.set(src, img);
                }
                const img = imageCacheRef.current.get(src);
                if (img && img.complete && img.naturalWidth > 0) {
                  ctx.drawImage(img, px, py, CELL_SIZE, CELL_SIZE);
                  drawn = true;
                }
              }
            }
            if (!drawn) {
              ctx.fillStyle = entry.type.color || '#334155';
              ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            }
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
      targetObjectId,
      offsetX: 0, offsetY: 0, followX: true, followY: true, clampToWorld: true,
    };
  }

  return {
    ...fallback,
    ...cameraComp,
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
