function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function getObjectTransform(object) {
  const components = object && object.components && typeof object.components === 'object' ? object.components : {};
  const transform = components.Transform && typeof components.Transform === 'object' ? components.Transform : {};
  return {
    x: numberOr(transform.x, numberOr(object && object.x, 0)),
    y: numberOr(transform.y, numberOr(object && object.y, 0)),
    rotation: numberOr(transform.rotation, numberOr(object && object.rotation, 0)),
    scaleX: numberOr(transform.scaleX, numberOr(object && object.scaleX, 1)),
    scaleY: numberOr(transform.scaleY, numberOr(object && object.scaleY, 1)),
  };
}

export function getObjectSpriteMetrics(object) {
  const components = object && object.components && typeof object.components === 'object' ? object.components : {};
  const sprite = components.Sprite && typeof components.Sprite === 'object' ? components.Sprite : {};
  const { x, y, rotation, scaleX, scaleY } = getObjectTransform(object);
  const baseWidth = Math.max(1, numberOr(sprite.width, 32));
  const baseHeight = Math.max(1, numberOr(sprite.height, 32));
  const absScaleX = Math.abs(scaleX || 1);
  const absScaleY = Math.abs(scaleY || 1);
  const width = baseWidth * absScaleX;
  const height = baseHeight * absScaleY;
  return {
    x,
    y,
    rotation,
    scaleX,
    scaleY,
    absScaleX,
    absScaleY,
    baseWidth,
    baseHeight,
    width,
    height,
    centerX: x + (width * 0.5),
    centerY: y + (height * 0.5),
  };
}

export function getRotatedBounds(centerX, centerY, width, height, rotation = 0) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfWidth = ((width * cos) + (height * sin)) * 0.5;
  const halfHeight = ((width * sin) + (height * cos)) * 0.5;
  return {
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
  };
}

export function getObjectRenderBounds(object) {
  const metrics = getObjectSpriteMetrics(object);
  return getRotatedBounds(metrics.centerX, metrics.centerY, metrics.width, metrics.height, metrics.rotation);
}

export function isWorldPointInObject(object, worldX, worldY) {
  const metrics = getObjectSpriteMetrics(object);
  const radians = (-metrics.rotation * Math.PI) / 180;
  const dx = worldX - metrics.centerX;
  const dy = worldY - metrics.centerY;
  const localX = (dx * Math.cos(radians)) - (dy * Math.sin(radians));
  const localY = (dx * Math.sin(radians)) + (dy * Math.cos(radians));
  return Math.abs(localX) <= (metrics.width * 0.5) && Math.abs(localY) <= (metrics.height * 0.5);
}

export function getObjectColliderMetrics(object, options = {}) {
  const components = object && object.components && typeof object.components === 'object' ? object.components : {};
  const collider = components.Collider && typeof components.Collider === 'object' ? components.Collider : {};
  const sprite = getObjectSpriteMetrics(object);
  const scaleWithTransform = options.scaleWithTransform !== false;
  const scaleX = scaleWithTransform ? sprite.scaleX : 1;
  const scaleY = scaleWithTransform ? sprite.scaleY : 1;
  const absScaleX = Math.abs(scaleX || 1);
  const absScaleY = Math.abs(scaleY || 1);
  const rawWidth = numberOr(collider.width, sprite.baseWidth);
  const rawHeight = numberOr(collider.height, sprite.baseHeight);
  const rawOffsetX = numberOr(collider.offsetX, numberOr(collider.x, 0));
  const rawOffsetY = numberOr(collider.offsetY, numberOr(collider.y, 0));
  const width = rawWidth * absScaleX;
  const height = rawHeight * absScaleY;
  const offsetX = rawOffsetX * scaleX;
  const offsetY = rawOffsetY * scaleY;
  const centerX = sprite.centerX + offsetX;
  const centerY = sprite.centerY + offsetY;
  return {
    shape: collider.shape || 'rect',
    rotation: sprite.rotation,
    width,
    height,
    centerX,
    centerY,
    radius: Math.max(width, height) * 0.5,
    x: centerX - (width * 0.5),
    y: centerY - (height * 0.5),
  };
}

export function getObjectColliderBounds(object, options = {}) {
  const metrics = getObjectColliderMetrics(object, options);
  if (metrics.shape === 'circle') {
    return {
      minX: metrics.centerX - metrics.radius,
      minY: metrics.centerY - metrics.radius,
      maxX: metrics.centerX + metrics.radius,
      maxY: metrics.centerY + metrics.radius,
    };
  }
  return getRotatedBounds(metrics.centerX, metrics.centerY, metrics.width, metrics.height, metrics.rotation);
}
