// Screenshot staging: puts the plane into a hand-placed, deterministic pose
// for each of the four dossier shots. A shot name is a URL query
// (`?shot=cover|start|play|approach|end`), and the same function is what the
// kit's screenshot task calls. The poses are chosen so every required
// element is visible: chase view over the island, the aircraft with lit
// instruments, a runway or ring ahead, and the HUD. Each pose points at its
// next target (heading = atan2(dx, -dz) toward it), then the autopilot flies
// the real flight step for two seconds so the pose settles honestly.
import { ISLAND, RING_SCORE } from './settings.js';
import { groundHeight } from './island.js';
import { SCREEN } from './flight.js';
import { flyToward, approachTarget } from './pilot.js';

const SHOTS = {
  // Golden hour over the southern sea: the island and the next ring ahead,
  // sun glitter on the water. The cover.
  cover: {
    mission: 1, x: 0, y: 200, z: 5700, heading: 0, pitch: 0.02, speed: 58,
    throttle: 0.66, time: 52, rings: 4,
  },
  // Dawn departure: the Dart-9 climbing off the strip toward the first ring.
  start: {
    mission: 2, x: -40, y: 105, z: 120, heading: 0.53, pitch: 0.3, speed: 42,
    throttle: 0.9, time: 16, rings: 0,
  },
  // Midday, threading the rings at altitude over the east of the island.
  play: {
    mission: 0, x: 1900, y: 280, z: 500, heading: 2.09, pitch: 0.02, speed: 55,
    throttle: 0.7, time: 165, rings: 2,
  },
  // Final approach at dusk: on the glide, threshold lights and numbers ahead.
  approach: {
    mission: 2, x: 30, y: 100, z: 800, heading: -0.03, pitch: -0.1, speed: 38,
    throttle: 0.42, time: 265, rings: 8, flaps: true, final: true,
  },
  // Parked on the strip after the last ring, mission complete.
  end: {
    mission: 0, x: 12, y: 3, z: -240, heading: 0, pitch: 0, speed: 0,
    throttle: 0, time: 342, rings: 8, landed: true,
  },
};

/** Read `?shot=<name>` from the URL, or null when this is a normal play. */
export function shotFromUrl(search) {
  const name = new URLSearchParams(search).get('shot');
  return name && SHOTS[name] ? name : null;
}

/** Pose the plane for a screenshot, then run the autopilot for a few frames
 *  so the flight model settles into the pose instead of snapping. */
export function stageShot(flight, name) {
  const shot = SHOTS[name];
  const state = flight.state;
  flight.reset(shot.mission);
  const p = state.plane;
  p.x = shot.x;
  p.y = shot.y;
  p.z = shot.z;
  p.heading = shot.heading;
  p.pitch = shot.pitch;
  p.roll = 0;
  p.speed = shot.speed;
  p.vy = 0;
  p.throttle = shot.throttle;
  p.throttleTarget = shot.throttle;
  p.flaps = Boolean(shot.flaps);
  p.onGround = false;
  state.time = shot.time;
  state.ringIndex = Math.min(shot.rings, state.rings.length);
  for (let i = 0; i < shot.rings; i += 1) state.rings[i].passed = true;
  state.finalApproach = Boolean(shot.final);
  state.screen = SCREEN.play;
  if (shot.landed) {
    p.onGround = true;
    p.speed = 0;
    p.throttle = 0;
    p.throttleTarget = 0;
    p.y = groundHeight(p.x, p.z) + 1.4;
    state.screen = SCREEN.landed;
    state.fuel = 42;
    const fuelBonus = Math.round(state.fuel * (state.mission.fuelBonus ?? 1) * 5);
    const ringBonus = state.ringIndex * 25;
    state.landBonus = fuelBonus + ringBonus;
    state.score = state.ringIndex * RING_SCORE + state.landBonus;
  }
  if (!shot.landed) {
    // Two seconds of real flight steps with the autopilot holding the pose.
    for (let i = 0; i < 120; i += 1) {
      const goal = state.ringIndex < state.rings.length
        ? { ...state.rings[state.ringIndex], kind: 'ring' }
        : approachTarget(state);
      flight.step(1 / 60, flyToward(state, goal));
    }
  }
}

export { SHOTS };
