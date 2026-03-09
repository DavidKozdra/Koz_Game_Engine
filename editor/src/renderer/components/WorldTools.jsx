import React from 'react';

export default function WorldTools({ project, editorState, onUpdateCamera, onToggleGrid }) {
  if (!project) return null;

  const world = project.world;

  return (
    <div className="panel-section">
      <h3>World</h3>
      <div className="field">
        <label>Size</label>
        <span style={{ fontSize: 11 }}>{world.cols} x {world.rows}</span>
      </div>
      <div className="field">
        <label>Elements</label>
        <span style={{ fontSize: 11 }}>{(world.elements || []).length}</span>
      </div>
      <div className="field">
        <label>Zoom</label>
        <span style={{ fontSize: 11 }}>{(editorState.camera.zoom * 100).toFixed(0)}%</span>
      </div>
      <div className="field">
        <label>Cam Speed</label>
        <span style={{ fontSize: 11 }}>{(project.camera && project.camera.speed) || 8}</span>
      </div>
      <div className="field">
        <label>Target</label>
        <span style={{ fontSize: 11 }}>{project.camera && project.camera.targetObjectId ? project.camera.targetObjectId : 'None'}</span>
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
        <button className="btn btn-sm" onClick={() => onUpdateCamera({ ...editorState.camera, zoom: 1, x: 0, y: 0 })}>
          Reset View
        </button>
        <button className={`btn btn-sm ${editorState.gridVisible ? 'active' : ''}`} onClick={onToggleGrid}>
          Grid
        </button>
      </div>
    </div>
  );
}
