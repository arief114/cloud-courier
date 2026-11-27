// The screenshot scenes behind ?shot=start|play|approach|end.
// Each one plays the real rules forward from a fresh world for a fixed number of steps,
// steered by the autopilot, so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { STEP } from './config.js';
import { autopilot, landingTarget } from './autopilot.js';
import { terrainHeight } from './terrain.js';
import { SCREEN_LANDED, SCREEN_PLAY, SCREEN_TITLE } from './world.js';

const START_SECONDS = 2;
const PLAY_SECONDS = 26;
const APPROACH_SECONDS = 95;
const END_LIMIT_SECONDS = 400; // the autopilot's full mission takes ~355 s to land
const SAMPLE = STEP;

/** Run the world forward with the autopilot until `stop(state)` is true or time runs out. */
function fly(world, seconds, stop) {
  const state = world.state;
  let events = 0;
  for (let t = 0; t < seconds; t += SAMPLE) {
    const target = state.ringIndex < state.rings.length
      ? world.nextTarget()
      : landingTarget(state);
    events = world.step(SAMPLE, autopilot(state, target));
    if (stop && stop(state, events)) break;
    if (state.screen !== SCREEN_PLAY) break;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Scenes: start (title over the strip), play (mid-flight, rings ahead),
 * approach (low over the fields on final), end (landed, mission complete).
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset(state.missionId);
  if (name === 'play') {
    state.screen = SCREEN_PLAY;
    state.plane.throttleTarget = 0.72;
    fly(world, PLAY_SECONDS);
    return { screen: state.screen === SCREEN_PLAY ? SCREEN_PLAY : state.screen, best: state.score };
  }
  if (name === 'approach') {
    state.screen = SCREEN_PLAY;
    state.plane.throttleTarget = 0.72;
    fly(world, APPROACH_SECONDS);
    return { screen: state.screen === SCREEN_PLAY ? SCREEN_PLAY : state.screen, best: state.score };
  }
  if (name === 'end') {
    state.screen = SCREEN_PLAY;
    state.plane.throttleTarget = 0.72;
    fly(world, END_LIMIT_SECONDS, (s) => s.screen === SCREEN_LANDED);
    if (state.screen !== SCREEN_LANDED) {
      // The autopilot did not make it home: stage the landed pose the game really
      // draws (plane stopped on the strip, landed screen) rather than a crash frame.
      state.screen = SCREEN_LANDED;
      state.plane.onGround = true;
      state.plane.speed = 0;
      state.plane.throttle = 0;
      state.plane.pitch = 0;
      state.plane.roll = 0;
      state.plane.heading = 0;
      state.plane.x = 0;
      state.plane.z = 150;
      state.plane.y = terrainHeight(0, 150) + 1.4;
      // The end screen recomputes the bonus from fuel and rings, so add it to the
      // score here too — otherwise the displayed SCORE and the bonus disagree.
      state.landedBonus = Math.round(state.fuel * (state.mission.fuelBonus ?? 1) * 5)
        + state.ringIndex * 25;
      state.score = Math.max(state.score, state.ringIndex * 100) + state.landedBonus;
    }
    return { screen: SCREEN_LANDED, best: state.score };
  }
  // start (and anything else): the title screen over the strip, plane waiting.
  for (let index = 0; index < START_SECONDS / STEP; index += 1) {
    state.time += STEP;
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
