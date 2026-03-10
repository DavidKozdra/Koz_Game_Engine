/**
 * Transform gizmos for the 2D viewport editor.
 * Provides move, rotate, and scale handles that render on the canvas
 * and support hit-testing for interactive manipulation.
 */

const AXIS_LENGTH = 60;
const ARROW_SIZE = 10;
const CENTER_SIZE = 10;
const SCALE_HANDLE_SIZE = 8;
const ROTATE_RADIUS = 45;
const ROTATE_HANDLE_SIZE = 8;
const HIT_TOLERANCE = 8;

const COLORS = {
  xAxis: '#ef4444',       // red
  xAxisHover: '#fca5a5',
  yAxis: '#22c55e',       // green
  yAxisHover: '#86efac',
  center: '#facc15',      // yellow
  centerHover: '#fef08a',
  rotate: '#a78bfa',      // purple
  rotateHover: '#c4b5fd',
};

/**
 * Compute the bounding box center of selected objects.
 * Returns { cx, cy, minX, minY, maxX, maxY } in world coords.
 */
export function getSelectionBounds(objects, selectedIds) {
  if (!objects || !selectedIds || selectedIds.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  for (const obj of objects) {
    if (!selectedIds.includes(obj.id)) continue;
    const t = (obj.components && obj.components.Transform) || {};
    const s = (obj.components && obj.components.Sprite) || {};
    const ox = Number.isFinite(t.x) ? t.x : (Number.isFinite(obj.x) ? obj.x : 0);
    const oy = Number.isFinite(t.y) ? t.y : (Number.isFinite(obj.y) ? obj.y : 0);
    const w = s.width || 32;
    const h = s.height || 32;
    minX = Math.min(minX, ox);
    minY = Math.min(minY, oy);
    maxX = Math.max(maxX, ox + w);
    maxY = Math.max(maxY, oy + h);
    count++;
  }
  if (count === 0) return null;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, minX, minY, maxX, maxY };
}

/**
 * Get rotation of a single selected object (for the rotate gizmo).
 */
export function getSelectionRotation(objects, selectedIds) {
  if (!objects || !selectedIds || selectedIds.length !== 1) return 0;
  const obj = objects.find(o => o.id === selectedIds[0]);
  if (!obj) return 0;
  const t = (obj.components && obj.components.Transform) || {};
  return Number.isFinite(t.rotation) ? t.rotation : 0;
}

/**
 * Draw the move gizmo (two axis arrows + center handle).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - center x in screen space
 * @param {number} cy - center y in screen space
 * @param {number} zoom
 * @param {string|null} hoveredPart - 'x', 'y', 'center', or null
 */
export function drawMoveGizmo(ctx, cx, cy, zoom, hoveredPart) {
  const len = AXIS_LENGTH;
  const arrow = ARROW_SIZE;
  const cs = CENTER_SIZE;

  ctx.save();
  ctx.lineWidth = 2;

  // X axis arrow (right)
  ctx.strokeStyle = hoveredPart === 'x' ? COLORS.xAxisHover : COLORS.xAxis;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + len, cy);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(cx + len + arrow, cy);
  ctx.lineTo(cx + len - 2, cy - arrow / 2);
  ctx.lineTo(cx + len - 2, cy + arrow / 2);
  ctx.closePath();
  ctx.fill();

  // Y axis arrow (down, since canvas Y is down)
  ctx.strokeStyle = hoveredPart === 'y' ? COLORS.yAxisHover : COLORS.yAxis;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + len);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(cx, cy + len + arrow);
  ctx.lineTo(cx - arrow / 2, cy + len - 2);
  ctx.lineTo(cx + arrow / 2, cy + len - 2);
  ctx.closePath();
  ctx.fill();

  // Center handle (square)
  ctx.fillStyle = hoveredPart === 'center' ? COLORS.centerHover : COLORS.center;
  ctx.fillRect(cx - cs / 2, cy - cs / 2, cs, cs);

  // XY plane indicator (small square in corner)
  ctx.fillStyle = hoveredPart === 'xy' ? 'rgba(250, 204, 21, 0.5)' : 'rgba(250, 204, 21, 0.25)';
  ctx.fillRect(cx, cy, 20, 20);
  ctx.strokeStyle = hoveredPart === 'xy' ? COLORS.centerHover : COLORS.center;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx, cy, 20, 20);

  ctx.restore();
}

/**
 * Draw the rotate gizmo (circle with handle).
 */
export function drawRotateGizmo(ctx, cx, cy, zoom, rotation, hoveredPart) {
  const r = ROTATE_RADIUS;
  const hs = ROTATE_HANDLE_SIZE;

  ctx.save();

  // Circle
  ctx.strokeStyle = hoveredPart === 'ring' ? COLORS.rotateHover : COLORS.rotate;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Rotation indicator line
  const rad = (rotation || 0) * Math.PI / 180;
  const hx = cx + Math.cos(rad) * r;
  const hy = cy + Math.sin(rad) * r;
  ctx.strokeStyle = COLORS.rotate;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(hx, hy);
  ctx.stroke();

  // Handle
  ctx.fillStyle = hoveredPart === 'ring' ? COLORS.rotateHover : COLORS.rotate;
  ctx.beginPath();
  ctx.arc(hx, hy, hs, 0, Math.PI * 2);
  ctx.fill();

  // Center dot
  ctx.fillStyle = COLORS.center;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw the scale gizmo (two axis lines with square handles + center).
 */
export function drawScaleGizmo(ctx, cx, cy, zoom, hoveredPart) {
  const len = AXIS_LENGTH;
  const hs = SCALE_HANDLE_SIZE;
  const cs = CENTER_SIZE;

  ctx.save();
  ctx.lineWidth = 2;

  // X axis
  ctx.strokeStyle = hoveredPart === 'x' ? COLORS.xAxisHover : COLORS.xAxis;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + len, cy);
  ctx.stroke();
  ctx.fillRect(cx + len - hs / 2, cy - hs / 2, hs, hs);

  // Y axis
  ctx.strokeStyle = hoveredPart === 'y' ? COLORS.yAxisHover : COLORS.yAxis;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + len);
  ctx.stroke();
  ctx.fillRect(cx - hs / 2, cy + len - hs / 2, hs, hs);

  // Center (uniform scale)
  ctx.fillStyle = hoveredPart === 'center' ? COLORS.centerHover : COLORS.center;
  ctx.fillRect(cx - cs / 2, cy - cs / 2, cs, cs);

  ctx.restore();
}

/**
 * Hit-test the move gizmo. Returns 'x', 'y', 'xy', 'center', or null.
 */
export function hitTestMoveGizmo(sx, sy, cx, cy) {
  const tol = HIT_TOLERANCE;
  const cs = CENTER_SIZE;

  // Center handle
  if (Math.abs(sx - cx) <= cs / 2 + tol && Math.abs(sy - cy) <= cs / 2 + tol) {
    return 'center';
  }

  // XY plane handle
  if (sx >= cx && sx <= cx + 20 + tol && sy >= cy && sy <= cy + 20 + tol) {
    return 'xy';
  }

  // X axis
  if (sx >= cx - tol && sx <= cx + AXIS_LENGTH + ARROW_SIZE + tol && Math.abs(sy - cy) <= tol) {
    return 'x';
  }

  // Y axis
  if (sy >= cy - tol && sy <= cy + AXIS_LENGTH + ARROW_SIZE + tol && Math.abs(sx - cx) <= tol) {
    return 'y';
  }

  return null;
}

/**
 * Hit-test the rotate gizmo. Returns 'ring' or null.
 */
export function hitTestRotateGizmo(sx, sy, cx, cy) {
  const dist = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
  if (Math.abs(dist - ROTATE_RADIUS) <= HIT_TOLERANCE + 4) {
    return 'ring';
  }
  return null;
}

/**
 * Hit-test the scale gizmo. Returns 'x', 'y', 'center', or null.
 */
export function hitTestScaleGizmo(sx, sy, cx, cy) {
  const tol = HIT_TOLERANCE;
  const cs = CENTER_SIZE;
  const hs = SCALE_HANDLE_SIZE;

  // Center handle
  if (Math.abs(sx - cx) <= cs / 2 + tol && Math.abs(sy - cy) <= cs / 2 + tol) {
    return 'center';
  }

  // X axis handle
  const xEnd = cx + AXIS_LENGTH;
  if (Math.abs(sx - xEnd) <= hs / 2 + tol && Math.abs(sy - cy) <= hs / 2 + tol) {
    return 'x';
  }

  // X axis line
  if (sx >= cx && sx <= cx + AXIS_LENGTH + tol && Math.abs(sy - cy) <= tol) {
    return 'x';
  }

  // Y axis handle
  const yEnd = cy + AXIS_LENGTH;
  if (Math.abs(sx - cx) <= hs / 2 + tol && Math.abs(sy - yEnd) <= hs / 2 + tol) {
    return 'y';
  }

  // Y axis line
  if (sy >= cy && sy <= cy + AXIS_LENGTH + tol && Math.abs(sx - cx) <= tol) {
    return 'y';
  }

  return null;
}
