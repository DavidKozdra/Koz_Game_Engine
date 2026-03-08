# Koz Engine War Roguelike Showcase

This demo turns the boilerplate into a fullscreen, responsive roguelike card game using **War** combat and a progression loop.

## What It Demonstrates

- **Core State Flow** (`READY`, `RUNNING`, `SHOP`, `PAUSED`, `GAMEOVER`, `TOUR`)
- **Save/Load** via `Koz_Engine_Lib/SaveLoad` (`SaveAPI` + local storage driver)
- **World Seeded RNG** via `Koz_Engine_Lib/World/seededRng`
- **VisualFX** via `Koz_Engine_Lib/VisualFX/particleSystem`
- **Audio** via `Koz_Engine_Lib/Audio/musicSystem` volume management + WebAudio SFX
- **Events** via `Koz_Engine_Lib/Events/eventEngine` event filtering/picking
- **AI Utility** via `Koz_Engine_Lib/AI/astar` (`MinHeap`) for enemy intent decisions
- **Minigames** via `Koz_Engine_Lib/Minigames/minigamesRuntime` route branch
- **Notifications** via `Koz_Engine_Lib/Events/notificationManager`

## Gameplay Loop

1. Start a standard or challenge run.
2. Play War rounds against enemy archetypes with intent-based behavior.
3. On victory, enter the shop and buy upgrades.
4. Choose a route: direct battle, random event, or minigame.
5. Push floors until defeat.

Runs are persisted and can be loaded from the ready menu.

## Controls

- `Space`: play round (or advance tour step)
- `A`: toggle auto-play
- `P`: pause/resume
- `R` or `Esc`: return to ready

UI includes:

- Start standard/challenge run
- Load/clear save
- Shop purchases and route selection
- Volume slider
- Feature tour controls

## Mobile/Desktop Notes

- Canvas resizes to viewport (`windowWidth`/`windowHeight` + `windowResized`).
- UI overlays are responsive and scale for small screens.
- Shop layout and action rows collapse for narrow devices.

## Feature Tour

Use **Feature Tour** from the ready screen to walk through the major engine integrations in-game.

## Files

- `game.js`: game systems, engine module integrations, rendering, run save/load
- `ui.js`: screen registration and menu interactions
- `style.css`: responsive UI layout and transitions
