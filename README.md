# Cloud Courier — Coral Island Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/arief114/cloud-courier/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/arief114/cloud-courier/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

An original flight game for the make.fun "Make the best flight game" bounty.
Fly the Dart-9 bush plane through glowing sky rings over Coral Island, then
bring her home to the runway at Coral Field. Three missions (Ring Run, Golden
Hour Hop, Dawn Patrol) with different ring counts, fuel and time limits — and
an autopilot that can fly a whole mission and land it for you.

Version 2 rebuilds the island for the judge's eye: a three-level terrain
grid with beaches, foam at the shore, cliffs and forest, a town of houses,
palm groves, sailboats, birds, two cloud layers and a sun-glitter path on the
water; a more built-looking Dart-9 with spinner, struts, gear and nav lights;
a lit HUD with a compass tape, vertical-speed needle, next-target readout and
a live minimap; and a golden-hour cover shot that shows the flight, not the
title screen.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 and fly:

- **Arrows** (or I/J/K/L) steer — up/down pitch, left/right bank
- **W / S** throttle up / down
- **F** flaps, **B** brake on the ground, **P** pause, **R** restart, **M** mute
- **Mouse**: move the pointer to steer
- **1 / 2 / 3** pick a mission on the title screen, **Enter** to fly

Land gently on the runway strip (slow, level, lined up) to finish a mission.
Each ring is worth 100 points; leftover fuel and rings flown add a landing
bonus. Best score is saved in your browser.

## Shots

The screenshots under `screenshots/` are real renders of the game, staged by
`game/src/scenes.js` through `?shot=cover|start|play|approach|end&seed=7` and
captured in desktop Chromium at 1280×720.

## Structure

- `game/src/settings.js` — constants, missions, time-of-day lighting
- `game/src/rng.js` — seeded randomness
- `game/src/island.js` — the island, runway, roads, ring course, clouds, palms, houses, boats, birds
- `game/src/flight.js` — flight physics, rings, fuel, scoring, landing/crashes
- `game/src/pilot.js` — the autopilot that flies missions and lands
- `game/src/view.js` — the 3D chase view, plane, lit HUD, screens
- `game/src/scenes.js` — the deterministic screenshot scenes
- `game/src/controls.js` — keyboard and mouse
- `game/src/sound.js` — synthesised Web Audio sound, no audio files
- `game/src/boot.js` — boot and the game loop

---

<sub>Entered on [make.fun](https://make.fun/?ref=2r03560m&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
