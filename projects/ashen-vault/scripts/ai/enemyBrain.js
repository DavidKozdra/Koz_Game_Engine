"use strict";

const { nextStep } = require("./pathingAdapter");
const { resolvePerception } = require("./perceptionSystem");

function resolveState(input) {
  const source = input || {};
  const self = source.self || {};
  const player = source.player || {};
  const perception = resolvePerception({
    world: source.world,
    agent: source.self,
    target: source.player,
    noise: source.noise,
    visionRange: source.visionRange,
    hearingRange: source.hearingRange,
    isOpaque: source.isOpaque,
  });
  const healthRatio = Math.max(0, Math.min(1, (Number(self.health) || 0) / Math.max(1, Number(self.maxHealth) || 1)));

  if (perception.sighted && perception.targetDistance <= (Number(source.attackRange) || 1)) {
    return "attack";
  }
  if (healthRatio < 0.35 && perception.sighted) {
    return "retreat";
  }
  if (perception.sighted) {
    return source.role === "flanker" ? "flank" : "pursue";
  }
  if (perception.heard) {
    return "investigate";
  }
  if (player && player.lastSeenAt && Number(source.now) - Number(player.lastSeenAt) < 1.5) {
    return "investigate";
  }
  return "idle";
}

function resolveMoveTarget(input) {
  const source = input || {};
  const state = source.state || resolveState(source);
  const self = source.self || { x: 0, y: 0 };
  const player = source.player || { x: 0, y: 0 };

  if (state === "retreat") {
    return {
      x: (Number(self.x) || 0) - ((Number(player.x) || 0) - (Number(self.x) || 0)),
      y: (Number(self.y) || 0) - ((Number(player.y) || 0) - (Number(self.y) || 0)),
    };
  }

  if (state === "flank") {
    const dx = (Number(player.x) || 0) - (Number(self.x) || 0);
    const dy = (Number(player.y) || 0) - (Number(self.y) || 0);
    return {
      x: (Number(player.x) || 0) - dy,
      y: (Number(player.y) || 0) + dx,
    };
  }

  if (state === "investigate" && source.noise && source.noise.point) {
    return source.noise.point;
  }

  return player;
}

function resolvePathStep(input) {
  const source = input || {};
  const cellGrid = source.cellGrid || [];
  const selfCell = source.selfCell || { x: 0, y: 0 };
  const targetCell = source.targetCell || { x: 0, y: 0 };
  return nextStep(cellGrid, selfCell, targetCell, source.pathingOptions || {});
}

module.exports = {
  resolveMoveTarget,
  resolvePathStep,
  resolveState,
};
