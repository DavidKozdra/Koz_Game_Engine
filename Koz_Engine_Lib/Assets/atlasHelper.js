// Koz_Engine_Lib/Assets/atlasHelper.js — Sprite Atlas Manager
// Provides named-frame lookup and drawing from packed texture atlases.
// Works with both p5.js canvas contexts and DOM Canvas 2D contexts.

const AtlasManager = (function () {
  // Internal registry: { [atlasName]: { image, meta, frames } }
  const _atlases = {};

  /**
   * Register a loaded atlas.
   * @param {string}       name  - unique atlas identifier (e.g. 'items', 'status')
   * @param {p5.Image}     image - image loaded via p5's loadImage()
   * @param {object}       data  - atlas descriptor ({ meta, frames })
   */
  function register(name, image, data) {
    _atlases[name] = {
      image,
      meta:   data.meta,
      frames: data.frames,
    };
    console.log(`[AtlasManager] Registered atlas "${name}" with ${Object.keys(data.frames).length} frames.`);
  }

  /**
   * Retrieve frame info for a named sprite.
   * Searches all atlases unless atlasName is specified.
   * @param {string}  frameName
   * @param {string}  [atlasName]
   * @returns {{ image, x, y, w, h } | null}
   */
  function getFrame(frameName, atlasName = null) {
    const candidates = atlasName
      ? (_atlases[atlasName] ? [_atlases[atlasName]] : [])
      : Object.values(_atlases);

    for (const atlas of candidates) {
      if (!atlas) continue;
      const f = atlas.frames[frameName];
      if (f) {
        return {
          image: atlas.image,
          x: f.x,
          y: f.y,
          w: atlas.meta.frameWidth,
          h: atlas.meta.frameHeight,
        };
      }
    }
    return null;
  }

  /**
   * Returns true if a named frame exists in any registered atlas.
   * @param {string} frameName
   */
  function has(frameName) {
    return !!getFrame(frameName);
  }

  /**
   * Draw a named sprite via p5.js (inside draw() or a p5.Graphics context).
   * @param {object} gfx       - p5 instance or p5.Graphics
   * @param {string} frameName - key in atlas frames
   * @param {number} dx        - destination x
   * @param {number} dy        - destination y
   * @param {number} [dw]      - destination width  (defaults to frame width)
   * @param {number} [dh]      - destination height (defaults to frame height)
   * @returns {boolean} true if drawn, false if frame not found
   */
  function draw(gfx, frameName, dx, dy, dw, dh) {
    const f = getFrame(frameName);
    if (!f) return false;
    const w = dw ?? f.w;
    const h = dh ?? f.h;
    gfx.image(f.image, dx, dy, w, h, f.x, f.y, f.w, f.h);
    return true;
  }

  /**
   * Draw a named sprite onto a DOM CanvasRenderingContext2D.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} frameName
   * @param {number} dx
   * @param {number} dy
   * @param {number} [dw]
   * @param {number} [dh]
   * @returns {boolean}
   */
  function drawCtx(ctx, frameName, dx, dy, dw, dh) {
    const f = getFrame(frameName);
    if (!f) return false;
    const w = dw ?? f.w;
    const h = dh ?? f.h;
    // p5.Image exposes its HTML element via .elt or .canvas
    const src = f.image.elt ?? f.image.canvas ?? f.image;
    ctx.drawImage(src, f.x, f.y, f.w, f.h, dx, dy, w, h);
    return true;
  }

  /**
   * Create a crisp off-screen <canvas> element showing a single atlas frame.
   * Ideal for DOM item icons (replaces <img> or emoji spans).
   * @param {string} frameName
   * @param {number} size - display size in pixels (square)
   * @returns {HTMLCanvasElement | null}
   */
  function createDOMCanvas(frameName, size) {
    const f = getFrame(frameName);
    if (!f) return null;

    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;

    // Set willReadFrequently to true because callers may read pixels from this canvas.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false; // keep pixel art crisp

    const src = f.image.elt ?? f.image.canvas ?? f.image;
    ctx.drawImage(src, f.x, f.y, f.w, f.h, 0, 0, size, size);

    canvas.className = 'item-icon item-icon-atlas';
    canvas.title     = frameName;
    return canvas;
  }

  /**
   * Lists every registered atlas name and its frame keys.
   * Useful for debugging.
   */
  function debugList() {
    for (const [name, atlas] of Object.entries(_atlases)) {
      console.log(`Atlas: "${name}"`);
      Object.keys(atlas.frames).forEach(k => console.log(`  → ${k}  (${atlas.frames[k].x}, ${atlas.frames[k].y})`));
    }
  }

  /**
   * Register a single standalone image as a named frame.
   * Use this when you have individual PNGs rather than a packed atlas.
   * @param {string}   frameName - the key to look up later (e.g. 'Jewelry')
   * @param {p5.Image} image     - image loaded via p5's loadImage()
   */
  function registerSingle(frameName, image) {
    // Store under a private per-image atlas so the frame lookup still works
    const key = '__single__' + frameName;
    _atlases[key] = {
      image,
      meta:   { frameWidth: image.width || 64, frameHeight: image.height || 64 },
      frames: { [frameName]: { x: 0, y: 0 } },
    };
  }

  return { register, registerSingle, getFrame, has, draw, drawCtx, createDOMCanvas, debugList };
})();

(function exportAtlasHelper(root) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { AtlasManager };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
