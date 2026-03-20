"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ASTAR_SOURCE_PATH = path.resolve(__dirname, "../../../../Koz_Engine_Lib/AI/astar.js");

let cachedFactory = null;

function loadLibAStar() {
  if (cachedFactory) return cachedFactory;

  const source = fs.readFileSync(ASTAR_SOURCE_PATH, "utf8");
  cachedFactory = function createAStarInstance(baseDiff, elevationMap) {
    const context = {
      module: { exports: {} },
      exports: {},
      console,
      baseDiff,
      elevationMap,
      globalThis: {},
    };
    vm.runInNewContext(source, context, { filename: ASTAR_SOURCE_PATH });
    return context.module.exports && context.module.exports.aStar;
  };

  return cachedFactory;
}

function buildCompatGrid(cellGrid, options = {}) {
  const solidIds = new Set(Array.isArray(options.solidIds) ? options.solidIds : ["wall", "solid"]);
  const rows = Array.isArray(cellGrid) ? cellGrid.length : 0;
  const cols = rows > 0 && Array.isArray(cellGrid[0]) ? cellGrid[0].length : 0;
  const compatGrid = [];
  const elevationMap = [];

  for (let y = 0; y < rows; y += 1) {
    const compatRow = [];
    const elevationRow = [];
    for (let x = 0; x < cols; x += 1) {
      const id = String(cellGrid[y][x] || "empty");
      const walkable = !solidIds.has(id);
      compatRow.push({ options: [walkable ? "Floor" : "Water"] });
      elevationRow.push(0);
    }
    compatGrid.push(compatRow);
    elevationMap.push(elevationRow);
  }

  return {
    grid: compatGrid,
    elevationMap,
    baseDiff: { Floor: 1, Water: 9999 },
  };
}

function findPath(cellGrid, start, goal, options = {}) {
  const normalizedStart = { x: Number(start && start.x) || 0, y: Number(start && start.y) || 0 };
  const normalizedGoal = { x: Number(goal && goal.x) || 0, y: Number(goal && goal.y) || 0 };
  const compat = buildCompatGrid(cellGrid, options);
  const createAStar = loadLibAStar();
  const aStar = createAStar(compat.baseDiff, compat.elevationMap);

  if (typeof aStar !== "function") {
    throw new Error("Failed to load Koz lib A* adapter");
  }

  return aStar(compat.grid, normalizedStart, normalizedGoal, false, null, false);
}

function nextStep(cellGrid, start, goal, options = {}) {
  const path = findPath(cellGrid, start, goal, options);
  return Array.isArray(path) && path.length > 0 ? path[0] : null;
}

module.exports = {
  buildCompatGrid,
  findPath,
  nextStep,
};
