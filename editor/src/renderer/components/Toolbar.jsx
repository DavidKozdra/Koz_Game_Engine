import React from 'react';
import Icon from './Icon.jsx';

const TOOLS = [
  { id: 'brush', label: 'Brush', key: 'B', icon: 'brush' },
  { id: 'fill', label: 'Fill', key: 'F', icon: 'fill' },
  { id: 'erase', label: 'Erase', key: 'E', icon: 'erase' },
  { id: 'select', label: 'Select', key: 'V', icon: 'select' },
  { id: 'worldMove', label: 'World', key: 'G', icon: 'world' },
  { id: 'place', label: 'Place', key: 'P', icon: 'place' },
];

const GIZMO_MODES = [
  { id: 'move', label: 'Move', key: 'W', icon: 'move' },
  { id: 'rotate', label: 'Rotate', key: 'E', icon: 'rotate' },
  { id: 'scale', label: 'Scale', key: 'R', icon: 'scale' },
];

export default function Toolbar({ project, editorState, isPlaying, onToolChange, onBrushChange, onGizmoModeChange, onUndo, onRedo, onNewProject, onSaveProject, onSaveAsProject, onLoadProject, onExport, onPlayToggle, undoCount, redoCount, onAlignObjects }) {
  const cellTypes = (project && project.cellTypes) || [];
  const gizmoMode = editorState.gizmoMode || 'move';
  const showGizmoTools = editorState.activeTool === 'select';
  const hasMultiSelection = Array.isArray(editorState.selectedObjectIds) && editorState.selectedObjectIds.length > 1;
  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button className="btn btn-sm" onClick={onNewProject} title="New Project" aria-label="New project">
          <Icon name="new" />
          New
        </button>
        <button className="btn btn-sm" onClick={onSaveProject} title="Save (Ctrl+S)" aria-label="Save project">
          <Icon name="save" />
          Save
        </button>
        <button className="btn btn-sm" onClick={onSaveAsProject} title="Save As (Ctrl+Shift+S)" aria-label="Save project as">
          <Icon name="saveAs" />
          Save As
        </button>
        <button className="btn btn-sm" onClick={onLoadProject} title="Load Project" aria-label="Load project">
          <Icon name="load" />
          Load
        </button>
      </div>

      <div className="toolbar-group">
        {TOOLS.map(tool => (
          <button key={tool.id}
            className={`btn btn-sm ${editorState.activeTool === tool.id ? 'active' : ''}`}
            onClick={() => onToolChange(tool.id)}
            title={`${tool.label} (${tool.key})`}
            disabled={isPlaying}
            aria-label={`${tool.label} tool (${tool.key})`}
          >
            <Icon name={tool.icon} />
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
              aria-label={`${mode.label} gizmo mode (${mode.key})`}
            >
              <Icon name={mode.icon} />
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
          <button className="btn btn-sm" onClick={() => onAlignObjects('left')} title="Align Left" aria-label="Align left" disabled={isPlaying}><Icon name="alignLeft" />Left</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('centerH')} title="Align Center Horizontally" aria-label="Align center horizontally" disabled={isPlaying}><Icon name="alignCenterH" />Center H</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('right')} title="Align Right" aria-label="Align right" disabled={isPlaying}><Icon name="alignRight" />Right</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('top')} title="Align Top" aria-label="Align top" disabled={isPlaying}><Icon name="alignTop" />Top</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('centerV')} title="Align Center Vertically" aria-label="Align center vertically" disabled={isPlaying}><Icon name="alignCenterV" />Center V</button>
          <button className="btn btn-sm" onClick={() => onAlignObjects('bottom')} title="Align Bottom" aria-label="Align bottom" disabled={isPlaying}><Icon name="alignBottom" />Bottom</button>
        </div>
      )}

      <div className="toolbar-group">
        <button
          className={`btn btn-sm ${editorState.snapToGrid ? 'active' : ''}`}
          onClick={() => onToolChange && onGizmoModeChange && onGizmoModeChange(editorState.gizmoMode || 'move', !editorState.snapToGrid)}
          title="Snap to Grid (toggle)"
          disabled={isPlaying}
          style={editorState.snapToGrid ? { background: '#22c55e', color: '#0f172a', borderColor: 'transparent' } : undefined}
          aria-label="Toggle snap to grid"
        >
          <Icon name="snap" />
          Snap
        </button>
      </div>

      <div className="toolbar-group">
        <button className="btn btn-sm" onClick={onUndo} title="Undo (Ctrl+Z)" aria-label="Undo" disabled={isPlaying || !undoCount}><Icon name="undo" />Undo</button>
        <button className="btn btn-sm" onClick={onRedo} title="Redo (Ctrl+Y)" aria-label="Redo" disabled={isPlaying || !redoCount}><Icon name="redo" />Redo</button>
      </div>

      <div className="toolbar-group">
        <button className={`btn btn-sm ${isPlaying ? 'btn-playing' : 'btn-play'}`}
          onClick={onPlayToggle} title="Play/Stop (F5)" aria-label={isPlaying ? 'Stop play mode' : 'Start play mode'}>
          <Icon name={isPlaying ? 'stop' : 'play'} />
          {isPlaying ? 'Stop' : 'Play'}
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div className="toolbar-group">
        <button className="btn btn-sm" onClick={onExport} title="Export standalone HTML" aria-label="Export standalone HTML"><Icon name="export" />Export</button>
      </div>
    </div>
  );
}
