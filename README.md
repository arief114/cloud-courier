# Cloud Courier — Coral Island Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/arief114/cloud-courier/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/arief114/cloud-courier/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

An original flight game for the make.fun "Make the best flight game" bounty.
Fly the Dart-9 bush plane through sky rings over Coral Island, then land on the
runway at Coral Field. Three missions (Ring Run, Golden Hour Hop, Dawn Patrol)
with different ring counts, fuel and time limits.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 and fly:

- **Arrows** (or I/J/K/L) steer — up/down pitch, left/right bank
- **W / S** (or Shift / Ctrl) throttle up / down
- **F** flaps, **B** brake on the ground, **P** pause, **R** restart, **M** mute
- **Mouse**: hold and move to steer with the pointer
- **1 / 2 / 3** pick a mission on the title screen, **Enter** to fly

Land gently on the runway strip (slow, level, lined up) to finish a mission.
Rings are worth 100 points each; leftover fuel and rings add a landing bonus.

## Shots

The screenshots under `screenshots/` are real renders of the game, staged by
`game/src/shots.js` through `?shot=start|play|approach|end&seed=7` and captured
in desktop Chromium.

## Structure

- `game/src/config.js` — constants, missions, skies
- `game/src/random.js` — seeded randomness
- `game/src/terrain.js` — the island, runway, roads, ring course, clouds
- `game/src/world.js` — flight physics, rings, fuel, scoring, landing/crashes
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised Web Audio sound, no audio files
- `game/src/render.js` — the 3D chase view, plane, lit HUD, screens
- `game/src/autopilot.js` — the pilot behind the screenshot scenes
- `game/src/shots.js` — the deterministic screenshot scenes
- `game/src/main.js` — boot and the game loop

---

<sub>Entered on [make.fun](https://make.fun/?ref=2r03560m&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
