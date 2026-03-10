/**
 * Central editor state store with simple pub/sub.
 * Holds the project document and editor UI state.
 */

// Inline the engine modules for browser use (they self-register when loaded via script tags,
// but in the editor we import them as plain JS modules via Vite).
// We use dynamic import paths resolved by Vite aliases.

let _project = null;
let _editorState = {
  mode: "EDIT", // EDIT | PLAY | PAUSE
  activeTool: "brush", // brush | fill | select | place | erase
  brushValue: 1,
  selectedObjectId: null,
  camera: { x: 0, y: 0, zoom: 1 },
  gridVisible: true,
};

const listeners = new Set();

function getProject() {
  return _project;
}

function setProject(project) {
  _project = project;
  notify();
}

function getEditorState() {
  return { ..._editorState };
}

function updateEditorState(patch) {
  _editorState = { ..._editorState, ...patch };
  notify();
}

function subscribe(fn) {
  listeners.add(fn);
  return function unsubscribe() {
    listeners.delete(fn);
  };
}

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.error("Store listener error:", e); }
  }
}

// Project mutation helpers
function addObjectToProject(obj) {
  if (!_project) return;
  _project.objects.push(obj);
  notify();
}

function removeObjectFromProject(id) {
  if (!_project) return;
  _project.objects = _project.objects.filter(function notId(o) { return o.id !== id; });
  if (_editorState.selectedObjectId === id) {
    _editorState.selectedObjectId = null;
  }
  notify();
}

function updateObjectInProject(id, patch) {
  if (!_project) return;
  const obj = _project.objects.find(function byId(o) { return o.id === id; });
  if (!obj) return;
  Object.assign(obj, patch);
  // Sync Transform component
  if (patch.x !== undefined || patch.y !== undefined) {
    if (obj.components && obj.components.Transform) {
      if (patch.x !== undefined) obj.components.Transform.x = patch.x;
      if (patch.y !== undefined) obj.components.Transform.y = patch.y;
    }
  }
  notify();
}

function addScriptToProject(script) {
  if (!_project) return;
  _project.scripts.push(script);
  notify();
}

function addAnimationToProject(clip) {
  if (!_project) return;
  _project.animations.push(clip);
  notify();
}

export {
  getProject,
  setProject,
  getEditorState,
  updateEditorState,
  subscribe,
  addObjectToProject,
  removeObjectFromProject,
  updateObjectInProject,
  addScriptToProject,
  addAnimationToProject,
};
