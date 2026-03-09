import React from 'react';

const TOOLS = [
  { id: 'brush', label: 'Brush', key: 'B' },
  { id: 'fill', label: 'Fill', key: 'F' },
  { id: 'erase', label: 'Erase', key: 'E' },
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'place', label: 'Place', key: 'P' },
];

export default function Toolbar({ editorState, isPlaying, onToolChange, onBrushChange, onUndo, onRedo, onNewProject, onSaveProject, onLoadProject, onExport, onPlayToggle, undoCount, redoCount }) {
  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button className="btn btn-sm" onClick={onNewProject} title="New Project">New</button>
        <button className="btn btn-sm" onClick={onSaveProject} title="Save (Ctrl+S)">Save</button>
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

      <div className="toolbar-group">
        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cell:</label>
        <select value={editorState.brushValue}
          onChange={(e) => onBrushChange(parseInt(e.target.value, 10))}
          disabled={isPlaying}
          style={{ padding: '2px 4px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3, fontSize: 11 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(v => (
            <option key={v} value={v}>Type {v}</option>
          ))}
        </select>
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
