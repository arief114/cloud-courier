// The autopilot: a simple pilot that flies toward the next ring or the runway.
// It powers the deterministic screenshot scenes and doubles as a reference for players.
import { clamp, wrapAngle } from './random.js';
import { terrainHeight } from './terrain.js';
import { WORLD } from './config.js';

const RUNWAY = WORLD.runway;

/**
 * Steer the plane toward `target` ({x, y, z, kind}). Returns the stick
 * {pitch, roll, throttle, flaps, brake} for one step.
 */
export function autopilot(state, target) {
  const p = state.plane;
  const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
  const dist = Math.hypot(dx, dy, dz);
  const desiredHeading = Math.atan2(dx, -dz);
  const headingErr = wrapAngle(desiredHeading - p.heading);

  // Altitude: climb early to the target's height, and never fly lower than 60 m
  // above the ground ahead — the island's hills rise faster than a shallow climb.
  // On the runway leg the floor drops so the plane can come down the final.
  const aheadX = p.x + Math.sin(p.heading) * 400;
  const aheadZ = p.z - Math.cos(p.heading) * 400;
  const groundAhead = terrainHeight(aheadX, aheadZ);
  let desiredPitch;
  if (target.kind === 'runway' && state.finalApproach) {
    // On final: only start the glide once lined up with the runway. While still
    // turning onto final, hold 130 m — the ground east and west of the strip is
    // high, and descending in the turn clips it.
    const linedUp = Math.abs(headingErr) < 0.35 && Math.abs(p.x - RUNWAY.cx) < 250;
    if (linedUp) {
      desiredPitch = clamp(Math.atan2(target.y - p.y, Math.hypot(dx, dz)), -0.35, 0.25);
    } else {
      desiredPitch = clamp((130 - p.y) * 0.02, -0.2, 0.3);
    }
  } else if (target.kind === 'runway') {
    // Stay 60 m above the ground ahead until close in, then come down the final.
    const clearance = dist > 500 ? 60 : 25;
    const safeAlt = Math.max(target.y, groundAhead + clearance, dist > 900 ? 130 : 40);
    desiredPitch = clamp((safeAlt - p.y) * 0.012, -0.3, 0.42);
  } else {
    const safeAlt = Math.max(target.y, groundAhead + 60, 120);
    desiredPitch = clamp((safeAlt - p.y) * 0.012, -0.3, 0.42);
  }

  // Bank into the turn, proportional to the heading error; level out when aligned.
  // Near a ring the plane slows right down: a slow plane turns in a much tighter
  // circle, which is what threading a 26 m ring takes.
  let roll = clamp(headingErr * 1.8, -0.9, 0.9);
  // Pitch toward the target altitude, eased.
  // Pitch: the stick is a deflection and the plane's pitch is the stick times
  // 0.55, so a plain proportional loop only ever reaches about half the wanted
  // pitch. Add the feedforward (wanted pitch / 0.55) so it lands on target.
  let pitch = clamp(desiredPitch / 0.55 + (desiredPitch - p.pitch) * 2.0, -0.9, 0.9);
  let throttle = 0.72;
  let flaps = false;
  let brake = false;

  if (target.kind === 'ring') {
    if (dist < 700) throttle = 0.5;
    if (dist < 400) throttle = 0.42;
  }

  // Keep the speed in the flying band: more power when slow, less when fast.
  // (The runway branch below may override this on final approach.)
  if (p.speed < 34) throttle = Math.max(throttle, 0.9);
  if (p.speed > 62) throttle = Math.min(throttle, 0.45);

  if (target.kind === 'runway') {
    // Final approach: line up with the strip, descend gently, slow down.
    const along = p.z - (RUNWAY.cz - RUNWAY.length / 2); // 0 at the far threshold
    const overStrip = Math.abs(p.x - RUNWAY.cx) < 120 && p.z > RUNWAY.cz - RUNWAY.length / 2 - 400 && p.z < RUNWAY.cz + RUNWAY.length / 2 + 400;
    if (dist < 1400) {
      throttle = 0.45;
      flaps = true;
    }
    if (dist < 500) {
      throttle = 0.3;
      flaps = true;
    }
    // Slow right down for the last stretch before the turn onto final, or the
    // turn overshoots wide.
    if (!state.finalApproach && dist < 600) {
      throttle = Math.min(throttle, 0.35);
    }
    // And slow while turning onto final, for the same reason.
    if (state.finalApproach && (Math.abs(headingErr) > 0.35 || Math.abs(p.x - RUNWAY.cx) > 250)) {
      throttle = Math.min(throttle, 0.35);
    }
    if (overStrip && p.y < 80) {
      // Descend steadily until 20 m, then level off for the touchdown — and keep
      // the speed up until the wheels are nearly down, or the plane floats.
      // (The stick is a deflection: the plane's pitch is the stick times 0.55, so
      // the flare aims the plane's pitch with the same controller as the climb.)
      const flarePitch = p.y > 20 ? -0.15 : clamp((3 - p.y) * 0.03, -0.12, 0.15);
      pitch = clamp(flarePitch / 0.55 + (flarePitch - p.pitch) * 2.0, -0.9, 0.9);
      throttle = p.y > 20 ? 0.3 : (p.speed > 38 ? 0.2 : 0.12);
      if (p.onGround) brake = true;
    }
    // Keep the nose on the centreline while low: blend the heading error with a
    // gentle pull toward the strip, so the two never fight each other.
    if (p.y < 120 && dist < 800) {
      roll = clamp(headingErr * 1.2 + (RUNWAY.cx - p.x) * 0.002, -0.6, 0.6);
    }
    void along;
  } else if (dist < 300) {
    // Close to a ring: keep full turn authority so the crossing stays on line.
    roll = clamp(roll * 1.1, -0.9, 0.9);
  }

  return { pitch, roll, throttle, flaps, brake };
}

/** The landing target: far out on the extended centreline, then a touchdown point on the strip.
 * Once the plane reaches the far point the approach latches to final — the target never
 * flips back, or the plane would chase it back and forth past the strip. */
export function landingTarget(state) {
  const p = state.plane;
  const far = { x: RUNWAY.cx, y: 130, z: RUNWAY.cz + RUNWAY.length / 2 + 1250 };
  // Aim for a point near the far end of the strip, not its middle: the plane
  // flies down the runway toward it and touches down on the way, instead of
  // passing the target and trying to turn back at low altitude.
  const near = { x: RUNWAY.cx, y: 3, z: RUNWAY.cz - RUNWAY.length / 2 + 100 };
  if (!state.finalApproach && Math.hypot(far.x - p.x, far.z - p.z) < 400) {
    state.finalApproach = true;
  }
  return state.finalApproach ? { ...near, kind: 'runway' } : { ...far, kind: 'runway' };
}
