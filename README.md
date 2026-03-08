# Koz Engine Boilerplate

Minimal client-side boilerplate for projects using `Koz_Engine_Lib`.

## Quickstart

1. Install the engine folder:
   - `./install-engine.sh /path/to/Koz_Engine_Lib`
   - If omitted, it defaults to `../Bargain-Quest/Koz_Engine_Lib`
2. Open `index.html` in a local web server.
3. Start building in `game.js` and `ui.js`.

## Runtime Order

- `Koz_Engine_Lib/Core/koz-engine.global.js` loads engine modules and auto-runs `Koz.init()` by default.
- `preload.js` verifies runtime and only initializes if needed, then sets:
  - `window.KozRuntime`
  - `window.KozReady`
  - `window.KozInitError`
- `game.js` consumes `window.KozRuntime`

Disable auto-init for advanced setups:
- set `window.KOZ_AUTO_INIT = false` before loading `koz-engine.global.js`
- then call `window.Koz.init({ setGlobalRuntime: true })` manually

## Extension Points

- `game.js`
  - state machine (`AppStates`)
  - world model (`world`, `worldEditor`)
  - render/update hooks (`draw`, input handlers)
- `ui.js`
  - basic state controls wired to `window.KozBoilerplateApp`

## Notes

- This repo is intentionally gameplay-agnostic.
- Keep engine/bootstrap logic out of gameplay files.
