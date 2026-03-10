import React, { useRef, useEffect, useCallback, useState } from 'react';
import { getCellType, normalizeCellTypeId, getBrushValue } from '../state/projectModel.js';
import { buildWorldSparseIndex, queryWorldSparseIndex } from '../lib/worldSparseIndex.js';
import {
  getSelectionBounds, getSelectionRotation,
  drawMoveGizmo, drawRotateGizmo, drawScaleGizmo,
  hitTestMoveGizmo, hitTestRotateGizmo, hitTestScaleGizmo,
} from '../lib/gizmos.js';

/**
 * 2D Canvas viewport for world editing.
 * Renders grid, tiles, elements, and game objects.
 * Handles mouse input for painting, selection, and camera.
 */
export default function Viewport({ project, editorState, onCellPaint, onCellFill, onSelectObject, onSelectObjects, onPlaceObject, onMoveObject, onMoveObjects, onMoveWorld, onUpdateCamera, onRotateObject, onScaleObject, onDropAsset }) {
  const canvasRef = useRef(null);
  const dragRef = useRef({ dragging: false, button: -1, startX: 0, startY: 0, lastX: 0, lastY: 0 });
  const imageCacheRef = useRef(new Map());
  const sparseRef = useRef({ world: null, cellTypes: null, index: null });
  const [canvasSize, setCanvasSize] = useState(0);
  const [hoveredGizmoPart, setHoveredGizmoPart] = useState(null);

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
      const assetById = new Map(((project.assets || []).map((a) => [a.id, a])));
      if (sparseRef.current.world !== world || sparseRef.current.cellTypes !== project.cellTypes) {
        sparseRef.current = {
          world,
          cellTypes: project.cellTypes,
          index: buildWorldSparseIndex(world, (cell) => {
            if (normalizeCellTypeId(cell) === 'empty') return null;
            const type = getCellType(project, cell);
            return {
              type,
              layerId: type.layerId || baseLayerId,
            };
          }),
        };
      }

      const visibleCells = queryWorldSparseIndex(sparseRef.current.index, drawMinX, drawMinY, drawMaxX, drawMaxY);
      const cellsByLayer = new Map();
      for (const entry of visibleCells) {
        if (!cellsByLayer.has(entry.layerId)) cellsByLayer.set(entry.layerId, []);
        cellsByLayer.get(entry.layerId).push(entry);
      }

      for (const layer of cellLayers) {
        const entries = cellsByLayer.get(layer.id);
        if (!entries || entries.length === 0) continue;
        for (const entry of entries) {
          const px = entry.x * cellSize;
          const py = entry.y * cellSize;
          let drawn = false;
          const imgAssetId = entry.type.imageAssetId;
          if (imgAssetId) {
            const asset = assetById.get(imgAssetId);
            const src = asset && (asset.previewUrl || asset.url || asset.src);
            if (src) {
              if (!imageCacheRef.current.has(src)) {
                const img = new Image();
                img.src = src;
                imageCacheRef.current.set(src, img);
              }
              const img = imageCacheRef.current.get(src);
              if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, px, py, cellSize, cellSize);
                drawn = true;
              }
            }
          }
          if (!drawn) {
            ctx.fillStyle = entry.type.color || '#334155';
            ctx.fillRect(px, py, cellSize, cellSize);
          }
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

    // Draw origin crosshair at (0,0)
    {
      const originX = 0;
      const originY = 0;
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      // Horizontal line spanning visible area
      ctx.beginPath();
      ctx.moveTo(viewMinX * cellSize, originY);
      ctx.lineTo((viewMaxX + 1) * cellSize, originY);
      ctx.stroke();
      // Vertical line spanning visible area
      ctx.beginPath();
      ctx.moveTo(originX, viewMinY * cellSize);
      ctx.lineTo(originX, (viewMaxY + 1) * cellSize);
      ctx.stroke();
      ctx.setLineDash([]);
      // Small crosshair marker at exact origin
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
      ctx.lineWidth = 2;
      const m = 8;
      ctx.beginPath();
      ctx.moveTo(-m, 0); ctx.lineTo(m, 0);
      ctx.moveTo(0, -m); ctx.lineTo(0, m);
      ctx.stroke();
      // Label
      ctx.fillStyle = 'rgba(250, 204, 21, 0.7)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('(0, 0)', 4, -4);
      ctx.restore();
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
        const ox = Number.isFinite(transform.x) ? transform.x : (Number.isFinite(obj.x) ? obj.x : 0);
        const oy = Number.isFinite(transform.y) ? transform.y : (Number.isFinite(obj.y) ? obj.y : 0);
        const rotation = Number.isFinite(transform.rotation) ? transform.rotation : 0;
        const scaleX = Number.isFinite(transform.scaleX) ? transform.scaleX : 1;
        const scaleY = Number.isFinite(transform.scaleY) ? transform.scaleY : 1;
        const w = (sprite.width || 32) * scaleX;
        const h = (sprite.height || 32) * scaleY;
        let drawn = false;
        const frameIds = Array.isArray(sprite.frameAssetIds) ? sprite.frameAssetIds : [];
        const frameId = frameIds.length > 0
          ? frameIds[Math.floor((performance.now() / 1000) * (sprite.fps || 8)) % frameIds.length]
          : sprite.assetId;
        const asset = frameId ? assetById.get(frameId) : null;
        const sourceAsset = asset && asset.sourceAssetId ? assetById.get(asset.sourceAssetId) : null;
        const src = (sourceAsset && (sourceAsset.previewUrl || sourceAsset.url || sourceAsset.src))
          || (asset && (asset.previewUrl || asset.url || asset.src));
        
        ctx.save();
        ctx.translate(ox + w / 2, oy + h / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        
        if (src) {
          if (!imageCacheRef.current.has(src)) {
            const img = new Image();
            img.src = src;
            imageCacheRef.current.set(src, img);
          }
          const img = imageCacheRef.current.get(src);
          if (img && img.complete && img.naturalWidth > 0) {
            const rect = asset && asset.frameRect;
            const drawW = sprite.width || 32;
            const drawH = sprite.height || 32;
            if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.w) && Number.isFinite(rect.h)) {
              ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, -drawW / 2, -drawH / 2, drawW, drawH);
            } else {
              ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
            }
            drawn = true;
          }
        }
        if (!drawn) {
          ctx.fillStyle = sprite.color || '#4ade80';
          ctx.fillRect(-(sprite.width || 32) / 2, -(sprite.height || 32) / 2, sprite.width || 32, sprite.height || 32);
        }
        ctx.restore();

        // Selection highlight (in world space, accounting for transform)
        const isSelected = (editorState.selectedObjectIds || []).includes(obj.id) || editorState.selectedObjectId === obj.id;
        if (isSelected) {
          ctx.save();
          ctx.translate(ox + w / 2, oy + h / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2 / zoom;
          ctx.strokeRect(-(sprite.width || 32) / 2 - 1, -(sprite.height || 32) / 2 - 1, (sprite.width || 32) + 2, (sprite.height || 32) + 2);
          ctx.restore();
        }

        // Name label
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(obj.name || obj.id, ox + w / 2, oy - 4);
      }

    ctx.restore();

    // Draw transform gizmos (in screen space, after ctx.restore)
    const gizmoMode = editorState.gizmoMode || 'move';
    const selectedIds = Array.isArray(editorState.selectedObjectIds) && editorState.selectedObjectIds.length > 0
      ? editorState.selectedObjectIds
      : (editorState.selectedObjectId ? [editorState.selectedObjectId] : []);
    if (selectedIds.length > 0 && editorState.activeTool === 'select' && project.objects) {
      const bounds = getSelectionBounds(project.objects, selectedIds);
      if (bounds) {
        const screenCenter = worldToScreen(bounds.cx, bounds.cy);
        if (gizmoMode === 'move') {
          drawMoveGizmo(ctx, screenCenter.x, screenCenter.y, zoom, hoveredGizmoPart);
        } else if (gizmoMode === 'rotate') {
          const rot = getSelectionRotation(project.objects, selectedIds);
          drawRotateGizmo(ctx, screenCenter.x, screenCenter.y, zoom, rot, hoveredGizmoPart);
        } else if (gizmoMode === 'scale') {
          drawScaleGizmo(ctx, screenCenter.x, screenCenter.y, zoom, hoveredGizmoPart);
        }
      }
    }

    // Cursor position indicator
    const mousePos = dragRef.current;
    if (mousePos.lastScreenX !== undefined) {
      const cell = screenToCell(mousePos.lastScreenX, mousePos.lastScreenY);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      const screenPos = worldToScreen(cell.cx * cellSize, cell.cy * cellSize);
      ctx.fillRect(screenPos.x, screenPos.y, cellSize * zoom, cellSize * zoom);
    }
    if (dragRef.current.selectMarquee && dragRef.current.startX !== undefined) {
      const sx = dragRef.current.startX;
      const sy = dragRef.current.startY;
      const ex = dragRef.current.lastX;
      const ey = dragRef.current.lastY;
      const rx = Math.min(sx, ex);
      const ry = Math.min(sy, ey);
      const rw = Math.abs(ex - sx);
      const rh = Math.abs(ey - sy);
      ctx.strokeStyle = 'rgba(59,130,246,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = 'rgba(59,130,246,0.12)';
      ctx.fillRect(rx, ry, rw, rh);
    }
  }

  }, [project, editorState, worldToScreen, screenToCell, canvasSize, hoveredGizmoPart]);

  // Resize observer — also triggers a repaint when canvas becomes visible again
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const observer = new ResizeObserver(() => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
        setCanvasSize(w + h);
      }
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  function handleMouseDown(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    dragRef.current = {
      dragging: true, button: e.button, startX: sx, startY: sy, lastX: sx, lastY: sy, lastScreenX: sx, lastScreenY: sy,
      selectDrag: false, selectMarquee: false, selectShift: !!e.shiftKey, selectStartWorld: null, selectStartPositions: null,
    };

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or alt+click = pan
      return;
    }

    if (e.button === 0) {
      const cell = screenToCell(sx, sy);

      // Check for gizmo interaction first
      if (editorState.activeTool === 'select') {
        const sIds = Array.isArray(editorState.selectedObjectIds) && editorState.selectedObjectIds.length > 0
          ? editorState.selectedObjectIds
          : (editorState.selectedObjectId ? [editorState.selectedObjectId] : []);
        if (sIds.length > 0 && project && project.objects) {
          const bounds = getSelectionBounds(project.objects, sIds);
          if (bounds) {
            const sc = worldToScreen(bounds.cx, bounds.cy);
            const gizmoMode = editorState.gizmoMode || 'move';
            let gizmoPart = null;
            if (gizmoMode === 'move') gizmoPart = hitTestMoveGizmo(sx, sy, sc.x, sc.y);
            else if (gizmoMode === 'rotate') gizmoPart = hitTestRotateGizmo(sx, sy, sc.x, sc.y);
            else if (gizmoMode === 'scale') gizmoPart = hitTestScaleGizmo(sx, sy, sc.x, sc.y);

            if (gizmoPart) {
              const worldPos = screenToWorld(sx, sy);
              const startPositions = new Map();
              for (const obj of (project.objects || [])) {
                if (!sIds.includes(obj.id)) continue;
                const t = (obj.components && obj.components.Transform) || {};
                startPositions.set(obj.id, {
                  x: Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0),
                  y: Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0),
                  rotation: Number.isFinite(t.rotation) ? t.rotation : 0,
                  scaleX: Number.isFinite(t.scaleX) ? t.scaleX : 1,
                  scaleY: Number.isFinite(t.scaleY) ? t.scaleY : 1,
                });
              }
              dragRef.current.gizmoDrag = true;
              dragRef.current.gizmoMode = gizmoMode;
              dragRef.current.gizmoPart = gizmoPart;
              dragRef.current.gizmoStartWorld = worldPos;
              dragRef.current.gizmoStartScreen = { x: sx, y: sy };
              dragRef.current.gizmoCenter = bounds;
              dragRef.current.gizmoStartPositions = startPositions;
              dragRef.current.gizmoStartAngle = Math.atan2(sy - sc.y, sx - sc.x);
              return;
            }
          }
        }
      }

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
            const ox = Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0);
            const oy = Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0);
            const w = s.width || 32;
            const h = s.height || 32;
            if (worldPos.x >= ox && worldPos.x <= ox + w && worldPos.y >= oy && worldPos.y <= oy + h) {
              found = obj;
            }
          }
        }
        if (found) {
          const current = Array.isArray(editorState.selectedObjectIds) ? editorState.selectedObjectIds : [];
          if (onSelectObject) onSelectObject(found.id, e.shiftKey ? { toggle: true } : undefined);
          const willBeSelected = e.shiftKey ? !current.includes(found.id) : true;
          if (willBeSelected) {
            const selectedIds = e.shiftKey
              ? (current.includes(found.id) ? current.filter((id) => id !== found.id) : [...current, found.id])
              : [found.id];
            const startPositions = new Map();
            for (const obj of (project.objects || [])) {
              if (!selectedIds.includes(obj.id)) continue;
              const t = (obj.components && obj.components.Transform) || {};
              const ox = Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0);
              const oy = Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0);
              startPositions.set(obj.id, { x: ox, y: oy });
            }
            dragRef.current.selectDrag = true;
            dragRef.current.selectStartWorld = worldPos;
            dragRef.current.selectStartPositions = startPositions;
          }
        } else {
          if (!e.shiftKey && onSelectObject) onSelectObject(null);
          dragRef.current.selectMarquee = true;
          dragRef.current.selectShift = !!e.shiftKey;
        }
      } else if (editorState.activeTool === 'place') {
        const worldPos = screenToWorld(sx, sy);
        if (onPlaceObject) onPlaceObject(Math.floor(worldPos.x), Math.floor(worldPos.y));
      } else if (editorState.activeTool === 'worldMove') {
        dragRef.current.worldMove = true;
      }
    }
  }

  function handleMouseMove(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    dragRef.current.lastScreenX = sx;
    dragRef.current.lastScreenY = sy;

    // Gizmo hover detection (even when not dragging)
    if (editorState.activeTool === 'select' && !dragRef.current.dragging) {
      const sIds = Array.isArray(editorState.selectedObjectIds) && editorState.selectedObjectIds.length > 0
        ? editorState.selectedObjectIds
        : (editorState.selectedObjectId ? [editorState.selectedObjectId] : []);
      if (sIds.length > 0 && project && project.objects) {
        const bounds = getSelectionBounds(project.objects, sIds);
        if (bounds) {
          const sc = worldToScreen(bounds.cx, bounds.cy);
          const gizmoMode = editorState.gizmoMode || 'move';
          let part = null;
          if (gizmoMode === 'move') part = hitTestMoveGizmo(sx, sy, sc.x, sc.y);
          else if (gizmoMode === 'rotate') part = hitTestRotateGizmo(sx, sy, sc.x, sc.y);
          else if (gizmoMode === 'scale') part = hitTestScaleGizmo(sx, sy, sc.x, sc.y);
          setHoveredGizmoPart(part);
        } else {
          setHoveredGizmoPart(null);
        }
      } else {
        setHoveredGizmoPart(null);
      }
    }

    if (!dragRef.current.dragging) return;

    const dx = sx - dragRef.current.lastX;
    const dy = sy - dragRef.current.lastY;
    dragRef.current.lastX = sx;
    dragRef.current.lastY = sy;

    // Handle gizmo drag
    if (dragRef.current.gizmoDrag) {
      const worldPos = screenToWorld(sx, sy);
      const startWorld = dragRef.current.gizmoStartWorld;
      const startPositions = dragRef.current.gizmoStartPositions;
      const gMode = dragRef.current.gizmoMode;
      const gPart = dragRef.current.gizmoPart;

      if (gMode === 'move') {
        const dxw = worldPos.x - startWorld.x;
        const dyw = worldPos.y - startWorld.y;
        const updates = [];
        for (const [id, pos] of startPositions.entries()) {
          let nx = pos.x, ny = pos.y;
          if (gPart === 'x') nx = pos.x + dxw;
          else if (gPart === 'y') ny = pos.y + dyw;
          else { nx = pos.x + dxw; ny = pos.y + dyw; }
          // Snap to grid if shift held or snap toggle is on
          if (e.shiftKey || editorState.snapToGrid) {
            nx = Math.round(nx / cellSize) * cellSize;
            ny = Math.round(ny / cellSize) * cellSize;
          }
          updates.push({ id, x: Math.round(nx), y: Math.round(ny) });
        }
        if (updates.length === 1 && onMoveObject) onMoveObject(updates[0].id, updates[0].x, updates[0].y);
        else if (updates.length > 1 && onMoveObjects) onMoveObjects(updates);
      } else if (gMode === 'rotate' && onRotateObject) {
        const center = dragRef.current.gizmoCenter;
        const sc = worldToScreen(center.cx, center.cy);
        const currentAngle = Math.atan2(sy - sc.y, sx - sc.x);
        const deltaAngle = (currentAngle - dragRef.current.gizmoStartAngle) * (180 / Math.PI);
        for (const [id, pos] of startPositions.entries()) {
          let newRotation = pos.rotation + deltaAngle;
          if (e.shiftKey) newRotation = Math.round(newRotation / 15) * 15;
          onRotateObject(id, newRotation);
        }
      } else if (gMode === 'scale' && onScaleObject) {
        const dxw = worldPos.x - startWorld.x;
        const dyw = worldPos.y - startWorld.y;
        for (const [id, pos] of startPositions.entries()) {
          let sx2 = pos.scaleX, sy2 = pos.scaleY;
          const scaleFactor = 0.01;
          if (gPart === 'x' || gPart === 'center') sx2 = pos.scaleX + dxw * scaleFactor;
          if (gPart === 'y' || gPart === 'center') sy2 = pos.scaleY + dyw * scaleFactor;
          if (e.shiftKey) { sx2 = Math.round(sx2 * 10) / 10; sy2 = Math.round(sy2 * 10) / 10; }
          onScaleObject(id, Math.max(0.1, sx2), Math.max(0.1, sy2));
        }
      }
      return;
    }

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
      } else if (editorState.activeTool === 'select' && dragRef.current.selectDrag && dragRef.current.selectStartWorld && dragRef.current.selectStartPositions) {
        const worldPos = screenToWorld(sx, sy);
        const dxw = Math.floor(worldPos.x - dragRef.current.selectStartWorld.x);
        const dyw = Math.floor(worldPos.y - dragRef.current.selectStartWorld.y);
        const updates = [];
        for (const [id, pos] of dragRef.current.selectStartPositions.entries()) {
          updates.push({ id, x: pos.x + dxw, y: pos.y + dyw });
        }
        if (updates.length === 1 && onMoveObject) onMoveObject(updates[0].id, updates[0].x, updates[0].y);
        else if (updates.length > 1 && onMoveObjects) onMoveObjects(updates);
      } else if (editorState.activeTool === 'worldMove' && dragRef.current.worldMove && onMoveWorld) {
        onMoveWorld(dx / editorState.camera.zoom, dy / editorState.camera.zoom);
      }
    }
  }

  function handleMouseUp() {
    if (dragRef.current.gizmoDrag) {
      dragRef.current.gizmoDrag = false;
      dragRef.current.dragging = false;
      return;
    }
    if (dragRef.current.selectMarquee && project && project.objects && onSelectObjects) {
      const sx = dragRef.current.startX;
      const sy = dragRef.current.startY;
      const ex = dragRef.current.lastX;
      const ey = dragRef.current.lastY;
      const minSx = Math.min(sx, ex);
      const minSy = Math.min(sy, ey);
      const maxSx = Math.max(sx, ex);
      const maxSy = Math.max(sy, ey);
      const a = screenToWorld(minSx, minSy);
      const b = screenToWorld(maxSx, maxSy);
      const minWx = Math.min(a.x, b.x);
      const minWy = Math.min(a.y, b.y);
      const maxWx = Math.max(a.x, b.x);
      const maxWy = Math.max(a.y, b.y);
      const ids = [];
      for (const obj of project.objects) {
        const t = (obj.components && obj.components.Transform) || {};
        const s = (obj.components && obj.components.Sprite) || {};
        const ox = Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0);
        const oy = Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0);
        const w = Number.isFinite(s.width) ? s.width : 32;
        const h = Number.isFinite(s.height) ? s.height : 32;
        const overlap = ox <= maxWx && ox + w >= minWx && oy <= maxWy && oy + h >= minWy;
        if (overlap) ids.push(obj.id);
      }
      onSelectObjects(ids, dragRef.current.selectShift);
    }
    dragRef.current.dragging = false;
    dragRef.current.selectDrag = false;
    dragRef.current.selectMarquee = false;
    dragRef.current.worldMove = false;
  }

  // Attach wheel handler imperatively so we can use { passive: false }
  // (React registers wheel as passive by default, blocking preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function handleWheel(e) {
      e.preventDefault();
      const cam = editorState.camera;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.25, Math.min(4, cam.zoom * zoomFactor));
      if (onUpdateCamera) {
        onUpdateCamera({ ...cam, zoom: newZoom });
      }
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [editorState.camera, onUpdateCamera]);

  return (
    <canvas
      ref={canvasRef}
      className="viewport-canvas"
      style={{ cursor: editorState.activeTool === 'worldMove' ? 'grab' : hoveredGizmoPart ? (editorState.gizmoMode === 'rotate' ? 'grab' : 'move') : undefined }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => {
        e.preventDefault();
        const assetId = e.dataTransfer.getData('application/koz-asset-id');
        const assetName = e.dataTransfer.getData('application/koz-asset-name');
        if (assetId && onDropAsset) {
          const rect = canvasRef.current.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const worldPos = screenToWorld(sx, sy);
          onDropAsset(assetId, assetName, Math.floor(worldPos.x), Math.floor(worldPos.y));
        }
      }}
    />
  );
}
