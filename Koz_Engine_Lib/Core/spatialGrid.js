(function initSpatialGridLib(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createSpatialGridApi() {
/**
 * Spatial partitioning grid for efficient entity queries.
 * Divides 2D space into cells for O(1) lookups of nearby entities.
 */
class SpatialGrid {
  /**
   * Creates a new SpatialGrid.
   * @param {number} cellSize - Size of each grid cell (default 32)
   */
  constructor(cellSize = 32) {
      this._cs = cellSize;
      this._cells = new Map();
    }

    /**
     * Generates a unique key for grid coordinates.
     * @param {number} tx - Tile x coordinate
     * @param {number} ty - Tile y coordinate
     * @returns {string} Grid cell key
     * @private
     */
    _key(tx, ty) {
      return `${Math.floor(tx / this._cs)},${Math.floor(ty / this._cs)}`;
    }

    /**
     * Inserts an entity into the grid at the specified tile coordinates.
     * @param {Object} entity - The entity to insert
     * @param {number} tx - Tile x coordinate
     * @param {number} ty - Tile y coordinate
     */
    insert(entity, tx, ty) {
      const key = this._key(tx, ty);
      let cell = this._cells.get(key);
      if (!cell) {
        cell = new Set();
        this._cells.set(key, cell);
      }
      cell.add(entity);
      entity._sgKey = key;
    }

    /**
     * Removes an entity from the grid.
     * @param {Object} entity - The entity to remove
     */
    remove(entity) {
      const key = entity._sgKey;
      if (key == null) return;
      const cell = this._cells.get(key);
      if (cell) {
        cell.delete(entity);
        if (cell.size === 0) this._cells.delete(key);
      }
      entity._sgKey = null;
    }

    /**
     * Moves an entity to a new position in the grid.
     * @param {Object} entity - The entity to move
     * @param {number} newTx - New tile x coordinate
     * @param {number} newTy - New tile y coordinate
     */
    move(entity, newTx, newTy) {
      const newKey = this._key(newTx, newTy);
      if (entity._sgKey === newKey) return;
      this.remove(entity);
      this.insert(entity, newTx, newTy);
    }

    /**
     * Queries all entities within a viewport bounds.
     * @param {Object} viewportBounds - Viewport definition
     * @param {number} viewportBounds.minX - Minimum x in world coordinates
     * @param {number} viewportBounds.maxX - Maximum x in world coordinates
     * @param {number} viewportBounds.minY - Minimum y in world coordinates
     * @param {number} viewportBounds.maxY - Maximum y in world coordinates
     * @param {number} [viewportBounds.tileSize=1] - Size of tiles
     * @returns {Array} Array of entities in the viewport
     */
    queryViewport(viewportBounds) {
      const cs = this._cs;
      const vp = viewportBounds || {
        minX: typeof _vpMinX !== "undefined" ? _vpMinX : 0,
        maxX: typeof _vpMaxX !== "undefined" ? _vpMaxX : 0,
        minY: typeof _vpMinY !== "undefined" ? _vpMinY : 0,
        maxY: typeof _vpMaxY !== "undefined" ? _vpMaxY : 0,
        tileSize: typeof tileSize !== "undefined" ? tileSize : 1,
      };

      const minCX = Math.floor((vp.minX / vp.tileSize) / cs);
      const maxCX = Math.floor((vp.maxX / vp.tileSize) / cs);
      const minCY = Math.floor((vp.minY / vp.tileSize) / cs);
      const maxCY = Math.floor((vp.maxY / vp.tileSize) / cs);

      const result = [];
      for (let cy = minCY; cy <= maxCY; cy++) {
        for (let cx = minCX; cx <= maxCX; cx++) {
          const cell = this._cells.get(`${cx},${cy}`);
          if (cell) {
            for (const e of cell) result.push(e);
          }
        }
      }
      return result;
    }

    /**
     * Clears all entities from the grid.
     */
    clear() {
      this._cells.clear();
    }
  }

  return { SpatialGrid };
});
