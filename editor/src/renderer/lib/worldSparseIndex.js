export const WORLD_CHUNK_SIZE = 32;

function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

export function buildWorldSparseIndex(world, createEntry) {
  const grid = Array.isArray(world && world.grid) ? world.grid : [];
  const rows = Number.isFinite(world && world.rows) ? world.rows : grid.length;
  const cols = Number.isFinite(world && world.cols) ? world.cols : ((grid[0] && grid[0].length) || 0);
  const offsetX = Number.isFinite(world && world.offsetX) ? world.offsetX : 0;
  const offsetY = Number.isFinite(world && world.offsetY) ? world.offsetY : 0;

  const chunks = new Map();
  for (let ly = 0; ly < rows; ly += 1) {
    const row = grid[ly] || [];
    for (let lx = 0; lx < cols; lx += 1) {
      const cell = row[lx];
      const entry = createEntry(cell);
      if (!entry) continue;
      const wx = offsetX + lx;
      const wy = offsetY + ly;
      const cx = Math.floor(wx / WORLD_CHUNK_SIZE);
      const cy = Math.floor(wy / WORLD_CHUNK_SIZE);
      const key = chunkKey(cx, cy);
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push({ x: wx, y: wy, ...entry });
    }
  }

  return {
    chunkSize: WORLD_CHUNK_SIZE,
    chunks,
    cols,
    rows,
    offsetX,
    offsetY,
  };
}

export function queryWorldSparseIndex(index, minX, minY, maxX, maxY) {
  if (!index || !index.chunks || index.chunks.size === 0) return [];
  const cs = index.chunkSize || WORLD_CHUNK_SIZE;
  const minCx = Math.floor(minX / cs);
  const minCy = Math.floor(minY / cs);
  const maxCx = Math.floor(maxX / cs);
  const maxCy = Math.floor(maxY / cs);
  const out = [];

  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      const cells = index.chunks.get(chunkKey(cx, cy));
      if (!cells || cells.length === 0) continue;
      for (const cell of cells) {
        if (cell.x < minX || cell.x > maxX || cell.y < minY || cell.y > maxY) continue;
        out.push(cell);
      }
    }
  }
  return out;
}
