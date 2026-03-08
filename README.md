# Koz Engine Boilerplate

Simple starter boilerplate for projects using `Koz_Engine_Lib`.

## Quickstart

1. Serve this folder with a local web server.
2. Open `index.html` in your browser.
3. Build your logic in `game.js` and your UI in `ui.js`.

## What Is Included

- p5 canvas setup (`960x540`)
- minimal app state flow (`READY`, `RUNNING`, `PAUSED`)
- event bridge between game and UI (`koz:command`, `koz:ui-sync`)
- basic overlay controls for start/pause/reset

## Runtime Notes

- `Koz_Engine_Lib/Core/koz-engine.global.js` loads the engine
- `preload.js` is currently optional/commented; app reads `window.KozRuntime` and `window.KozReady`
- `game.js` drives state + render loop
- `ui.js` handles overlay controls

Replace placeholder loop/render code with your project logic.
