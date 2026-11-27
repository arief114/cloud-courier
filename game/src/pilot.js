// The autopilot: a plain pilot that steers toward the next ring or the strip.
// It flies the deterministic screenshot scenes and doubles as a reference
// for players. Same flying rules as the game itself: slow down near rings,
// hold altitude over the hills, and only descend on final when lined up.
import { clamp, wrapAngle } from './rng.js';
import { groundHeight } from './island.js';
import { ISLAND } from './settings.js';

const STRIP = ISLAND.strip;

/** Steer toward `goal` ({x, y, z, kind}) for one step. */
export function flyToward(state, goal) {
  const p = state.plane;
  const dx = goal.x - p.x, dy = goal.y - p.y, dz = goal.z - p.z;
  const dist = Math.hypot(dx, dy, dz);
  const wantHeading = Math.atan2(dx, -dz);
  const headingErr = wrapAngle(wantHeading - p.heading);

  // Altitude: climb early to the goal's height, never lower than 60 m above
  // the ground ahead — the hills rise faster than a shallow climb.
  const aheadX = p.x + Math.sin(p.heading) * 400;
  const aheadZ = p.z - Math.cos(p.heading) * 400;
  const groundAhead = groundHeight(aheadX, aheadZ);
  let wantPitch;
  if (goal.kind === 'runway' && state.finalApproach) {
    // On final: only start the glide once lined up. While still turning onto
    // final, hold 130 m — the ground east and west of the strip is high, and
    // descending in the turn clips it. Keep 60 m above the ground ahead too.
    const linedUp = Math.abs(headingErr) < 0.35 && Math.abs(p.x - STRIP.x) < 250;
    if (linedUp) {
      wantPitch = clamp(Math.atan2(goal.y - p.y, Math.hypot(dx, dz)), -0.35, 0.25);
    } else {
      const holdAlt = Math.max(130, groundAhead + 60);
      wantPitch = clamp((holdAlt - p.y) * 0.02, -0.2, 0.3);
    }
  } else if (goal.kind === 'runway') {
    const clearance = dist > 500 ? 60 : 25;
    const safeAlt = Math.max(goal.y, groundAhead + clearance, dist > 900 ? 130 : 40);
    wantPitch = clamp((safeAlt - p.y) * 0.012, -0.3, 0.42);
  } else {
    const safeAlt = Math.max(goal.y, groundAhead + 60, 120);
    wantPitch = clamp((safeAlt - p.y) * 0.012, -0.3, 0.42);
  }

  // Bank into the turn, level out when aligned.
  let roll = clamp(headingErr * 1.8, -0.9, 0.9);
  // The stick is a deflection (plane pitch = stick * 0.55), so add the
  // feedforward or a plain loop only ever reaches half the wanted pitch.
  let pitch = clamp(wantPitch / 0.55 + (wantPitch - p.pitch) * 2.0, -0.9, 0.9);
  let throttle = 0.72;
  let flaps = false;
  let brake = false;

  if (goal.kind === 'ring') {
    if (dist < 700) throttle = 0.5;
    if (dist < 400) throttle = 0.42;
  }

  // Keep the speed in the flying band.
  if (p.speed < 34) throttle = Math.max(throttle, 0.9);
  if (p.speed > 62) throttle = Math.min(throttle, 0.45);

  if (goal.kind === 'runway') {
    const overStrip = Math.abs(p.x - STRIP.x) < 120
      && p.z > STRIP.z - STRIP.length / 2 - 400 && p.z < STRIP.z + STRIP.length / 2 + 400;
    if (dist < 1400) { throttle = 0.45; flaps = true; }
    if (dist < 500) { throttle = 0.3; flaps = true; }
    // Slow right down before the turn onto final, or the turn overshoots wide.
    if (!state.finalApproach && dist < 600) throttle = Math.min(throttle, 0.35);
    if (state.finalApproach && (Math.abs(headingErr) > 0.35 || Math.abs(p.x - STRIP.x) > 250)) {
      throttle = Math.min(throttle, 0.35);
    }
    if (overStrip && p.y < 80) {
      // Descend steadily until 20 m, then level off for the touchdown.
      const flare = p.y > 20 ? -0.15 : clamp((3 - p.y) * 0.03, -0.12, 0.15);
      pitch = clamp(flare / 0.55 + (flare - p.pitch) * 2.0, -0.9, 0.9);
      throttle = p.y > 20 ? 0.3 : (p.speed > 38 ? 0.2 : 0.12);
      if (p.onGround) brake = true;
    }
    // Keep the nose on the centreline while low.
    if (p.y < 120 && dist < 800) {
      roll = clamp(headingErr * 1.2 + (STRIP.x - p.x) * 0.002, -0.6, 0.6);
    }
  } else if (dist < 300) {
    // Close to a ring: keep full turn authority so the crossing stays on line.
    roll = clamp(roll * 1.1, -0.9, 0.9);
  }

  return { pitch, roll, throttle, flaps, brake };
}

/** The landing target: far out on the extended centreline, then a touchdown
 *  point on the strip. Once the plane reaches the far point the approach
 *  latches to final — the target never flips back. */
export function approachTarget(state) {
  const p = state.plane;
  const far = { x: STRIP.x, y: 130, z: STRIP.z + STRIP.length / 2 + 1250 };
  const near = { x: STRIP.x, y: 3, z: STRIP.z - STRIP.length / 2 + 100 };
  if (!state.finalApproach && Math.hypot(far.x - p.x, far.z - p.z) < 400) {
    state.finalApproach = true;
  }
  return state.finalApproach ? { ...near, kind: 'runway' } : { ...far, kind: 'runway' };
}
