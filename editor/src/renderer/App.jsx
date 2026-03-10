import React, { useState, useCallback, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Viewport from './components/Viewport.jsx';
import ObjectList from './components/ObjectList.jsx';
import WorldTools from './components/WorldTools.jsx';
import Inspector from './components/Inspector.jsx';
import ScriptEditor from './components/ScriptEditor.jsx';
import SystemsTab from './components/SystemsTab.jsx';
import Timeline from './components/Timeline.jsx';
import ConsolePanel from './components/Console.jsx';
import { usePlayMode } from './components/PlayMode.jsx';
import KozLogo from './components/KozLogo.jsx';
import Modal from './components/Modal.jsx';
import { ensureProjectShape, normalizeCellTypeId, getBrushValue } from './state/projectModel.js';
import './editor.css';

// ---- Project helpers ----
function createDefaultProject(opts = {}) {
  const cols = opts.cols || 30;
  const rows = opts.rows || 20;
  const offsetX = opts.offsetX !== undefined ? opts.offsetX : -Math.floor(cols / 2);
  const offsetY = opts.offsetY !== undefined ? opts.offsetY : -Math.floor(rows / 2);
  const dc = opts.defaultCell !== undefined ? opts.defaultCell : null;
  const grid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) row.push(dc);
    grid.push(row);
  }
  return ensureProjectShape({
    schemaVersion: 1,
    meta: { name: opts.name || 'Untitled Project', version: '1.0.0', resolution: { width: 960, height: 540 }, engineVersion: '0.1.0' },
    world: { cols, rows, offsetX, offsetY, defaultCell: dc, grid, elements: [], meta: {} },
    objects: [],
    animations: [],
    scripts: [],
    assets: [],
    build: { profile: 'web-prod', pwa: false },
  });
}

function worldOffsets(world) {
  return {
    x: Number.isFinite(world && world.offsetX) ? world.offsetX : 0,
    y: Number.isFinite(world && world.offsetY) ? world.offsetY : 0,
  };
}

function worldFillValue(world) {
  return world && world.defaultCell !== undefined ? world.defaultCell : 'empty';
}

function normalizeWorldGrid(world) {
  if (!world) return;
  if (!Array.isArray(world.grid)) world.grid = [];
  if (!Number.isFinite(world.cols)) world.cols = (world.grid[0] && world.grid[0].length) || 0;
  if (!Number.isFinite(world.rows)) world.rows = world.grid.length;
  if (!Number.isFinite(world.offsetX)) world.offsetX = 0;
  if (!Number.isFinite(world.offsetY)) world.offsetY = 0;
}

function ensureWorldContains(world, cellX, cellY) {
  normalizeWorldGrid(world);
  const fill = worldFillValue(world);
  const width = Math.max(0, world.cols);
  const height = Math.max(0, world.rows);
  if (height === 0 || width === 0) {
    world.offsetX = cellX;
    world.offsetY = cellY;
    world.cols = 1;
    world.rows = 1;
    world.grid = [[fill]];
    return { lx: 0, ly: 0 };
  }

  if (cellX < world.offsetX) {
    const add = world.offsetX - cellX;
    world.grid = world.grid.map((row) => [...Array(add).fill(fill), ...row]);
    world.cols += add;
    world.offsetX = cellX;
  } else if (cellX >= world.offsetX + world.cols) {
    const add = cellX - (world.offsetX + world.cols) + 1;
    world.grid = world.grid.map((row) => [...row, ...Array(add).fill(fill)]);
    world.cols += add;
  }

  if (cellY < world.offsetY) {
    const add = world.offsetY - cellY;
    const rowTemplate = Array(world.cols).fill(fill);
    const topRows = Array.from({ length: add }, () => rowTemplate.slice());
    world.grid = [...topRows, ...world.grid];
    world.rows += add;
    world.offsetY = cellY;
  } else if (cellY >= world.offsetY + world.rows) {
    const add = cellY - (world.offsetY + world.rows) + 1;
    const rowTemplate = Array(world.cols).fill(fill);
    for (let i = 0; i < add; i += 1) world.grid.push(rowTemplate.slice());
    world.rows += add;
  }

  return { lx: cellX - world.offsetX, ly: cellY - world.offsetY };
}

function getWorldCell(world, cellX, cellY) {
  normalizeWorldGrid(world);
  const { x: ox, y: oy } = worldOffsets(world);
  const lx = cellX - ox;
  const ly = cellY - oy;
  if (lx < 0 || ly < 0 || lx >= world.cols || ly >= world.rows) return worldFillValue(world);
  return (world.grid[ly] && world.grid[ly][lx]) !== undefined ? world.grid[ly][lx] : worldFillValue(world);
}

let _idCounter = 0;
function genId(prefix) { _idCounter++; return prefix + '_' + Date.now().toString(36) + '_' + _idCounter; }

function createGameObject(name, x, y, opts = {}) {
  const type = opts.type || 'generic';
  if (type === 'camera') {
    return {
      id: genId('obj'),
      name: name || 'Camera',
      type,
      parentId: null,
      x,
      y,
      components: {
        Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
        Camera: {
          enabled: true,
          targetObjectId: null,
          speed: 8,
          offsetX: 0,
          offsetY: 0,
          deadZoneWidth: 180,
          deadZoneHeight: 120,
          lookAheadX: 0,
          lookAheadY: 0,
          visibleMargin: 40,
          followX: true,
          followY: true,
          clampToWorld: true,
          maxSpeed: 2000,
        },
        Render: { layerId: opts.layerId || 'obj-main', visible: false, zIndex: 0 },
        ScriptBindings: [],
      },
    };
  }
  const next = {
    id: genId('obj'), name: name || 'Object', type, x, y,
    parentId: null,
    components: {
      Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
      Sprite: { assetId: null, color: opts.color || '#4ade80', width: 32, height: 32 },
      Collider: { shape: 'rect', width: 32, height: 32 },
      Collision: { enabled: true, isTrigger: false },
      RigidBody: { enabled: false, weight: 1, friction: 0.4 },
      Render: { layerId: opts.layerId || 'obj-main', visible: true, zIndex: 0 },
      ScriptBindings: [],
      Animator: { clipId: null, autoplay: type === 'animator' },
    },
  };
  return next;
}

function instantiateFromPrefab(prefab, projectView, x, y) {
  const sourceById = (projectView && projectView.objects || []).find((o) => o.id === prefab.sourceObjectId) || null;
  const source = prefab && prefab.object ? prefab.object : sourceById;
  if (!source) return createGameObject(prefab && prefab.name ? prefab.name : 'Object', x, y);

  const obj = JSON.parse(JSON.stringify(source));
  obj.id = genId('obj');
  obj.name = (prefab && prefab.name) || obj.name || 'Object';
  obj.prefabId = prefab.id;
  obj.parentId = null;
  obj.x = x;
  obj.y = y;
  obj.components = obj.components || {};
  const t = obj.components.Transform || {};
  obj.components.Transform = {
    ...t,
    x,
    y,
    rotation: Number.isFinite(t.rotation) ? t.rotation : 0,
    scaleX: Number.isFinite(t.scaleX) ? t.scaleX : 1,
    scaleY: Number.isFinite(t.scaleY) ? t.scaleY : 1,
  };

  if (obj.type === 'camera' || obj.components.Camera) {
    obj.type = 'camera';
    obj.components.Camera = {
      enabled: (obj.components.Camera && obj.components.Camera.enabled) !== false,
      targetObjectId: (obj.components.Camera && obj.components.Camera.targetObjectId) || null,
      speed: (obj.components.Camera && Number.isFinite(obj.components.Camera.speed)) ? obj.components.Camera.speed : 8,
      offsetX: (obj.components.Camera && Number.isFinite(obj.components.Camera.offsetX)) ? obj.components.Camera.offsetX : 0,
      offsetY: (obj.components.Camera && Number.isFinite(obj.components.Camera.offsetY)) ? obj.components.Camera.offsetY : 0,
      deadZoneWidth: (obj.components.Camera && Number.isFinite(obj.components.Camera.deadZoneWidth)) ? obj.components.Camera.deadZoneWidth : 180,
      deadZoneHeight: (obj.components.Camera && Number.isFinite(obj.components.Camera.deadZoneHeight)) ? obj.components.Camera.deadZoneHeight : 120,
      lookAheadX: (obj.components.Camera && Number.isFinite(obj.components.Camera.lookAheadX)) ? obj.components.Camera.lookAheadX : 0,
      lookAheadY: (obj.components.Camera && Number.isFinite(obj.components.Camera.lookAheadY)) ? obj.components.Camera.lookAheadY : 0,
      visibleMargin: (obj.components.Camera && Number.isFinite(obj.components.Camera.visibleMargin)) ? obj.components.Camera.visibleMargin : 40,
      followX: (obj.components.Camera && obj.components.Camera.followX) !== false,
      followY: (obj.components.Camera && obj.components.Camera.followY) !== false,
      clampToWorld: (obj.components.Camera && obj.components.Camera.clampToWorld) !== false,
      maxSpeed: (obj.components.Camera && Number.isFinite(obj.components.Camera.maxSpeed)) ? obj.components.Camera.maxSpeed : 2000,
    };
    obj.components.Render = {
      layerId: (obj.components.Render && obj.components.Render.layerId) || 'obj-main',
      visible: false,
      zIndex: (obj.components.Render && Number.isFinite(obj.components.Render.zIndex)) ? obj.components.Render.zIndex : 0,
    };
    delete obj.components.Sprite;
    delete obj.components.Collider;
    delete obj.components.Collision;
    delete obj.components.RigidBody;
    delete obj.components.Animator;
  }

  return obj;
}

function buildExportHtml(project, projectJson, target, options = {}) {
  const safeJson = projectJson
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  const title = (project && project.meta && project.meta.name) || 'Koz Game';
  const width = project?.meta?.resolution?.width || 960;
  const height = project?.meta?.resolution?.height || 540;
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: #0b1220; color: #e2e8f0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; overflow: hidden; }
    #shell { width: 100%; height: 100%; display: grid; place-items: center; }
    #stage { position: relative; width: min(100vw, ${width}px); height: min(100vh, ${height}px); display: grid; place-items: center; }
    #game { display: block; max-width: 100%; max-height: 100%; background: #111827; image-rendering: pixelated; }
    #ui-root { position: absolute; inset: 0; pointer-events: none; }
  </style>
</head>
<body>
  <div id="shell">
    <div id="stage">
      <canvas id="game" width="${width}" height="${height}"></canvas>
      <div id="ui-root"></div>
    </div>
  </div>
  <script>window.__KOZ_PROJECT__=${safeJson};</script>
  <script>
    (function() {
      var project = window.__KOZ_PROJECT__ || {};
      var canvas = document.getElementById('game');
      var uiRoot = document.getElementById('ui-root');
      var ctx = canvas.getContext('2d');
      var keys = new Set();
      var images = new Map();
      var assetById = new Map((Array.isArray(project.assets) ? project.assets : []).map(function(a) { return [a.id, a]; }));
      var cellSize = 24;
      var CELL_SIZE = 24;
      var elapsed = 0;

      function clone(v) { return JSON.parse(JSON.stringify(v)); }
      function resolveScene(p) {
        var scenes = Array.isArray(p.scenes) ? p.scenes : [];
        if (!scenes.length) return { id: p.activeSceneId || 'scene_main', name: 'Main Scene', world: p.world || {}, objects: p.objects || [] };
        for (var i = 0; i < scenes.length; i += 1) if (scenes[i].id === p.activeSceneId) return scenes[i];
        return scenes[0];
      }
      function resolveCellType(cell) {
        if (cell == null || cell === 'empty') return null;
        var types = Array.isArray(project.cellTypes) ? project.cellTypes : [];
        if (typeof cell === 'number') return types[cell] || null;
        if (typeof cell === 'string') return types.find(function(t) { return t && t.id === cell; }) || null;
        if (typeof cell === 'object' && cell.typeId) return types.find(function(t) { return t && t.id === cell.typeId; }) || null;
        return null;
      }
      function normalizeCellTypeId(cell) {
        if (cell == null) return 'empty';
        if (typeof cell === 'string') return cell;
        if (typeof cell === 'number') {
          var type = resolveCellType(cell);
          return (type && type.id) || 'empty';
        }
        if (typeof cell === 'object') {
          if (typeof cell.typeId === 'string') return cell.typeId;
          if (typeof cell.id === 'string') return cell.id;
        }
        return 'empty';
      }
      function isCollidableCell(cell) {
        if (normalizeCellTypeId(cell) === 'empty') return false;
        var type = resolveCellType(cell);
        return !!(type && type.collision);
      }
      function getColliderRect(obj) {
        var collider = (obj && obj.components && obj.components.Collider) || {};
        var w = Number.isFinite(collider.width) ? collider.width : (Number.isFinite(obj.width) ? obj.width : 0);
        var h = Number.isFinite(collider.height) ? collider.height : (Number.isFinite(obj.height) ? obj.height : 0);
        var ox = Number.isFinite(collider.offsetX) ? collider.offsetX : (Number.isFinite(collider.x) ? collider.x : 0);
        var oy = Number.isFinite(collider.offsetY) ? collider.offsetY : (Number.isFinite(collider.y) ? collider.y : 0);
        return {
          x: (Number.isFinite(obj.x) ? obj.x : 0) + ox,
          y: (Number.isFinite(obj.y) ? obj.y : 0) + oy,
          w: w,
          h: h,
        };
      }
      function getOverlap(a, b) {
        var overlapLeft = (a.x + a.w) - b.x;
        var overlapRight = (b.x + b.w) - a.x;
        var overlapTop = (a.y + a.h) - b.y;
        var overlapBottom = (b.y + b.h) - a.y;
        if (overlapLeft <= 0 || overlapRight <= 0 || overlapTop <= 0 || overlapBottom <= 0) return null;

        var ax = a.x + a.w / 2;
        var ay = a.y + a.h / 2;
        var bx = b.x + b.w / 2;
        var by = b.y + b.h / 2;

        return {
          dx: ax < bx ? -overlapLeft : overlapRight,
          dy: ay < by ? -overlapTop : overlapBottom,
        };
      }
      function imageForAssetId(id) {
        if (!id) return null;
        var asset = assetById.get(id);
        if (!asset) return null;
        var src = asset.previewUrl || asset.url || asset.src;
        if (!src) return null;
        if (!images.has(src)) {
          var img = new Image();
          img.src = src;
          images.set(src, img);
        }
        return images.get(src);
      }
      function readGameState() {
        var gsm = window.gameStateManager;
        if (!gsm) return null;
        if (typeof gsm.getState === 'function') return gsm.getState();
        if (gsm.currentState !== undefined) return gsm.currentState;
        if (gsm.state !== undefined) return gsm.state;
        if (gsm.current !== undefined) return gsm.current;
        return null;
      }
      function resolveSceneName(sceneId) {
        var scenes = Array.isArray(project.scenes) ? project.scenes : [];
        var found = scenes.find(function(s) { return s && s.id === sceneId; });
        return found ? found.name : sceneId;
      }
      function resolveRuntimeScene(activeSceneId) {
        var fallbackId = activeSceneId || 'scene_main';
        var fallbackName = resolveSceneName(fallbackId);
        if (!window.sceneManager) return { id: fallbackId, name: fallbackName };
        var sm = window.sceneManager;
        var active = null;
        if (typeof sm.getActiveScene === 'function') active = sm.getActiveScene();
        else if (sm.activeScene !== undefined) active = sm.activeScene;
        else if (sm.currentScene !== undefined) active = sm.currentScene;
        if (typeof active === 'string') return { id: active, name: resolveSceneName(active) };
        if (active && typeof active === 'object') {
          var id = active.id || active.sceneId || sm.activeSceneId || sm.currentSceneId || fallbackId;
          return { id: id, name: active.name || resolveSceneName(id) };
        }
        var id2 = sm.activeSceneId || sm.currentSceneId || fallbackId;
        return { id: id2, name: resolveSceneName(id2) };
      }
      function sampleTrack(track, time) {
        var kfs = track && track.keyframes;
        if (!kfs || kfs.length === 0) return 0;
        if (kfs.length === 1) return kfs[0].value;
        if (time <= kfs[0].time) return kfs[0].value;
        if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;
        for (var i = 0; i < kfs.length - 1; i += 1) {
          if (time >= kfs[i].time && time <= kfs[i + 1].time) {
            var range = kfs[i + 1].time - kfs[i].time;
            var t = range > 0 ? (time - kfs[i].time) / range : 0;
            return kfs[i].value + (kfs[i + 1].value - kfs[i].value) * t;
          }
        }
        return kfs[kfs.length - 1].value;
      }
      function resolveWorldMetrics(world, cellSize) {
        if (!world || !Array.isArray(world.grid)) return null;
        var rows = Number.isFinite(world.rows) ? world.rows : world.grid.length;
        var cols = Number.isFinite(world.cols) ? world.cols : ((world.grid[0] && world.grid[0].length) || 0);
        if (rows <= 0 || cols <= 0) return null;
        var offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
        var offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
        var minX = offsetX * cellSize;
        var minY = offsetY * cellSize;
        var width = cols * cellSize;
        var height = rows * cellSize;
        return {
          rows: rows,
          cols: cols,
          offsetX: offsetX,
          offsetY: offsetY,
          minX: minX,
          minY: minY,
          maxX: minX + width,
          maxY: minY + height,
          width: width,
          height: height,
        };
      }
      function resolvePlayCamera(cameraConfig, objects) {
        var fallback = cameraConfig || {};
        var cameraObject = objects.find(function(o) {
          return o && o.components && o.components.Camera && o.components.Camera.enabled !== false;
        });
        var cameraComp = cameraObject ? (cameraObject.components.Camera || {}) : {};
        var targetObjectId = cameraComp.targetObjectId || fallback.targetObjectId || null;
        if (!targetObjectId) {
          var player = objects.find(function(o) { return o.type === 'player'; });
          targetObjectId = player ? player.id : null;
        }
        if (!cameraObject) {
          return Object.assign({}, fallback, {
            targetObjectId: targetObjectId,
            offsetX: 0, offsetY: 0, followX: true, followY: true, clampToWorld: true,
          });
        }
        return Object.assign({}, fallback, cameraComp, {
          originX: Number.isFinite(cameraObject.x) ? cameraObject.x : 0,
          originY: Number.isFinite(cameraObject.y) ? cameraObject.y : 0,
          targetObjectId: targetObjectId,
        });
      }
      function smoothAxis(current, target, dt, speed, maxSpeed) {
        if (!Number.isFinite(target)) return current;
        var alpha = 1 - Math.exp(-Math.max(0.1, speed) * Math.max(0.0001, dt));
        var next = current + (target - current) * alpha;
        if (Number.isFinite(maxSpeed)) {
          var delta = next - current;
          var maxStep = Math.max(1, maxSpeed) * Math.max(0.0001, dt);
          if (delta > maxStep) next = current + maxStep;
          if (delta < -maxStep) next = current - maxStep;
        }
        return next;
      }
      function resolveDesiredView(cameraConfig, objects, currentViewX, currentViewY, snapToTarget, viewW, viewH) {
        var target = cameraConfig.targetObjectId ? objects.find(function(o) { return o.id === cameraConfig.targetObjectId; }) : null;
        var offsetX = Number.isFinite(cameraConfig.offsetX) ? cameraConfig.offsetX : 0;
        var offsetY = Number.isFinite(cameraConfig.offsetY) ? cameraConfig.offsetY : 0;
        var lookAheadX = Number.isFinite(cameraConfig.lookAheadX) ? cameraConfig.lookAheadX : 0;
        var lookAheadY = Number.isFinite(cameraConfig.lookAheadY) ? cameraConfig.lookAheadY : 0;
        var deadZoneWidth = Math.max(0, Number.isFinite(cameraConfig.deadZoneWidth) ? cameraConfig.deadZoneWidth : 0);
        var deadZoneHeight = Math.max(0, Number.isFinite(cameraConfig.deadZoneHeight) ? cameraConfig.deadZoneHeight : 0);
        var visibleMargin = Math.max(0, Number.isFinite(cameraConfig.visibleMargin) ? cameraConfig.visibleMargin : 0);
        var followX = cameraConfig.followX !== false;
        var followY = cameraConfig.followY !== false;
        var desiredX = Number.isFinite(currentViewX) ? currentViewX : 0;
        var desiredY = Number.isFinite(currentViewY) ? currentViewY : 0;

        var focusCenterX = target
          ? (target.x + (target.width || 32) * 0.5 + offsetX + lookAheadX)
          : (Number.isFinite(cameraConfig.originX) ? cameraConfig.originX + offsetX + lookAheadX : desiredX + viewW * 0.5);
        var focusCenterY = target
          ? (target.y + (target.height || 32) * 0.5 + offsetY + lookAheadY)
          : (Number.isFinite(cameraConfig.originY) ? cameraConfig.originY + offsetY + lookAheadY : desiredY + viewH * 0.5);

        if (followX) {
          if (snapToTarget || deadZoneWidth <= 0) {
            desiredX = focusCenterX - viewW * 0.5;
          } else {
            var currentLeft = (currentViewX || 0) + viewW * 0.5 - deadZoneWidth * 0.5;
            var currentRight = (currentViewX || 0) + viewW * 0.5 + deadZoneWidth * 0.5;
            if (focusCenterX < currentLeft) desiredX = focusCenterX - (viewW * 0.5 - deadZoneWidth * 0.5);
            if (focusCenterX > currentRight) desiredX = focusCenterX - (viewW * 0.5 + deadZoneWidth * 0.5);
          }
        }
        if (followY) {
          if (snapToTarget || deadZoneHeight <= 0) {
            desiredY = focusCenterY - viewH * 0.5;
          } else {
            var currentTop = (currentViewY || 0) + viewH * 0.5 - deadZoneHeight * 0.5;
            var currentBottom = (currentViewY || 0) + viewH * 0.5 + deadZoneHeight * 0.5;
            if (focusCenterY < currentTop) desiredY = focusCenterY - (viewH * 0.5 - deadZoneHeight * 0.5);
            if (focusCenterY > currentBottom) desiredY = focusCenterY - (viewH * 0.5 + deadZoneHeight * 0.5);
          }
        }

        if (target) {
          var tx = Number.isFinite(target.x) ? target.x : 0;
          var ty = Number.isFinite(target.y) ? target.y : 0;
          var tw = Number.isFinite(target.width) ? target.width : 32;
          var th = Number.isFinite(target.height) ? target.height : 32;
          var left = desiredX + visibleMargin;
          var right = desiredX + viewW - visibleMargin;
          var top = desiredY + visibleMargin;
          var bottom = desiredY + viewH - visibleMargin;
          if (followX) {
            if (tx < left) desiredX = tx - visibleMargin;
            if (tx + tw > right) desiredX = tx + tw + visibleMargin - viewW;
          }
          if (followY) {
            if (ty < top) desiredY = ty - visibleMargin;
            if (ty + th > bottom) desiredY = ty + th + visibleMargin - viewH;
          }
        }

        if (cameraConfig.clampToWorld !== false) {
          var rows = Number.isFinite(world.rows) ? world.rows : ((world.grid && world.grid.length) || 0);
          var cols = Number.isFinite(world.cols) ? world.cols : ((world.grid && world.grid[0] && world.grid[0].length) || 0);
          if (cols > 0 && rows > 0) {
            var ox = Number.isFinite(world.offsetX) ? world.offsetX : 0;
            var oy = Number.isFinite(world.offsetY) ? world.offsetY : 0;
            var minX = ox * CELL_SIZE;
            var minY = oy * CELL_SIZE;
            var maxX = (ox + cols) * CELL_SIZE - viewW;
            var maxY = (oy + rows) * CELL_SIZE - viewH;
            desiredX = maxX < minX ? minX - ((viewW - cols * CELL_SIZE) * 0.5) : Math.max(minX, Math.min(maxX, desiredX));
            desiredY = maxY < minY ? minY - ((viewH - rows * CELL_SIZE) * 0.5) : Math.max(minY, Math.min(maxY, desiredY));
          }
        }
        return { x: desiredX, y: desiredY };
      }
      function createUiManager(root) {
        var screens = new Map();
        var layers = new Map();
        function ensureLayer(id, order) {
          var key = id || 'default';
          if (layers.has(key)) return layers.get(key);
          var layer = document.createElement('div');
          layer.style.position = 'absolute';
          layer.style.inset = '0';
          layer.style.zIndex = String(Number.isFinite(order) ? order : 0);
          layer.style.pointerEvents = 'none';
          root.appendChild(layer);
          layers.set(key, layer);
          return layer;
        }
        function toNode(node) { return node && node.elt ? node.elt : node; }
        function shouldShow(def, c) {
          if (Array.isArray(def.validScenes) && def.validScenes.length) {
            var okScene = def.validScenes.some(function(s) { return s === c.sceneId || s === c.sceneName; });
            if (!okScene) return false;
          }
          if (Array.isArray(def.validStates) && def.validStates.length) {
            if (!def.validStates.includes(c.gameState)) return false;
          }
          if (typeof def.isVisible === 'function') {
            try { return !!def.isVisible(c); } catch (_e) { return false; }
          }
          return true;
        }
        var api = {
          registerScreen: function(id, def) {
            if (!id) return api;
            var old = screens.get(id);
            if (old && old.container && old.container.parentElement) old.container.parentElement.removeChild(old.container);
            var rec = { id: id, def: def || {}, container: null, visible: false, hideTimer: null };
            screens.set(id, rec);
            return api;
          },
          scheduleFadeHide: function(id, delay) {
            var rec = screens.get(id);
            if (!rec || !rec.container) return;
            if (rec.hideTimer) clearTimeout(rec.hideTimer);
            rec.hideTimer = setTimeout(function() {
              if (!rec.visible && rec.container) rec.container.style.display = 'none';
            }, Math.max(0, delay || 0));
          },
          updateAll: function(c) {
            screens.forEach(function(rec) {
              var def = rec.def || {};
              if (!rec.container && typeof def.create === 'function') {
                try {
                  var node = toNode(def.create(c));
                  if (!node) node = document.createElement('div');
                  if (!node.id) node.id = rec.id;
                  node.style.display = 'none';
                  node.style.pointerEvents = node.style.pointerEvents || 'auto';
                  ensureLayer(def.layer || 'default', def.layerOrder || 0).appendChild(node);
                  rec.container = node;
                } catch (_e) {}
              }
              var visible = shouldShow(def, c);
              if (visible) {
                if (rec.container) rec.container.style.display = '';
                if (!rec.visible && typeof def.show === 'function') { try { def.show.call(rec, c); } catch (_e) {} }
                rec.visible = true;
                if (typeof def.update === 'function') { try { def.update.call(rec, c); } catch (_e) {} }
              } else {
                if (rec.visible && typeof def.hide === 'function') { try { def.hide.call(rec, c); } catch (_e) {} }
                else if (rec.container) rec.container.style.display = 'none';
                rec.visible = false;
              }
            });
          }
        };
        return api;
      }

      var scene = resolveScene(project);
      var world = scene.world || project.world || {};
      var gameObjects = clone(scene.objects || project.objects || []).map(function(obj) {
        var t = (obj.components && obj.components.Transform) || {};
        var s = (obj.components && obj.components.Sprite) || {};
        return Object.assign({}, obj, {
          x: Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0),
          y: Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0),
          width: Number.isFinite(s.width) ? s.width : 32,
          height: Number.isFinite(s.height) ? s.height : 32,
          color: s.color || '#4ade80',
          components: obj.components || {},
        });
      });
      var cameraConfig = project.camera || {};
      var animClips = Array.isArray(project.animations) ? project.animations : [];
      var activeSceneId = scene.id || project.activeSceneId || 'scene_main';
      var viewX = 0;
      var viewY = 0;
      function resolveCellCollisions() {
        if (!world || !Array.isArray(world.grid)) return;
        var rows = Number.isFinite(world.rows) ? world.rows : world.grid.length;
        var cols = Number.isFinite(world.cols) ? world.cols : ((world.grid[0] && world.grid[0].length) || 0);
        var offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
        var offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
        if (rows <= 0 || cols <= 0) return;

        for (var i = 0; i < gameObjects.length; i += 1) {
          var obj = gameObjects[i];
          var collision = (obj.components && obj.components.Collision) || {};
          if (collision.enabled === false || collision.isTrigger) continue;

          if (typeof obj.grounded === 'boolean') obj.grounded = false;
          var iterations = 0;
          while (iterations < 4) {
            iterations += 1;
            var rect = getColliderRect(obj);
            if (rect.w <= 0 || rect.h <= 0) break;

            var worldMinX = offsetX;
            var worldMinY = offsetY;
            var worldMaxX = offsetX + cols - 1;
            var worldMaxY = offsetY + rows - 1;
            var minX = Math.max(worldMinX, Math.floor(rect.x / CELL_SIZE));
            var minY = Math.max(worldMinY, Math.floor(rect.y / CELL_SIZE));
            var maxX = Math.min(worldMaxX, Math.floor((rect.x + rect.w - 1) / CELL_SIZE));
            var maxY = Math.min(worldMaxY, Math.floor((rect.y + rect.h - 1) / CELL_SIZE));
            if (minX > maxX || minY > maxY) break;

            var resolved = false;
            for (var y = minY; y <= maxY && !resolved; y += 1) {
              for (var x = minX; x <= maxX && !resolved; x += 1) {
                var ly = y - offsetY;
                var lx = x - offsetX;
                var cell = world.grid[ly] && world.grid[ly][lx];
                if (!isCollidableCell(cell)) continue;
                var tile = { x: x * CELL_SIZE, y: y * CELL_SIZE, w: CELL_SIZE, h: CELL_SIZE };
                var overlap = getOverlap(rect, tile);
                if (!overlap) continue;

                if (Math.abs(overlap.dx) <= Math.abs(overlap.dy)) {
                  obj.x += overlap.dx;
                  if (typeof obj.vx === 'number' && ((overlap.dx < 0 && obj.vx > 0) || (overlap.dx > 0 && obj.vx < 0))) obj.vx = 0;
                } else {
                  obj.y += overlap.dy;
                  if (typeof obj.vy === 'number' && ((overlap.dy < 0 && obj.vy > 0) || (overlap.dy > 0 && obj.vy < 0))) obj.vy = 0;
                  if (overlap.dy < 0 && typeof obj.grounded === 'boolean') obj.grounded = true;
                }
                resolved = true;
              }
            }
            if (!resolved) break;
          }
        }
      }

      var scripts = {};
      (Array.isArray(project.scripts) ? project.scripts : []).forEach(function(s) {
        if (!s || !s.id || (s.language && s.language !== 'javascript')) return;
        scripts[s.id] = s;
      });
      var engine = {
        elapsed: 0,
        gameObjects: gameObjects,
        findObject: function(id) { return gameObjects.find(function(o) { return o.id === id; }) || null; },
        findObjectsByType: function(type) { return gameObjects.filter(function(o) { return o.type === type; }); },
        keyIsDown: function(code) { return keys.has(code); }
      };

      var uiManager = createUiManager(uiRoot);
      window.KozUIManager = uiManager;
      window.uiManager = uiManager;
      var scriptInstances = [];
      gameObjects.forEach(function(obj) {
        var bindings = [];
        if (Array.isArray(obj.components && obj.components.ScriptBindings)) bindings = bindings.concat(obj.components.ScriptBindings);
        if (obj.components && obj.components.ScriptBinding) bindings.push(Object.assign({ active: true, properties: {} }, obj.components.ScriptBinding));
        bindings.forEach(function(binding) {
          if (!binding || binding.active === false || !binding.scriptId || !scripts[binding.scriptId]) return;
          try {
            var src = scripts[binding.scriptId].source || '';
            var factory = new Function('return (function(self, props, console, keyIsDown, LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW, SPACE){' + src + '; return { onInit: typeof onInit === \"function\" ? onInit : null, onUpdate: typeof onUpdate === \"function\" ? onUpdate : null }; })')();
            var props = binding.properties ? clone(binding.properties) : {};
            var hooks = factory(obj, props, console, engine.keyIsDown, 37, 39, 38, 40, 32);
            scriptInstances.push({ obj: obj, hooks: hooks });
          } catch (err) { console.error('Script compile error', err); }
        });
      });
      scriptInstances.forEach(function(inst) {
        if (inst.hooks && typeof inst.hooks.onInit === 'function') {
          try { inst.hooks.onInit(inst.obj, engine); } catch (err) { console.error('onInit error', err); }
        }
      });

      function drawWorld(viewX, viewY) {
        var grid = Array.isArray(world.grid) ? world.grid : [];
        var rows = Number.isFinite(world.rows) ? world.rows : grid.length;
        var cols = Number.isFinite(world.cols) ? world.cols : ((grid[0] && grid[0].length) || 0);
        var ox = Number.isFinite(world.offsetX) ? world.offsetX : 0;
        var oy = Number.isFinite(world.offsetY) ? world.offsetY : 0;
        var cellLayers = ((project.layers && project.layers.cells) || [])
          .filter(function(layer) { return layer.visible !== false; })
          .sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
        if (!cellLayers.length) cellLayers = [{ id: null }];
        for (var li = 0; li < cellLayers.length; li += 1) {
          var layer = cellLayers[li];
          for (var y = 0; y < rows; y += 1) {
            for (var x = 0; x < cols; x += 1) {
              var cell = grid[y] && grid[y][x];
              var type = resolveCellType(cell);
              if (!type || type.id === 'empty') continue;
              var typeLayer = type.layerId || null;
              if (layer.id !== typeLayer) continue;
              var px = (x + ox) * cellSize - viewX;
              var py = (y + oy) * cellSize - viewY;
              var img = imageForAssetId(type.imageAssetId);
              if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, px, py, cellSize, cellSize);
              else {
                ctx.fillStyle = type.color || '#334155';
                ctx.fillRect(px, py, cellSize, cellSize);
              }
            }
          }
        }
      }

      function drawObjects(viewX, viewY) {
        var objectLayers = ((project.layers && project.layers.objects) || [])
          .filter(function(layer) { return layer.visible !== false; })
          .sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
        var objects = gameObjects.slice().sort(function(a, b) {
          var ar = (a.components && a.components.Render) || {};
          var br = (b.components && b.components.Render) || {};
          var ao = objectLayers.find(function(l) { return l.id === ar.layerId; });
          var bo = objectLayers.find(function(l) { return l.id === br.layerId; });
          var layerDelta = ((ao && ao.order) || 0) - ((bo && bo.order) || 0);
          if (layerDelta !== 0) return layerDelta;
          return (ar.zIndex || 0) - (br.zIndex || 0);
        });
        objects.forEach(function(obj) {
          var render = (obj.components && obj.components.Render) || {};
          if (render.visible === false) return;
          var sprite = (obj.components && obj.components.Sprite) || {};
          var x = Number.isFinite(obj.x) ? obj.x : 0;
          var y = Number.isFinite(obj.y) ? obj.y : 0;
          var w = Number.isFinite(obj.width) ? obj.width : 32;
          var h = Number.isFinite(obj.height) ? obj.height : 32;
          var frameIds = Array.isArray(sprite.frameAssetIds) ? sprite.frameAssetIds : [];
          var frameId = frameIds.length > 0
            ? frameIds[Math.floor(elapsed * (sprite.fps || 8)) % frameIds.length]
            : sprite.assetId;
          var asset = frameId ? assetById.get(frameId) : null;
          var sourceAsset = asset && asset.sourceAssetId ? assetById.get(asset.sourceAssetId) : null;
          var src = (sourceAsset && (sourceAsset.previewUrl || sourceAsset.url || sourceAsset.src))
            || (asset && (asset.previewUrl || asset.url || asset.src));
          var drawn = false;
          if (src) {
            if (!images.has(src)) {
              var frameImg = new Image();
              frameImg.src = src;
              images.set(src, frameImg);
            }
            var img = images.get(src);
            if (img && img.complete && img.naturalWidth > 0) {
              var rect = asset && asset.frameRect;
              if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.w) && Number.isFinite(rect.h)) {
                ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, x - viewX, y - viewY, w, h);
              } else {
                ctx.drawImage(img, x - viewX, y - viewY, w, h);
              }
              drawn = true;
            }
          }
          if (!drawn) {
            ctx.fillStyle = obj.color || '#4ade80';
            ctx.fillRect(x - viewX, y - viewY, w, h);
          }
        });
      }

      var last = performance.now();
      function frame(now) {
        var dt = Math.min((now - last) / 1000, 0.033);
        last = now;
        elapsed += dt;
        engine.elapsed = elapsed;
        for (var c = 0; c < animClips.length; c += 1) {
          var clip = animClips[c];
          if (!clip || !Array.isArray(clip.tracks)) continue;
          var dur = clip.duration || 1;
          var t = clip.loop ? (elapsed % dur) : Math.min(elapsed, dur);
          for (var ti = 0; ti < clip.tracks.length; ti += 1) {
            var track = clip.tracks[ti];
            var obj = gameObjects.find(function(o) { return o.id === track.targetObjectId; });
            if (!obj || !track.keyframes || track.keyframes.length === 0) continue;
            obj[track.property] = sampleTrack(track, t);
          }
        }

        var runtimeScene = resolveRuntimeScene(activeSceneId);
        activeSceneId = runtimeScene.id || activeSceneId;
        engine.sceneId = activeSceneId;

        var worldMetrics = resolveWorldMetrics(world, cellSize);
        if (worldMetrics) {
          engine.world = worldMetrics;
          gameObjects.forEach(function(obj) {
            if (Object.prototype.hasOwnProperty.call(obj, 'worldWidth')) obj.worldWidth = worldMetrics.width;
            if (Object.prototype.hasOwnProperty.call(obj, 'worldHeight')) obj.worldHeight = worldMetrics.height;
            if (Object.prototype.hasOwnProperty.call(obj, 'worldMinX')) obj.worldMinX = worldMetrics.minX;
            if (Object.prototype.hasOwnProperty.call(obj, 'worldMinY')) obj.worldMinY = worldMetrics.minY;
            if (Object.prototype.hasOwnProperty.call(obj, 'worldMaxX')) obj.worldMaxX = worldMetrics.maxX;
            if (Object.prototype.hasOwnProperty.call(obj, 'worldMaxY')) obj.worldMaxY = worldMetrics.maxY;
          });
        }

        var prePositions = gameObjects.map(function(obj) {
          var t = (obj.components && obj.components.Transform) || {};
          return { x: obj.x, y: obj.y, tx: t.x, ty: t.y };
        });

        scriptInstances.forEach(function(inst) {
          if (inst.hooks && typeof inst.hooks.onUpdate === 'function') {
            try { inst.hooks.onUpdate(inst.obj, engine, dt); } catch (err) { console.error('onUpdate error', err); }
          }
        });

        gameObjects.forEach(function(obj, i) {
          if (!obj.components || !obj.components.Transform) return;
          var pre = prePositions[i];
          if (Number.isFinite(obj.components.Transform.x) && obj.components.Transform.x !== pre.tx) obj.x = obj.components.Transform.x;
          if (Number.isFinite(obj.components.Transform.y) && obj.components.Transform.y !== pre.ty) obj.y = obj.components.Transform.y;
          obj.components.Transform.x = obj.x;
          obj.components.Transform.y = obj.y;
        });
        resolveCellCollisions();
        gameObjects.forEach(function(obj) {
          if (!obj.components || !obj.components.Transform) return;
          obj.components.Transform.x = obj.x;
          obj.components.Transform.y = obj.y;
        });

        var camera = resolvePlayCamera(cameraConfig, gameObjects);
        var desired = resolveDesiredView(camera, gameObjects, viewX, viewY, false, canvas.width, canvas.height);
        var speed = Number.isFinite(camera.speed) ? Math.max(0.1, camera.speed) : 8;
        var maxSpeed = Number.isFinite(camera.maxSpeed) ? Math.max(60, camera.maxSpeed) : Infinity;
        viewX = smoothAxis(viewX || 0, desired.x, dt, speed, maxSpeed);
        viewY = smoothAxis(viewY || 0, desired.y, dt, speed, maxSpeed);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawWorld(viewX, viewY);
        drawObjects(viewX, viewY);

        uiManager.updateAll({ dt: dt, elapsed: elapsed, sceneId: runtimeScene.id, sceneName: runtimeScene.name, gameState: readGameState() });
        requestAnimationFrame(frame);
      }

      window.addEventListener('keydown', function(e) { keys.add(e.keyCode); });
      window.addEventListener('keyup', function(e) { keys.delete(e.keyCode); });
      var initialCamera = resolvePlayCamera(cameraConfig, gameObjects);
      var initialView = resolveDesiredView(initialCamera, gameObjects, 0, 0, true, canvas.width, canvas.height);
      viewX = initialView.x;
      viewY = initialView.y;
      requestAnimationFrame(frame);
    })();
  </script>
</body>
</html>`;
  if (options && options.minify) return html.replace(/\n\s*/g, '');
  return html;
}

function stripAssetsForExport(project) {
  const next = JSON.parse(JSON.stringify(project));
  next.assets = [];
  const clearObjectAssets = (obj) => {
    if (!obj || !obj.components || !obj.components.Sprite) return;
    obj.components.Sprite.assetId = null;
    obj.components.Sprite.frameAssetIds = [];
  };
  (next.objects || []).forEach(clearObjectAssets);
  (next.scenes || []).forEach((scene) => (scene.objects || []).forEach(clearObjectAssets));
  (next.cellTypes || []).forEach((type) => { if (type) type.imageAssetId = null; });
  return next;
}

function stripScriptsForExport(project) {
  const next = JSON.parse(JSON.stringify(project));
  next.scripts = [];
  const clearObjectScripts = (obj) => {
    if (!obj || !obj.components) return;
    delete obj.components.ScriptBinding;
    obj.components.ScriptBindings = [];
  };
  (next.objects || []).forEach(clearObjectScripts);
  (next.scenes || []).forEach((scene) => (scene.objects || []).forEach(clearObjectScripts));
  return next;
}

function resolveActiveScene(project) {
  if (!project || !Array.isArray(project.scenes) || project.scenes.length === 0) return null;
  return project.scenes.find((scene) => scene.id === project.activeSceneId) || project.scenes[0];
}

function withActiveSceneView(project) {
  if (!project) return project;
  const active = resolveActiveScene(project);
  if (!active) return project;
  return {
    ...project,
    world: active.world || project.world,
    objects: active.objects || project.objects || [],
  };
}

const MAX_UNDO = 100;

function App() {
  // All hooks must be called unconditionally and in the same order
  const [project, setProject] = useState(null);
  const [showProjectSelector, setShowProjectSelector] = useState(true);
  const [projectFile, setProjectFile] = useState({ projectPath: null, folderPath: null, name: null });
  const [availableProjects, setAvailableProjects] = useState([]);
  const [projectsRoot, setProjectsRoot] = useState(null);
  const [newProjectName, setNewProjectName] = useState('Untitled Project');
  const [editorState, setEditorState] = useState({
    mode: 'EDIT', activeTool: 'brush', brushValue: 'solid', gizmoMode: 'move',
    selectedObjectId: null, selectedObjectIds: [], selectedScriptId: null, camera: { x: -240, y: -140, zoom: 1 }, gridVisible: true,
  });
  const [bottomTab, setBottomTab] = useState('timeline');
  const [bottomHeight, setBottomHeight] = useState(240);
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(260);
  const [logs, setLogs] = useState([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState([]);
  const [exportConfig, setExportConfig] = useState({
    target: 'html-zip',
    fileName: '',
    includeAssets: true,
    includeScripts: true,
    minify: true,
    pwaOfflineCache: true,
    electronSingleFile: false,
    tarGzip: true,
    desktopPlatform: 'auto',
    desktopFormat: 'portable',
  });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((message, duration = 2000) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), duration);
  }, []);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const [mainTab, setMainTab] = useState('world');
  const inferredPlatform = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
    ? 'mac'
    : typeof navigator !== 'undefined' && /win/i.test(navigator.platform)
      ? 'win'
      : 'linux';
  const effectiveDesktopPlatform = exportConfig.desktopPlatform === 'auto' ? inferredPlatform : exportConfig.desktopPlatform;
  const desktopFormats = effectiveDesktopPlatform === 'win'
    ? ['portable', 'nsis', 'zip']
    : effectiveDesktopPlatform === 'mac'
      ? ['dmg', 'zip']
      : ['AppImage', 'deb', 'zip'];
  const projectView = withActiveSceneView(project);

  // ...existing callbacks and logic...

  const updateEditor = useCallback((patch) => {
    setEditorState(prev => ({ ...prev, ...patch }));
  }, []);

  const refreshProjects = useCallback(() => {
    const api = window.api;
    if (!api || typeof api.listProjects !== 'function') return;
    api.listProjects().then((result) => {
      if (!result || !result.ok) return;
      setProjectsRoot(result.root || null);
      setAvailableProjects(Array.isArray(result.projects) ? result.projects : []);
    });
  }, []);

  const mutateActiveScene = useCallback((prevProject, mutateFn) => {
    const base = ensureProjectShape(prevProject);
    const scenes = Array.isArray(base.scenes) && base.scenes.length > 0 ? base.scenes : [{
      id: 'scene_main',
      name: 'Main Scene',
      world: base.world,
      objects: base.objects || [],
    }];
    const active = resolveActiveScene(base) || scenes[0];
    const activeId = active.id;
    const world = JSON.parse(JSON.stringify(active.world || base.world));
    const objects = JSON.parse(JSON.stringify(active.objects || base.objects || []));
    const nextState = mutateFn({ world, objects }) || { world, objects };
    const nextScenes = scenes.map((scene) => (
      scene.id === activeId ? { ...scene, world: nextState.world, objects: nextState.objects } : scene
    ));
    return ensureProjectShape({
      ...base,
      scenes: nextScenes,
      activeSceneId: activeId,
      world: nextState.world,
      objects: nextState.objects,
    });
  }, []);

  // ---- Undo/redo ----
  const pushUndo = useCallback((prevProject) => {
    undoStackRef.current.push(JSON.stringify(prevProject));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    setProject(prev => {
      redoStackRef.current.push(JSON.stringify(prev));
      return JSON.parse(undoStackRef.current.pop());
    });
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    setProject(prev => {
      undoStackRef.current.push(JSON.stringify(prev));
      return JSON.parse(redoStackRef.current.pop());
    });
  }, []);

  // ---- Console ----
  const addLog = useCallback((log) => {
    setLogs(prev => [...prev.slice(-500), log]);
  }, []);

  // ---- Play mode ----
  const { canvasRef: playCanvasRef, uiRootRef: playUiRootRef, isPlaying, start: startPlay, stop: stopPlay, execute } = usePlayMode(projectView, addLog);

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) { stopPlay(); updateEditor({ mode: 'EDIT' }); }
    else { startPlay(); updateEditor({ mode: 'PLAY' }); setMainTab('world'); setBottomTab('console'); }
  }, [isPlaying, startPlay, stopPlay, updateEditor]);

  // ---- World editing ----
  const handleCellPaint = useCallback((cx, cy, value) => {
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => {
        const { lx, ly } = ensureWorldContains(world, cx, cy);
        world.grid[ly][lx] = value || 'empty';
        return { world, objects };
      });
    });
  }, [pushUndo, mutateActiveScene]);

  const handleCellFill = useCallback((startX, startY, value) => {
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => {
        normalizeWorldGrid(world);
        world.grid = world.grid.map((r) => [...r]);
        const { x: ox, y: oy } = worldOffsets(world);
        const minX = ox;
        const minY = oy;
        const maxX = ox + world.cols - 1;
        const maxY = oy + world.rows - 1;
        if (startX < minX || startX > maxX || startY < minY || startY > maxY) {
          const { lx, ly } = ensureWorldContains(world, startX, startY);
          world.grid[ly][lx] = value;
          return { world, objects };
        }
      const old = normalizeCellTypeId(getWorldCell(world, startX, startY));
        if (old === value) return { world, objects };
      const stack = [[startX, startY]];
      const visited = new Set();
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = x + ',' + y;
        if (visited.has(key) || x < minX || x > maxX || y < minY || y > maxY) continue;
        if (normalizeCellTypeId(getWorldCell(world, x, y)) !== old) continue;
        visited.add(key);
        const lx = x - world.offsetX;
        const ly = y - world.offsetY;
        world.grid[ly][lx] = value;
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
        return { world, objects };
      });
    });
  }, [pushUndo, mutateActiveScene]);

  const handleResizeWorld = useCallback((nextCols, nextRows) => {
    setProject((prev) => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => {
        const cols = Math.max(1, parseInt(String(nextCols), 10) || 1);
        const rows = Math.max(1, parseInt(String(nextRows), 10) || 1);
        const fillValue = world.defaultCell !== undefined ? world.defaultCell : 'empty';
        const sourceOffsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
        const sourceOffsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
        const source = Array.isArray(world.grid) ? world.grid : [];
        const grid = [];
        for (let y = 0; y < rows; y += 1) {
          const srcRow = Array.isArray(source[y]) ? source[y] : [];
          const row = [];
          for (let x = 0; x < cols; x += 1) {
            row.push(srcRow[x] !== undefined ? srcRow[x] : fillValue);
          }
          grid.push(row);
        }
        return { world: { ...world, cols, rows, offsetX: sourceOffsetX, offsetY: sourceOffsetY, grid }, objects };
      });
    });
  }, [pushUndo, mutateActiveScene]);

  // ---- Object management ----
  const handleAddObject = useCallback((template) => {
    const cam = editorState.camera;
    const x = Math.floor(cam.x + 100);
    const y = Math.floor(cam.y + 100);
    let obj;

    if (template && template.kind === 'prefab' && template.prefab) {
      obj = instantiateFromPrefab(template.prefab, projectView, x, y);
    } else if (template && template.kind === 'class') {
      const baseType = template.baseType || 'generic';
      const name = template.name || (baseType === 'camera' ? 'Camera' : 'Object');
      obj = createGameObject(name, x, y, { type: baseType });
    } else {
      const cls = (projectView?.defaultClasses || [])[0];
      obj = createGameObject('Object', x, y, { type: (cls && cls.baseType) || 'generic' });
    }

    if (obj.type === 'camera') {
      const player = (projectView && projectView.objects || []).find((o) => o.type === 'player');
      if (player && obj.components && obj.components.Camera && !obj.components.Camera.targetObjectId) {
        obj.components.Camera.targetObjectId = player.id;
      }
    }

    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({ world, objects: [...objects, obj] }));
    });
    updateEditor({ selectedObjectId: obj.id, selectedObjectIds: [obj.id] });
  }, [editorState.camera, updateEditor, pushUndo, projectView, mutateActiveScene]);

  const handleAddCameraObject = useCallback(() => {
    handleAddObject({ kind: 'class', baseType: 'camera', name: 'Camera' });
  }, [handleAddObject]);

  const handleDuplicateObject = useCallback((id) => {
    const source = (projectView && projectView.objects || []).find((o) => o.id === id);
    if (!source) return;
    const clone = JSON.parse(JSON.stringify(source));
    clone.id = genId('obj');
    clone.name = (source.name || 'Object') + ' Copy';
    clone.x = (source.x || 0) + 24;
    clone.y = (source.y || 0) + 24;
    if (clone.components && clone.components.Transform) {
      clone.components.Transform.x = clone.x;
      clone.components.Transform.y = clone.y;
    }
    setProject((prev) => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({ world, objects: [...objects, clone] }));
    });
    updateEditor({ selectedObjectId: clone.id, selectedObjectIds: [clone.id] });
  }, [projectView, pushUndo, mutateActiveScene, updateEditor]);

  const handleRemoveObject = useCallback((id) => {
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({
        world,
        objects: objects
          .filter((o) => o.id !== id)
          .map((o) => (o.parentId === id ? { ...o, parentId: null } : o)),
      }));
    });
    setEditorState((prev) => {
      const ids = (prev.selectedObjectIds || []).filter((sid) => sid !== id);
      const nextPrimary = prev.selectedObjectId === id ? (ids[ids.length - 1] || null) : prev.selectedObjectId;
      return { ...prev, selectedObjectIds: ids, selectedObjectId: nextPrimary };
    });
  }, [pushUndo, mutateActiveScene]);

  const handleSelectObject = useCallback((id, opts = {}) => {
    setEditorState((prev) => {
      const prevIds = Array.isArray(prev.selectedObjectIds) ? prev.selectedObjectIds : (prev.selectedObjectId ? [prev.selectedObjectId] : []);
      let ids = prevIds.slice();
      let primary = prev.selectedObjectId;

      if (Array.isArray(opts.ids)) {
        if (opts.add) {
          const set = new Set(ids);
          for (const sid of opts.ids) set.add(sid);
          ids = [...set];
          primary = opts.ids[opts.ids.length - 1] || primary;
        } else {
          ids = opts.ids.slice();
          primary = ids[ids.length - 1] || null;
        }
      } else if (opts.toggle && id) {
        if (ids.includes(id)) ids = ids.filter((sid) => sid !== id);
        else ids.push(id);
        primary = ids.includes(id) ? id : (ids[ids.length - 1] || null);
      } else if (id) {
        ids = [id];
        primary = id;
      } else {
        ids = [];
        primary = null;
      }

      return {
        ...prev,
        selectedObjectId: primary,
        selectedObjectIds: ids,
        activeTool: primary ? 'select' : prev.activeTool,
      };
    });
  }, [updateEditor, editorState.activeTool]);

  const handleUpdateObject = useCallback((id, patch) => {
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({
        world,
        objects,
      }) => ({ world, objects: objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
    });
  }, [pushUndo, mutateActiveScene]);

  const handleUpdateComponent = useCallback((objId, compName, compData) => {
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({
        world,
        objects: objects.map(o => {
          if (o.id !== objId) return o;
          const updated = { ...o, components: { ...o.components, [compName]: compData } };
          if (compName === 'Transform') { updated.x = compData.x; updated.y = compData.y; }
          return updated;
        }),
      }));
    });
  }, [pushUndo, mutateActiveScene]);

  const handleRemoveComponent = useCallback((objId, compName) => {
    if (compName === 'Transform' || compName === 'Render' || compName === 'ScriptBindings') return;
    setProject(prev => {
      pushUndo(prev);
      return mutateActiveScene(prev, ({ world, objects }) => ({
        world,
        objects: objects.map(o => {
          if (o.id !== objId) return o;
          const comps = { ...o.components };
          delete comps[compName];
          return { ...o, components: comps };
        }),
      }));
    });
  }, [pushUndo, mutateActiveScene]);

  const handleMoveObject = useCallback((id, x, y) => {
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map(o => {
        if (o.id !== id) return o;
        return { ...o, x, y, components: { ...o.components, Transform: { ...o.components.Transform, x, y } } };
      }),
    })));
  }, [mutateActiveScene]);

  const handleMoveObjects = useCallback((updates) => {
    if (!Array.isArray(updates) || updates.length === 0) return;
    const map = new Map(updates.map((u) => [u.id, u]));
    setProject((prev) => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map((o) => {
        const u = map.get(o.id);
        if (!u) return o;
        return {
          ...o,
          x: u.x,
          y: u.y,
          components: { ...o.components, Transform: { ...(o.components && o.components.Transform), x: u.x, y: u.y } },
        };
      }),
    })));
  }, [mutateActiveScene]);

  const handleRotateObject = useCallback((id, rotation) => {
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map(o => {
        if (o.id !== id) return o;
        return { ...o, components: { ...o.components, Transform: { ...(o.components && o.components.Transform), rotation } } };
      }),
    })));
  }, [mutateActiveScene]);

  const handleScaleObject = useCallback((id, scaleX, scaleY) => {
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map(o => {
        if (o.id !== id) return o;
        return { ...o, components: { ...o.components, Transform: { ...(o.components && o.components.Transform), scaleX, scaleY } } };
      }),
    })));
  }, [mutateActiveScene]);

  const handleAlignObjects = useCallback((alignment) => {
    const ids = Array.isArray(editorState.selectedObjectIds) ? editorState.selectedObjectIds : [];
    if (ids.length < 2) return;
    pushUndo(project);
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => {
      const selected = objects.filter(o => ids.includes(o.id));
      const positions = selected.map(o => {
        const t = (o.components && o.components.Transform) || {};
        const s = (o.components && o.components.Sprite) || {};
        return {
          id: o.id,
          x: Number.isFinite(t.x) ? t.x : (Number.isFinite(o.x) ? o.x : 0),
          y: Number.isFinite(t.y) ? t.y : (Number.isFinite(o.y) ? o.y : 0),
          w: s.width || 32,
          h: s.height || 32,
        };
      });
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x + p.w));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y + p.h));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const updateMap = new Map();
      for (const p of positions) {
        let nx = p.x, ny = p.y;
        if (alignment === 'left') nx = minX;
        else if (alignment === 'right') nx = maxX - p.w;
        else if (alignment === 'centerH') nx = centerX - p.w / 2;
        else if (alignment === 'top') ny = minY;
        else if (alignment === 'bottom') ny = maxY - p.h;
        else if (alignment === 'centerV') ny = centerY - p.h / 2;
        updateMap.set(p.id, { x: Math.round(nx), y: Math.round(ny) });
      }

      return {
        world,
        objects: objects.map(o => {
          const u = updateMap.get(o.id);
          if (!u) return o;
          return { ...o, x: u.x, y: u.y, components: { ...o.components, Transform: { ...(o.components && o.components.Transform), x: u.x, y: u.y } } };
        }),
      };
    }));
  }, [editorState.selectedObjectIds, project, pushUndo, mutateActiveScene]);

  const handleReparentObject = useCallback((childId, newParentId) => {
    if (childId === newParentId) return;
    // Prevent circular references
    if (newParentId) {
      const checkCircular = (id) => {
        if (!id) return false;
        if (id === childId) return true;
        const obj = (project && project.objects || []).find(o => o.id === id);
        return obj ? checkCircular(obj.parentId) : false;
      };
      if (checkCircular(newParentId)) return;
    }
    pushUndo(project);
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map(o => o.id === childId ? { ...o, parentId: newParentId } : o),
    })));
  }, [project, pushUndo, mutateActiveScene]);

  const handleDropAsset = useCallback((assetId, assetName, x, y) => {
    const asset = (project && project.assets || []).find(a => a.id === assetId);
    if (!asset) return;
    const w = asset.width || 32;
    const h = asset.height || 32;
    const obj = createGameObject(assetName || 'Sprite', x, y, { type: 'generic' });
    obj.components.Sprite = { ...obj.components.Sprite, assetId, width: Math.min(w, 128), height: Math.min(h, 128) };
    obj.components.Collider = { ...obj.components.Collider, width: Math.min(w, 128), height: Math.min(h, 128) };
    pushUndo(project);
    setProject(prev => mutateActiveScene(prev, ({ world, objects }) => ({ world, objects: [...objects, obj] })));
    updateEditor({ selectedObjectId: obj.id, selectedObjectIds: [obj.id], activeTool: 'select' });
  }, [project, pushUndo, mutateActiveScene, updateEditor]);

  const handleMoveWorld = useCallback((dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    setProject((prev) => mutateActiveScene(prev, ({ world, objects }) => {
      const cellDx = Math.round(dx / 24);
      const cellDy = Math.round(dy / 24);
      if (cellDx === 0 && cellDy === 0) return { world, objects };
      const nextObjects = objects.map((obj) => {
        const t = (obj.components && obj.components.Transform) || {};
        const x = (Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0)) + (cellDx * 24);
        const y = (Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0)) + (cellDy * 24);
        return {
          ...obj,
          x,
          y,
          components: { ...obj.components, Transform: { ...t, x, y } },
        };
      });
      return {
        world: {
          ...world,
          offsetX: (Number.isFinite(world.offsetX) ? world.offsetX : 0) + cellDx,
          offsetY: (Number.isFinite(world.offsetY) ? world.offsetY : 0) + cellDy,
        },
        objects: nextObjects,
      };
    }));
  }, [mutateActiveScene]);

  const handleCreatePrefabFromObject = useCallback((objId) => {
    const source = (projectView && projectView.objects || []).find((o) => o.id === objId);
    if (!source) return;
    // Don't create duplicate if already linked to a prefab
    if (source.prefabId) return;
    const prefabId = `prefab_${Date.now().toString(36)}`;
    const nextPrefab = {
      id: prefabId,
      name: `${source.name || source.type || 'Object'} Prefab`,
      sourceObjectId: source.id,
      object: JSON.parse(JSON.stringify(source)),
    };
    setProject((prev) => {
      const updated = mutateActiveScene(prev, ({ world, objects }) => ({
        world,
        objects: objects.map((o) => o.id === objId ? { ...o, prefabId } : o),
      }));
      return { ...updated, prefabs: [...((updated.prefabs) || []), nextPrefab] };
    });
  }, [projectView, mutateActiveScene]);

  const handleUnlinkPrefab = useCallback((objId) => {
    setProject((prev) => mutateActiveScene(prev, ({ world, objects }) => ({
      world,
      objects: objects.map((o) => o.id === objId ? { ...o, prefabId: undefined } : o),
    })));
  }, [mutateActiveScene]);

  // ---- Scripts ----
  const handleUpdateScript = useCallback((id, patch) => {
    setProject(prev => ({ ...prev, scripts: prev.scripts.map(s => s.id === id ? { ...s, ...patch } : s) }));
  }, []);

  const handleAddScript = useCallback((name, language = 'javascript') => {
const templates = {
      javascript: `function onInit(self, engine) {
  // Called once when game starts
}

function onUpdate(self, engine, dt) {
  // Called every frame
  // Use engine.keyIsDown(keyCode) for input
}
`,
      ui: `// UI Screen using KozUIManager / uiManager
// Visibility can be filtered by game state and active scene

function onInit(self, engine) {
  const manager = (typeof uiManager !== 'undefined' && uiManager) || (typeof KozUIManager !== 'undefined' && KozUIManager);
  if (!manager) return;

  manager.registerScreen('myScreen', {
    validStates: ['RUNNING'],
    // validScenes: ['scene_main', 'Main Scene'],
    layer: 'hud',
    layerOrder: 20,
    create: function() {
      const container = document.createElement('div');
      container.id = 'myScreen';
      container.style.cssText = 'position:absolute;top:20px;right:20px;padding:16px;background:rgba(0,0,0,0.8);color:#fff;border-radius:8px;font-family:sans-serif;';
      container.innerHTML = '<h3>My UI</h3><p id="uiTime">Game time: 0s</p><button id="myBtn">Click Me</button>';
      const btn = container.querySelector('#myBtn');
      if (btn) btn.onclick = function() { console.log('Button clicked!'); };
      return container;
    },
    update: function(ctx) {
      const panel = document.getElementById('myScreen');
      if (!panel) return;
      const p = panel.querySelector('#uiTime');
      if (p) p.textContent = 'Game time: ' + Math.floor(ctx.elapsed || 0) + 's';
    }
  });
}

function onUpdate(self, engine, dt) {
  // manager.updateAll() is called automatically by play mode
}
`,
      typescript: `// TypeScript support coming soon
function onInit(self: any, engine: any): void {
  // Called once when game starts
}

function onUpdate(self: any, engine: any, dt: number): void {
  // Called every frame
}
`,
      lua: `-- Lua support coming soon
function onInit(self, engine)
  -- Called once when game starts
end

function onUpdate(self, engine, dt)
  -- Called every frame
end
`,
      python: `# Python support coming soon
def on_init(self, engine):
    # Called once when game starts
    pass

def on_update(self, engine, dt):
    # Called every frame
    pass
`,
    };
    const ext = language === 'javascript' ? 'js' : language === 'typescript' ? 'ts' : language === 'lua' ? 'lua' : language === 'python' ? 'py' : 'js';
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filePath = `${safeName}.${ext}`;
    const source = templates[language] || templates.javascript;
    const script = {
      id: genId('script'), name, language,
      filePath,
      source,
    };
    
    // Save to external file immediately if electron API available
    if (window.api && projectFile && projectFile.projectPath) {
      console.log('[DEBUG] Calling saveScript', {
        projectPath: projectFile.projectPath,
        filePath,
        source
      });
      window.api.saveScript(projectFile.projectPath, filePath, source)
        .then(result => {
          console.log('[DEBUG] saveScript result:', result);
        })
        .catch(err => console.error('[DEBUG] Failed to save script file:', err));
    } else {
      console.warn('[DEBUG] Script not saved: missing Electron API or project path.', { projectFile, filePath, source });
    }
    
    setProject(prev => { pushUndo(prev); return { ...prev, scripts: [...prev.scripts, script] }; });
  }, [pushUndo, projectFile.projectPath]);

  const handleDeleteScript = useCallback((id) => {
    setProject(prev => { pushUndo(prev); return { ...prev, scripts: prev.scripts.filter(s => s.id !== id) }; });
  }, [pushUndo]);

  // ---- Animations ----
  const handleUpdateAnimation = useCallback((id, patch) => {
    setProject(prev => ({ ...prev, animations: prev.animations.map(a => a.id === id ? { ...a, ...patch } : a) }));
  }, []);

  const handleAddAnimation = useCallback((name) => {
    const clip = { id: genId('anim'), name, duration: 2.0, loop: true, tracks: [] };
    setProject(prev => { pushUndo(prev); return { ...prev, animations: [...prev.animations, clip] }; });
  }, [pushUndo]);

  const handleDeleteAnimation = useCallback((id) => {
    setProject(prev => { pushUndo(prev); return { ...prev, animations: prev.animations.filter(a => a.id !== id) }; });
  }, [pushUndo]);

  const handleAddTrack = useCallback((clipId, objectId, property) => {
    setProject(prev => ({
      ...prev,
      animations: prev.animations.map(a => {
        if (a.id !== clipId) return a;
        return { ...a, tracks: [...a.tracks, { targetObjectId: objectId, property, keyframes: [] }] };
      }),
    }));
  }, []);

  const handleAddKeyframe = useCallback((clipId, trackIdx, time, value) => {
    setProject(prev => ({
      ...prev,
      animations: prev.animations.map(a => {
        if (a.id !== clipId) return a;
        const tracks = a.tracks.map((t, i) => {
          if (i !== trackIdx) return t;
          const kfs = [...t.keyframes, { time: parseFloat(time.toFixed(2)), value, easing: 'linear' }];
          kfs.sort((a, b) => a.time - b.time);
          return { ...t, keyframes: kfs };
        });
        return { ...a, tracks };
      }),
    }));
  }, []);

  // ---- Camera ----
  const handleUpdateCamera = useCallback((cam) => updateEditor({ camera: cam }), [updateEditor]);
  const handleToggleGrid = useCallback(() => updateEditor({ gridVisible: !editorState.gridVisible }), [updateEditor, editorState.gridVisible]);
  const handleFrameScene = useCallback(() => {
    if (!projectView || !projectView.world) return;
    const world = projectView.world;
    const ox = Number.isFinite(world.offsetX) ? world.offsetX : 0;
    const oy = Number.isFinite(world.offsetY) ? world.offsetY : 0;
    const cols = Number.isFinite(world.cols) ? world.cols : ((world.grid && world.grid[0] && world.grid[0].length) || 1);
    const rows = Number.isFinite(world.rows) ? world.rows : ((world.grid && world.grid.length) || 1);
    const minX = ox * 24;
    const minY = oy * 24;
    const maxX = (ox + cols) * 24;
    const maxY = (oy + rows) * 24;
    let sceneMinX = minX;
    let sceneMinY = minY;
    let sceneMaxX = maxX;
    let sceneMaxY = maxY;
    for (const obj of (projectView.objects || [])) {
      const t = (obj.components && obj.components.Transform) || {};
      const s = (obj.components && obj.components.Sprite) || {};
      const x = Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0);
      const y = Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0);
      const w = Number.isFinite(s.width) ? s.width : 32;
      const h = Number.isFinite(s.height) ? s.height : 32;
      sceneMinX = Math.min(sceneMinX, x);
      sceneMinY = Math.min(sceneMinY, y);
      sceneMaxX = Math.max(sceneMaxX, x + w);
      sceneMaxY = Math.max(sceneMaxY, y + h);
    }
    updateEditor({
      camera: {
        ...editorState.camera,
        x: sceneMinX - 48,
        y: sceneMinY - 48,
        zoom: editorState.camera.zoom || 1,
      },
    });
  }, [projectView, updateEditor, editorState.camera]);

  useEffect(() => {
    if (!projectView || !projectView.world) return;
    const ox = Number.isFinite(projectView.world.offsetX) ? projectView.world.offsetX : 0;
    const oy = Number.isFinite(projectView.world.offsetY) ? projectView.world.offsetY : 0;
    if ((ox !== 0 || oy !== 0) && editorState.camera.x === 0 && editorState.camera.y === 0) {
      handleFrameScene();
    }
  }, [projectView, editorState.camera.x, editorState.camera.y, handleFrameScene]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);


  // ---- File ops ----
  const openProjectFromContent = useCallback((content, fileInfo = {}) => {
    try {
      const data = JSON.parse(content);
      if (data.schemaVersion !== 1) {
        alert('Unknown schema version');
        return;
      }
      const next = ensureProjectShape(data);
      setProject(next);
      setProjectFile({
        projectPath: fileInfo.projectPath || null,
        folderPath: fileInfo.folderPath || null,
        name: (next.meta && next.meta.name) || fileInfo.name || null,
      });
      setShowProjectSelector(false);
      undoStackRef.current = [];
      redoStackRef.current = [];
    } catch (err) {
      alert('Invalid project file: ' + err.message);
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!project) return;
    const normalized = ensureProjectShape(project);
    const json = JSON.stringify(normalized, null, 2);
    const api = window.api;
    if (api && typeof api.saveProject === 'function') {
      api.saveProject({
        projectPath: projectFile.projectPath,
        name: normalized.meta && normalized.meta.name ? normalized.meta.name : newProjectName,
        projectJson: json,
      }).then((result) => {
        if (!result || !result.ok) {
          if (!(result && result.canceled)) alert(`Save failed: ${(result && result.error) || 'Unknown error'}`);
          return;
        }
        setProjectFile({
          projectPath: result.projectPath || null,
          folderPath: result.folderPath || null,
          name: result.name || (normalized.meta && normalized.meta.name) || null,
        });
        refreshProjects();
        showToast('Project saved');
      });
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (normalized.meta.name || 'project') + '.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('Project saved');
  }, [project, projectFile.projectPath, newProjectName, refreshProjects, showToast]);

  const handleSaveAs = useCallback(() => {
    if (!project) return;
    const normalized = ensureProjectShape(project);
    const json = JSON.stringify(normalized, null, 2);
    const api = window.api;
    if (api && typeof api.saveProjectAs === 'function') {
      api.saveProjectAs({
        name: normalized.meta && normalized.meta.name ? normalized.meta.name : newProjectName,
        projectJson: json,
      }).then((result) => {
        if (!result || !result.ok) {
          if (!(result && result.canceled)) alert(`Save As failed: ${(result && result.error) || 'Unknown error'}`);
          return;
        }
        setProjectFile({
          projectPath: result.projectPath || null,
          folderPath: result.folderPath || null,
          name: result.name || (normalized.meta && normalized.meta.name) || null,
        });
        refreshProjects();
      });
      return;
    }
    handleSave();
  }, [project, newProjectName, handleSave, refreshProjects]);

  const handleLoad = useCallback(() => {
    refreshProjects();
    setShowProjectSelector(true);
  }, [refreshProjects]);

  const handleLoadFromFile = useCallback(() => {
    const api = window.api;
    if (api && typeof api.openProjectDialog === 'function') {
      api.openProjectDialog().then((result) => {
        if (!result || !result.ok) {
          if (!(result && result.canceled)) alert(`Load failed: ${(result && result.error) || 'Unknown error'}`);
          return;
        }
        openProjectFromContent(result.content, {
          projectPath: result.projectPath || null,
          folderPath: result.folderPath || null,
          name: null,
        });
      });
      return;
    }
  }, [openProjectFromContent]);

  const handleLoadProjectFromList = useCallback((item) => {
    const api = window.api;
    if (!item) return;
    if (api && typeof api.loadProject === 'function') {
      api.loadProject(item.projectPath).then((result) => {
        if (!result || !result.ok) return;
        openProjectFromContent(result.content, { projectPath: result.projectPath, folderPath: result.folderPath, name: item.name });
      });
      return;
    }
  }, [openProjectFromContent]);

  const handleNew = useCallback(() => {
    const name = (newProjectName || 'Untitled Project').trim() || 'Untitled Project';
    const nextProject = createDefaultProject({ name });
    setProject(nextProject);
    setShowProjectSelector(false);
    setProjectFile({ projectPath: null, folderPath: null, name });
    updateEditor({ selectedObjectId: null, selectedObjectIds: [], selectedScriptId: null, camera: { x: -240, y: -140, zoom: 1 }, brushValue: 'solid' });
    undoStackRef.current = [];
    redoStackRef.current = [];
    const api = window.api;
    if (api && typeof api.saveProject === 'function') {
      api.saveProject({
        projectPath: null,
        name,
        projectJson: JSON.stringify(nextProject, null, 2),
      }).then((result) => {
        if (!result || !result.ok) return;
        setProjectFile({
          projectPath: result.projectPath || null,
          folderPath: result.folderPath || null,
          name: result.name || name,
        });
        refreshProjects();
      });
    }
  }, [updateEditor, newProjectName, refreshProjects]);

  const handlePatchProject = useCallback((patch) => {
    setProject(prev => {
      const merged = ensureProjectShape({ ...prev, ...patch });
      const active = resolveActiveScene(merged);
      if (!active) return merged;
      return ensureProjectShape({ ...merged, world: active.world, objects: active.objects, activeSceneId: active.id });
    });
  }, []);

  const openExportModal = useCallback(() => {
    if (!project) return;
    const normalized = ensureProjectShape(project);
    const defaultTarget = (normalized.build && normalized.build.target) || 'html-zip';
    setExportConfig(prev => ({
      ...prev,
      target: defaultTarget,
      fileName: normalized.meta && normalized.meta.name ? normalized.meta.name : 'game',
    }));
    setExportProgress([]);
    setShowExportModal(true);
  }, [project]);

  const handleExport = useCallback(() => {
    if (isExporting) return;
    const normalized = ensureProjectShape(project);
    const target = exportConfig.target || 'html-zip';
    const persistedProject = ensureProjectShape({
      ...normalized,
      build: { ...normalized.build, target },
      exportOptions: {
        includeAssets: exportConfig.includeAssets,
        includeScripts: exportConfig.includeScripts,
        minify: exportConfig.minify,
        pwaOfflineCache: exportConfig.pwaOfflineCache,
        electronSingleFile: exportConfig.electronSingleFile,
        tarGzip: exportConfig.tarGzip,
        desktopPlatform: exportConfig.desktopPlatform,
        desktopFormat: exportConfig.desktopFormat,
      },
    });
    setProject(persistedProject);

    let projectForExport = JSON.parse(JSON.stringify(persistedProject));
    if (!exportConfig.includeAssets) projectForExport = stripAssetsForExport(projectForExport);
    if (!exportConfig.includeScripts) projectForExport = stripScriptsForExport(projectForExport);

    const json = exportConfig.minify ? JSON.stringify(projectForExport) : JSON.stringify(projectForExport, null, 2);
    const html = buildExportHtml(projectForExport, json, target, { minify: exportConfig.minify });
    const baseName = (exportConfig.fileName || projectForExport.meta.name || 'game').trim();

    const electronApi = window.api && typeof window.api.exportBuild === 'function' ? window.api : null;
    if (electronApi) {
      setIsExporting(true);
      setExportProgress((prev) => [...prev, `Starting export for ${target}...`]);
      electronApi.exportBuild({
        target,
        fileName: baseName,
        html,
        projectJson: json,
        options: {
          includeAssets: exportConfig.includeAssets,
          includeScripts: exportConfig.includeScripts,
          minify: exportConfig.minify,
          pwaOfflineCache: exportConfig.pwaOfflineCache,
          electronSingleFile: exportConfig.electronSingleFile,
          tarGzip: exportConfig.tarGzip,
          desktopPlatform: exportConfig.desktopPlatform,
          desktopFormat: exportConfig.desktopFormat,
        },
      }).then((result) => {
        setIsExporting(false);
        if (result && result.ok) {
          setShowExportModal(false);
          addLog({ type: 'info', message: `Exported build target: ${target}`, time: new Date().toLocaleTimeString() });
          if (result.warning) {
            addLog({ type: 'warn', message: result.warning, time: new Date().toLocaleTimeString() });
          }
        } else if (result && result.canceled) {
          addLog({ type: 'warn', message: 'Export canceled', time: new Date().toLocaleTimeString() });
        } else {
          addLog({ type: 'error', message: `Export failed: ${(result && result.error) || 'Unknown error'}`, time: new Date().toLocaleTimeString() });
        }
      });
      return;
    }

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = baseName + '.html'; a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
    addLog({ type: 'info', message: `Exported fallback HTML: ${target}`, time: new Date().toLocaleTimeString() });
  }, [project, addLog, exportConfig, isExporting]);

  // ---- Bottom panel resize ----
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomHeight;
    function onMove(e) { setBottomHeight(Math.max(100, Math.min(600, startH - (e.clientY - startY)))); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [bottomHeight]);

  // ---- Left panel resize ----
  const handleLeftResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;
    function onMove(e) { setLeftWidth(Math.max(180, Math.min(500, startW + (e.clientX - startX)))); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftWidth]);

  // ---- Right panel resize ----
  const handleRightResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    function onMove(e) { setRightWidth(Math.max(220, Math.min(500, startW - (e.clientX - startX)))); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [rightWidth]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.closest('.cm-editor')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (mod && e.key === 'y') { e.preventDefault(); handleRedo(); }
      if (mod && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); handleSaveAs(); }
      if (mod && e.key === 's') { e.preventDefault(); handleSave(); }
      if (mod && e.key === 'd') { e.preventDefault(); if (editorState.selectedObjectId) handleDuplicateObject(editorState.selectedObjectId); }
      if (e.key === 'F5') { e.preventDefault(); handlePlayToggle(); }
      if (!isPlaying) {
        if (e.key === 'b') updateEditor({ activeTool: 'brush' });
        if (e.key === 'f') updateEditor({ activeTool: 'fill' });
        if (e.key === 'v') updateEditor({ activeTool: 'select' });
        if (e.key === 'g') updateEditor({ activeTool: 'worldMove' });
        // Gizmo mode shortcuts (W/E/R) — switch to select tool + set gizmo mode
        if (e.key === 'w') { updateEditor({ activeTool: 'select', gizmoMode: 'move' }); return; }
        if (e.key === 'e') { updateEditor({ activeTool: 'select', gizmoMode: 'rotate' }); return; }
        if (e.key === 'r') { updateEditor({ activeTool: 'select', gizmoMode: 'scale' }); return; }
        const camStep = e.shiftKey ? 48 : 24;
        const isPan = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 's'].includes(e.key);
        if (isPan && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const cam = editorState.camera;
          if (e.key === 'ArrowLeft' || e.key === 'a') updateEditor({ camera: { ...cam, x: cam.x - camStep } });
          if (e.key === 'ArrowRight' || e.key === 'd') updateEditor({ camera: { ...cam, x: cam.x + camStep } });
          if (e.key === 'ArrowUp' || e.key === 'w') updateEditor({ camera: { ...cam, y: cam.y - camStep } });
          if (e.key === 'ArrowDown' || e.key === 's') updateEditor({ camera: { ...cam, y: cam.y + camStep } });
        }
        if (e.key === 'Delete') {
          const ids = Array.isArray(editorState.selectedObjectIds) && editorState.selectedObjectIds.length > 0
            ? editorState.selectedObjectIds
            : (editorState.selectedObjectId ? [editorState.selectedObjectId] : []);
          if (ids.length === 1) handleRemoveObject(ids[0]);
          if (ids.length > 1) {
            setProject((prev) => {
              pushUndo(prev);
              return mutateActiveScene(prev, ({ world, objects }) => ({
                world,
                objects: objects
                  .filter((o) => !ids.includes(o.id))
                  .map((o) => (ids.includes(o.parentId) ? { ...o, parentId: null } : o)),
              }));
            });
            updateEditor({ selectedObjectId: null, selectedObjectIds: [] });
          }
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleUndo, handleRedo, handleSave, handleSaveAs, handlePlayToggle, updateEditor, editorState.camera, editorState.selectedObjectId, editorState.selectedObjectIds, handleRemoveObject, handleDuplicateObject, isPlaying, pushUndo, mutateActiveScene]);

  useEffect(() => {
    if (!window.api || typeof window.api.onMenuEvent !== 'function') return;
    const unbind = window.api.onMenuEvent((eventName) => {
      if (eventName === 'menu-save') handleSave();
      if (eventName === 'menu-save-as') handleSaveAs();
      if (eventName === 'menu-load') handleLoad();
      if (eventName === 'menu-export') openExportModal();
    });
    return () => { if (typeof unbind === 'function') unbind(); };
  }, [handleSave, handleSaveAs, handleLoad, openExportModal]);

  useEffect(() => {
    if (!window.api || typeof window.api.onExportProgress !== 'function') return;
    const unbind = window.api.onExportProgress((entry) => {
      if (!entry || !entry.message) return;
      setExportProgress((prev) => [...prev.slice(-199), entry.message]);
    });
    return () => { if (typeof unbind === 'function') unbind(); };
  }, []);

  useEffect(() => {
    if (exportConfig.target !== 'electron-exe') return;
    if (desktopFormats.includes(exportConfig.desktopFormat)) return;
    setExportConfig((prev) => ({ ...prev, desktopFormat: desktopFormats[0] || 'portable' }));
  }, [exportConfig.target, exportConfig.desktopFormat, desktopFormats]);

  useEffect(() => {
    const theme = (project && project.editorTheme) || 'slate';
    document.documentElement.setAttribute('data-editor-theme', theme);
  }, [project]);

  // Render project selector modal if no project loaded
  return (
    <>
      {(showProjectSelector || !project) && (
        <Modal open={true} title={null} onClose={() => { if (project) setShowProjectSelector(false); }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, minWidth: 360, maxHeight: '72vh' }}>
            <KozLogo size={80} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <button className="btn btn-lg" style={{ width: '100%' }} onClick={handleNew}>New Project</button>
              <button className="btn btn-lg" style={{ width: '100%' }} onClick={handleLoadFromFile}>Load Project</button>
              {!!project && (
                <button className="btn btn-lg" style={{ width: '100%' }} onClick={() => setShowProjectSelector(false)}>Cancel</button>
              )}
              <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                Save uses {projectsRoot || 'the current projects folder'} and does not open the file system.
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: '#0b1220', maxHeight: '32vh', overflow: 'auto' }}>
                {(availableProjects || []).length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 10 }}>No projects found yet.</div>
                )}
                {(availableProjects || []).map((item) => (
                  <button
                    key={item.projectPath}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleLoadProjectFromList(item)}
                    style={{ width: '100%', justifyContent: 'space-between', border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, background: 'transparent' }}
                  >
                    <span style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.folderPath || ''}</span>
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{new Date(item.updatedAt).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {!(showProjectSelector || !project) && (
        // ...existing code for the editor layout...
        <div className="editor-layout" style={{ gridTemplateColumns: `${leftWidth}px 1fr ${rightWidth}px` }}>
          <Toolbar project={projectView} editorState={editorState} isPlaying={isPlaying}
            onToolChange={(tool) => updateEditor({ activeTool: tool })}
            onBrushChange={(val) => updateEditor({ brushValue: getBrushValue({ brushValue: val }) })}
            onGizmoModeChange={(mode, snapOverride) => updateEditor({
              gizmoMode: mode,
              activeTool: 'select',
              ...(snapOverride !== undefined ? { snapToGrid: snapOverride } : {}),
            })}
            onUndo={handleUndo} onRedo={handleRedo}
            onNewProject={handleNew} onSaveProject={handleSave} onSaveAsProject={handleSaveAs} onLoadProject={handleLoadFromFile}
            onExport={openExportModal} onPlayToggle={handlePlayToggle}
            undoCount={undoStackRef.current.length} redoCount={redoStackRef.current.length}
            onAlignObjects={handleAlignObjects} />

          <div className="editor-left" style={{ width: leftWidth, overflow: 'auto' }}>
            <div className="resize-handle-h" onMouseDown={handleLeftResizeStart} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'ew-resize', zIndex: 10 }} />
            <WorldTools
              project={projectView}
              editorState={editorState}
              onUpdateCamera={handleUpdateCamera}
              onToggleGrid={handleToggleGrid}
              onResizeWorld={handleResizeWorld}
              onResetView={handleFrameScene}
            />
            <ObjectList
              project={projectView}
              editorState={editorState}
              onSelectObject={handleSelectObject}
              onAddObject={handleAddObject}
              onAddCameraObject={handleAddCameraObject}
              onRemoveObject={handleRemoveObject}
              onDuplicateObject={handleDuplicateObject}
              onReparentObject={handleReparentObject}
            />
          </div>

          <div className="editor-center">
            <div className="main-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#181c24' }}>
              {['world', 'scripts', 'assets', 'scenes', 'settings'].map(tab => (
                <button
                  key={tab}
                  className={`main-tab ${mainTab === tab ? 'active' : ''}`}
                  style={{
                    padding: '8px 20px',
                    border: 'none',
                    background: mainTab === tab ? '#23283a' : 'transparent',
                    color: mainTab === tab ? '#fff' : '#aaa',
                    fontWeight: mainTab === tab ? 600 : 400,
                    cursor: 'pointer',
                    outline: 'none',
                    borderBottom: mainTab === tab ? '2px solid #4ade80' : '2px solid transparent',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onClick={() => setMainTab(tab)}
                >
                  {tab === 'world'
                    ? 'World / Game'
                    : tab === 'scripts'
                      ? `Scripts (${projectView && Array.isArray(projectView.scripts) ? projectView.scripts.length : 0})`
                      : tab === 'assets'
                        ? 'Assets'
                        : tab === 'scenes'
                          ? `Scenes (${project && Array.isArray(project.scenes) ? project.scenes.length : 0})`
                          : 'Settings'}
                </button>
              ))}
            </div>

            {mainTab === 'world' && (
              <>
                <div className="editor-viewport">
                  {isPlaying ? (
                    <div style={{ position: 'relative', width: 'fit-content', maxWidth: '100%', maxHeight: '100%', margin: '0 auto' }}>
                      <canvas ref={playCanvasRef} width={projectView.meta.resolution.width} height={projectView.meta.resolution.height}
                        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', margin: '0 auto', background: '#0b1220' }} tabIndex={0} />
                      <div ref={playUiRootRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
                    </div>
                  ) : (
                    <Viewport project={projectView} editorState={editorState}
                      onCellPaint={handleCellPaint} onCellFill={handleCellFill} onSelectObject={handleSelectObject}
                      onPlaceObject={(x, y) => {
                        const cls = (projectView?.defaultClasses || [])[0];
                        const obj = createGameObject('Object', x, y, { type: (cls && cls.baseType) || 'generic' });
                        setProject(prev => {
                          pushUndo(prev);
                          return mutateActiveScene(prev, ({ world, objects }) => ({ world, objects: [...objects, obj] }));
                        });
                        updateEditor({ selectedObjectId: obj.id, selectedObjectIds: [obj.id] });
                      }}
                      onMoveObject={handleMoveObject}
                      onMoveObjects={handleMoveObjects}
                      onMoveWorld={handleMoveWorld}
                      onRotateObject={handleRotateObject}
                      onScaleObject={handleScaleObject}
                      onSelectObjects={(ids, add) => handleSelectObject(null, { ids, add })}
                      onUpdateCamera={handleUpdateCamera}
                      onDropAsset={handleDropAsset} />
                  )}
                </div>
                <div className="resize-handle" onMouseDown={handleResizeStart} />
                <div className="editor-bottom" style={{ height: bottomHeight }}>
                  <div className="bottom-tabs">
                    {['timeline', 'console'].map(tab => (
                      <button key={tab} className={`bottom-tab ${bottomTab === tab ? 'active' : ''}`} onClick={() => setBottomTab(tab)}>
                        {tab === 'timeline'
                          ? `Timeline (${projectView && Array.isArray(projectView.animations) ? projectView.animations.length : 0})`
                          : `Console (${logs.length})`}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    {bottomTab === 'timeline' && (
                      <Timeline
                        project={projectView}
                        onUpdateAnimation={handleUpdateAnimation}
                        onAddAnimation={handleAddAnimation}
                        onDeleteAnimation={handleDeleteAnimation}
                        onAddTrack={handleAddTrack}
                        onAddKeyframe={handleAddKeyframe}
                      />
                    )}
                    {bottomTab === 'console' && (
                      <ConsolePanel
                        logs={logs}
                        onClear={() => setLogs([])}
                        onCommand={(cmd) => execute && execute(cmd)}
                        isRunning={isPlaying}
                        onStop={stopPlay}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
            {mainTab === 'scripts' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <ScriptEditor
                  project={projectView}
                  onUpdateScript={handleUpdateScript}
                  onAddScript={handleAddScript}
                  onDeleteScript={handleDeleteScript}
                  selectedId={editorState.selectedScriptId}
                  setSelectedId={id => setEditorState(prev => ({ ...prev, selectedScriptId: id }))}
                  showFileList={true}
                  projectPath={projectFile.folderPath}
                />
              </div>
            )}
            {mainTab === 'assets' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SystemsTab
                  mode="assets"
                  project={project}
                  selectedObjectId={editorState.selectedObjectId}
                  onPatchProject={handlePatchProject}
                  onSelectObject={handleSelectObject}
                />
              </div>
            )}
            {mainTab === 'scenes' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SystemsTab
                  mode="scenes"
                  project={project}
                  selectedObjectId={editorState.selectedObjectId}
                  onPatchProject={handlePatchProject}
                  onSelectObject={handleSelectObject}
                />
              </div>
            )}
            {mainTab === 'settings' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <SystemsTab
                  mode="settings"
                  project={project}
                  selectedObjectId={editorState.selectedObjectId}
                  onPatchProject={handlePatchProject}
                  onSelectObject={handleSelectObject}
                />
              </div>
            )}
          </div>
          <div className="editor-right" style={{ width: rightWidth, overflow: 'auto' }}>
            <div className="resize-handle-h" onMouseDown={handleRightResizeStart} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, cursor: 'ew-resize', zIndex: 10 }} />
            <Inspector
              project={projectView}
              editorState={editorState}
              onUpdateObject={handleUpdateObject}
              onUpdateComponent={handleUpdateComponent}
              onRemoveComponent={handleRemoveComponent}
              onCreatePrefabFromObject={handleCreatePrefabFromObject}
              onUnlinkPrefab={handleUnlinkPrefab}
            />
          </div>
        </div>
      )}
      <Modal open={showExportModal} title="Export Project" onClose={() => setShowExportModal(false)}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="field">
            <label>Target</label>
            <select value={exportConfig.target} onChange={(e) => setExportConfig(prev => ({ ...prev, target: e.target.value }))}>
              <option value="electron-exe">Electron based EXE</option>
              <option value="pwa">PWA</option>
              <option value="html-zip">HTML/ZIP</option>
              <option value="single-html">Single HTML</option>
              <option value="tarball">Tarball</option>
            </select>
          </div>
          <div className="field">
            <label>Filename</label>
            <input
              value={exportConfig.fileName}
              onChange={(e) => setExportConfig(prev => ({ ...prev, fileName: e.target.value }))}
              placeholder="Build file name"
            />
          </div>
          <div className="field">
            <label>Assets</label>
            <input type="checkbox" checked={exportConfig.includeAssets} onChange={(e) => setExportConfig(prev => ({ ...prev, includeAssets: e.target.checked }))} />
            <label>Scripts</label>
            <input type="checkbox" checked={exportConfig.includeScripts} onChange={(e) => setExportConfig(prev => ({ ...prev, includeScripts: e.target.checked }))} />
            <label>Minify</label>
            <input type="checkbox" checked={exportConfig.minify} onChange={(e) => setExportConfig(prev => ({ ...prev, minify: e.target.checked }))} />
          </div>
          {exportConfig.target === 'pwa' && (
            <div className="field">
              <label>Offline Cache</label>
              <input type="checkbox" checked={exportConfig.pwaOfflineCache} onChange={(e) => setExportConfig(prev => ({ ...prev, pwaOfflineCache: e.target.checked }))} />
            </div>
          )}
          {exportConfig.target === 'electron-exe' && (
            <>
              <div className="field">
                <label>Platform</label>
                <select value={exportConfig.desktopPlatform} onChange={(e) => setExportConfig(prev => ({ ...prev, desktopPlatform: e.target.value }))}>
                  <option value="auto">Auto (current OS)</option>
                  <option value="win">Windows</option>
                  <option value="linux">Linux</option>
                  <option value="mac">macOS</option>
                </select>
              </div>
              <div className="field">
                <label>Format</label>
                <select value={exportConfig.desktopFormat} onChange={(e) => setExportConfig(prev => ({ ...prev, desktopFormat: e.target.value }))}>
                  {desktopFormats.map((fmt) => (
                    <option key={`desktop-fmt-${fmt}`} value={fmt}>{fmt}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Single File</label>
                <input type="checkbox" checked={exportConfig.electronSingleFile} onChange={(e) => setExportConfig(prev => ({ ...prev, electronSingleFile: e.target.checked }))} />
              </div>
            </>
          )}
          {exportConfig.target === 'tarball' && (
            <div className="field">
              <label>gzip</label>
              <input type="checkbox" checked={exportConfig.tarGzip} onChange={(e) => setExportConfig(prev => ({ ...prev, tarGzip: e.target.checked }))} />
            </div>
          )}
          {exportProgress.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 4, padding: 6, background: '#0b1220', maxHeight: 120, overflow: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
              {exportProgress.map((line, i) => (
                <div key={`exp-line-${i}`} style={{ color: '#94a3b8' }}>{line}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button className="btn btn-sm" onClick={() => setShowExportModal(false)} disabled={isExporting}>Cancel</button>
            <button className="btn btn-sm btn-play" onClick={handleExport} disabled={isExporting}>{isExporting ? 'Exporting...' : 'Export'}</button>
          </div>
        </div>
      </Modal>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#22c55e', color: '#0b1220', padding: '8px 20px', borderRadius: 6,
          fontSize: 13, fontWeight: 600, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
            </>
          );
}
export default App;
