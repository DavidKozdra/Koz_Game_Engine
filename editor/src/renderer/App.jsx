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
import KozLogo from './components/KozLogo.jsx';
import Modal from './components/Modal.jsx';
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
      ScriptBindings: [],
      Animator: { clipId: null },
    },
  };
}

const MAX_UNDO = 100;

function App() {
  // All hooks must be called unconditionally and in the same order
  const [project, setProject] = useState(null);
  const [showProjectSelector, setShowProjectSelector] = useState(true);
  const [editorState, setEditorState] = useState({
    mode: 'EDIT', activeTool: 'brush', brushValue: 1,
    selectedObjectId: null, selectedScriptId: null, camera: { x: 0, y: 0, zoom: 1 }, gridVisible: true,
  });
  const [bottomTab, setBottomTab] = useState('timeline');
  const [bottomHeight, setBottomHeight] = useState(240);
  const [logs, setLogs] = useState([]);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const [mainTab, setMainTab] = useState('world');

  // ...existing callbacks and logic...

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
  const { canvasRef: playCanvasRef, isPlaying, start: startPlay, stop: stopPlay, execute } = usePlayMode(project, addLog);

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) { stopPlay(); updateEditor({ mode: 'EDIT' }); }
    else { startPlay(); updateEditor({ mode: 'PLAY' }); setMainTab('world'); setBottomTab('console'); }
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
      ui: `// UI Screen using KozUIManager
// Registers a screen that shows/hides based on game state

function onInit(self, engine) {
  // Register screen with UIManager (auto-injected as global)
  if (typeof KozUIManager !== 'undefined') {
    KozUIManager.registerScreen('myScreen', {
      // validStates: ['RUNNING', 'PAUSED'], // Show in these states
      create: function() {
        const container = document.createElement('div');
        container.id = 'myScreen';
        container.style.cssText = 'position:absolute;top:20px;right:20px;padding:16px;background:rgba(0,0,0,0.8);color:#fff;border-radius:8px;font-family:sans-serif;';
        container.innerHTML = '<h3>My UI</h3><p>Game time: 0s</p><button id="myBtn">Click Me</button>';
        
        // Add click handler
        const btn = container.querySelector('#myBtn');
        if (btn) {
          btn.onclick = function() {
            console.log('Button clicked!');
          };
        }
        
        return container;
      },
      show: function() {
        // Called when screen becomes visible
        console.log('UI Screen shown');
      },
      hide: function() {
        // Called when screen hides
        console.log('UI Screen hidden');
      },
      update: function() {
        // Called every frame while visible
        const container = this.container;
        if (container) {
          const time = Math.floor(engine.elapsed || 0);
          const p = container.querySelector('p');
          if (p) p.textContent = 'Game time: ' + time + 's';
        }
      },
      validStates: ['RUNNING']
    });
  }
}

function onUpdate(self, engine, dt) {
  // Called every frame
  // KozUIManager.updateAll() is called automatically
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
    const script = {
      id: genId('script'), name, language,
      source: templates[language] || templates.javascript,
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
    if (!project) return;
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (project.meta.name || 'project') + '.json'; a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  // Project selector modal logic
  const handleProjectFile = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.schemaVersion === 1) {
          setProject(data);
          setShowProjectSelector(false);
        } else {
          alert('Unknown schema version');
        }
      } catch (err) {
        alert('Invalid project file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleLoad = useCallback(() => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      handleProjectFile(file);
    };
    input.click();
  }, []);

  const handleNew = useCallback(() => {
    setProject(createDefaultProject());
    setShowProjectSelector(false);
    updateEditor({ selectedObjectId: null, selectedScriptId: null, camera: { x: 0, y: 0, zoom: 1 } });
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

  // Render project selector modal if no project loaded
  return (
    <>
      {(showProjectSelector || !project) && (
        <Modal open={true} title={null} onClose={() => {}}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, minWidth: 320 }}>
            <KozLogo size={80} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <button className="btn btn-lg" style={{ width: '100%' }} onClick={handleNew}>New Project</button>
              <button className="btn btn-lg" style={{ width: '100%' }} onClick={handleLoad}>Load Project</button>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>Select a project file (.json) or start a new one.</div>
            </div>
          </div>
        </Modal>
      )}
      {!(showProjectSelector || !project) && (
        // ...existing code for the editor layout...
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
            <div className="main-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#181c24' }}>
              {['world', 'scripts'].map(tab => (
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
                  {tab === 'world' ? 'World / Game' : `Scripts (${project && Array.isArray(project.scripts) ? project.scripts.length : 0})`}
                </button>
              ))}
            </div>

            {mainTab === 'world' && (
              <>
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
                    {['timeline', 'console'].map(tab => (
                      <button key={tab} className={`bottom-tab ${bottomTab === tab ? 'active' : ''}`} onClick={() => setBottomTab(tab)}>
                        {tab === 'timeline'
                          ? `Timeline (${project && Array.isArray(project.animations) ? project.animations.length : 0})`
                          : `Console (${logs.length})`}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    {bottomTab === 'timeline' && (
                      <Timeline
                        project={project}
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
                  project={project}
                  onUpdateScript={handleUpdateScript}
                  onAddScript={handleAddScript}
                  onDeleteScript={handleDeleteScript}
                  selectedId={editorState.selectedScriptId}
                  setSelectedId={id => setEditorState(prev => ({ ...prev, selectedScriptId: id }))}
                  showFileList={true}
                />
              </div>
            )}
          </div>
          <Inspector project={project} editorState={editorState} onUpdateObject={handleUpdateObject} onUpdateComponent={handleUpdateComponent} />
        </div>
      )}
            </>
          );
}
export default App;
