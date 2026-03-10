
# Koz web-based Game Engine 

> Simple starter boilerplate for projects using **Koz_Engine_Lib**.

![Koz Engine Screenshot](https://github.com/user-attachments/assets/318e290a-3179-47c0-a9d8-8174d07526c6)

## Quickstart

1. Start a local web server in this folder (e.g. `npx serve .` or use VS Code Live Server).
2. Open `index.html` in your browser.
3. Edit `game.js` for your game logic and `ui.js` for overlay/UI logic.

## Project Structure

- `index.html` — Main entry point
- `game.js` — Game state, update, and render loop
- `ui.js` — Overlay UI controls and event bridge
- `preload.js` — (Optional) Preload logic, reads `window.KozRuntime` and `window.KozReady`
- `style.css` — Basic styles
- `Koz_Engine_Lib/` — Engine source (imported via `Koz_Engine_Lib/Core/koz-engine.global.js`)

## Features

- p5.js canvas setup (`960x540`)
- Minimal app state flow (`READY`, `RUNNING`, `PAUSED`)
- Event bridge between game and UI (`koz:command`, `koz:ui-sync`)
- Overlay controls for start/pause/reset

## Runtime Notes

- The engine is loaded via `Koz_Engine_Lib/Core/koz-engine.global.js`
- `preload.js` is optional; app reads `window.KozRuntime` and `window.KozReady`
- `game.js` drives the main state and render loop
- `ui.js` handles overlay controls and UI events

Replace the placeholder loop/render code with your own project logic to get started quickly.
