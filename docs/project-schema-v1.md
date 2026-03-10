# Project Schema v1

## Overview

The project document is the single source of truth shared between editor and runtime.
It is stored as `project.json` inside a project folder.

Scenes are the canonical gameplay container in schema v1. The top-level `world` and
`objects` fields are kept as a compatibility alias of the active scene so older code
can still read the current scene without understanding `scenes`.

## Top-level structure

```jsonc
{
  "schemaVersion": 1,
  "meta": {
    "name": "My Game",
    "version": "1.0.0",
    "resolution": { "width": 960, "height": 540 },
    "engineVersion": "0.1.0"
  },
  "activeSceneId": "scene_main",
  "world": {
    // Compatibility alias for scenes[activeSceneId].world
    "cols": 30,
    "rows": 20,
    "defaultCell": null,
    "grid": [/* 2D array */],
    "elements": [/* placed world elements */],
    "meta": {}
  },
  "objects": [
    // Compatibility alias for scenes[activeSceneId].objects
  ],
  "scenes": [
    {
      "id": "scene_main",
      "name": "Main Scene",
      "world": {
        "cols": 30,
        "rows": 20,
        "defaultCell": null,
        "grid": [/* 2D array */],
        "elements": [/* placed world elements */],
        "meta": {}
      },
      "objects": [
        {
          "id": "obj_1",
          "name": "Player",
          "type": "generic",
          "x": 5,
          "y": 5,
          "components": {
            "Transform": { "x": 5, "y": 5, "rotation": 0, "scaleX": 1, "scaleY": 1 },
            "Sprite": { "assetId": null, "color": "#4ade80", "width": 32, "height": 32 },
            "Collider": { "shape": "rect", "width": 32, "height": 32 },
            "ScriptBinding": { "scriptId": null },
            "ScriptBindings": [],
            "Animator": { "clipId": null }
          }
        }
      ]
    }
  ],
  "animations": [
    {
      "id": "anim_1",
      "name": "Walk",
      "duration": 1.0,
      "loop": true,
      "tracks": [
        {
          "targetObjectId": "obj_1",
          "property": "x",
          "keyframes": [
            { "time": 0, "value": 0, "easing": "linear" },
            { "time": 1, "value": 100, "easing": "linear" }
          ]
        }
      ]
    }
  ],
  "scripts": [
    {
      "id": "script_1",
      "name": "PlayerController",
      "language": "javascript",
      "source": "function onInit(self, engine) {}\nfunction onUpdate(self, engine, dt) {}\n"
    }
  ],
  "assets": [],
  "build": {
    "profile": "web-prod",
    "pwa": false
  }
}
```

## Field descriptions

### meta
| Field | Type | Description |
|---|---|---|
| name | string | Human-readable project name |
| version | string | Semver project version |
| resolution | {width, height} | Target canvas resolution |
| engineVersion | string | Koz Engine version used |

### activeSceneId
The scene that runtime and export should boot into.

### scenes
Array of named scenes. Each scene owns its own `world` and `objects`.

### world
Compatibility alias of the active scene world. New code should prefer `scenes`.

### objects
Compatibility alias of the active scene object list. New code should prefer `scenes`.

### animations
Array of animation clips. Each clip targets an object property via tracks with keyframes.

### scripts
Array of script assets with source code. Bound to objects via `ScriptBinding` / `ScriptBindings`.
`language` can be `javascript` (runtime hooks) or `css` (injected stylesheet when the binding is active).

### build
Export settings. `profile` is `"web-dev"` or `"web-prod"`. `pwa` enables PWA output.

## Migration

When `schemaVersion` is missing or less than 1, the migrate function wraps raw data into v1 format,
creates a default scene when needed, and syncs `world` / `objects` to the active scene.
