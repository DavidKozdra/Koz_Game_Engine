# Koz Engine Plan: World Editor + Animation + Scripting + Web/PWA Build

This plan is based on the current repository state:
- Browser runtime scaffold in `index.html`, `game.js`, `ui.js`, `style.css`
- Engine modules in `Koz_Engine_Lib/*`
- Desktop editor scaffold in `editor/` (Electron + React + Vite)

## 1. Current Code Assessment

### Already usable now
- `Koz_Engine_Lib/World/worldSpace.js`
  - Grid + element storage, resize, serialization, element queries.
- `Koz_Engine_Lib/World/worldEditor.js`
  - Editing primitives: paint, flood fill, place/update/delete element, selection, undo/redo.
- `Koz_Engine_Lib/SaveLoad/saveApi.js` + `storageDrivers.js`
  - JSON save/load abstraction (can power project files and autosave).
- `Koz_Engine_Lib/Core/gameStateManager.js`
  - Runtime/editor mode states can be modeled cleanly.
- `Koz_Engine_Lib/Core/koz-engine.global.js`
  - Transitional browser module bridge already loads world/editor modules.

### Missing for your target
- Editor UI is still scaffold-only (`editor/src/renderer/App.jsx`).
- No scene/object document format yet (versioned schema).
- No timeline/animation system integrated into runtime loop.
- No script authoring/execution sandbox.
- No export pipeline from editor project -> standalone web game.
- No PWA assets (`manifest.webmanifest`, service worker, offline caching).

## 2. Target Architecture (using current code)

Build around one project document that both editor and runtime understand.

### Core model (new)
- `project.json`
  - `meta`: name, version, resolution, engineVersion
  - `world`: serialized from `createWorldSpace().serialize()`
  - `objects`: game objects/components
  - `animations`: clips/tracks/keyframes
  - `scripts`: script assets and per-object bindings
  - `assets`: sprite/audio references
  - `build`: web/pwa output options

### Runtime composition
- Keep `Koz_Engine_Lib` as engine primitives.
- Add a runtime layer (`runtime/`) that:
  - Loads `project.json`
  - Instantiates world + objects
  - Evaluates animation each frame
  - Dispatches script lifecycle hooks (`onInit`, `onUpdate`, `onCollision`)

### Editor composition
- Use Electron shell for desktop workflow (`editor/src/main/*`).
- Build React editor UI (`editor/src/renderer/*`) around:
  - Viewport (world space)
  - Hierarchy/object list
  - Inspector (components/properties)
  - Timeline
  - Script panel
  - Build/export panel

## 3. Implementation Phases

## Phase 1: Define stable project schema and adapters
1. Create `docs/project-schema-v1.md`.
2. Create `engine/project/projectSchema.js`:
   - validation
   - default document factory
   - migrate(old)->v1 function
3. Add adapters:
   - `worldSpace <-> project.world`
   - `GameObject <-> project.objects`
4. Use `SaveAPI` for local autosave in editor (initially JSON text in app data).

Deliverable:
- You can create/open/save a project document with schema versioning.

## Phase 2: Build world-space visual editor MVP
1. Replace scaffold `editor/src/renderer/App.jsx` with 3-pane layout:
   - left: object/world tools
   - center: viewport canvas
   - right: inspector
2. Add viewport renderer:
   - start with 2D canvas (not p5 in editor)
   - grid, camera pan/zoom, tile hover, selection bounds
3. Bind current world editing actions from `worldEditor.js`:
   - brush, fill, place element, move element, delete
   - undo/redo stack controls
4. Add scene hierarchy list from `world.listElements()`.

Deliverable:
- User can see world space and edit game objects visually.

## Phase 3: Component model + game object editing
1. Introduce components for editor/runtime parity:
   - `Transform`, `Sprite`, `Collider`, `ScriptBinding`, `Animator`
2. Extend inspector UI to edit component properties.
3. Bridge with `Core/GameObject.js`:
   - keep `GameObject` as runtime primitive
   - generate runtime instances from component data during play/export
4. Add prefab support (optional in phase 3, required by phase 5).

Deliverable:
- Game objects have structured editable data, not ad hoc blobs.

## Phase 4: Animation timeline system
1. Add animation data model:
   - clips, tracks, keyframes, easing
2. Implement timeline editor panel:
   - keyframe add/remove, scrubber, playback controls
3. Add runtime evaluator:
   - sample tracks each frame and write values to components
4. Add animation preview in editor viewport.

Deliverable:
- User can animate object properties and preview playback.

## Phase 5: Script authoring and safe runtime execution
1. Script asset model:
   - source code + id + exposed properties
2. Add code editor panel (Monaco or CodeMirror).
3. Implement constrained script runtime:
   - no direct Node/electron APIs
   - controlled engine API surface
   - lifecycle hooks: `onInit`, `onUpdate(dt)`, `onEvent(evt)`
4. Bind scripts to objects via `ScriptBinding` component.
5. Add runtime diagnostics console in editor.

Deliverable:
- User can attach scripts and run interactive gameplay logic.

## Phase 6: In-editor play mode and debugging
1. Add mode states: `EDIT`, `PLAY`, `PAUSE` (can use `gameStateManager`).
2. Start/stop simulation with deterministic reset from project document.
3. Add debug overlays:
   - FPS
   - selected object state
   - script errors and stack traces
4. Keep undo history separate between edit and play sessions.

Deliverable:
- User can test gameplay directly in editor without corrupting source data.

## Phase 7: Export/build pipeline (HTML/JS/CSS)
1. Add `editor/src/main/exporter.js`:
   - takes project document
   - writes output folder with:
     - `index.html`
     - `game.bundle.js`
     - `style.css`
     - `project.json`
2. Use Vite build for bundling runtime + scripts into web JS.
3. Include only required engine modules in bundle (avoid loading whole global bridge when possible).
4. Add export profiles:
   - `web-dev`
   - `web-prod`

Deliverable:
- One-click export creates a playable standalone web build.

## Phase 8: PWA support
1. Generate `manifest.webmanifest` from project settings.
2. Add service worker (Workbox or manual cache list):
   - shell caching
   - asset caching
   - offline fallback page
3. Add installability checks in exported app.
4. Validate with Lighthouse PWA checks.

Deliverable:
- Exported game can install as a PWA and run offline.

## 4. File/Folder Changes To Make

- `plan.md` (this plan)
- `docs/project-schema-v1.md`
- `engine/project/projectSchema.js`
- `engine/runtime/*` (play runtime)
- `editor/src/renderer/components/*` (viewport, inspector, timeline, script editor)
- `editor/src/renderer/state/*` (editor store, actions, undo/redo)
- `editor/src/main/exporter.js`
- `editor/src/main/ipc/*` (save/open/export IPC)
- `templates/web/*` (html/css/pwa template files)

## 5. Suggested Execution Order (pragmatic)

1. Phase 1 + 2 first (schema + world editor MVP).
2. Phase 7 early prototype right after phase 2 (prove export path before adding complexity).
3. Then phase 3, 4, 5 (components, animation, scripts).
4. Phase 6 debugging polish.
5. Phase 8 PWA hardening at the end.

Reason:
- You de-risk the most important promise quickly: "edit world -> export playable web build".

## 6. Risks and Controls

- Risk: Engine modules are transitional/mixed export styles.
  - Control: Introduce runtime adapter layer instead of modifying every engine module immediately.
- Risk: Script execution can be unsafe.
  - Control: sandboxed API + denylist globals + runtime timeout budget.
- Risk: Editor/runtime data drift.
  - Control: single project schema + migration tests.
- Risk: Export breaks due to asset path issues.
  - Control: centralized asset registry and build-time validation.

## 7. Definition of Done (MVP)

MVP is complete when all are true:
1. User can create/open/save a project.
2. User can edit world tiles and game objects in a viewport.
3. User can add one animation clip and preview it.
4. User can attach a script and see behavior in play mode.
5. User can export to HTML/JS/CSS and run the game in browser.
6. User can export with PWA option and install offline-capable build.

## 8. Implementation Status

### DONE (Phase 1 + 2 + 7 early)
1. **Phase 1** — Project schema v1 implemented:
   - `Koz_Engine_Lib/Project/projectSchema.js` — validation, defaults, migration, factories
   - `Koz_Engine_Lib/Project/projectAdapters.js` — worldSpace/GameObject round-trip adapters
   - `Koz_Engine_Lib/Runtime/gameRuntime.js` — play runtime with script/animation evaluation
   - `docs/project-schema-v1.md` — schema documentation
   - `tests/test-schema.js` — 38 passing tests

2. **Phase 2** — World editor MVP implemented:
   - 3-pane layout: left (world tools + hierarchy), center (viewport canvas), right (inspector)
   - Viewport: grid rendering, camera pan/zoom, cell painting, flood fill, erase
   - Object management: add/remove/select/move game objects
   - Inspector: edit Transform, Sprite, Collider, ScriptBinding, Animator components
   - Toolbar: tool selection, brush value, undo/redo buttons, save/load/export
   - Keyboard shortcuts: B(rush), F(ill), E(rase), V(select), Delete, Ctrl+S/Z/Y

3. **Phase 7 early** — Export pipeline:
   - One-click "Export Build" generates self-contained HTML with embedded p5.js runtime
   - Exported game includes: world rendering, animation evaluation, script execution
   - `samples/demo-project.json` — sample project with player movement + enemy patrol
   - `samples/test-runtime.html` — standalone runtime test

### REMAINING
4. Phase 3 — Component model polish + prefabs
5. Phase 4 — Animation timeline editor panel
6. Phase 5 — Script authoring panel (Monaco/CodeMirror)
7. Phase 6 — In-editor play mode with state isolation
8. Phase 7 full — Multi-file export (separate JS/CSS), build profiles
9. Phase 8 — PWA support (manifest, service worker, Lighthouse)
