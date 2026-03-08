(function initWorldSpaceLib(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createWorldSpaceApi() {
/**
 * World space utilities for grid management.
 * Provides functions for creating and manipulating game world grids.
 */
function isPlainObject(value) {
    return !!value && Object.prototype.toString.call(value) === "[object Object]";
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (isPlainObject(value)) {
      const out = {};
      for (const key of Object.keys(value)) out[key] = cloneValue(value[key]);
      return out;
    }
    return value;
  }

  function normalizeSize(value, fallback) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function normalizeCoord(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) ? n : 0;
  }

  function makeCellFactory(defaultCell) {
    if (typeof defaultCell === "function") {
      return function cellFactory(x, y) {
        return cloneValue(defaultCell(x, y));
      };
    }

    return function cellFactory() {
      return cloneValue(defaultCell);
    };
  }

  function createGrid(cols, rows, defaultCell) {
    const cellFactory = makeCellFactory(defaultCell);
    const grid = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        row.push(cellFactory(x, y));
      }
      grid.push(row);
    }
    return grid;
  }

  function normalizeElement(input, fallbackId) {
    const source = cloneValue(input || {});
    const next = source;
    next.id = Number.isFinite(Number(source.id)) ? Number(source.id) : fallbackId;
    next.kind = String(source.kind || "element");
    next.x = normalizeCoord(source.x);
    next.y = normalizeCoord(source.y);
    return next;
  }

  function createWorldSpace(options) {
    const opts = options || {};
    let cols = normalizeSize(opts.cols, 1);
    let rows = normalizeSize(opts.rows, 1);
    let defaultCell = opts.defaultCell !== undefined ? opts.defaultCell : null;
    let grid = createGrid(cols, rows, defaultCell);
    let elements = [];
    let nextElementId = 1;
    const meta = cloneValue(opts.meta || {});

    function inBounds(x, y) {
      return x >= 0 && x < cols && y >= 0 && y < rows;
    }

    function getCell(x, y) {
      if (!inBounds(x, y)) return undefined;
      return grid[y][x];
    }

    function setCell(x, y, value) {
      if (!inBounds(x, y)) return false;
      grid[y][x] = cloneValue(value);
      return true;
    }

    function fillCells(value) {
      const nextFactory = makeCellFactory(value);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          grid[y][x] = nextFactory(x, y);
        }
      }
      defaultCell = value;
      return grid;
    }

    function resize(nextCols, nextRows, resizeOptions) {
      const sizeOpts = resizeOptions || {};
      const targetCols = normalizeSize(nextCols, cols);
      const targetRows = normalizeSize(nextRows, rows);
      const nextDefaultCell = sizeOpts.defaultCell !== undefined ? sizeOpts.defaultCell : defaultCell;
      const nextGrid = createGrid(targetCols, targetRows, nextDefaultCell);

      for (let y = 0; y < Math.min(rows, targetRows); y++) {
        for (let x = 0; x < Math.min(cols, targetCols); x++) {
          nextGrid[y][x] = cloneValue(grid[y][x]);
        }
      }

      const removedElements = [];
      const keptElements = [];
      for (const element of elements) {
        if (element.x >= 0 && element.x < targetCols && element.y >= 0 && element.y < targetRows) {
          keptElements.push(element);
        } else {
          removedElements.push(cloneValue(element));
        }
      }

      cols = targetCols;
      rows = targetRows;
      defaultCell = nextDefaultCell;
      grid = nextGrid;
      elements = keptElements;
      return { removedElements: removedElements };
    }

    function listElements(filterOrKind) {
      if (typeof filterOrKind === "function") {
        return elements.filter(filterOrKind);
      }
      if (typeof filterOrKind === "string" && filterOrKind) {
        return elements.filter(function byKind(element) {
          return element.kind === filterOrKind;
        });
      }
      return elements.slice();
    }

    function indexOfElement(id) {
      const targetId = Number(id);
      return elements.findIndex(function byId(element) {
        return element.id === targetId;
      });
    }

    function findElementById(id) {
      const idx = indexOfElement(id);
      return idx === -1 ? null : elements[idx];
    }

    function findElementAt(x, y, filterOrKind) {
      const matches = listElements(filterOrKind);
      return matches.find(function onElement(element) {
        return element.x === x && element.y === y;
      }) || null;
    }

    function addElement(input, addOptions) {
      const opts = addOptions || {};
      const element = normalizeElement(input, nextElementId);
      if (element.id >= nextElementId) nextElementId = element.id + 1;
      const rawIndex = Math.floor(Number(opts.index));
      const index = Number.isFinite(rawIndex)
        ? Math.max(0, Math.min(elements.length, rawIndex))
        : elements.length;
      elements.splice(index, 0, element);
      return element;
    }

    function updateElement(id, patch) {
      const idx = indexOfElement(id);
      if (idx === -1) return null;
      const current = elements[idx];
      const nextPatch = cloneValue(patch || {});
      const next = Object.assign(current, nextPatch);
      next.x = normalizeCoord(next.x);
      next.y = normalizeCoord(next.y);
      next.kind = String(next.kind || "element");
      return next;
    }

    function replaceElement(id, snapshot) {
      const idx = indexOfElement(id);
      if (idx === -1) return null;
      const replacement = normalizeElement(snapshot, Number(id));
      if (replacement.id >= nextElementId) nextElementId = replacement.id + 1;
      elements[idx] = replacement;
      return replacement;
    }

    function removeElementById(id) {
      const idx = indexOfElement(id);
      if (idx === -1) return null;
      return elements.splice(idx, 1)[0] || null;
    }

    function clearElements(filterOrKind) {
      if (!filterOrKind) {
        const removed = elements.slice();
        elements = [];
        return removed;
      }

      const removed = [];
      const kept = [];
      for (const element of elements) {
        const matches = typeof filterOrKind === "function"
          ? filterOrKind(element)
          : element.kind === filterOrKind;
        if (matches) removed.push(element);
        else kept.push(element);
      }
      elements = kept;
      return removed;
    }

    function replaceState(snapshot) {
      const source = snapshot || {};
      cols = normalizeSize(source.cols, cols);
      rows = normalizeSize(source.rows, rows);
      defaultCell = source.defaultCell !== undefined ? source.defaultCell : defaultCell;
      grid = createGrid(cols, rows, defaultCell);

      if (Array.isArray(source.grid)) {
        for (let y = 0; y < Math.min(rows, source.grid.length); y++) {
          const row = Array.isArray(source.grid[y]) ? source.grid[y] : [];
          for (let x = 0; x < Math.min(cols, row.length); x++) {
            grid[y][x] = cloneValue(row[x]);
          }
        }
      }

      elements = [];
      nextElementId = 1;
      if (Array.isArray(source.elements)) {
        source.elements.forEach(function restoreElement(element, index) {
          addElement(element, { index: index });
        });
      }
    }

    function serialize() {
      return {
        cols: cols,
        rows: rows,
        defaultCell: cloneValue(defaultCell),
        grid: cloneValue(grid),
        elements: cloneValue(elements),
        meta: cloneValue(meta),
      };
    }

    return {
      get cols() { return cols; },
      get rows() { return rows; },
      get grid() { return grid; },
      get meta() { return meta; },
      inBounds: inBounds,
      getCell: getCell,
      setCell: setCell,
      fillCells: fillCells,
      resize: resize,
      listElements: listElements,
      findElementById: findElementById,
      findElementAt: findElementAt,
      addElement: addElement,
      updateElement: updateElement,
      replaceElement: replaceElement,
      removeElementById: removeElementById,
      clearElements: clearElements,
      replaceState: replaceState,
      serialize: serialize,
    };
  }

  return {
    cloneValue: cloneValue,
    createGrid: createGrid,
    createWorldSpace: createWorldSpace,
  };
});
