import React, { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

export default function WorldTools({ project, editorState, onUpdateCamera, onToggleGrid, onResizeWorld, onResetView }) {
  if (!project) return null;

  const world = project.world;
  const offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
  const pixelWidth = (Number.isFinite(world.cols) ? world.cols : 0) * 24;
  const pixelHeight = (Number.isFinite(world.rows) ? world.rows : 0) * 24;
  const objectCount = Array.isArray(project.objects) ? project.objects.length : 0;
  const resolution = (project.meta && project.meta.resolution) || { width: 960, height: 540 };
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
        <label>Pixels</label>
        <span style={{ fontSize: 11 }}>{pixelWidth} x {pixelHeight}</span>
      </div>
      <div className="field">
        <label>Offset</label>
        <span style={{ fontSize: 11 }}>{offsetX}, {offsetY}</span>
      </div>
      <div className="field">
        <label>Objects</label>
        <span style={{ fontSize: 11 }}>{objectCount}</span>
      </div>
      <div className="field">
        <label>Elements</label>
        <span style={{ fontSize: 11 }}>{(world.elements || []).length}</span>
      </div>
      <div className="field">
        <label>Game View</label>
        <span style={{ fontSize: 11 }}>{resolution.width} x {resolution.height}</span>
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
        }} aria-label="Reset viewport camera">
          <Icon name="reset" />
          Reset View
        </button>
        <button className={`btn btn-sm ${editorState.gridVisible ? 'active' : ''}`} onClick={onToggleGrid} aria-label={editorState.gridVisible ? 'Hide grid' : 'Show grid'}>
          <Icon name="grid" />
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
          <button className="btn btn-sm" onClick={handleResize} aria-label="Apply world resize">
            <Icon name="apply" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
