import React, { useEffect, useState } from 'react';

export default function WorldTools({ project, editorState, onUpdateCamera, onToggleGrid, onResizeWorld, onResetView }) {
  if (!project) return null;

  const world = project.world;
  const [colsInput, setColsInput] = useState(String(world.cols || 30));
  const [rowsInput, setRowsInput] = useState(String(world.rows || 20));

  useEffect(() => {
    setColsInput(String(world.cols || 30));
    setRowsInput(String(world.rows || 20));
  }, [world.cols, world.rows]);

  function handleResize() {
    if (!onResizeWorld) return;
    const cols = Math.max(1, parseInt(colsInput, 10) || 1);
    const rows = Math.max(1, parseInt(rowsInput, 10) || 1);
    onResizeWorld(cols, rows);
  }

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
        <button className="btn btn-sm" onClick={() => {
          if (onResetView) onResetView();
          else onUpdateCamera({ ...editorState.camera, zoom: 1, x: 0, y: 0 });
        }}>
          Reset View
        </button>
        <button className={`btn btn-sm ${editorState.gridVisible ? 'active' : ''}`} onClick={onToggleGrid}>
          Grid
        </button>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>Resize</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="number"
            min={1}
            value={colsInput}
            onChange={(e) => setColsInput(e.target.value)}
            style={{ width: 64 }}
          />
          <input
            type="number"
            min={1}
            value={rowsInput}
            onChange={(e) => setRowsInput(e.target.value)}
            style={{ width: 64 }}
          />
          <button className="btn btn-sm" onClick={handleResize}>Apply</button>
        </div>
      </div>
    </div>
  );
}
