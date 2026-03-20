"use strict";

function normalizePoint(point) {
  return {
    x: Number(point && point.x) || 0,
    y: Number(point && point.y) || 0,
  };
}

function distance(a, b) {
  const dx = (Number(a && a.x) || 0) - (Number(b && b.x) || 0);
  const dy = (Number(a && a.y) || 0) - (Number(b && b.y) || 0);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function hasLineOfSight(world, from, to, isOpaque) {
  const start = normalizePoint(from);
  const end = normalizePoint(to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)));
  const steps = Math.max(1, Math.floor(length));
  const blocked = typeof isOpaque === "function" ? isOpaque : function fallbackOpaque(x, y) {
    return !!(world && typeof world.isOpaque === "function" && world.isOpaque(x, y));
  };

  for (let i = 1; i < steps; i += 1) {
    const sample = {
      x: start.x + (dx * (i / steps)),
      y: start.y + (dy * (i / steps)),
    };
    if (blocked(sample.x, sample.y)) return false;
  }

  return true;
}

function createNoiseMemory() {
  let noise = null;
  return {
    write(point, time, power = 1) {
      noise = {
        point: normalizePoint(point),
        time: Number(time) || 0,
        power: Number(power) || 1,
      };
      return noise;
    },
    read() {
      return noise ? { ...noise, point: { ...noise.point } } : null;
    },
    clear() {
      noise = null;
    },
  };
}

function resolvePerception(input) {
  const source = input || {};
  const agent = normalizePoint(source.agent);
  const target = normalizePoint(source.target);
  const visionRange = Number(source.visionRange) || 0;
  const hearingRange = Number(source.hearingRange) || 0;
  const sighted = distance(agent, target) <= visionRange && hasLineOfSight(source.world, agent, target, source.isOpaque);
  const noise = source.noise || null;
  const heard = !!(noise && distance(agent, noise.point) <= (hearingRange * (Number(noise.power) || 1)));

  return {
    sighted,
    heard,
    targetDistance: distance(agent, target),
    noiseDistance: noise ? distance(agent, noise.point) : Infinity,
  };
}

module.exports = {
  createNoiseMemory,
  distance,
  hasLineOfSight,
  resolvePerception,
};
