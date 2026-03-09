import React, { useState, useCallback, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Viewport from './components/Viewport.jsx';
import ObjectList from './components/ObjectList.jsx';
import WorldTools from './components/WorldTools.jsx';
import Inspector from './components/Inspector.jsx';
import ScriptEditor from './components/ScriptEditor.jsx';
import Timeline from './components/Timeline.jsx';
import ConsolePanel from './components/Console.jsx';
import { usePlayMode } from './components/PlayMode.jsx';
import './editor.css';

// ---- Project helpers ----
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
    id: genId('obj'), name: name || 'Object', type: 'generic', x, y,
    components: {
      Transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
      Sprite: { assetId: null, color: opts.color || '#4ade80', width: 32, height: 32 },
      Collider: { shape: 'rect', width: 32, height: 32 },
      ScriptBinding: { scriptId: null },
      Animator: { clipId: null },
    },
  };
}

const MAX_UNDO = 100;

function App() {
  const [project, setProject] = useState(() => createDefaultProject());
  const [editorState, setEditorState] = useState({
    mode: 'EDIT', activeTool: 'brush', brushValue: 1,
    selectedObjectId: null, camera: { x: 0, y: 0, zoom: 1 }, gridVisible: true,
  });
  const [bottomTab, setBottomTab] = useState('scripts');
  const [bottomHeight, setBottomHeight] = useState(240);
  const [logs, setLogs] = useState([]);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const updateEditor = useCallback((patch) => {
    setEditorState(prev => ({ ...prev, ...patch }));
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
  const { canvasRef: playCanvasRef, isPlaying, start: startPlay, stop: stopPlay } = usePlayMode(project, addLog);

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) { stopPlay(); updateEditor({ mode: 'EDIT' }); }
    else { startPlay(); updateEditor({ mode: 'PLAY' }); setBottomTab('console'); }
  }, [isPlaying, startPlay, stopPlay, updateEditor]);

  // ---- World editing ----
  const handleCellPaint = useCallback((cx, cy, value) => {
    setProject(prev => {
      pushUndo(prev);
      const p = { ...prev, world: { ...prev.world } };
      if (cy >= 0 && cy < p.world.rows && cx >= 0 && cx < p.world.cols) {
        p.world.grid = [...p.world.grid];
        p.world.grid[cy] = [...p.world.grid[cy]];
        p.world.grid[cy][cx] = value;
      }
      return p;
    });
  }, [pushUndo]);

  const handleCellFill = useCallback((startX, startY, value) => {
    setProject(prev => {
      pushUndo(prev);
      const p = { ...prev, world: { ...prev.world, grid: prev.world.grid.map(r => [...r]) } };
      const grid = p.world.grid;
      const { cols, rows } = p.world;
      if (startY < 0 || startY >= rows || startX < 0 || startX >= cols) return prev;
      const old = grid[startY][startX];
      if (old === value) return prev;
      const stack = [[startX, startY]];
      const visited = new Set();
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = x + ',' + y;
        if (visited.has(key) || x < 0 || x >= cols || y < 0 || y >= rows) continue;
        if (grid[y][x] !== old) continue;
        visited.add(key);
        grid[y][x] = value;
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      return p;
    });
  }, [pushUndo]);

  // ---- Object management ----
  const handleAddObject = useCallback(() => {
    const cam = editorState.camera;
    const obj = createGameObject('Object', Math.floor(cam.x + 100), Math.floor(cam.y + 100));
    setProject(prev => { pushUndo(prev); return { ...prev, objects: [...prev.objects, obj] }; });
    updateEditor({ selectedObjectId: obj.id });
  }, [editorState.camera, updateEditor, pushUndo]);

  const handleRemoveObject = useCallback((id) => {
    setProject(prev => { pushUndo(prev); return { ...prev, objects: prev.objects.filter(o => o.id !== id) }; });
    setEditorState(prev => prev.selectedObjectId === id ? { ...prev, selectedObjectId: null } : prev);
  }, [pushUndo]);

  const handleSelectObject = useCallback((id) => {
    updateEditor({ selectedObjectId: id, activeTool: id ? 'select' : editorState.activeTool });
  }, [updateEditor, editorState.activeTool]);

  const handleUpdateObject = useCallback((id, patch) => {
    setProject(prev => ({ ...prev, objects: prev.objects.map(o => o.id === id ? { ...o, ...patch } : o) }));
  }, []);

  const handleUpdateComponent = useCallback((objId, compName, compData) => {
    setProject(prev => ({
      ...prev,
      objects: prev.objects.map(o => {
        if (o.id !== objId) return o;
        const updated = { ...o, components: { ...o.components, [compName]: compData } };
        if (compName === 'Transform') { updated.x = compData.x; updated.y = compData.y; }
        return updated;
      }),
    }));
  }, []);

  const handleMoveObject = useCallback((id, x, y) => {
    setProject(prev => ({
      ...prev,
      objects: prev.objects.map(o => {
        if (o.id !== id) return o;
        return { ...o, x, y, components: { ...o.components, Transform: { ...o.components.Transform, x, y } } };
      }),
    }));
  }, []);

  // ---- Scripts ----
  const handleUpdateScript = useCallback((id, patch) => {
    setProject(prev => ({ ...prev, scripts: prev.scripts.map(s => s.id === id ? { ...s, ...patch } : s) }));
  }, []);

  const handleAddScript = useCallback((name) => {
    const script = {
      id: genId('script'), name,
      source: `function onInit(self, engine) {\n  // Called once when game starts\n}\n\nfunction onUpdate(self, engine, dt) {\n  // Called every frame\n  // Use engine.keyIsDown(keyCode) for input\n}\n`,
    };
    setProject(prev => { pushUndo(prev); return { ...prev, scripts: [...prev.scripts, script] }; });
  }, [pushUndo]);

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

  // ---- File ops ----
  const handleSave = useCallback(() => {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (project.meta.name || 'project') + '.json'; a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  const handleLoad = useCallback(() => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.schemaVersion === 1) { pushUndo(project); setProject(data); addLog({ type: 'info', message: `Loaded: ${data.meta?.name || file.name}`, time: new Date().toLocaleTimeString() }); }
          else { alert('Unknown schema version'); }
        } catch (err) { alert('Invalid project file: ' + err.message); }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [project, pushUndo, addLog]);

  const handleNew = useCallback(() => {
    if (!confirm('Create new project? Unsaved changes will be lost.')) return;
    setProject(createDefaultProject());
    updateEditor({ selectedObjectId: null, camera: { x: 0, y: 0, zoom: 1 } });
    undoStackRef.current = []; redoStackRef.current = [];
  }, [updateEditor]);

  const handleExport = useCallback(() => {
    const json = JSON.stringify(project);
    const html = buildExportHtml(project, json);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (project.meta.name || 'game') + '.html'; a.click();
    URL.revokeObjectURL(url);
    addLog({ type: 'info', message: 'Exported standalone build', time: new Date().toLocaleTimeString() });
  }, [project, addLog]);

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

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.closest('.cm-editor')) return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handleRedo(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
      if (e.key === 'F5') { e.preventDefault(); handlePlayToggle(); }
      if (!isPlaying) {
        if (e.key === 'b') updateEditor({ activeTool: 'brush' });
        if (e.key === 'f') updateEditor({ activeTool: 'fill' });
        if (e.key === 'e') updateEditor({ activeTool: 'erase' });
        if (e.key === 'v') updateEditor({ activeTool: 'select' });
        if (e.key === 'Delete' && editorState.selectedObjectId) handleRemoveObject(editorState.selectedObjectId);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleUndo, handleRedo, handleSave, handlePlayToggle, updateEditor, editorState.selectedObjectId, handleRemoveObject, isPlaying]);

  return (
    <div className="editor-layout">
      <Toolbar editorState={editorState} isPlaying={isPlaying}
        onToolChange={(tool) => updateEditor({ activeTool: tool })}
        onBrushChange={(val) => updateEditor({ brushValue: val })}
        onUndo={handleUndo} onRedo={handleRedo}
        onNewProject={handleNew} onSaveProject={handleSave} onLoadProject={handleLoad}
        onExport={handleExport} onPlayToggle={handlePlayToggle}
        undoCount={undoStackRef.current.length} redoCount={redoStackRef.current.length} />

      <div className="editor-left">
        <WorldTools project={project} editorState={editorState} onUpdateCamera={handleUpdateCamera} onToggleGrid={handleToggleGrid} />
        <ObjectList project={project} editorState={editorState} onSelectObject={handleSelectObject} onAddObject={handleAddObject} onRemoveObject={handleRemoveObject} />
      </div>

      <div className="editor-center">
        <div className="editor-viewport">
          {isPlaying ? (
            <canvas ref={playCanvasRef} width={project.meta.resolution.width} height={project.meta.resolution.height}
              style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', margin: '0 auto', background: '#0b1220' }} tabIndex={0} />
          ) : (
            <Viewport project={project} editorState={editorState}
              onCellPaint={handleCellPaint} onCellFill={handleCellFill} onSelectObject={handleSelectObject}
              onPlaceObject={(x, y) => { const obj = createGameObject('Object', x, y); setProject(prev => { pushUndo(prev); return { ...prev, objects: [...prev.objects, obj] }; }); updateEditor({ selectedObjectId: obj.id }); }}
              onMoveObject={handleMoveObject} onUpdateCamera={handleUpdateCamera} />
          )}
        </div>
        <div className="resize-handle" onMouseDown={handleResizeStart} />
        <div className="editor-bottom" style={{ height: bottomHeight }}>
          <div className="bottom-tabs">
            {['scripts', 'timeline', 'console'].map(tab => (
              <button key={tab} className={`bottom-tab ${bottomTab === tab ? 'active' : ''}`} onClick={() => setBottomTab(tab)}>
                {tab === 'scripts' ? `Scripts (${project.scripts.length})` : tab === 'timeline' ? `Timeline (${project.animations.length})` : `Console (${logs.length})`}
              </button>
            ))}
          </div>
          <div className="bottom-content">
            {bottomTab === 'scripts' && <ScriptEditor project={project} onUpdateScript={handleUpdateScript} onAddScript={handleAddScript} onDeleteScript={handleDeleteScript} />}
            {bottomTab === 'timeline' && <Timeline project={project} onUpdateAnimation={handleUpdateAnimation} onAddAnimation={handleAddAnimation} onDeleteAnimation={handleDeleteAnimation} onAddTrack={handleAddTrack} onAddKeyframe={handleAddKeyframe} onDeleteKeyframe={() => {}} onUpdateKeyframe={() => {}} />}
            {bottomTab === 'console' && <ConsolePanel logs={logs} onClear={() => setLogs([])} />}
          </div>
        </div>
      </div>

      <div className="editor-right">
        <Inspector project={project} editorState={editorState} onUpdateObject={handleUpdateObject} onUpdateComponent={handleUpdateComponent} />
      </div>

      <div className="editor-statusbar">
        <span className={isPlaying ? 'status-playing' : ''}>{isPlaying ? 'PLAYING' : 'EDIT'}</span>
        <span>Tool: {editorState.activeTool}</span>
        <span>Zoom: {(editorState.camera.zoom * 100).toFixed(0)}%</span>
        <span>Obj: {project.objects.length} | Scripts: {project.scripts.length} | Anims: {project.animations.length}</span>
        <span style={{ flex: 1 }} />
        <span style={{ opacity: 0.6 }}>F5: Play | Ctrl+S: Save | Ctrl+Z/Y: Undo/Redo</span>
        <span style={{ marginLeft: 12, fontWeight: 600 }}>{project.meta.name}</span>
      </div>
    </div>
  );
}

// ---- Export HTML builder ----
function buildExportHtml(project, projectJson) {
  const res = project.meta.resolution || { width: 960, height: 540 };
  const title = project.meta.name || 'Koz Engine Game';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="mobile-web-app-capable" content="yes"><title>${escapeHtml(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/p5@1.4.2/lib/p5.js"><\/script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#0f172a;overflow:hidden;display:flex;align-items:center;justify-content:center}canvas{display:block}</style>
</head><body><script>
const P=${projectJson},CS=24;let go=[],sc={},si=[],ac=[],el=0;
function setup(){createCanvas(${res.width},${res.height}).parent(document.body);pixelDensity(1);textFont('Trebuchet MS');
(P.objects||[]).forEach(o=>{let t=(o.components&&o.components.Transform)||{};
go.push({id:o.id,name:o.name,type:o.type,x:t.x||o.x||0,y:t.y||o.y||0,
width:(o.components&&o.components.Sprite&&o.components.Sprite.width)||32,
height:(o.components&&o.components.Sprite&&o.components.Sprite.height)||32,
color:(o.components&&o.components.Sprite&&o.components.Sprite.color)||'#4ade80',components:o.components||{}})});
(P.scripts||[]).forEach(s=>{sc[s.id]=s});
go.forEach(o=>{let b=o.components.ScriptBinding;if(b&&b.scriptId&&sc[b.scriptId]){try{
let f=new Function('return (function(self,console){'+sc[b.scriptId].source+
' return{onInit:typeof onInit==="function"?onInit:null,onUpdate:typeof onUpdate==="function"?onUpdate:null}})')();
si.push({o,h:f(o,console)})}catch(e){console.error(e)}}});ac=P.animations||[];
let E={gameObjects:go,elapsed:0,findObject:id=>go.find(o=>o.id===id)||null,keyIsDown:c=>keyIsDown(c)};
si.forEach(i=>{if(i.h.onInit)try{i.h.onInit(i.o,E)}catch(e){console.error(e)}})}
function draw(){let dt=Math.min(deltaTime/1000,.033);el+=dt;background('#0b1220');
let w=P.world;if(w&&w.grid)for(let y=0;y<w.rows;y++)for(let x=0;x<w.cols;x++){
let c=w.grid[y]&&w.grid[y][x];if(c!=null&&c!==0){fill('hsl('+(typeof c==='number'?c*40:120)%360+',50%,35%)');noStroke();rect(x*CS,y*CS,CS,CS)}}
ac.forEach(cl=>{if(!cl.tracks)return;let d=cl.duration||1,t=cl.loop?el%d:Math.min(el,d);
cl.tracks.forEach(tr=>{let o=go.find(g=>g.id===tr.targetObjectId);if(!o||!tr.keyframes||!tr.keyframes.length)return;o[tr.property]=S(tr,t)})});
let E={gameObjects:go,elapsed:el,findObject:id=>go.find(o=>o.id===id)||null,keyIsDown:c=>keyIsDown(c)};
si.forEach(i=>{if(i.h.onUpdate)try{i.h.onUpdate(i.o,E,dt)}catch(e){console.error(e)}});
go.forEach(o=>{fill(o.color);noStroke();rect(o.x,o.y,o.width,o.height);fill('#fff');textSize(10);textAlign(CENTER,BOTTOM);text(o.name,o.x+o.width/2,o.y-2)})}
function S(tr,t){let k=tr.keyframes;if(!k.length)return 0;if(k.length===1)return k[0].value;
if(t<=k[0].time)return k[0].value;if(t>=k[k.length-1].time)return k[k.length-1].value;
for(let i=0;i<k.length-1;i++){if(t>=k[i].time&&t<=k[i+1].time){let r=k[i+1].time-k[i].time,p=r>0?(t-k[i].time)/r:0;return k[i].value+(k[i+1].value-k[i].value)*p}}return k[k.length-1].value}
<\/script></body></html>`;
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
export default App;
