import React, { useRef, useEffect, useCallback } from 'react';

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

    // Build console interceptor
    const makeConsole = () => ({
      log: (...args) => onLog({ type: 'log', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
      warn: (...args) => onLog({ type: 'warn', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
      error: (...args) => onLog({ type: 'error', message: args.map(String).join(' '), time: new Date().toLocaleTimeString() }),
    });
    const sandboxConsole = makeConsole();

    // Bind scripts to objects
    gameObjects.forEach(obj => {
      const binding = obj.components.ScriptBinding;
      if (binding && binding.scriptId && scripts[binding.scriptId]) {
        try {
          const src = scripts[binding.scriptId].source;
          const factory = new Function('return (function(self, console) { ' + src + ' return { onInit: typeof onInit==="function"?onInit:null, onUpdate: typeof onUpdate==="function"?onUpdate:null }; })')();
          const hooks = factory(obj, sandboxConsole);
          scriptInstances.push({ obj, hooks });
        } catch (e) {
          onLog({ type: 'error', message: `Script compile error: ${e.message}`, time: new Date().toLocaleTimeString() });
        }
      }
    });

    const state = {
      running: true,
      elapsed: 0,
      world: snapshot.world,
      gameObjects,
      scriptInstances,
      animClips,
      keys: keysRef.current,
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

    // World
    const world = state.world;
    if (world && world.grid) {
      for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
          const cell = world.grid[y] && world.grid[y][x];
          if (cell !== null && cell !== undefined && cell !== 0) {
            const hue = (typeof cell === 'number' ? cell * 40 : 120) % 360;
            ctx.fillStyle = `hsl(${hue}, 50%, 35%)`;
            ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
          }
        }
      }
    }

    // Objects
    state.gameObjects.forEach(obj => {
      ctx.fillStyle = obj.color;
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(obj.name, obj.x + obj.width / 2, obj.y - 3);
    });

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

  return { canvasRef, isPlaying, start, stop };
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
