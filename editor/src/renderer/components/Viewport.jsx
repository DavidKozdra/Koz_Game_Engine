import React, { useRef, useEffect, useCallback } from 'react';
import { getCellType, normalizeCellTypeId, getBrushValue } from '../state/projectModel.js';

/**
 * 2D Canvas viewport for world editing.
 * Renders grid, tiles, elements, and game objects.
 * Handles mouse input for painting, selection, and camera.
 */
export default function Viewport({ project, editorState, onCellPaint, onCellFill, onSelectObject, onPlaceObject, onMoveObject, onUpdateCamera }) {
  const canvasRef = useRef(null);
  const dragRef = useRef({ dragging: false, button: -1, startX: 0, startY: 0, lastX: 0, lastY: 0 });
  const imageCacheRef = useRef(new Map());

  const cellSize = 24;

  const worldToScreen = useCallback((wx, wy) => {
    const cam = editorState.camera;
    return {
      x: (wx - cam.x) * cam.zoom,
      y: (wy - cam.y) * cam.zoom,
    };
  }, [editorState.camera]);

  const screenToWorld = useCallback((sx, sy) => {
    const cam = editorState.camera;
    return {
      x: sx / cam.zoom + cam.x,
      y: sy / cam.zoom + cam.y,
    };
  }, [editorState.camera]);

  const screenToCell = useCallback((sx, sy) => {
    const world = screenToWorld(sx, sy);
    return {
      cx: Math.floor(world.x / cellSize),
      cy: Math.floor(world.y / cellSize),
    };
  }, [screenToWorld]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const cam = editorState.camera;
    const zoom = cam.zoom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-cam.x * zoom, -cam.y * zoom);
    ctx.scale(zoom, zoom);

    const world = project.world;
    const cols = Number.isFinite(world.cols) ? world.cols : ((world.grid && world.grid[0] && world.grid[0].length) || 0);
    const rows = Number.isFinite(world.rows) ? world.rows : ((world.grid && world.grid.length) || 0);
    const offsetX = Number.isFinite(world.offsetX) ? world.offsetX : 0;
    const offsetY = Number.isFinite(world.offsetY) ? world.offsetY : 0;
    const viewMinX = Math.floor(cam.x / cellSize) - 1;
    const viewMinY = Math.floor(cam.y / cellSize) - 1;
    const viewMaxX = Math.ceil((cam.x + canvas.width / zoom) / cellSize) + 1;
    const viewMaxY = Math.ceil((cam.y + canvas.height / zoom) / cellSize) + 1;

    const cellLayers = ((project.layers && project.layers.cells) || [])
      .slice()
      .filter((layer) => layer.visible !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const baseLayerId = cellLayers[0] ? cellLayers[0].id : null;

    ctx.fillStyle = '#111827';
    ctx.fillRect(
      viewMinX * cellSize,
      viewMinY * cellSize,
      (viewMaxX - viewMinX + 1) * cellSize,
      (viewMaxY - viewMinY + 1) * cellSize,
    );

    const worldMinX = offsetX;
    const worldMinY = offsetY;
    const worldMaxX = offsetX + cols - 1;
    const worldMaxY = offsetY + rows - 1;
    const drawMinX = Math.max(viewMinX, worldMinX);
    const drawMinY = Math.max(viewMinY, worldMinY);
    const drawMaxX = Math.min(viewMaxX, worldMaxX);
    const drawMaxY = Math.min(viewMaxY, worldMaxY);

    if (drawMinX <= drawMaxX && drawMinY <= drawMaxY) {
      const cellsByLayer = new Map();
      for (let y = drawMinY; y <= drawMaxY; y += 1) {
        const ly = y - offsetY;
        const row = world.grid[ly] || [];
        for (let x = drawMinX; x <= drawMaxX; x += 1) {
          const lx = x - offsetX;
          const cell = row[lx];
          if (normalizeCellTypeId(cell) === 'empty') continue;
          const type = getCellType(project, cell);
          const layerId = type.layerId || baseLayerId;
          if (!cellsByLayer.has(layerId)) cellsByLayer.set(layerId, []);
          cellsByLayer.get(layerId).push({ x, y, type });
        }
      }

      for (const layer of cellLayers) {
        const entries = cellsByLayer.get(layer.id);
        if (!entries || entries.length === 0) continue;
        for (const entry of entries) {
          const px = entry.x * cellSize;
          const py = entry.y * cellSize;
          ctx.fillStyle = entry.type.color || '#334155';
          ctx.fillRect(px, py, cellSize, cellSize);
          if (entry.type.collision) {
            ctx.strokeStyle = 'rgba(239,68,68,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
          }
        }
      }
    }

    // Draw grid lines
    if (editorState.gridVisible) {
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
      ctx.lineWidth = 0.5;
      for (let x = viewMinX; x <= viewMaxX + 1; x += 1) {
        ctx.beginPath();
        ctx.moveTo(x * cellSize, viewMinY * cellSize);
        ctx.lineTo(x * cellSize, (viewMaxY + 1) * cellSize);
        ctx.stroke();
      }
      for (let y = viewMinY; y <= viewMaxY + 1; y += 1) {
        ctx.beginPath();
        ctx.moveTo(viewMinX * cellSize, y * cellSize);
        ctx.lineTo((viewMaxX + 1) * cellSize, y * cellSize);
        ctx.stroke();
      }
    }

    // Draw world elements
    if (world.elements) {
      for (const el of world.elements) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(el.x * cellSize + 2, el.y * cellSize + 2, cellSize - 4, cellSize - 4);
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(el.kind[0].toUpperCase(), el.x * cellSize + cellSize / 2, el.y * cellSize + cellSize / 2 + 3);
      }
    }

    // Draw game objects
    if (project.objects) {
      const assetById = new Map((project.assets || []).map((a) => [a.id, a]));
      const objectLayers = ((project.layers && project.layers.objects) || [])
        .filter((layer) => layer.visible !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      const objects = project.objects.slice().sort((a, b) => {
        const ar = (a.components && a.components.Render) || {};
        const br = (b.components && b.components.Render) || {};
        const ao = objectLayers.find((l) => l.id === ar.layerId);
        const bo = objectLayers.find((l) => l.id === br.layerId);
        const layerDelta = ((ao && ao.order) || 0) - ((bo && bo.order) || 0);
        if (layerDelta !== 0) return layerDelta;
        return (ar.zIndex || 0) - (br.zIndex || 0);
      });
      for (const obj of objects) {
        const sprite = (obj.components && obj.components.Sprite) || {};
        const transform = (obj.components && obj.components.Transform) || {};
        const render = (obj.components && obj.components.Render) || {};
        if (render.visible === false) continue;
        const ox = (transform.x || obj.x || 0);
        const oy = (transform.y || obj.y || 0);
        const w = sprite.width || 32;
        const h = sprite.height || 32;
        let drawn = false;
        const frameIds = Array.isArray(sprite.frameAssetIds) ? sprite.frameAssetIds : [];
        const frameId = frameIds.length > 0
          ? frameIds[Math.floor((performance.now() / 1000) * (sprite.fps || 8)) % frameIds.length]
          : sprite.assetId;
        const asset = frameId ? assetById.get(frameId) : null;
        const sourceAsset = asset && asset.sourceAssetId ? assetById.get(asset.sourceAssetId) : null;
        const src = (sourceAsset && (sourceAsset.previewUrl || sourceAsset.url || sourceAsset.src))
          || (asset && (asset.previewUrl || asset.url || asset.src));
        if (src) {
          if (!imageCacheRef.current.has(src)) {
            const img = new Image();
            img.src = src;
            imageCacheRef.current.set(src, img);
          }
          const img = imageCacheRef.current.get(src);
          if (img && img.complete && img.naturalWidth > 0) {
            const rect = asset && asset.frameRect;
            if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.w) && Number.isFinite(rect.h)) {
              ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, ox, oy, w, h);
            } else {
              ctx.drawImage(img, ox, oy, w, h);
            }
            drawn = true;
          }
        }
        if (!drawn) {
          ctx.fillStyle = sprite.color || '#4ade80';
          ctx.fillRect(ox, oy, w, h);
        }

        // Selection highlight
        if (editorState.selectedObjectId === obj.id) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.strokeRect(ox - 1, oy - 1, w + 2, h + 2);
        }

        // Name label
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(obj.name || obj.id, ox + w / 2, oy - 4);
      }
    }

    ctx.restore();

    // Cursor position indicator
    const mousePos = dragRef.current;
    if (mousePos.lastScreenX !== undefined) {
      const cell = screenToCell(mousePos.lastScreenX, mousePos.lastScreenY);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      const screenPos = worldToScreen(cell.cx * cellSize, cell.cy * cellSize);
      ctx.fillRect(screenPos.x, screenPos.y, cellSize * zoom, cellSize * zoom);
    }
  }, [project, editorState, worldToScreen, screenToCell]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const observer = new ResizeObserver(() => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  function handleMouseDown(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    dragRef.current = { dragging: true, button: e.button, startX: sx, startY: sy, lastX: sx, lastY: sy, lastScreenX: sx, lastScreenY: sy };

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or alt+click = pan
      return;
    }

    if (e.button === 0) {
      const cell = screenToCell(sx, sy);

      if (editorState.activeTool === 'brush') {
        if (onCellPaint) onCellPaint(cell.cx, cell.cy, getBrushValue(editorState));
      } else if (editorState.activeTool === 'fill') {
        if (onCellFill) onCellFill(cell.cx, cell.cy, getBrushValue(editorState));
      } else if (editorState.activeTool === 'erase') {
        if (onCellPaint) onCellPaint(cell.cx, cell.cy, 'empty');
      } else if (editorState.activeTool === 'select') {
        // Check if clicking on a game object
        const worldPos = screenToWorld(sx, sy);
        let found = null;
        if (project && project.objects) {
          for (const obj of project.objects) {
            const t = (obj.components && obj.components.Transform) || {};
            const s = (obj.components && obj.components.Sprite) || {};
            const ox = t.x || obj.x || 0;
            const oy = t.y || obj.y || 0;
            const w = s.width || 32;
            const h = s.height || 32;
            if (worldPos.x >= ox && worldPos.x <= ox + w && worldPos.y >= oy && worldPos.y <= oy + h) {
              found = obj;
            }
          }
        }
        if (onSelectObject) onSelectObject(found ? found.id : null);
      } else if (editorState.activeTool === 'place') {
        const worldPos = screenToWorld(sx, sy);
        if (onPlaceObject) onPlaceObject(Math.floor(worldPos.x), Math.floor(worldPos.y));
      }
    }
  }

  function handleMouseMove(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    dragRef.current.lastScreenX = sx;
    dragRef.current.lastScreenY = sy;

    if (!dragRef.current.dragging) return;

    const dx = sx - dragRef.current.lastX;
    const dy = sy - dragRef.current.lastY;
    dragRef.current.lastX = sx;
    dragRef.current.lastY = sy;

    // Pan with middle mouse or alt+left
    if (dragRef.current.button === 1 || (dragRef.current.button === 0 && e.altKey)) {
      const cam = editorState.camera;
      if (onUpdateCamera) {
        onUpdateCamera({
          x: cam.x - dx / cam.zoom,
          y: cam.y - dy / cam.zoom,
          zoom: cam.zoom,
        });
      }
      return;
    }

    // Drag painting
    if (dragRef.current.button === 0) {
      const cell = screenToCell(sx, sy);
      if (editorState.activeTool === 'brush') {
        if (onCellPaint) onCellPaint(cell.cx, cell.cy, getBrushValue(editorState));
      } else if (editorState.activeTool === 'erase') {
        if (onCellPaint) onCellPaint(cell.cx, cell.cy, 'empty');
      } else if (editorState.activeTool === 'select' && editorState.selectedObjectId) {
        // Drag to move selected object
        const worldPos = screenToWorld(sx, sy);
        if (onMoveObject) onMoveObject(editorState.selectedObjectId, Math.floor(worldPos.x), Math.floor(worldPos.y));
      }
    }
  }

  function handleMouseUp() {
    dragRef.current.dragging = false;
  }

  function handleWheel(e) {
    const cam = editorState.camera;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.25, Math.min(4, cam.zoom * zoomFactor));
    if (onUpdateCamera) {
      onUpdateCamera({ ...cam, zoom: newZoom });
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="viewport-canvas"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
