import React from 'react';

const TOOLS = [
  { id: 'brush', label: 'Brush', key: 'B' },
  { id: 'fill', label: 'Fill', key: 'F' },
  { id: 'erase', label: 'Erase', key: 'E' },
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'worldMove', label: 'World', key: 'G' },
  { id: 'place', label: 'Place', key: 'P' },
];

const GIZMO_MODES = [
  { id: 'move', label: 'Move', key: 'W' },
  { id: 'rotate', label: 'Rotate', key: 'E' },
  { id: 'scale', label: 'Scale', key: 'R' },
];

export default function Toolbar({ project, editorState, isPlaying, onToolChange, onBrushChange, onGizmoModeChange, onUndo, onRedo, onNewProject, onSaveProject, onSaveAsProject, onLoadProject, onExport, onPlayToggle, undoCount, redoCount, onAlignObjects }) {
  const cellTypes = (project && project.cellTypes) || [];
  const gizmoMode = editorState.gizmoMode || 'move';
  const showGizmoTools = editorState.activeTool === 'select';
  const hasMultiSelection = Array.isArray(editorState.selectedObjectIds) && editorState.selectedObjectIds.length > 1;
  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button className="btn btn-sm" onClick={onNewProject} title="New Project">New</button>
        <button className="btn btn-sm" onClick={onSaveProject} title="Save (Ctrl+S)">Save</button>
        <button className="btn btn-sm" onClick={onSaveAsProject} title="Save As (Ctrl+Shift+S)">Save As</button>
        <button className="btn btn-sm" onClick={onLoadProject} title="Load Project">Load</button>
      </div>

      <div className="toolbar-group">
        {TOOLS.map(tool => (
          <button key={tool.id}
            className={`btn btn-sm ${editorState.activeTool === tool.id ? 'active' : ''}`}
            onClick={() => onToolChange(tool.id)}
            title={`${tool.label} (${tool.key})`}
            disabled={isPlaying}
          >
            {tool.label}
          </button>
        ))}
      </div>

      {showGizmoTools && (
        <div className="toolbar-group">
          {GIZMO_MODES.map(mode => (
            <button key={mode.id}
              className={`btn btn-sm ${gizmoMode === mode.id ? 'active' : ''}`}
              onClick={() => onGizmoModeChange && onGizmoModeChange(mode.id)}
              title={`${mode.label} (${mode.key})`}
              disabled={isPlaying}
              style={gizmoMode === mode.id ? { background: mode.id === 'move' ? '#facc15' : mode.id === 'rotate' ? '#a78bfa' : '#3b82f6', color: '#0f172a', borderColor: 'transparent', fontWeight: 600 } : undefined}
            >
              {mode.label}
            </button>
          ))}
        </div>
      )}

      <div className="toolbar-group">
        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cell:</label>
        <select value={editorState.brushValue}
          onChange={(e) => onBrushChange(e.target.value)}
          disabled={isPlaying}
          style={{ padding: '2px 4px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3, fontSize: 11 }}>
          {cellTypes.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {showGizmoTools && hasMultiSelection && onAlignObjects && (
        <div className="toolbar-group">
          <button className="btn btn-sm" onClick={() => onAlignObjects('left')} title="Align Left" disabled={isPlaying}>L</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('centerH')} title="Align Center H" disabled={isPlaying}>CH</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('right')} title="Align Right" disabled={isPlaying}>R</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('top')} title="Align Top" disabled={isPlaying}>T</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('centerV')} title="Align Center V" disabled={isPlaying}>CV</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('bottom')} title="Align Bottom" disabled={isPlaying}>B</button>
        </div>
      )}

      <div className="toolbar-group">
        <button
          className={`btn btn-sm ${editorState.snapToGrid ? 'active' : ''}`}
          onClick={() => onToolChange && onGizmoModeChange && onGizmoModeChange(editorState.gizmoMode || 'move', !editorState.snapToGrid)}
          title="Snap to Grid (toggle)"
          disabled={isPlaying}
          style={editorState.snapToGrid ? { background: '#22c55e', color: '#0f172a', borderColor: 'transparent' } : undefined}
        >
          Snap
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn btn-sm" onClick={onUndo} title="Undo (Ctrl+Z)" disabled={isPlaying || !undoCount}>Undo</button>
        <button className="btn btn-sm" onClick={onRedo} title="Redo (Ctrl+Y)" disabled={isPlaying || !redoCount}>Redo</button>
      </div>

      <div className="toolbar-group">
        <button className={`btn btn-sm ${isPlaying ? 'btn-playing' : 'btn-play'}`}
          onClick={onPlayToggle} title="Play/Stop (F5)">
          {isPlaying ? 'Stop' : 'Play'}
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div className="toolbar-group">
        <button className="btn btn-sm" onClick={onExport} title="Export standalone HTML">Export</button>
      </div>
    </div>
  );
}
