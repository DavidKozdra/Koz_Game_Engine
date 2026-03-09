import React, { useState, useCallback, useEffect } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Viewport from './components/Viewport.jsx';
import ObjectList from './components/ObjectList.jsx';
import WorldTools from './components/WorldTools.jsx';
import Inspector from './components/Inspector.jsx';
import './editor.css';

// Inline minimal project schema helpers (avoid Node require in browser context)
function createDefaultProject(opts = {}) {
  const cols = opts.cols || 30;
  const rows = opts.rows || 20;
  const dc = opts.defaultCell !== undefined ? opts.defaultCell : null;
  const grid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) row.push(dc);
    grid.push(row);
  }
  return {
    schemaVersion: 1,
    meta: { name: opts.name || 'Untitled Project', version: '1.0.0', resolution: { width: 960, height: 540 }, engineVersion: '0.1.0' },
    world: { cols, rows, defaultCell: dc, grid, elements: [], meta: {} },
    objects: [],
    animations: [],
    scripts: [],
    assets: [],
    build: { profile: 'web-prod', pwa: false },
  };
}

let _idCounter = 0;
function genId(prefix) { _idCounter++; return prefix + '_' + Date.now().toString(36) + '_' + _idCounter; }

function createGameObject(name, x, y, opts = {}) {
  return {
    id: genId('obj'),
    name: name || 'Object',
    type: 'generic',
    x, y,
    components: {
      Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
      Sprite: { assetId: null, color: opts.color || '#4ade80', width: 32, height: 32 },
      Collider: { shape: 'rect', width: 32, height: 32 },
      ScriptBinding: { scriptId: null },
      Animator: { clipId: null },
    },
  };
}

function App() {
  const [project, setProject] = useState(() => createDefaultProject());
  const [editorState, setEditorState] = useState({
    mode: 'EDIT',
    activeTool: 'brush',
    brushValue: 1,
    selectedObjectId: null,
    camera: { x: 0, y: 0, zoom: 1 },
    gridVisible: true,
  });
  const [, forceRender] = useState(0);

  const updateEditor = useCallback((patch) => {
    setEditorState(prev => ({ ...prev, ...patch }));
  }, []);

  // World cell painting (mutate project.world.grid directly, then force re-render)
  const handleCellPaint = useCallback((cx, cy, value) => {
    setProject(prev => {
      const p = { ...prev, world: { ...prev.world } };
      if (cy >= 0 && cy < p.world.rows && cx >= 0 && cx < p.world.cols) {
        // Clone the row being modified
        p.world.grid = [...p.world.grid];
        p.world.grid[cy] = [...p.world.grid[cy]];
        p.world.grid[cy][cx] = value;
      }
      return p;
    });
  }, []);

  // Flood fill
  const handleCellFill = useCallback((startX, startY, value) => {
    setProject(prev => {
      const p = { ...prev, world: { ...prev.world, grid: prev.world.grid.map(r => [...r]) } };
      const grid = p.world.grid;
      const cols = p.world.cols;
      const rows = p.world.rows;
      if (startY < 0 || startY >= rows || startX < 0 || startX >= cols) return prev;
      const oldValue = grid[startY][startX];
      if (oldValue === value) return prev;

      const stack = [[startX, startY]];
      const visited = new Set();
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = x + ',' + y;
        if (visited.has(key)) continue;
        if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
        if (grid[y][x] !== oldValue) continue;
        visited.add(key);
        grid[y][x] = value;
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      return p;
    });
  }, []);

  // Undo/redo (simplified — full undo would use worldEditor.js)
  const handleUndo = useCallback(() => { /* TODO: integrate worldEditor undo stack */ }, []);
  const handleRedo = useCallback(() => { /* TODO: integrate worldEditor redo stack */ }, []);

  // Object management
  const handleAddObject = useCallback(() => {
    const cam = editorState.camera;
    const obj = createGameObject('Object', Math.floor(cam.x + 100), Math.floor(cam.y + 100));
    setProject(prev => ({ ...prev, objects: [...prev.objects, obj] }));
    updateEditor({ selectedObjectId: obj.id });
  }, [editorState.camera, updateEditor]);

  const handleRemoveObject = useCallback((id) => {
    setProject(prev => ({ ...prev, objects: prev.objects.filter(o => o.id !== id) }));
    setEditorState(prev => prev.selectedObjectId === id ? { ...prev, selectedObjectId: null } : prev);
  }, []);

  const handleSelectObject = useCallback((id) => {
    updateEditor({ selectedObjectId: id, activeTool: id ? 'select' : editorState.activeTool });
  }, [updateEditor, editorState.activeTool]);

  const handleUpdateObject = useCallback((id, patch) => {
    setProject(prev => ({
      ...prev,
      objects: prev.objects.map(o => o.id === id ? { ...o, ...patch } : o),
    }));
  }, []);

  const handleUpdateComponent = useCallback((objId, compName, compData) => {
    setProject(prev => ({
      ...prev,
      objects: prev.objects.map(o => {
        if (o.id !== objId) return o;
        const updated = { ...o, components: { ...o.components, [compName]: compData } };
        // Sync position from Transform
        if (compName === 'Transform') {
          updated.x = compData.x;
          updated.y = compData.y;
        }
        return updated;
      }),
    }));
  }, []);

  const handleMoveObject = useCallback((id, x, y) => {
    setProject(prev => ({
      ...prev,
      objects: prev.objects.map(o => {
        if (o.id !== id) return o;
        return {
          ...o, x, y,
          components: { ...o.components, Transform: { ...o.components.Transform, x, y } },
        };
      }),
    }));
  }, []);

  const handleUpdateCamera = useCallback((cam) => {
    updateEditor({ camera: cam });
  }, [updateEditor]);

  const handleToggleGrid = useCallback(() => {
    updateEditor({ gridVisible: !editorState.gridVisible });
  }, [updateEditor, editorState.gridVisible]);

  // Save/Load
  const handleSave = useCallback(() => {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (project.meta.name || 'project') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.schemaVersion === 1) {
            setProject(data);
          } else {
            alert('Unknown schema version');
          }
        } catch (err) {
          alert('Invalid project file: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const handleNew = useCallback(() => {
    if (confirm('Create new project? Unsaved changes will be lost.')) {
      setProject(createDefaultProject());
      updateEditor({ selectedObjectId: null, camera: { x: 0, y: 0, zoom: 1 } });
    }
  }, [updateEditor]);

  // Export
  const handleExport = useCallback(() => {
    const json = JSON.stringify(project);
    const html = buildExportHtml(project, json);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (project.meta.name || 'game') + '.html';
    a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handleRedo(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
      if (e.key === 'b') updateEditor({ activeTool: 'brush' });
      if (e.key === 'f') updateEditor({ activeTool: 'fill' });
      if (e.key === 'e') updateEditor({ activeTool: 'erase' });
      if (e.key === 'v') updateEditor({ activeTool: 'select' });
      if (e.key === 'Delete' && editorState.selectedObjectId) handleRemoveObject(editorState.selectedObjectId);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleUndo, handleRedo, handleSave, updateEditor, editorState.selectedObjectId, handleRemoveObject]);

  return (
    <div className="editor-layout">
      <Toolbar
        editorState={editorState}
        onToolChange={(tool) => updateEditor({ activeTool: tool })}
        onBrushChange={(val) => updateEditor({ brushValue: val })}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onNewProject={handleNew}
        onSaveProject={handleSave}
        onLoadProject={handleLoad}
        onExport={handleExport}
      />

      <div className="editor-left">
        <WorldTools
          project={project}
          editorState={editorState}
          onUpdateCamera={handleUpdateCamera}
          onToggleGrid={handleToggleGrid}
        />
        <ObjectList
          project={project}
          editorState={editorState}
          onSelectObject={handleSelectObject}
          onAddObject={handleAddObject}
          onRemoveObject={handleRemoveObject}
        />
      </div>

      <div className="editor-viewport">
        <Viewport
          project={project}
          editorState={editorState}
          onCellPaint={handleCellPaint}
          onCellFill={handleCellFill}
          onSelectObject={handleSelectObject}
          onPlaceObject={(x, y) => {
            const obj = createGameObject('Object', x, y);
            setProject(prev => ({ ...prev, objects: [...prev.objects, obj] }));
            updateEditor({ selectedObjectId: obj.id });
          }}
          onMoveObject={handleMoveObject}
          onUpdateCamera={handleUpdateCamera}
        />
      </div>

      <div className="editor-right">
        <Inspector
          project={project}
          editorState={editorState}
          onUpdateObject={handleUpdateObject}
          onUpdateComponent={handleUpdateComponent}
        />
      </div>

      <div className="editor-statusbar">
        <span>Tool: {editorState.activeTool}</span>
        <span>Zoom: {(editorState.camera.zoom * 100).toFixed(0)}%</span>
        <span>Objects: {project.objects.length}</span>
        <span>Grid: {project.world.cols}x{project.world.rows}</span>
        <span style={{ flex: 1 }} />
        <span>{project.meta.name} v{project.meta.version}</span>
      </div>
    </div>
  );
}

/**
 * Build a self-contained HTML file that runs the project as a standalone game.
 * This is the Phase 7 export pipeline.
 */
function buildExportHtml(project, projectJson) {
  const res = project.meta.resolution || { width: 960, height: 540 };
  const title = project.meta.name || 'Koz Engine Game';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="mobile-web-app-capable" content="yes">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/p5@1.4.2/lib/p5.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #0f172a; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    canvas { display: block; }
  </style>
</head>
<body>
<script>
// === Embedded Project Data ===
const PROJECT = ${projectJson};

// === Minimal Runtime ===
const CELL_SIZE = 24;
let gameObjects = [];
let scripts = {};
let scriptInstances = [];
let animClips = [];
let elapsed = 0;
let running = false;

function setup() {
  const canvas = createCanvas(${res.width}, ${res.height});
  canvas.parent(document.body);
  pixelDensity(1);
  textFont('Trebuchet MS');

  // Load objects
  (PROJECT.objects || []).forEach(function(obj) {
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
  (PROJECT.scripts || []).forEach(function(s) { scripts[s.id] = s; });

  // Bind scripts
  gameObjects.forEach(function(obj) {
    var binding = obj.components.ScriptBinding;
    if (binding && binding.scriptId && scripts[binding.scriptId]) {
      try {
        var src = scripts[binding.scriptId].source;
        var factory = new Function('return (function(self, console) { ' + src + ' return { onInit: typeof onInit==="function"?onInit:null, onUpdate: typeof onUpdate==="function"?onUpdate:null }; })')();
        var hooks = factory(obj, console);
        scriptInstances.push({ obj: obj, hooks: hooks });
      } catch(e) { console.error('Script error:', e); }
    }
  });

  animClips = PROJECT.animations || [];

  // Init scripts
  var engine = { gameObjects: gameObjects, elapsed: 0, findObject: function(id) { return gameObjects.find(function(o){return o.id===id;})||null; } };
  scriptInstances.forEach(function(inst) {
    if (inst.hooks.onInit) try { inst.hooks.onInit(inst.obj, engine); } catch(e) { console.error(e); }
  });

  running = true;
}

function draw() {
  var dt = Math.min(deltaTime / 1000, 0.033);
  elapsed += dt;
  background('#0b1220');

  // Draw world
  var world = PROJECT.world;
  if (world && world.grid) {
    for (var y = 0; y < world.rows; y++) {
      for (var x = 0; x < world.cols; x++) {
        var cell = world.grid[y] && world.grid[y][x];
        if (cell !== null && cell !== undefined && cell !== 0) {
          var hue = (typeof cell === 'number' ? cell * 40 : 120) % 360;
          fill('hsl(' + hue + ', 50%, 35%)');
          noStroke();
          rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }
  }

  // Evaluate animations
  animClips.forEach(function(clip) {
    if (!clip.tracks) return;
    var dur = clip.duration || 1;
    var t = clip.loop ? (elapsed % dur) : Math.min(elapsed, dur);
    clip.tracks.forEach(function(track) {
      var obj = gameObjects.find(function(o){return o.id===track.targetObjectId;});
      if (!obj || !track.keyframes || track.keyframes.length === 0) return;
      var val = sampleTrack(track, t);
      if (val !== null) obj[track.property] = val;
    });
  });

  // Update scripts
  var engine = { gameObjects: gameObjects, elapsed: elapsed, findObject: function(id) { return gameObjects.find(function(o){return o.id===id;})||null; } };
  scriptInstances.forEach(function(inst) {
    if (inst.hooks.onUpdate) try { inst.hooks.onUpdate(inst.obj, engine, dt); } catch(e) { console.error(e); }
  });

  // Draw objects
  gameObjects.forEach(function(obj) {
    fill(obj.color);
    noStroke();
    rect(obj.x, obj.y, obj.width, obj.height);
  });
}

function sampleTrack(track, time) {
  var kfs = track.keyframes;
  if (kfs.length === 0) return null;
  if (kfs.length === 1) return kfs[0].value;
  if (time <= kfs[0].time) return kfs[0].value;
  if (time >= kfs[kfs.length-1].time) return kfs[kfs.length-1].value;
  for (var i = 0; i < kfs.length - 1; i++) {
    if (time >= kfs[i].time && time <= kfs[i+1].time) {
      var range = kfs[i+1].time - kfs[i].time;
      var t = range > 0 ? (time - kfs[i].time) / range : 0;
      return kfs[i].value + (kfs[i+1].value - kfs[i].value) * t;
    }
  }
  return kfs[kfs.length-1].value;
}
<\/script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default App;
