# Ashen Vault

## Game Snapshot

**Genre:** top-down action roguelike  
**Engine target:** Koz Engine web runtime  
**Target resolution:** 960x540  
**Session length:** 30-45 minutes per full run  
**Structure:** complete standalone run-based dungeon crawler with a beginning, midgame, final boss, ending, hub progression, art direction, and adaptive sound plan

**High concept:**  
The player is a Lantern Bearer sent beneath a frozen city into the Ashen Vault, a living dungeon that rearranges itself each descent. Each run is a seeded dive through hostile chambers, faction fights, cursed relic choices, and bosses guarding four vault seals. The hook is enemy behavior: creatures do not just walk straight at the player. They investigate sound, flank around cover, retreat when wounded, protect summoners, and collapse on the player's last known position.

## Core Pillars

1. **Readable but dangerous combat**  
   Fast top-down movement, one dodge, one main weapon, one powered secondary tool, and high enemy telegraph clarity.
2. **AI-driven encounters**  
   Enemies act like coordinated dungeon defenders instead of health bars with legs.
3. **Strong audiovisual identity**  
   Gloomy gothic-fantasy pixel art, heavy contrast lighting, ember-and-glass effects, layered music, and sharp combat SFX.
4. **Finite, shippable scope**  
   One hero, three starting vows, four biome acts, four bosses, a final ending, and enough content variety to feel complete without ballooning.

## Why This Fits The Current Engine

- `Core/gameStateManager.js` handles title, hub, run, pause, death, and ending flow.
- `World/seededRng.js` gives deterministic runs, daily seeds, and shareable challenge seeds.
- `World/dungeonMaze.js` creates dungeon floor plans with rooms, connectors, start, and exit points.
- `World/worldGenerators.js` can layer hazard masks, corruption zones, lighting falloff, and biome-specific tile classification.
- `World/worldSpace.js` provides a clean tile-and-element model for rooms, traps, doors, shrines, and pickups.
- `VisualFX/particleSystemCore.js` is enough for sparks, ash bursts, curse smoke, impact flashes, and boss telegraphs.
- `Audio/musicSystem.js` and `Audio/soundRegistry.js` cover adaptive music switching, volume persistence, sound registration, and positional volume helpers.
- `SaveLoad/saveApi.js` supports unlocks, settings, hub progression, and run-state persistence.
- `Events/tipTracker.js` is a good fit for one-time tutorials and contextual hints.
- `UI/uiManager.js` and `Core/uiScreenController.js` cover hub menus, codex, pause, victory, and death recap screens.

## AI Plan

The game should use the `lib` AI surface honestly, not blindly.

- `AI/astar.js` is the usable foundation for pathing once the floor data is adapted into its expected grid shape.
- `AI/AI.js` is not reusable as-is because it is tied to another game, but its ideas are still useful: aggressive, retreating, circling, charging, and avoid states can directly inspire this project's enemy state model.
- The project should add a clean local wrapper around the lib AI folder:
  - `pathingAdapter.js` converts room tiles into a path grid.
  - `perceptionSystem.js` tracks line of sight, sound pings, and last known player position.
  - `enemyBrain.js` runs state selection with utility scoring.
  - `squadCoordinator.js` assigns roles like flanker, blocker, and backline caster.

This keeps the design grounded in the engine while avoiding the host-coupled parts of the current AI folder.

## Player Fantasy

You are not a generic adventurer. You are a sanctioned thief-saint sent to break into a sacred machine-prison below the city. The run fantasy is:

1. Enter with a chosen vow.
2. Survive rooms by reading enemy intentions.
3. Build a broken relic combination.
4. Kill the seal keeper of each biome.
5. Decide whether to take safe upgrades or cursed power.
6. Reach the vault heart and escape with the city's stolen fire.

## Core Gameplay Loop

1. Start in the surface sanctuary hub.
2. Choose a vow, equip a starting weapon, and spend meta currency.
3. Enter a seeded descent.
4. Clear combat rooms, event rooms, shrines, traps, and miniboss spaces.
5. Pick relics, consumables, and weapon upgrades.
6. Beat the biome boss and unlock the next seal gate.
7. Finish all four acts and defeat the final seal keeper.
8. Return to the hub with meta currency, codex updates, and new unlocks.

## Run Structure

Each run is four acts. Each act is one procedural floor with a clear theme and boss.

### Act 1: Cinder Gate
- Intro biome teaching melee spacing, dodge timing, and trap awareness.
- Enemies are direct but coordinated.
- Boss: **The Gate Hound**, a chained furnace beast.

### Act 2: Thorn Ossuary
- Bone gardens, poison spores, necromancer support enemies, narrow ambush lanes.
- Introduces summoners and corpse revival.
- Boss: **The Choir of Teeth**, a multi-target necromantic encounter.

### Act 3: Glass Archive
- Reflective floors, laser sigils, ranged pressure, and illusion doubles.
- Emphasis on line of sight and repositioning.
- Boss: **The Prism Widow**, a teleporting beam caster.

### Act 4: Hollow Throne
- Black stone halls, elite remixes, corruption pools, and mixed enemy squads.
- Final act combines mechanics from prior biomes.
- Boss: **The Ashen Regent**, final guardian of the vault heart.

## Room Types

- Combat room
- Elite room
- Event room
- Shrine room
- Forge room
- Merchant room
- Puzzle-trap room
- Treasure vault
- Boss ante-room
- Boss arena

Each act should contain 6-8 rooms before the boss so a full run feels complete without dragging.

## Player Kit

The player character is always the Lantern Bearer, but the run begins with one of three vows:

### Vow of Iron
- Sword and buckler
- Close-range counter play
- Best for stagger and defense

### Vow of Thread
- Chain bow
- Mobile mid-range play
- Best for kiting and status setup

### Vow of Ash
- Hex lantern
- Short-range cone blasts and curse spread
- Best for area denial and relic synergies

### Universal Actions

- Move
- Primary attack
- Secondary attack or focus skill
- Dodge
- Interact
- Flask use
- Map toggle

### Core Resources

- **Health:** restored mostly between acts and through rare drops.
- **Stamina:** fuels dodge and heavy actions; recovers quickly out of danger.
- **Lantern Charge:** gained through combat and spent on vow-specific power moves.

## Progression Inside A Run

- **Relics:** passive modifiers that alter stats, attacks, or rule interactions.
- **Cursed Relics:** high power with a clear drawback.
- **Weapon Upgrades:** rune slots, attack modifiers, and elemental conversions.
- **Flasks:** limited-use healing or utility tools.
- **Marks:** temporary act-only blessings from shrines.

## Meta Progression

Meta progression should unlock breadth, not raw permanent dominance.

- Unlock new starting relic pools.
- Unlock new vow variants and cosmetic weapon skins.
- Expand codex knowledge on enemies, bosses, and relic combinations.
- Unlock daily seeded challenge mode.
- Unlock harder heat modifiers after the first full clear.

## Enemy Roster And Behavior

### Standard Enemies

- **Cinder Guard:** shield carrier that advances with cover discipline.
- **Ash Rat Swarm:** low-health rush unit that punishes greedy players.
- **Bone Weaver:** summons skeletons and retreats behind blockers.
- **Grave Pike:** charges down lanes after a wind-up.
- **Glass Acolyte:** ranged sniper that repositions after every volley.
- **Mirror Shade:** creates decoys and attacks from off angles.
- **Throne Warden:** slow elite bruiser with area denial slams.
- **Ember Priest:** buffs nearby enemies and calls reinforcements.
- **Vault Leech:** drains charge and pressures careless kiting.

### Elite Behaviors

- Flanking elite
- Summoner elite
- Pursuit assassin
- Area-control caster

### AI States

- Idle
- Patrol
- Investigate sound
- Pursue line of sight
- Circle target
- Commit attack
- Retreat and regroup
- Protect ally
- Flee to alarm beacon
- Enrage below health threshold

### AI Rules That Make The Game Stand Out

- Noise from dashes, explosions, broken urns, and doors creates investigation points.
- Enemies remember the player's last known position for a short time.
- Backline units try to keep distance instead of walking into melee.
- Shield units attempt to hold doors while ranged units shoot through safe lanes.
- Necromancers and priests become priority targets because squads get worse if they live.
- Elites can trigger room alarms that spawn delayed reinforcements if not interrupted.

## Procedural Generation Plan

The dungeon should feel handcrafted even though the layout is procedural.

1. Start each run with `SeededRNG.startRun(seed)`.
2. Generate the macro room graph with `generateDungeonMaze(...)`.
3. Convert generated rooms into biome-specific room templates.
4. Use `worldGenerators.js` to paint corruption, fire pits, poison zones, or glass hazard masks.
5. Place props, traps, shrines, and spawn anchors into `worldSpace`.
6. Stamp one handcrafted boss arena per act.
7. Save the active seed and RNG state so a suspended run can resume cleanly.

## Relic And Build Design

The build system should create strong synergies fast.

### Relic Families

- **Flame:** burn, explosion, aggressive play
- **Bone:** lifesteal, corpse interaction, survivability
- **Glass:** crit, beam, precision bonuses
- **Thorn:** poison, root, trap amplification
- **Crown:** risk/reward cursed power

### Example Relics

- **Coal Halo:** every fifth hit releases a ring of fire.
- **Widow Lens:** ranged attacks pierce but reduce max stamina.
- **Saint's Nail:** parries create a damage aura.
- **Grave Salt:** dead enemies leave healing ash.
- **Black Oath:** gain huge damage at low health, no healing during the room.

## Event Rooms

- Pilgrim altar: trade health for relic rarity.
- Silent well: choose between map reveal or curse cleanse.
- Broken forge: sacrifice a relic to upgrade a weapon line.
- Prison cell: free an NPC for a later hub reward.
- Oracle flame: preview the boss modifier for the current act.

## Boss Design

Each boss needs three phases, readable telegraphs, and one mechanic that changes player behavior.

- **Gate Hound:** arena charges, chain sweeps, molten floor pools.
- **Choir of Teeth:** summons choir heads that heal the core if ignored.
- **Prism Widow:** reflections and delayed laser webs force constant movement.
- **Ashen Regent:** uses mixed patterns from all acts and summons seal echoes during phase three.

## Art Direction

**Visual identity:** painterly pixel art with dense shadows, strong silhouette readability, glowing ember highlights, and stained-glass color accents.

### Art Rules

- The world is dark, but threats are readable through shape language and rim light.
- Every biome gets one dominant color pair and one accent color.
- Character sprites use exaggerated weapon silhouettes so combat reads at a glance.
- FX should sell impact without obscuring hitboxes.
- UI should look carved and lit, not flat sci-fi panels.

### Biome Palette Targets

- Cinder Gate: coal black, iron gray, furnace orange
- Thorn Ossuary: dead ivory, moss green, venom yellow
- Glass Archive: midnight blue, cyan glass, magenta warning sigils
- Hollow Throne: deep indigo, ash white, blood ember red

### Required Art Deliverables

- 1 hero base set with vow-specific weapon overlays
- 9 standard enemy sprite sets
- 4 boss sprite sets
- 4 tileset families
- 1 hub environment set
- 1 full UI atlas
- 1 FX atlas for sparks, smoke, curses, beams, and hit flashes
- Portraits for hub NPCs and bosses

## Sound Direction

The sound should make the vault feel alive and hostile.

### Music Plan

- Hub theme: restrained, hopeful, acoustic and choir-led
- Each act gets one exploration loop and one combat escalation layer
- Boss fights get unique intros and final-phase stingers
- Victory ending gets a brief emotional release cue

`MusicSystem` should manage:

- main title and hub theme
- biome exploration track switching
- boss transition cues
- persisted volume and mute settings

### SFX Plan

- Distinct telegraph sounds for every elite and boss attack
- Impact layers for blade, bolt, curse, shield, and breakable props
- Room alarms, chain gates, shrine hums, and vault ambience
- Soft UI sounds that do not compete with combat

`soundRegistry.js` should manage:

- registered sound ids
- per-sound volume defaults
- small variants for repeated hits
- positional falloff for distant hazards, alarms, and boss tells

## UI And UX

- Title screen
- Hub menu
- Pause menu
- Settings
- Relic pickup compare panel
- Map overlay
- Boss health and phase UI
- Death recap
- Ending screen
- Codex

Use `tipTracker.js` to show first-time help for dodge timing, curses, shrines, and elites without repeating it every run.

## Narrative Frame

The city above is dying in endless winter because its sacred fire was sealed beneath the vault generations ago. The church sends the Lantern Bearer to retrieve it, but the vault is not just a dungeon; it is a prison for a ruler who willingly chained the fire to keep something worse asleep. The ending choice after the final boss can be simple:

- take the fire and save the city now
- leave it sealed and preserve the deeper prison

Both are valid endings. One is hopeful and unstable. One is grim and dutiful.

## Save And Persistence Plan

Use `SaveAPI` for:

- player settings
- unlocked vows
- codex progress
- challenge seeds
- suspended in-progress run data

Store run data as:

- current act
- seed
- RNG stream state
- current relics
- player stats
- map discovery
- defeated bosses

## Technical Blueprint

Suggested future project layout:

- `project.json`
- `scripts/bootstrap.js`
- `scripts/runDirector.js`
- `scripts/playerController.js`
- `scripts/combatResolver.js`
- `scripts/ai/pathingAdapter.js`
- `scripts/ai/perceptionSystem.js`
- `scripts/ai/enemyBrain.js`
- `scripts/ai/squadCoordinator.js`
- `scripts/world/floorBuilder.js`
- `scripts/world/roomStampLibrary.js`
- `scripts/audio/audioDirector.js`
- `scripts/ui/hud.js`
- `scripts/ui/screens.js`
- `assets/sprites/`
- `assets/audio/`
- `assets/data/`

## Definition Of Complete

The project counts as a complete game when it has:

- one full start-to-finish run with four acts and a final ending
- one hub with unlocks and codex
- three starting vows
- nine standard enemies
- four elites
- four bosses
- at least twenty-four relics
- at least eight event rooms
- full title, pause, settings, death, and ending screens
- music coverage for hub, acts, combat escalation, and bosses
- a cohesive art pass across hero, enemies, bosses, UI, and tiles
- save/load for meta progression and suspended runs

## Scope Guardrails

To keep this shippable, do not add these in version one:

- online co-op
- procedural story branches
- class-specific campaigns
- full voice acting
- giant open-world overworld
- endless content before the first complete clear exists

## Recommended Next Step

After this outline, the practical next move is to create `project.json`, a hub scene, a first generated floor, and a local AI wrapper that adapts `AI/astar.js` into a clean room-based enemy pathing system.
