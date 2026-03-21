/**
 * Validates transform-aware editor object geometry helpers.
 * Run with: node tests/test-object-geometry.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS:', message);
  } else {
    failed += 1;
    console.error('  FAIL:', message);
  }
}

async function loadObjectGeometry() {
  const modulePath = path.join(__dirname, '..', 'editor', 'src', 'renderer', 'lib', 'objectGeometry.js');
  const source = fs.readFileSync(modulePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(moduleUrl);
}

function createObject(overrides = {}) {
  return {
    id: 'obj_test',
    x: 100,
    y: 50,
    components: {
      Transform: { x: 100, y: 50, rotation: 0, scaleX: 2, scaleY: 1.5 },
      Sprite: { width: 20, height: 10 },
      Collider: { shape: 'rect', width: 8, height: 6, offsetX: 3, offsetY: -2 },
    },
    ...overrides,
  };
}

async function main() {
  console.log('\n=== Object Geometry Tests ===\n');

  const {
    getObjectColliderMetrics,
    getObjectRenderBounds,
    getObjectSpriteMetrics,
    isWorldPointInObject,
  } = await loadObjectGeometry();

  const scaled = createObject();
  const metrics = getObjectSpriteMetrics(scaled);
  assert(metrics.width === 40 && metrics.height === 15, 'sprite metrics scale width and height with transform scale');
  assert(metrics.centerX === 120 && metrics.centerY === 57.5, 'sprite metrics keep the world-space top-left anchored while scaling');

  const bounds = getObjectRenderBounds(scaled);
  assert(bounds.minX === 100 && bounds.maxX === 140, 'unrotated render bounds preserve the scaled x extents');
  assert(bounds.minY === 50 && bounds.maxY === 65, 'unrotated render bounds preserve the scaled y extents');
  assert(isWorldPointInObject(scaled, 120, 57.5), 'point hit-testing succeeds at the transformed object center');
  assert(!isWorldPointInObject(scaled, 141, 57.5), 'point hit-testing rejects points outside the transformed object bounds');

  const rotated = createObject({
    components: {
      Transform: { x: 100, y: 50, rotation: 90, scaleX: 2, scaleY: 1 },
      Sprite: { width: 20, height: 10 },
      Collider: { shape: 'rect', width: 8, height: 6, offsetX: 0, offsetY: 0 },
    },
  });
  const rotatedBounds = getObjectRenderBounds(rotated);
  assert(rotatedBounds.minX === 115 && rotatedBounds.maxX === 125, 'rotated bounds collapse the x extent down to the rotated sprite height');
  assert(rotatedBounds.minY === 35 && rotatedBounds.maxY === 75, 'rotated bounds expand the y extent to cover the rotated sprite width');

  const collider = getObjectColliderMetrics(scaled);
  assert(collider.width === 16 && collider.height === 9, 'collider metrics scale collider size with object scale');
  assert(collider.centerX === 126 && collider.centerY === 54.5, 'collider metrics scale offsets from the object center');
  assert(collider.x === 118 && collider.y === 50, 'collider metrics expose scaled top-left collision bounds');

  console.log('\n=== Results ===\n');
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('\nAll object geometry tests passed!\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
