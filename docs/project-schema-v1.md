# Project Schema v1

## Overview

The project document is the single source of truth shared between editor and runtime.
It is stored as `project.json` inside a project folder.

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
  "world": {
    // Serialized output of createWorldSpace().serialize()
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
        "Animator": { "clipId": null }
      }
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

### world
Direct output of `createWorldSpace().serialize()`. The editor and runtime both use `createWorldSpace` to load this.

### objects
Array of game objects with component data. Each object has a unique `id` and a `components` map keyed by component type name.

### animations
Array of animation clips. Each clip targets an object property via tracks with keyframes.

### scripts
Array of script assets with source code. Bound to objects via `ScriptBinding` / `ScriptBindings`.
`language` can be `javascript` (runtime hooks) or `css` (injected stylesheet when the binding is active).

### build
Export settings. `profile` is `"web-dev"` or `"web-prod"`. `pwa` enables PWA output.

## Migration

When `schemaVersion` is missing or less than 1, the migrate function wraps raw data into v1 format with sensible defaults.
