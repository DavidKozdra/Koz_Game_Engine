export const OBJECT_INDEX_CHUNK_SIZE = 256;

function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

function intersectBounds(bounds, minX, minY, maxX, maxY) {
  if (!bounds) return false;
  return !(bounds.maxX < minX || bounds.minX > maxX || bounds.maxY < minY || bounds.minY > maxY);
}

function boundsEqual(a, b) {
  if (!a || !b) return false;
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

export function getObjectSpatialBounds(object) {
  if (!object || typeof object !== 'object') return null;
  const components = object.components && typeof object.components === 'object' ? object.components : {};
  const transform = components.Transform && typeof components.Transform === 'object' ? components.Transform : {};
  const sprite = components.Sprite && typeof components.Sprite === 'object' ? components.Sprite : {};
  const x = Number.isFinite(object.x) ? object.x : (Number.isFinite(transform.x) ? transform.x : 0);
  const y = Number.isFinite(object.y) ? object.y : (Number.isFinite(transform.y) ? transform.y : 0);
  const rotation = Number.isFinite(object.rotation)
    ? object.rotation
    : (Number.isFinite(transform.rotation) ? transform.rotation : 0);
  const scaleX = Number.isFinite(object.scaleX)
    ? object.scaleX
    : (Number.isFinite(transform.scaleX) ? transform.scaleX : 1);
  const scaleY = Number.isFinite(object.scaleY)
    ? object.scaleY
    : (Number.isFinite(transform.scaleY) ? transform.scaleY : 1);
  const width = Math.max(1, (Number.isFinite(sprite.width) ? sprite.width : 32) * Math.abs(scaleX || 1));
  const height = Math.max(1, (Number.isFinite(sprite.height) ? sprite.height : 32) * Math.abs(scaleY || 1));
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfWidth = ((width * cos) + (height * sin)) * 0.5;
  const halfHeight = ((width * sin) + (height * cos)) * 0.5;
  const centerX = x + (width * 0.5);
  const centerY = y + (height * 0.5);
  return {
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
  };
}

export function createObjectSpatialIndex(chunkSize = OBJECT_INDEX_CHUNK_SIZE) {
  return {
    chunkSize: Math.max(32, Number(chunkSize) || OBJECT_INDEX_CHUNK_SIZE),
    chunks: new Map(),
    entries: new Map(),
  };
}

export function clearObjectSpatialIndex(index) {
  if (!index) return index;
  index.chunks.clear();
  index.entries.clear();
  return index;
}

export function removeObjectSpatialIndexEntry(index, objectId) {
  if (!index || !index.entries) return false;
  const entry = index.entries.get(objectId);
  if (!entry) return false;
  for (let cy = entry.minCY; cy <= entry.maxCY; cy += 1) {
    for (let cx = entry.minCX; cx <= entry.maxCX; cx += 1) {
      const key = chunkKey(cx, cy);
      const bucket = index.chunks.get(key);
      if (!bucket) continue;
      bucket.delete(objectId);
      if (bucket.size === 0) index.chunks.delete(key);
    }
  }
  index.entries.delete(objectId);
  return true;
}

function setObjectSpatialIndexEntry(index, object, bounds) {
  const cs = index.chunkSize || OBJECT_INDEX_CHUNK_SIZE;
  const minCX = Math.floor(bounds.minX / cs);
  const minCY = Math.floor(bounds.minY / cs);
  const maxCX = Math.floor(bounds.maxX / cs);
  const maxCY = Math.floor(bounds.maxY / cs);
  for (let cy = minCY; cy <= maxCY; cy += 1) {
    for (let cx = minCX; cx <= maxCX; cx += 1) {
      const key = chunkKey(cx, cy);
      let bucket = index.chunks.get(key);
      if (!bucket) {
        bucket = new Set();
        index.chunks.set(key, bucket);
      }
      bucket.add(object.id);
    }
  }
  index.entries.set(object.id, { object, bounds, minCX, minCY, maxCX, maxCY });
  return true;
}

export function upsertObjectSpatialIndexEntry(index, object) {
  if (!index || !object || !object.id) return false;
  const bounds = getObjectSpatialBounds(object);
  if (!bounds) return false;
  removeObjectSpatialIndexEntry(index, object.id);
  return setObjectSpatialIndexEntry(index, object, bounds);
}

export function rebuildObjectSpatialIndex(index, objects) {
  const next = index || createObjectSpatialIndex();
  clearObjectSpatialIndex(next);
  if (!Array.isArray(objects)) return next;
  for (let i = 0; i < objects.length; i += 1) {
    upsertObjectSpatialIndexEntry(next, objects[i]);
  }
  return next;
}

export function syncObjectSpatialIndex(index, objects) {
  const next = index || createObjectSpatialIndex();
  if (!Array.isArray(objects) || objects.length === 0) {
    clearObjectSpatialIndex(next);
    return next;
  }

  const seen = new Set();
  for (let i = 0; i < objects.length; i += 1) {
    const object = objects[i];
    if (!object || !object.id) continue;
    seen.add(object.id);
    const bounds = getObjectSpatialBounds(object);
    if (!bounds) {
      removeObjectSpatialIndexEntry(next, object.id);
      continue;
    }
    const entry = next.entries.get(object.id);
    if (!entry) {
      setObjectSpatialIndexEntry(next, object, bounds);
      continue;
    }
    if (entry.object !== object || !boundsEqual(entry.bounds, bounds)) {
      removeObjectSpatialIndexEntry(next, object.id);
      setObjectSpatialIndexEntry(next, object, bounds);
      continue;
    }
    entry.object = object;
  }

  Array.from(next.entries.keys()).forEach((objectId) => {
    if (!seen.has(objectId)) removeObjectSpatialIndexEntry(next, objectId);
  });
  return next;
}

export function queryObjectSpatialIndex(index, minX, minY, maxX, maxY) {
  if (!index || !index.chunks || index.chunks.size === 0) return [];
  const cs = index.chunkSize || OBJECT_INDEX_CHUNK_SIZE;
  const minCX = Math.floor(minX / cs);
  const minCY = Math.floor(minY / cs);
  const maxCX = Math.floor(maxX / cs);
  const maxCY = Math.floor(maxY / cs);
  const seen = new Set();
  const out = [];

  for (let cy = minCY; cy <= maxCY; cy += 1) {
    for (let cx = minCX; cx <= maxCX; cx += 1) {
      const bucket = index.chunks.get(chunkKey(cx, cy));
      if (!bucket || bucket.size === 0) continue;
      for (const objectId of bucket) {
        if (seen.has(objectId)) continue;
        seen.add(objectId);
        const entry = index.entries.get(objectId);
        if (!entry || !intersectBounds(entry.bounds, minX, minY, maxX, maxY)) continue;
        out.push(entry.object);
      }
    }
  }

  return out;
}
