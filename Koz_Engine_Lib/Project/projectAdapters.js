(function initProjectAdaptersLib(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createProjectAdaptersApi() {

  /**
   * Convert a worldSpace instance to the project.world format.
   * @param {Object} worldSpace - A worldSpace instance (has .serialize())
   * @returns {Object} Serialized world data for project.json
   */
  function worldSpaceToProject(worldSpace) {
    return worldSpace.serialize();
  }

  /**
   * Load project.world data into a worldSpace instance.
   * @param {Function} createWorldSpace - Factory from worldSpace.js
   * @param {Object} worldData - project.world from project.json
   * @returns {Object} A live worldSpace instance
   */
  function projectToWorldSpace(createWorldSpace, worldData) {
    const ws = createWorldSpace({
      cols: worldData.cols,
      rows: worldData.rows,
      offsetX: worldData.offsetX || 0,
      offsetY: worldData.offsetY || 0,
      defaultCell: worldData.defaultCell,
    });
    ws.replaceState(worldData);
    return ws;
  }

  /**
   * Convert project.objects into runtime GameObject instances.
   * @param {Function} GameObjectCtor - GameObject class
   * @param {Array} objects - project.objects array
   * @returns {Array} Array of GameObject instances
   */
  function projectToGameObjects(GameObjectCtor, objects) {
    if (!Array.isArray(objects)) return [];
    return objects.map(function toGameObject(obj) {
      const transform = (obj.components && obj.components.Transform) || {};
      const sprite = (obj.components && obj.components.Sprite) || {};
      const collider = (obj.components && obj.components.Collider) || {};
      return new GameObjectCtor(obj.type || "generic", transform.x || obj.x || 0, transform.y || obj.y || 0, {
        id: obj.id,
        shape: collider.shape || "rect",
        width: collider.width || sprite.width || 32,
        height: collider.height || sprite.height || 32,
        meta: { name: obj.name, components: obj.components },
      });
    });
  }

  /**
   * Convert a runtime GameObject back to project object format.
   * @param {Object} gameObject - A GameObject instance
   * @returns {Object} project.objects entry
   */
  function gameObjectToProject(gameObject) {
    const components = (gameObject.meta && gameObject.meta.components) || {};
    return {
      id: gameObject.id,
      name: (gameObject.meta && gameObject.meta.name) || gameObject.type,
      type: gameObject.type,
      x: gameObject.x,
      y: gameObject.y,
      components: {
        Transform: { x: gameObject.x, y: gameObject.y, rotation: 0, scaleX: 1, scaleY: 1, ...(components.Transform || {}) },
        Sprite: components.Sprite || { assetId: null, color: "#4ade80", width: 32, height: 32 },
        Collider: components.Collider || { shape: gameObject.shape, width: gameObject.width, height: gameObject.height },
        ScriptBinding: components.ScriptBinding || { scriptId: null },
        Animator: components.Animator || { clipId: null },
      },
    };
  }

  return {
    worldSpaceToProject: worldSpaceToProject,
    projectToWorldSpace: projectToWorldSpace,
    projectToGameObjects: projectToGameObjects,
    gameObjectToProject: gameObjectToProject,
  };
});
