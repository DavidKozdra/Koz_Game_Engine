function exportRuntimeMain() {
  var PLAY_RENDER_MODE_WEBGL_3D = 'webgl-3d';
  var CELL_SIZE = 24;
  var DEFAULT_SCENE_LIGHTING = {
    enabled: false,
    ambientColor: '#0b1220',
    ambientIntensity: 0.35,
    overlayOpacity: 0.82,
    fogColor: '#07111d',
    fogDensity: 0.65,
  };
  var DEFAULT_LIGHT_COMPONENT = {
    enabled: true,
    color: '#ffd27a',
    intensity: 1,
    radius: 180,
    falloff: 0.65,
    offsetX: 0,
    offsetY: 0,
    height: 18,
  };
  var project = window.__KOZ_PROJECT__ || {};
  var canvas2d = document.getElementById('game-2d');
  var canvas3d = document.getElementById('game-3d');
  var uiRoot = document.getElementById('ui-root');
  var ctx2d = canvas2d && canvas2d.getContext ? canvas2d.getContext('2d') : null;
  var keys = new Set();
  var images = new Map();
  var assetById = new Map((Array.isArray(project.assets) ? project.assets : []).map(function(asset) { return [asset.id, asset]; }));
  var elapsed = 0;
  var activeSceneId = project.activeSceneId || (((project.scenes || [])[0] || {}).id) || 'scene_main';
  var currentScene = null;
  var sceneLighting = Object.assign({}, DEFAULT_SCENE_LIGHTING);
  var renderMode = '2d';
  var activeCanvas = canvas2d;
  var world = {};
  var gameObjects = [];
  var cameraConfig = project.camera || {};
  var animClips = Array.isArray(project.animations) ? project.animations : [];
  var scripts = {};
  var cssScripts = {};
  var activeCssNodes = new Map();
  var scriptInstances = [];
  var pendingSceneId = null;
  var viewX = 0;
  var viewY = 0;
  var render3D = null;
  var uiManager = null;
  var audioSystem = null;
  var renderer3dController = null;
  var engine = null;
  var sceneManager = null;
  var lightingManager = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clampLighting01(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function normalizeRenderMode(value, fallback) {
    var mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (mode === '3d' || mode === PLAY_RENDER_MODE_WEBGL_3D) return PLAY_RENDER_MODE_WEBGL_3D;
    if (mode === '2d') return '2d';
    return fallback || '2d';
  }

  function resolveScene(sceneId) {
    var scenes = Array.isArray(project.scenes) ? project.scenes : [];
    if (!scenes.length) {
      return {
        id: sceneId || project.activeSceneId || 'scene_main',
        name: 'Main Scene',
        renderMode: normalizeRenderMode(project && project.meta && project.meta.renderMode, '2d'),
        lighting: normalizeSceneLighting(project && project.lighting),
        world: project.world || {},
        objects: project.objects || [],
      };
    }
    for (var i = 0; i < scenes.length; i += 1) {
      if (scenes[i] && scenes[i].id === sceneId) return scenes[i];
    }
    return scenes[0];
  }

  function resolveRenderMode(sceneId) {
    var fallback = normalizeRenderMode(project && project.meta && project.meta.renderMode, '2d');
    var scene = resolveScene(sceneId);
    return normalizeRenderMode(scene && scene.renderMode, fallback);
  }

  function resolveSceneName(sceneId) {
    var scene = resolveScene(sceneId);
    return scene ? scene.name : sceneId;
  }

  function normalizeSceneLighting(lighting) {
    var source = lighting && typeof lighting === 'object' ? lighting : {};
    return {
      enabled: source.enabled === true,
      ambientColor: typeof source.ambientColor === 'string' && source.ambientColor ? source.ambientColor : DEFAULT_SCENE_LIGHTING.ambientColor,
      ambientIntensity: clampLighting01(source.ambientIntensity == null ? DEFAULT_SCENE_LIGHTING.ambientIntensity : source.ambientIntensity),
      overlayOpacity: clampLighting01(source.overlayOpacity == null ? DEFAULT_SCENE_LIGHTING.overlayOpacity : source.overlayOpacity),
      fogColor: typeof source.fogColor === 'string' && source.fogColor ? source.fogColor : DEFAULT_SCENE_LIGHTING.fogColor,
      fogDensity: clampLighting01(source.fogDensity == null ? DEFAULT_SCENE_LIGHTING.fogDensity : source.fogDensity),
    };
  }

  function normalizeLightComponent(light) {
    var source = light && typeof light === 'object' ? light : {};
    return {
      enabled: source.enabled !== false,
      color: typeof source.color === 'string' && source.color ? source.color : DEFAULT_LIGHT_COMPONENT.color,
      intensity: clampLighting01(source.intensity == null ? DEFAULT_LIGHT_COMPONENT.intensity : source.intensity),
      radius: Number.isFinite(source.radius) ? Math.max(1, source.radius) : DEFAULT_LIGHT_COMPONENT.radius,
      falloff: clampLighting01(source.falloff == null ? DEFAULT_LIGHT_COMPONENT.falloff : source.falloff),
      offsetX: Number.isFinite(source.offsetX) ? source.offsetX : DEFAULT_LIGHT_COMPONENT.offsetX,
      offsetY: Number.isFinite(source.offsetY) ? source.offsetY : DEFAULT_LIGHT_COMPONENT.offsetY,
      height: Number.isFinite(source.height) ? Math.max(0, source.height) : DEFAULT_LIGHT_COMPONENT.height,
    };
  }

  function getLightingManagerObject() {
    return (Array.isArray(gameObjects) ? gameObjects : []).find(function(obj) {
      return obj && obj.components && obj.components.LightingManager;
    }) || null;
  }

  function resolveLightingSettings(sceneLike) {
    var managerObject = getLightingManagerObject();
    if (managerObject && managerObject.components && managerObject.components.LightingManager) {
      return normalizeSceneLighting(managerObject.components.LightingManager);
    }
    return normalizeSceneLighting(sceneLike && sceneLike.lighting);
  }

  function resolveCellType(cell) {
    if (cell == null || cell === 'empty') return null;
    var types = Array.isArray(project.cellTypes) ? project.cellTypes : [];
    if (typeof cell === 'number') return types[cell] || null;
    if (typeof cell === 'string') {
      for (var i = 0; i < types.length; i += 1) {
        if (types[i] && types[i].id === cell) return types[i];
      }
      return null;
    }
    if (typeof cell === 'object' && cell.typeId) {
      for (var j = 0; j < types.length; j += 1) {
        if (types[j] && types[j].id === cell.typeId) return types[j];
      }
    }
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

  function buildRuntimeObject(obj) {
    var t = (obj.components && obj.components.Transform) || {};
    var s = (obj.components && obj.components.Sprite) || {};
    var x = Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0);
    var y = Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0);
    var scaleX = Number.isFinite(t.scaleX) ? t.scaleX : 1;
    var scaleY = Number.isFinite(t.scaleY) ? t.scaleY : 1;
    var width = Number.isFinite(s.width) ? s.width : 32;
    var height = Number.isFinite(s.height) ? s.height : 32;
    return Object.assign({}, obj, {
      x: x,
      y: y,
      rotation: Number.isFinite(t.rotation) ? t.rotation : 0,
      scaleX: scaleX,
      scaleY: scaleY,
      width: width * scaleX,
      height: height * scaleY,
      color: s.color || '#4ade80',
      components: obj.components || {},
    });
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

  function clearActiveCss() {
    activeCssNodes.forEach(function(node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
    activeCssNodes.clear();
  }

  function applyCssScript(script) {
    if (!script || !script.id || activeCssNodes.has(script.id)) return;
    var target = document.head || document.documentElement || document.body;
    if (!target) return;
    var styleNode = document.createElement('style');
    styleNode.type = 'text/css';
    styleNode.setAttribute('data-koz-script-id', script.id);
    styleNode.textContent = String(script.source || '');
    target.appendChild(styleNode);
    activeCssNodes.set(script.id, styleNode);
  }

  function getColliderRect(obj) {
    var collider = (obj && obj.components && obj.components.Collider) || {};
    var width = Number.isFinite(collider.width) ? collider.width : (Number.isFinite(obj.width) ? obj.width : 0);
    var height = Number.isFinite(collider.height) ? collider.height : (Number.isFinite(obj.height) ? obj.height : 0);
    var offsetX = Number.isFinite(collider.offsetX) ? collider.offsetX : (Number.isFinite(collider.x) ? collider.x : 0);
    var offsetY = Number.isFinite(collider.offsetY) ? collider.offsetY : (Number.isFinite(collider.y) ? collider.y : 0);
    return {
      x: (Number.isFinite(obj.x) ? obj.x : 0) + offsetX,
      y: (Number.isFinite(obj.y) ? obj.y : 0) + offsetY,
      w: width,
      h: height,
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

  function sampleTrack(track, time) {
    var keyframes = track && track.keyframes;
    if (!keyframes || keyframes.length === 0) return 0;
    if (keyframes.length === 1) return keyframes[0].value;
    if (time <= keyframes[0].time) return keyframes[0].value;
    if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;
    for (var i = 0; i < keyframes.length - 1; i += 1) {
      if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
        var range = keyframes[i + 1].time - keyframes[i].time;
        var t = range > 0 ? (time - keyframes[i].time) / range : 0;
        return keyframes[i].value + (keyframes[i + 1].value - keyframes[i].value) * t;
      }
    }
    return keyframes[keyframes.length - 1].value;
  }

  function resolveWorldMetrics(sourceWorld, cellSize) {
    if (!sourceWorld || !Array.isArray(sourceWorld.grid)) return null;
    var rows = Number.isFinite(sourceWorld.rows) ? sourceWorld.rows : sourceWorld.grid.length;
    var cols = Number.isFinite(sourceWorld.cols) ? sourceWorld.cols : ((sourceWorld.grid[0] && sourceWorld.grid[0].length) || 0);
    if (rows <= 0 || cols <= 0) return null;
    var offsetX = Number.isFinite(sourceWorld.offsetX) ? sourceWorld.offsetX : 0;
    var offsetY = Number.isFinite(sourceWorld.offsetY) ? sourceWorld.offsetY : 0;
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
      cellSize: cellSize,
    };
  }

  function readWorldCell(sourceWorld, cellX, cellY) {
    if (!sourceWorld || !Array.isArray(sourceWorld.grid)) return null;
    var offsetX = Number.isFinite(sourceWorld.offsetX) ? sourceWorld.offsetX : 0;
    var offsetY = Number.isFinite(sourceWorld.offsetY) ? sourceWorld.offsetY : 0;
    var lx = Math.floor(cellX) - offsetX;
    var ly = Math.floor(cellY) - offsetY;
    if (lx < 0 || ly < 0) return null;
    if (!sourceWorld.grid[ly] || lx >= sourceWorld.grid[ly].length) return null;
    return sourceWorld.grid[ly][lx];
  }

  function createWorldApi() {
    var metrics = resolveWorldMetrics(world, CELL_SIZE);
    if (!metrics) return null;
    return {
      rows: metrics.rows,
      cols: metrics.cols,
      offsetX: metrics.offsetX,
      offsetY: metrics.offsetY,
      minX: metrics.minX,
      minY: metrics.minY,
      maxX: metrics.maxX,
      maxY: metrics.maxY,
      width: metrics.width,
      height: metrics.height,
      cellSize: metrics.cellSize,
      sampleCell: function(cellX, cellY) {
        return readWorldCell(world, cellX, cellY);
      },
      isSolidCell: function(cellX, cellY) {
        return isCollidableCell(readWorldCell(world, cellX, cellY));
      },
      worldToCell: function(worldX, worldY) {
        return {
          x: Math.floor((Number(worldX) || 0) / metrics.cellSize),
          y: Math.floor((Number(worldY) || 0) / metrics.cellSize),
        };
      },
    };
  }

  function resolvePlayCamera(config, objects) {
    var fallback = config || {};
    var cameraObject = objects.find(function(obj) {
      return obj && obj.components && obj.components.Camera && obj.components.Camera.enabled !== false;
    });
    var cameraComp = cameraObject ? (cameraObject.components.Camera || {}) : {};
    var targetObjectId = cameraComp.targetObjectId || fallback.targetObjectId || null;
    if (!targetObjectId) {
      var player = objects.find(function(obj) { return obj.type === 'player'; });
      targetObjectId = player ? player.id : null;
    }
    if (!cameraObject) {
      return Object.assign({}, fallback, {
        targetObjectId: targetObjectId,
        offsetX: 0,
        offsetY: 0,
        followX: true,
        followY: true,
        clampToWorld: true,
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

  function resolveDesiredView(camera, objects, currentViewX, currentViewY, snapToTarget, viewW, viewH) {
    var target = camera.targetObjectId ? objects.find(function(obj) { return obj.id === camera.targetObjectId; }) : null;
    var offsetX = Number.isFinite(camera.offsetX) ? camera.offsetX : 0;
    var offsetY = Number.isFinite(camera.offsetY) ? camera.offsetY : 0;
    var lookAheadX = Number.isFinite(camera.lookAheadX) ? camera.lookAheadX : 0;
    var lookAheadY = Number.isFinite(camera.lookAheadY) ? camera.lookAheadY : 0;
    var deadZoneWidth = Math.max(0, Number.isFinite(camera.deadZoneWidth) ? camera.deadZoneWidth : 0);
    var deadZoneHeight = Math.max(0, Number.isFinite(camera.deadZoneHeight) ? camera.deadZoneHeight : 0);
    var visibleMargin = Math.max(0, Number.isFinite(camera.visibleMargin) ? camera.visibleMargin : 0);
    var followX = camera.followX !== false;
    var followY = camera.followY !== false;
    var desiredX = Number.isFinite(currentViewX) ? currentViewX : 0;
    var desiredY = Number.isFinite(currentViewY) ? currentViewY : 0;

    var focusCenterX = target
      ? (target.x + (target.width || 32) * 0.5 + offsetX + lookAheadX)
      : (Number.isFinite(camera.originX) ? camera.originX + offsetX + lookAheadX : desiredX + viewW * 0.5);
    var focusCenterY = target
      ? (target.y + (target.height || 32) * 0.5 + offsetY + lookAheadY)
      : (Number.isFinite(camera.originY) ? camera.originY + offsetY + lookAheadY : desiredY + viewH * 0.5);

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

    if (camera.clampToWorld !== false) {
      var rows = Number.isFinite(world.rows) ? world.rows : ((world.grid && world.grid.length) || 0);
      var cols = Number.isFinite(world.cols) ? world.cols : ((world.grid && world.grid[0] && world.grid[0].length) || 0);
      if (cols > 0 && rows > 0) {
        var worldOffsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
        var worldOffsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
        var minX = worldOffsetX * CELL_SIZE;
        var minY = worldOffsetY * CELL_SIZE;
        var maxX = (worldOffsetX + cols) * CELL_SIZE - viewW;
        var maxY = (worldOffsetY + rows) * CELL_SIZE - viewH;
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

    function toNode(node) {
      return node && node.elt ? node.elt : node;
    }

    function shouldShow(def, context) {
      if (Array.isArray(def.validScenes) && def.validScenes.length) {
        var okScene = def.validScenes.some(function(sceneName) {
          return sceneName === context.sceneId || sceneName === context.sceneName;
        });
        if (!okScene) return false;
      }
      if (Array.isArray(def.validStates) && def.validStates.length) {
        if (def.validStates.indexOf(context.gameState) === -1) return false;
      }
      if (typeof def.isVisible === 'function') {
        try { return !!def.isVisible(context); } catch (_err) { return false; }
      }
      return true;
    }

    var api = {
      registerScreen: function(id, def) {
        if (!id) return api;
        var old = screens.get(id);
        if (old && old.container && old.container.parentElement) old.container.parentElement.removeChild(old.container);
        screens.set(id, { id: id, def: def || {}, container: null, visible: false, hideTimer: null });
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
      updateAll: function(context) {
        screens.forEach(function(rec) {
          var def = rec.def || {};
          if (!rec.container && typeof def.create === 'function') {
            try {
              var node = toNode(def.create(context));
              if (!node) node = document.createElement('div');
              if (!node.id) node.id = rec.id;
              node.style.display = 'none';
              node.style.pointerEvents = node.style.pointerEvents || 'auto';
              ensureLayer(def.layer || 'default', def.layerOrder || 0).appendChild(node);
              rec.container = node;
            } catch (_err) {}
          }
          var visible = shouldShow(def, context);
          if (visible) {
            if (rec.container) rec.container.style.display = '';
            if (!rec.visible && typeof def.show === 'function') {
              try { def.show.call(rec, context); } catch (_err2) {}
            }
            rec.visible = true;
            if (typeof def.update === 'function') {
              try { def.update.call(rec, context); } catch (_err3) {}
            }
          } else {
            if (rec.visible && typeof def.hide === 'function') {
              try { def.hide.call(rec, context); } catch (_err4) {}
            } else if (rec.container) {
              rec.container.style.display = 'none';
            }
            rec.visible = false;
          }
        });
      },
      clear: function() {
        screens.forEach(function(screen) {
          if (screen.hideTimer) clearTimeout(screen.hideTimer);
          if (screen.container && screen.container.parentElement) {
            screen.container.parentElement.removeChild(screen.container);
          }
        });
        screens.clear();
        layers.forEach(function(layer) {
          if (layer.parentElement) layer.parentElement.removeChild(layer);
        });
        layers.clear();
      },
      destroy: function() {
        api.clear();
      },
    };

    return api;
  }

  function clamp01(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n));
  }

  function computePositionalVolume(distance, maxDistance) {
    var dist = Math.max(0, Number(distance) || 0);
    var maxDist = Math.max(0.0001, Number(maxDistance) || 0.0001);
    return Math.max(0, Math.min(1, 1 - (dist / maxDist)));
  }

  function createAudioSystem(assetMap, objects) {
    var masterVolume = 1;
    var listenerX = 0;
    var listenerY = 0;
    var currentMusic = null;
    var handles = [];

    function resolveAudioSrc(assetId) {
      if (!assetId) return null;
      var asset = assetMap.get(assetId);
      if (!asset) return null;
      return asset.previewUrl || asset.url || asset.src || null;
    }

    function resolveObject(target) {
      if (!target) return null;
      if (typeof target === 'string') {
        return objects.find(function(obj) { return obj.id === target; }) || null;
      }
      if (typeof target === 'object' && target.id) return target;
      return null;
    }

    function applyHandleVolume(handle) {
      if (!handle || !handle.audio) return;
      var positional = 1;
      if (handle.maxDistance > 0 && handle.sourceObjectId) {
        var source = objects.find(function(obj) { return obj.id === handle.sourceObjectId; });
        if (source) {
          var dx = (Number(source.x) || 0) - listenerX;
          var dy = (Number(source.y) || 0) - listenerY;
          positional = computePositionalVolume(Math.sqrt(dx * dx + dy * dy), handle.maxDistance);
        }
      }
      handle.audio.volume = clamp01(handle.baseVolume * masterVolume * positional);
    }

    function removeHandle(handle) {
      handles = handles.filter(function(entry) { return entry !== handle; });
      if (currentMusic === handle) currentMusic = null;
    }

    function stopHandle(handle) {
      if (!handle || !handle.audio) return;
      try {
        handle.audio.pause();
        handle.audio.currentTime = 0;
      } catch (_err) {}
      removeHandle(handle);
    }

    function play(assetId, options) {
      options = options || {};
      if (typeof Audio === 'undefined') return null;
      var src = resolveAudioSrc(assetId);
      if (!src) return null;
      var audio = new Audio(src);
      var handle = {
        audio: audio,
        sourceObjectId: options.sourceObjectId || null,
        baseVolume: clamp01(options.volume != null ? options.volume : 1),
        maxDistance: Number.isFinite(options.maxDistance) ? Math.max(0, options.maxDistance) : 0,
        category: options.category === 'music' ? 'music' : 'sfx',
      };
      audio.loop = !!options.loop;
      audio.preload = 'auto';
      audio.addEventListener('ended', function() {
        if (!audio.loop) removeHandle(handle);
      });
      handles.push(handle);
      applyHandleVolume(handle);
      var promise = audio.play();
      if (promise && typeof promise.catch === 'function') promise.catch(function() {});
      return handle;
    }

    var api = {
      play: function(assetId, options) {
        return play(assetId, options || {});
      },
      playMusic: function(assetId, options) {
        if (currentMusic) stopHandle(currentMusic);
        options = options || {};
        currentMusic = play(assetId, Object.assign({}, options, { loop: options.loop !== false, category: 'music' }));
        return currentMusic;
      },
      stopMusic: function() {
        if (currentMusic) stopHandle(currentMusic);
        currentMusic = null;
      },
      playObjectSound: function(target, overrides) {
        var obj = resolveObject(target);
        if (!obj) return null;
        var sound = (obj.components && obj.components.Sound) || null;
        if (!sound || !sound.assetId) return null;
        overrides = overrides || {};
        var options = {
          loop: overrides.loop !== undefined ? overrides.loop : !!sound.loop,
          volume: overrides.volume !== undefined ? overrides.volume : (Number.isFinite(sound.volume) ? sound.volume : 1),
          maxDistance: overrides.maxDistance !== undefined ? overrides.maxDistance : (Number.isFinite(sound.maxDistance) ? sound.maxDistance : 0),
          category: overrides.category || (sound.category === 'music' ? 'music' : 'sfx'),
          sourceObjectId: obj.id,
        };
        if (options.category === 'music') return api.playMusic(sound.assetId, options);
        return play(sound.assetId, options);
      },
      stopObjectSound: function(target) {
        var obj = resolveObject(target);
        if (!obj) return;
        handles.slice().forEach(function(handle) {
          if (handle.sourceObjectId === obj.id) stopHandle(handle);
        });
      },
      stop: function(handle) {
        stopHandle(handle);
      },
      stopAll: function() {
        handles.slice().forEach(function(handle) { stopHandle(handle); });
        currentMusic = null;
      },
      setMasterVolume: function(value) {
        masterVolume = clamp01(value);
        handles.forEach(function(handle) { applyHandleVolume(handle); });
        return masterVolume;
      },
      getMasterVolume: function() {
        return masterVolume;
      },
    };

    return {
      api: api,
      autoplayFromComponents: function() {
        objects.forEach(function(obj) {
          var sound = (obj.components && obj.components.Sound) || null;
          if (!sound || !sound.assetId || !sound.autoplay) return;
          api.playObjectSound(obj);
        });
      },
      updateListener: function(camera, runtimeObjects) {
        var target = null;
        if (camera && camera.targetObjectId) {
          target = (runtimeObjects || objects).find(function(obj) { return obj.id === camera.targetObjectId; }) || null;
        }
        listenerX = target ? (Number(target.x) || 0) : ((camera && Number(camera.originX)) || 0);
        listenerY = target ? (Number(target.y) || 0) : ((camera && Number(camera.originY)) || 0);
        handles.forEach(function(handle) { applyHandleVolume(handle); });
      },
      stopAll: function() {
        api.stopAll();
      },
    };
  }

  function syncCanvasMode(mode) {
    renderMode = normalizeRenderMode(mode, '2d');
    var use3d = renderMode === PLAY_RENDER_MODE_WEBGL_3D;
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
    activeCanvas = use3d ? (canvas3d || canvas2d) : (canvas2d || canvas3d);
    if (engine && engine.viewport && activeCanvas) {
      engine.viewport.width = activeCanvas.width || 960;
      engine.viewport.height = activeCanvas.height || 540;
    }
  }

  function createInitial3DState() {
    var enabled = renderMode === PLAY_RENDER_MODE_WEBGL_3D;
    return {
      enabled: enabled,
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

  function parseHexColor(color, fallback) {
    if (typeof color !== 'string') return fallback.slice();
    var value = color.trim();
    if (!value.startsWith('#')) return fallback.slice();
    var hex = value.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(function(part) { return part + part; }).join('');
    }
    if (hex.length !== 6) return fallback.slice();
    var r = Number.parseInt(hex.slice(0, 2), 16);
    var g = Number.parseInt(hex.slice(2, 4), 16);
    var b = Number.parseInt(hex.slice(4, 6), 16);
    if (![r, g, b].every(Number.isFinite)) return fallback.slice();
    return [r, g, b];
  }

  function shadeRgb(rgb, factor) {
    return rgb.map(function(value) {
      return Math.max(0, Math.min(255, Math.round(value * factor)));
    });
  }

  function rgbaString(rgb, alpha) {
    return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + clamp01(alpha) + ')';
  }

  function resolveLightAnchor(obj, light) {
    var sprite = (obj && obj.components && obj.components.Sprite) || {};
    var width = Number.isFinite(obj && obj.width) ? obj.width : ((Number.isFinite(sprite.width) ? sprite.width : 32) * (Number.isFinite(obj && obj.scaleX) ? obj.scaleX : 1));
    var height = Number.isFinite(obj && obj.height) ? obj.height : ((Number.isFinite(sprite.height) ? sprite.height : 32) * (Number.isFinite(obj && obj.scaleY) ? obj.scaleY : 1));
    return {
      worldX: (Number(obj && obj.x) || 0) + (width * 0.5) + light.offsetX,
      worldY: (Number(obj && obj.y) || 0) + (height * 0.5) + light.offsetY,
    };
  }

  function getActiveLights() {
    return (Array.isArray(gameObjects) ? gameObjects : []).map(function(obj) {
      if (!obj || !obj.components || !obj.components.Light) return null;
      var light = normalizeLightComponent(obj.components.Light);
      if (light.enabled === false) return null;
      var anchor = resolveLightAnchor(obj, light);
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

  function buildLightingSignature() {
    sceneLighting = resolveLightingSettings(currentScene);
    var lights = getActiveLights().map(function(light) {
      return [
        light.id,
        Math.round(light.worldX * 10) / 10,
        Math.round(light.worldY * 10) / 10,
        Math.round(light.height * 10) / 10,
        light.color,
        Math.round(light.intensity * 100) / 100,
        Math.round(light.radius * 10) / 10,
        Math.round(light.falloff * 100) / 100,
      ].join(':');
    }).sort();
    return JSON.stringify({
      enabled: sceneLighting.enabled,
      ambientColor: sceneLighting.ambientColor,
      ambientIntensity: sceneLighting.ambientIntensity,
      overlayOpacity: sceneLighting.overlayOpacity,
      fogColor: sceneLighting.fogColor,
      fogDensity: sceneLighting.fogDensity,
      lights: lights,
    });
  }

  function computeLightStrength(distance, radius, intensity, falloff) {
    var maxRadius = Math.max(1, Number(radius) || 1);
    var remaining = Math.max(0, 1 - ((Number(distance) || 0) / maxRadius));
    if (remaining <= 0) return 0;
    var exponent = 1 + ((1 - clamp01(falloff)) * 2.5);
    return clamp01(intensity) * Math.pow(remaining, exponent);
  }

  function apply3DLighting(baseRgb, samplePoint, lights) {
    if (!sceneLighting.enabled) return baseRgb.slice();
    var ambientRgb = parseHexColor(sceneLighting.ambientColor, [11, 18, 32]);
    var ambient = clamp01(sceneLighting.ambientIntensity);
    var next = [
      baseRgb[0] * (0.18 + ambient * 0.82) + ambientRgb[0] * (1 - ambient) * 0.08,
      baseRgb[1] * (0.18 + ambient * 0.82) + ambientRgb[1] * (1 - ambient) * 0.08,
      baseRgb[2] * (0.18 + ambient * 0.82) + ambientRgb[2] * (1 - ambient) * 0.08,
    ];
    (lights || []).forEach(function(light) {
      var distance = Math.hypot(samplePoint[0] - light.worldX, samplePoint[1] - light.height, samplePoint[2] - light.worldY);
      var strength = computeLightStrength(distance, light.radius, light.intensity, light.falloff);
      if (strength <= 0) return;
      next[0] += baseRgb[0] * strength * (0.28 + ((light.rgb[0] / 255) * 0.72));
      next[1] += baseRgb[1] * strength * (0.28 + ((light.rgb[1] / 255) * 0.72));
      next[2] += baseRgb[2] * strength * (0.28 + ((light.rgb[2] / 255) * 0.72));
    });
    return next.map(function(value) {
      return Math.max(0, Math.min(255, Math.round(value)));
    });
  }

  function renderFrame2DLighting() {
    if (!ctx2d || !sceneLighting.enabled) return;
    var ambientRgb = parseHexColor(sceneLighting.ambientColor, [11, 18, 32]);
    var lights = getActiveLights();
    var overlayAlpha = clamp01(sceneLighting.overlayOpacity * (1 - (sceneLighting.ambientIntensity * 0.6)));

    ctx2d.save();
    ctx2d.fillStyle = rgbaString(ambientRgb, overlayAlpha);
    ctx2d.fillRect(0, 0, canvas2d.width, canvas2d.height);
    if (lights.length > 0) {
      ctx2d.globalCompositeOperation = 'destination-out';
      lights.forEach(function(light) {
        var radius = Math.max(8, light.radius);
        var sx = light.worldX - viewX;
        var sy = light.worldY - viewY;
        var innerRadius = Math.max(0, radius * (0.12 + ((1 - light.falloff) * 0.18)));
        var alpha = clamp01(0.92 * light.intensity);
        var cutout = ctx2d.createRadialGradient(sx, sy, innerRadius, sx, sy, radius);
        cutout.addColorStop(0, 'rgba(0, 0, 0, ' + alpha + ')');
        cutout.addColorStop(Math.min(0.68, 0.2 + (light.falloff * 0.48)), 'rgba(0, 0, 0, ' + (alpha * 0.42) + ')');
        cutout.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx2d.fillStyle = cutout;
        ctx2d.beginPath();
        ctx2d.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx2d.fill();
      });
      ctx2d.globalCompositeOperation = 'lighter';
      lights.forEach(function(light) {
        var radius = Math.max(8, light.radius * 0.95);
        var sx = light.worldX - viewX;
        var sy = light.worldY - viewY;
        var glow = ctx2d.createRadialGradient(sx, sy, 0, sx, sy, radius);
        glow.addColorStop(0, rgbaString(light.rgb, light.intensity * 0.24));
        glow.addColorStop(0.4, rgbaString(light.rgb, light.intensity * 0.14));
        glow.addColorStop(1, rgbaString(light.rgb, 0));
        ctx2d.fillStyle = glow;
        ctx2d.beginPath();
        ctx2d.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx2d.fill();
      });
    }
    ctx2d.restore();
  }

  function pushColoredQuad(positions, colors, a, b, c, d, rgb) {
    positions.push(
      a[0], a[1], a[2],
      b[0], b[1], b[2],
      c[0], c[1], c[2],
      a[0], a[1], a[2],
      c[0], c[1], c[2],
      d[0], d[1], d[2]
    );
    for (var i = 0; i < 6; i += 1) {
      colors.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    }
  }

  function build3DMesh() {
    var positions = [];
    var colors = [];
    var activeLights = getActiveLights();
    var metrics = resolveWorldMetrics(world, CELL_SIZE);
    if (!metrics) {
      return { positions: new Float32Array(0), colors: new Float32Array(0), farPlane: 600 };
    }

    var options = (render3D && render3D.options) || {};
    var wallHeight = Number.isFinite(options.wallHeight) ? options.wallHeight : CELL_SIZE * 2.2;
    var floorColor = parseHexColor(options.floorColor || '#111827', [17, 24, 39]);
    var ceilingColor = parseHexColor(options.ceilingColor || '#1e3a5f', [30, 58, 95]);
    var defaultWall = parseHexColor(options.wallColor || '#fb923c', [251, 146, 60]);
    var minX = metrics.minX;
    var minZ = metrics.minY;
    var maxX = metrics.maxX;
    var maxZ = metrics.maxY;
    var floorLit = apply3DLighting(floorColor, [(minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5], []);
    var ceilingLit = apply3DLighting(ceilingColor, [(minX + maxX) * 0.5, wallHeight, (minZ + maxZ) * 0.5], []);

    pushColoredQuad(positions, colors, [minX, 0, minZ], [maxX, 0, minZ], [maxX, 0, maxZ], [minX, 0, maxZ], floorLit);
    pushColoredQuad(positions, colors, [minX, wallHeight, maxZ], [maxX, wallHeight, maxZ], [maxX, wallHeight, minZ], [minX, wallHeight, minZ], ceilingLit);

    for (var y = metrics.offsetY; y < metrics.offsetY + metrics.rows; y += 1) {
      for (var x = metrics.offsetX; x < metrics.offsetX + metrics.cols; x += 1) {
        var cell = readWorldCell(world, x, y);
        if (!isCollidableCell(cell)) continue;
        var type = resolveCellType(cell);
        var baseColor = parseHexColor((type && type.color) || options.wallColor || '#fb923c', defaultWall);
        var x0 = x * metrics.cellSize;
        var x1 = x0 + metrics.cellSize;
        var z0 = y * metrics.cellSize;
        var z1 = z0 + metrics.cellSize;
        if (!isCollidableCell(readWorldCell(world, x, y - 1))) {
          pushColoredQuad(positions, colors, [x0, 0, z0], [x1, 0, z0], [x1, wallHeight, z0], [x0, wallHeight, z0], apply3DLighting(shadeRgb(baseColor, 1), [x0 + (metrics.cellSize * 0.5), wallHeight * 0.5, z0], activeLights));
        }
        if (!isCollidableCell(readWorldCell(world, x, y + 1))) {
          pushColoredQuad(positions, colors, [x1, 0, z1], [x0, 0, z1], [x0, wallHeight, z1], [x1, wallHeight, z1], apply3DLighting(shadeRgb(baseColor, 0.82), [x0 + (metrics.cellSize * 0.5), wallHeight * 0.5, z1], activeLights));
        }
        if (!isCollidableCell(readWorldCell(world, x - 1, y))) {
          pushColoredQuad(positions, colors, [x0, 0, z1], [x0, 0, z0], [x0, wallHeight, z0], [x0, wallHeight, z1], apply3DLighting(shadeRgb(baseColor, 0.7), [x0, wallHeight * 0.5, z0 + (metrics.cellSize * 0.5)], activeLights));
        }
        if (!isCollidableCell(readWorldCell(world, x + 1, y))) {
          pushColoredQuad(positions, colors, [x1, 0, z0], [x1, 0, z1], [x1, wallHeight, z1], [x1, wallHeight, z0], apply3DLighting(shadeRgb(baseColor, 0.9), [x1, wallHeight * 0.5, z0 + (metrics.cellSize * 0.5)], activeLights));
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      farPlane: Math.max(metrics.width, metrics.height, wallHeight) * 3,
    };
  }

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var error = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
      gl.deleteShader(shader);
      throw new Error(error);
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    var vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    var fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    var program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      var error = gl.getProgramInfoLog(program) || 'Unknown program link error';
      gl.deleteProgram(program);
      throw new Error(error);
    }
    return program;
  }

  function createPlayWebGLRuntime(canvas) {
    var gl = canvas && canvas.getContext ? canvas.getContext('webgl', { alpha: false, antialias: true, depth: true }) : null;
    if (!gl) {
      renderMode = '2d';
      syncCanvasMode('2d');
      return null;
    }

    var vertexSource = [
      'attribute vec3 aPosition;',
      'attribute vec3 aColor;',
      'uniform mat4 uProjection;',
      'uniform mat4 uView;',
      'varying vec3 vColor;',
      'varying float vFogDepth;',
      'void main() {',
      '  vec4 clip = uProjection * uView * vec4(aPosition, 1.0);',
      '  gl_Position = clip;',
      '  vColor = aColor;',
      '  vFogDepth = clip.z / clip.w;',
      '}'
    ].join('\n');

    var fragmentSource = [
      'precision mediump float;',
      'varying vec3 vColor;',
      'varying float vFogDepth;',
      'uniform vec3 uFogColor;',
      'uniform float uFogDensity;',
      'void main() {',
      '  float fog = smoothstep(0.15, 0.95, clamp((vFogDepth + 1.0) * 0.5, 0.0, 1.0));',
      '  vec3 color = mix(vColor, uFogColor, fog * uFogDensity);',
      '  gl_FragColor = vec4(color, 1.0);',
      '}'
    ].join('\n');

    try {
      var program = createProgram(gl, vertexSource, fragmentSource);
      var mesh = build3DMesh();
      var position = gl.createBuffer();
      var color = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, color);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      return {
        canvas: canvas,
        gl: gl,
        program: program,
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
        buffers: { position: position, color: color },
      };
    } catch (_err) {
      renderMode = '2d';
      syncCanvasMode('2d');
      return null;
    }
  }

  function destroyPlayWebGLRuntime(runtime) {
    if (!runtime || !runtime.gl) return;
    var gl = runtime.gl;
    if (runtime.buffers) {
      if (runtime.buffers.position) gl.deleteBuffer(runtime.buffers.position);
      if (runtime.buffers.color) gl.deleteBuffer(runtime.buffers.color);
    }
    if (runtime.program) gl.deleteProgram(runtime.program);
  }

  function createPerspectiveMatrix(fovRadians, aspect, near, far) {
    var f = 1 / Math.tan(fovRadians / 2);
    var nf = 1 / (near - far);
    return new Float32Array([
      f / Math.max(0.0001, aspect), 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0,
    ]);
  }

  function createLookAtMatrix(eye, target, up) {
    var zx = eye[0] - target[0];
    var zy = eye[1] - target[1];
    var zz = eye[2] - target[2];
    var len = Math.hypot(zx, zy, zz) || 1;
    zx /= len;
    zy /= len;
    zz /= len;

    var xx = up[1] * zz - up[2] * zy;
    var xy = up[2] * zx - up[0] * zz;
    var xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len;
    xy /= len;
    xz /= len;

    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
    var tx = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    var ty = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    var tz = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);

    return new Float32Array([
      xx, xy, xz, 0,
      yx, yy, yz, 0,
      zx, zy, zz, 0,
      tx, ty, tz, 1,
    ]);
  }

  function renderFrame3D() {
    if (!canvas3d || !render3D) return;
    var runtime = render3D.runtime;
    if (!runtime || runtime.canvas !== canvas3d || render3D.meshDirty) {
      if (runtime) destroyPlayWebGLRuntime(runtime);
      runtime = createPlayWebGLRuntime(canvas3d);
      render3D.runtime = runtime;
      render3D.meshDirty = false;
    }
    if (!runtime || !runtime.gl) return;

    var gl = runtime.gl;
    var width = canvas3d.width || 960;
    var height = canvas3d.height || 540;
    var camera = render3D.camera || {};
    var clear = parseHexColor(sceneLighting.enabled ? sceneLighting.fogColor : ((render3D.options && render3D.options.clearColor) || '#07111d'), [7, 17, 29]);
    var fogColor = parseHexColor(sceneLighting.fogColor || '#07111d', [7, 17, 29]);
    var fogDensity = sceneLighting.enabled ? clamp01(sceneLighting.fogDensity) : 0.65;
    var eye = [
      Number.isFinite(camera.x) ? camera.x : CELL_SIZE * 1.5,
      Number.isFinite(camera.y) ? camera.y : CELL_SIZE * 0.72,
      Number.isFinite(camera.z) ? camera.z : CELL_SIZE * 1.5,
    ];
    var yaw = Number.isFinite(camera.yaw) ? camera.yaw : 0;
    var pitch = Number.isFinite(camera.pitch) ? camera.pitch : 0;
    var look = [
      eye[0] + Math.cos(pitch) * Math.cos(yaw),
      eye[1] + Math.sin(pitch),
      eye[2] + Math.cos(pitch) * Math.sin(yaw),
    ];
    var near = 0.1;
    var far = Math.max(runtime.farPlane || 600, 600);
    var projection = createPerspectiveMatrix((Number.isFinite(camera.fov) ? camera.fov : 72) * Math.PI / 180, width / Math.max(1, height), near, far);
    var view = createLookAtMatrix(eye, look, [0, 1, 0]);

    gl.viewport(0, 0, width, height);
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

  function createRenderer3DController() {
    return {
      isEnabled: function() {
        return renderMode === PLAY_RENDER_MODE_WEBGL_3D && !!render3D;
      },
      getCamera: function() {
        return render3D ? Object.assign({}, render3D.camera || {}) : null;
      },
      setCamera: function(patch) {
        if (!render3D) return null;
        var next = Object.assign({}, render3D.camera || {});
        ['x', 'y', 'z', 'yaw', 'pitch', 'fov'].forEach(function(key) {
          if (Number.isFinite(patch && patch[key])) next[key] = patch[key];
        });
        render3D.camera = next;
        return Object.assign({}, next);
      },
      setOptions: function(patch) {
        if (!render3D) return null;
        var prev = render3D.options || {};
        var next = Object.assign({}, prev, patch || {});
        var changed = Object.keys(patch || {}).some(function(key) { return next[key] !== prev[key]; });
        render3D.options = next;
        if (changed) render3D.meshDirty = true;
        return Object.assign({}, render3D.options);
      },
      getOptions: function() {
        return render3D ? Object.assign({}, render3D.options || {}) : null;
      },
      requestPointerLock: function() {
        var canvas = activeCanvas || canvas3d || canvas2d;
        if (canvas && typeof canvas.requestPointerLock === 'function') canvas.requestPointerLock();
      },
      exitPointerLock: function() {
        if (document.exitPointerLock) document.exitPointerLock();
      },
    };
  }

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

        var minX = Math.max(offsetX, Math.floor(rect.x / CELL_SIZE));
        var minY = Math.max(offsetY, Math.floor(rect.y / CELL_SIZE));
        var maxX = Math.min(offsetX + cols - 1, Math.floor((rect.x + rect.w - 1) / CELL_SIZE));
        var maxY = Math.min(offsetY + rows - 1, Math.floor((rect.y + rect.h - 1) / CELL_SIZE));
        if (minX > maxX || minY > maxY) break;

        var resolved = false;
        for (var y = minY; y <= maxY && !resolved; y += 1) {
          for (var x = minX; x <= maxX && !resolved; x += 1) {
            if (!isCollidableCell(readWorldCell(world, x, y))) continue;
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

  function drawWorld(drawViewX, drawViewY) {
    if (!ctx2d) return;
    var grid = Array.isArray(world.grid) ? world.grid : [];
    var rows = Number.isFinite(world.rows) ? world.rows : grid.length;
    var cols = Number.isFinite(world.cols) ? world.cols : ((grid[0] && grid[0].length) || 0);
    var offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
    var offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
    var cellLayers = ((project.layers && project.layers.cells) || [])
      .filter(function(layer) { return layer.visible !== false; })
      .sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    if (!cellLayers.length) cellLayers = [{ id: null }];

    for (var layerIndex = 0; layerIndex < cellLayers.length; layerIndex += 1) {
      var layer = cellLayers[layerIndex];
      for (var y = 0; y < rows; y += 1) {
        for (var x = 0; x < cols; x += 1) {
          var cell = grid[y] && grid[y][x];
          var type = resolveCellType(cell);
          if (!type || type.id === 'empty') continue;
          var typeLayer = type.layerId || null;
          if (layer.id !== typeLayer) continue;
          var px = (x + offsetX) * CELL_SIZE - drawViewX;
          var py = (y + offsetY) * CELL_SIZE - drawViewY;
          var img = imageForAssetId(type.imageAssetId);
          if (img && img.complete && img.naturalWidth > 0) {
            ctx2d.drawImage(img, px, py, CELL_SIZE, CELL_SIZE);
          } else {
            ctx2d.fillStyle = type.color || '#334155';
            ctx2d.fillRect(px, py, CELL_SIZE, CELL_SIZE);
          }
        }
      }
    }
  }

  function drawObjects(drawViewX, drawViewY) {
    if (!ctx2d) return;
    var objectLayers = ((project.layers && project.layers.objects) || [])
      .filter(function(layer) { return layer.visible !== false; })
      .sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    gameObjects.slice().sort(function(a, b) {
      var ar = (a.components && a.components.Render) || {};
      var br = (b.components && b.components.Render) || {};
      var ao = objectLayers.find(function(layer) { return layer.id === ar.layerId; });
      var bo = objectLayers.find(function(layer) { return layer.id === br.layerId; });
      var layerDelta = ((ao && ao.order) || 0) - ((bo && bo.order) || 0);
      if (layerDelta !== 0) return layerDelta;
      return (ar.zIndex || 0) - (br.zIndex || 0);
    }).forEach(function(obj) {
      var render = (obj.components && obj.components.Render) || {};
      if (render.visible === false) return;
      var sprite = (obj.components && obj.components.Sprite) || {};
      var rotation = obj.rotation || 0;
      var scaleX = obj.scaleX || 1;
      var scaleY = obj.scaleY || 1;
      var baseWidth = sprite.width || 32;
      var baseHeight = sprite.height || 32;
      var width = baseWidth * scaleX;
      var height = baseHeight * scaleY;
      var frameIds = Array.isArray(sprite.frameAssetIds) ? sprite.frameAssetIds : [];
      var frameId = frameIds.length > 0
        ? frameIds[Math.floor(elapsed * (sprite.fps || 8)) % frameIds.length]
        : sprite.assetId;
      var asset = frameId ? assetById.get(frameId) : null;
      var sourceAsset = asset && asset.sourceAssetId ? assetById.get(asset.sourceAssetId) : null;
      var src = (sourceAsset && (sourceAsset.previewUrl || sourceAsset.url || sourceAsset.src))
        || (asset && (asset.previewUrl || asset.url || asset.src));
      var drawn = false;

      ctx2d.save();
      ctx2d.translate(obj.x - drawViewX + width * 0.5, obj.y - drawViewY + height * 0.5);
      ctx2d.rotate((rotation * Math.PI) / 180);

      if (src) {
        if (!images.has(src)) {
          var img = new Image();
          img.src = src;
          images.set(src, img);
        }
        var objectImg = images.get(src);
        if (objectImg && objectImg.complete && objectImg.naturalWidth > 0) {
          var rect = asset && asset.frameRect;
          if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.w) && Number.isFinite(rect.h)) {
            ctx2d.drawImage(objectImg, rect.x, rect.y, rect.w, rect.h, -baseWidth * 0.5, -baseHeight * 0.5, baseWidth, baseHeight);
          } else {
            ctx2d.drawImage(objectImg, -baseWidth * 0.5, -baseHeight * 0.5, baseWidth, baseHeight);
          }
          drawn = true;
        }
      }
      if (!drawn) {
        ctx2d.fillStyle = obj.color || '#4ade80';
        ctx2d.fillRect(-baseWidth * 0.5, -baseHeight * 0.5, baseWidth, baseHeight);
      }
      ctx2d.restore();
    });
  }

  function renderFrame2D() {
    if (!ctx2d || !canvas2d) return;
    ctx2d.clearRect(0, 0, canvas2d.width, canvas2d.height);
    ctx2d.fillStyle = '#0b1220';
    ctx2d.fillRect(0, 0, canvas2d.width, canvas2d.height);
    drawWorld(viewX, viewY);
    drawObjects(viewX, viewY);
    renderFrame2DLighting();
    ctx2d.fillStyle = '#e2e8f0';
    ctx2d.font = '11px sans-serif';
    ctx2d.textAlign = 'left';
    ctx2d.fillText('EXPORT | ' + elapsed.toFixed(1) + 's', 8, 16);
  }

  function renderFrame() {
    if (renderMode === PLAY_RENDER_MODE_WEBGL_3D) {
      renderFrame3D();
      return;
    }
    renderFrame2D();
  }

  function updateSceneManagerState() {
    if (!sceneManager) return;
    sceneManager.activeSceneId = activeSceneId;
    sceneManager.currentSceneId = activeSceneId;
    sceneManager.activeScene = currentScene
      ? { id: currentScene.id, name: currentScene.name, renderMode: renderMode }
      : null;
  }

  function resolveRuntimeScene(fallbackId) {
    var fallbackSceneId = fallbackId || activeSceneId || 'scene_main';
    var fallbackName = resolveSceneName(fallbackSceneId);
    if (!window.sceneManager) return { id: fallbackSceneId, name: fallbackName };
    var manager = window.sceneManager;
    var active = null;
    if (typeof manager.getActiveScene === 'function') active = manager.getActiveScene();
    else if (manager.activeScene !== undefined) active = manager.activeScene;
    else if (manager.currentScene !== undefined) active = manager.currentScene;
    if (typeof active === 'string') return { id: active, name: resolveSceneName(active) };
    if (active && typeof active === 'object') {
      var activeId = active.id || active.sceneId || manager.activeSceneId || manager.currentSceneId || fallbackSceneId;
      return { id: activeId, name: active.name || resolveSceneName(activeId) };
    }
    var id = manager.activeSceneId || manager.currentSceneId || fallbackSceneId;
    return { id: id, name: resolveSceneName(id) };
  }

  function compileSceneScripts() {
    scriptInstances = [];
    gameObjects.forEach(function(obj) {
      var bindings = [];
      if (Array.isArray(obj.components && obj.components.ScriptBindings)) bindings = bindings.concat(obj.components.ScriptBindings);
      if (obj.components && obj.components.ScriptBinding && obj.components.ScriptBinding.scriptId) {
        bindings.push(Object.assign({ active: true, properties: {} }, obj.components.ScriptBinding));
      }
      bindings.forEach(function(binding) {
        if (!binding || binding.active === false || !binding.scriptId) return;
        if (cssScripts[binding.scriptId]) {
          applyCssScript(cssScripts[binding.scriptId]);
          return;
        }
        if (!scripts[binding.scriptId]) return;
        try {
          var src = scripts[binding.scriptId].source || '';
          var factory = new Function('return (function(self, props, console, keyIsDown, LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW, SPACE){' + src + '; return { onInit: typeof onInit === "function" ? onInit : null, onUpdate: typeof onUpdate === "function" ? onUpdate : null }; })')();
          var props = binding.properties ? clone(binding.properties) : {};
          var hooks = factory(obj, props, console, engine.keyIsDown, 37, 39, 38, 40, 32);
          scriptInstances.push({ obj: obj, hooks: hooks });
        } catch (err) {
          console.error('Script compile error', err);
        }
      });
    });
  }

  function hydrateScene(sceneId, runInit) {
    var nextScene = resolveScene(sceneId);
    activeSceneId = nextScene.id;
    currentScene = nextScene;
    project.activeSceneId = nextScene.id;
    project.world = nextScene.world || project.world;
    project.objects = nextScene.objects || project.objects;
    world = clone(nextScene.world || project.world || {});
    gameObjects.splice(0, gameObjects.length, ...((nextScene.objects || project.objects || []).map(buildRuntimeObject)));
    sceneLighting = resolveLightingSettings(nextScene);
    scriptInstances = [];
    pendingSceneId = null;
    if (audioSystem && audioSystem.api) audioSystem.api.stopAll();
    clearActiveCss();
    if (uiManager && typeof uiManager.clear === 'function') uiManager.clear();
    if (render3D && render3D.runtime) destroyPlayWebGLRuntime(render3D.runtime);
    syncCanvasMode(resolveRenderMode(nextScene.id));
    render3D = createInitial3DState();
    compileSceneScripts();
    engine.sceneId = activeSceneId;
    engine.elapsed = elapsed;
    engine.world = createWorldApi();

    var initialCamera = resolvePlayCamera(cameraConfig, gameObjects);
    var initialView = resolveDesiredView(
      initialCamera,
      gameObjects,
      0,
      0,
      true,
      activeCanvas ? activeCanvas.width : 960,
      activeCanvas ? activeCanvas.height : 540
    );
    viewX = initialView.x;
    viewY = initialView.y;
    updateSceneManagerState();

    if (runInit) {
      scriptInstances.forEach(function(inst) {
        if (!inst.hooks || typeof inst.hooks.onInit !== 'function') return;
        try { inst.hooks.onInit(inst.obj, engine); } catch (err) { console.error('onInit error', err); }
      });
      if (audioSystem) audioSystem.autoplayFromComponents();
    }
  }

  (Array.isArray(project.scripts) ? project.scripts : []).forEach(function(script) {
    if (!script || !script.id) return;
    if (script.language === 'css') {
      cssScripts[script.id] = script;
      return;
    }
    if (script.language && script.language !== 'javascript') return;
    scripts[script.id] = script;
  });

  uiManager = createUiManager(uiRoot);
  audioSystem = createAudioSystem(assetById, gameObjects);
  renderer3dController = createRenderer3DController();
  engine = {
    elapsed: 0,
    sceneId: activeSceneId,
    gameObjects: gameObjects,
    uiManager: uiManager,
    audio: audioSystem.api,
    renderer3d: renderer3dController,
    sceneManager: null,
    lightingManager: null,
    lighting: null,
    findObject: function(id) { return gameObjects.find(function(obj) { return obj.id === id; }) || null; },
    findObjectsByType: function(type) { return gameObjects.filter(function(obj) { return obj.type === type; }); },
    keyIsDown: function(code) { return keys.has(code); },
    viewport: {
      width: activeCanvas ? activeCanvas.width : 960,
      height: activeCanvas ? activeCanvas.height : 540,
    },
  };
  lightingManager = {
    isEnabled: function() {
      return !!resolveLightingSettings(currentScene).enabled;
    },
    getSettings: function() {
      return resolveLightingSettings(currentScene);
    },
    getManagerObject: function() {
      return getLightingManagerObject();
    },
    setEnabled: function(enabled) {
      var managerObject = getLightingManagerObject();
      var next = normalizeSceneLighting(Object.assign({}, resolveLightingSettings(currentScene), { enabled: !!enabled }));
      if (managerObject) {
        if (!managerObject.components) managerObject.components = {};
        managerObject.components.LightingManager = clone(next);
      } else {
        if (currentScene) currentScene.lighting = clone(next);
        var activeScene = Array.isArray(project.scenes) ? project.scenes.find(function(scene) { return scene && scene.id === activeSceneId; }) : null;
        if (activeScene) activeScene.lighting = clone(next);
      }
      sceneLighting = resolveLightingSettings(currentScene);
      if (render3D) {
        render3D.meshDirty = true;
        render3D.lightingSignature = '';
      }
      return true;
    },
    setSettings: function(patch) {
      var managerObject = getLightingManagerObject();
      var next = normalizeSceneLighting(Object.assign({}, resolveLightingSettings(currentScene), patch || {}));
      if (managerObject) {
        if (!managerObject.components) managerObject.components = {};
        managerObject.components.LightingManager = clone(next);
      } else {
        if (currentScene) currentScene.lighting = clone(next);
        var activeScene = Array.isArray(project.scenes) ? project.scenes.find(function(scene) { return scene && scene.id === activeSceneId; }) : null;
        if (activeScene) activeScene.lighting = clone(next);
      }
      sceneLighting = resolveLightingSettings(currentScene);
      if (render3D) {
        render3D.meshDirty = true;
        render3D.lightingSignature = '';
      }
      return clone(sceneLighting);
    },
    getLights: function() {
      return getActiveLights();
    },
    getLight: function(objectId) {
      if (!objectId) return null;
      var obj = gameObjects.find(function(entry) { return entry.id === objectId; });
      return obj && obj.components && obj.components.Light ? normalizeLightComponent(obj.components.Light) : null;
    },
    setLight: function(objectId, patch) {
      if (!objectId) return null;
      var obj = gameObjects.find(function(entry) { return entry.id === objectId; });
      if (!obj) return null;
      if (!obj.components) obj.components = {};
      obj.components.Light = normalizeLightComponent(Object.assign({}, normalizeLightComponent(obj.components.Light), patch || {}));
      if (render3D) {
        render3D.meshDirty = true;
        render3D.lightingSignature = '';
      }
      return clone(obj.components.Light);
    },
    refresh: function() {
      if (render3D) {
        render3D.meshDirty = true;
        render3D.lightingSignature = '';
      }
      return true;
    },
  };
  engine.lightingManager = lightingManager;
  engine.lighting = lightingManager;
  sceneManager = {
    activeSceneId: activeSceneId,
    currentSceneId: activeSceneId,
    activeScene: null,
    getActiveScene: function() {
      return currentScene ? { id: currentScene.id, name: currentScene.name, renderMode: renderMode } : null;
    },
    loadScene: function(sceneId) {
      if (!sceneId) return false;
      pendingSceneId = sceneId;
      return true;
    },
    loadSceneOffset: function(offset) {
      var scenes = Array.isArray(project.scenes) ? project.scenes.filter(Boolean) : [];
      if (!Number.isFinite(offset) || offset === 0 || !scenes.length) return false;
      var currentIndex = Math.max(0, scenes.findIndex(function(scene) { return scene.id === activeSceneId; }));
      var nextIndex = currentIndex + Math.trunc(offset);
      if (nextIndex < 0 || nextIndex >= scenes.length) return false;
      var nextScene = scenes[nextIndex];
      if (!nextScene || !nextScene.id) return false;
      pendingSceneId = nextScene.id;
      return true;
    },
    loadNextScene: function() {
      return sceneManager.loadSceneOffset(1);
    },
    loadPreviousScene: function() {
      return sceneManager.loadSceneOffset(-1);
    },
    reloadScene: function() {
      pendingSceneId = activeSceneId;
      return true;
    },
  };
  engine.sceneManager = sceneManager;
  window.KozUIManager = uiManager;
  window.uiManager = uiManager;
  window.sceneManager = sceneManager;
  window.lightingManager = lightingManager;

  syncCanvasMode(resolveRenderMode(activeSceneId));
  render3D = createInitial3DState();
  hydrateScene(activeSceneId, true);

  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    elapsed += dt;
    engine.elapsed = elapsed;

    if (pendingSceneId) {
      hydrateScene(pendingSceneId, true);
    }

    var runtimeScene = resolveRuntimeScene(activeSceneId);
    if (runtimeScene.id && runtimeScene.id !== activeSceneId) {
      hydrateScene(runtimeScene.id, true);
      runtimeScene = resolveRuntimeScene(activeSceneId);
    }
    engine.sceneId = activeSceneId;

    for (var clipIndex = 0; clipIndex < animClips.length; clipIndex += 1) {
      var clip = animClips[clipIndex];
      if (!clip || !Array.isArray(clip.tracks)) continue;
      var duration = clip.duration || 1;
      var time = clip.loop ? (elapsed % duration) : Math.min(elapsed, duration);
      for (var trackIndex = 0; trackIndex < clip.tracks.length; trackIndex += 1) {
        var track = clip.tracks[trackIndex];
        var targetObject = gameObjects.find(function(obj) { return obj.id === track.targetObjectId; });
        if (!targetObject || !track.keyframes || track.keyframes.length === 0) continue;
        targetObject[track.property] = sampleTrack(track, time);
      }
    }

    engine.world = createWorldApi();
    if (engine.world) {
      gameObjects.forEach(function(obj) {
        if (Object.prototype.hasOwnProperty.call(obj, 'worldWidth')) obj.worldWidth = engine.world.width;
        if (Object.prototype.hasOwnProperty.call(obj, 'worldHeight')) obj.worldHeight = engine.world.height;
        if (Object.prototype.hasOwnProperty.call(obj, 'worldMinX')) obj.worldMinX = engine.world.minX;
        if (Object.prototype.hasOwnProperty.call(obj, 'worldMinY')) obj.worldMinY = engine.world.minY;
        if (Object.prototype.hasOwnProperty.call(obj, 'worldMaxX')) obj.worldMaxX = engine.world.maxX;
        if (Object.prototype.hasOwnProperty.call(obj, 'worldMaxY')) obj.worldMaxY = engine.world.maxY;
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

    if (uiManager && typeof uiManager.updateAll === 'function') {
      uiManager.updateAll({
        dt: dt,
        elapsed: elapsed,
        sceneId: runtimeScene.id,
        sceneName: runtimeScene.name,
        gameState: readGameState(),
      });
    }

    gameObjects.forEach(function(obj, index) {
      if (!obj.components || !obj.components.Transform) return;
      var pre = prePositions[index];
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
    if (audioSystem) audioSystem.updateListener(camera, gameObjects);
    var desired = resolveDesiredView(camera, gameObjects, viewX, viewY, false, activeCanvas ? activeCanvas.width : 960, activeCanvas ? activeCanvas.height : 540);
    var speed = Number.isFinite(camera.speed) ? Math.max(0.1, camera.speed) : 8;
    var maxSpeed = Number.isFinite(camera.maxSpeed) ? Math.max(60, camera.maxSpeed) : Infinity;
    viewX = smoothAxis(viewX || 0, desired.x, dt, speed, maxSpeed);
    viewY = smoothAxis(viewY || 0, desired.y, dt, speed, maxSpeed);
    sceneLighting = resolveLightingSettings(currentScene);
    if (renderMode === PLAY_RENDER_MODE_WEBGL_3D && render3D) {
      var lightingSignature = buildLightingSignature();
      if (lightingSignature !== render3D.lightingSignature) {
        render3D.lightingSignature = lightingSignature;
        render3D.meshDirty = true;
      }
    }

    renderFrame();
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', function(event) { keys.add(event.keyCode); });
  window.addEventListener('keyup', function(event) { keys.delete(event.keyCode); });
  window.addEventListener('beforeunload', function() {
    clearActiveCss();
    if (audioSystem) audioSystem.stopAll();
    if (uiManager && typeof uiManager.destroy === 'function') uiManager.destroy();
    if (render3D && render3D.runtime) destroyPlayWebGLRuntime(render3D.runtime);
  });

  requestAnimationFrame(frame);
}

export function buildExportHtml(project, projectJson, target, options = {}) {
  const safeJson = projectJson
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  const title = (project && project.meta && project.meta.name) || 'Koz Game';
  const width = project?.meta?.resolution?.width || 960;
  const height = project?.meta?.resolution?.height || 540;
  const runtimeSource = `(${exportRuntimeMain.toString()})();`;
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
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; max-width: 100%; max-height: 100%; background: #111827; image-rendering: pixelated; display: block; }
    #game-3d { display: none; image-rendering: auto; }
    #ui-root { position: absolute; inset: 0; pointer-events: none; }
  </style>
</head>
<body>
  <div id="shell">
    <div id="stage">
      <canvas id="game-2d" width="${width}" height="${height}"></canvas>
      <canvas id="game-3d" width="${width}" height="${height}"></canvas>
      <div id="ui-root"></div>
    </div>
  </div>
  <script>window.__KOZ_PROJECT__=${safeJson};</script>
  <script>${runtimeSource}</script>
</body>
</html>`;
  if (options && options.minify) return html.replace(/\n\s*/g, '');
  return html;
}
