// Cloud Courier v2 — one flight: arcade physics, rings, fuel, scoring,
// landings and crashes. Fixed 1/60 s steps; the renderer only paints state.
import { AIRCRAFT, ISLAND, MISSIONS, RING_R, RING_SCORE, TICK } from './settings.js';
import { clamp, makeRng, wrapAngle } from './rng.js';
import {
  buildBirds, buildBoats, buildClouds, buildHouses, buildPalms, buildRings,
  groundHeight, isSea, stripApproach, stripFactor, takeOffPose,
} from './island.js';

export const SCREEN = {
  title: 'title', play: 'play', paused: 'paused',
  landed: 'landed', crashed: 'crashed', timeout: 'timeout',
};

export const EV = { ring: 1, landed: 2, crashed: 4, timeout: 8, fuelEmpty: 16, stall: 32 };

const STRIP = ISLAND.strip;

/** Fresh flight state for a seed and mission. */
export function createFlight(seed, missionId) {
  const rng = makeRng(seed);
  const mission = MISSIONS[missionId] ?? MISSIONS[0];
  const pose = takeOffPose();
  const state = {
    mission, missionId,
    screen: SCREEN.title,
    clouds: buildClouds(rng, 42),
    palms: buildPalms(),
    houses: buildHouses(rng),
    boats: buildBoats(rng),
    birds: buildBirds(rng),
    rings: buildRings(mission),
    ringIndex: 0,
    plane: {
      x: pose.x, y: pose.y, z: pose.z,
      heading: pose.heading, pitch: 0, roll: 0,
      speed: 0, throttle: 0, throttleTarget: 0,
      flaps: false, onGround: true, vy: 0,
    },
    fuel: mission.fuel,
    score: 0,
    time: 0,
    best: 0,
    banner: null,
    bannerUntil: 0,
    crashReason: null,
    landBonus: 0,
    airborne: false, // set once the wheels first leave the strip
    finalApproach: false, // the autopilot's latch; the pilot sets it
    muted: false,
    lastStallWarn: -9,
    lastLowWarn: -9,
  };

  function fresh(missionNext) {
    const next = createFlight(seed, missionNext ?? state.missionId);
    for (const k of Object.keys(state)) state[k] = next.state[k];
  }

  /** Where the pilot should aim next: the next ring, or the strip when done. */
  function nextTarget() {
    const ring = state.rings[state.ringIndex];
    if (ring) return { x: ring.x, y: ring.y, z: ring.z, kind: 'ring' };
    const t = stripApproach();
    return { x: t.x, y: t.y, z: t.z, kind: 'runway' };
  }

  function distanceToTarget() {
    const t = nextTarget();
    const p = state.plane;
    return Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
  }

  /** One fixed step. Returns an event bitmask; only runs while playing. */
  function advance(dt, stick) {
    if (state.screen !== SCREEN.play) return 0;
    state.time += dt;
    const p = state.plane;
    const stallAt = p.flaps ? AIRCRAFT.stallFlaps : AIRCRAFT.stall;

    // Throttle eases toward its target; an empty tank forces idle.
    if (stick.throttle !== null && stick.throttle !== undefined) p.throttleTarget = stick.throttle;
    if (state.fuel <= 0) p.throttleTarget = 0;
    p.throttle += clamp(p.throttleTarget - p.throttle, -dt * 0.7, dt * 0.5);
    p.flaps = !!stick.flaps;

    // The stick eases the bank and pitch toward their targets.
    const bankWant = clamp(stick.roll, -1, 1) * 1.05;
    const pitchWant = clamp(stick.pitch, -1, 1) * 0.55;
    p.roll += (bankWant - p.roll) * Math.min(1, dt * 2.2);
    p.pitch += (pitchWant - p.pitch) * Math.min(1, dt * 1.6);

    const stalling = p.speed < stallAt && !p.onGround;
    if (stalling) p.pitch += (0 - p.pitch) * Math.min(1, dt * 1.2) - dt * 0.25;

    // Speed: thrust against drag and the climb.
    const drag = AIRCRAFT.drag * (p.flaps ? 1.7 : 1) * p.speed * p.speed;
    const climb = 9.8 * Math.sin(p.pitch) * 0.4;
    p.speed += (p.throttle * AIRCRAFT.thrust - drag - climb) * dt;
    p.speed = clamp(p.speed, 0, AIRCRAFT.topSpeed);

    // A banked turn: heading follows the bank, quicker when slow.
    const turn = p.speed > 4 ? (9.8 * Math.tan(p.roll * 0.85)) / Math.max(p.speed, 12) : 0;
    p.heading = wrapAngle(p.heading + turn * dt);

    // Move along the nose.
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const fx = Math.sin(p.heading) * cp, fy = sp, fz = -Math.cos(p.heading) * cp;
    let vy = p.speed * fy;
    if (!p.onGround && p.speed < stallAt) vy -= (stallAt - p.speed) * 0.55;
    p.vy = vy;
    p.x += fx * p.speed * dt;
    p.z += fz * p.speed * dt;

    const ground = groundHeight(p.x, p.z);
    let events = 0;

    if (p.onGround) {
      p.y = ground + 1.4;
      if (p.speed > stallAt * 0.95 && p.pitch > 0.06) {
        p.onGround = false;
        state.airborne = true;
        p.y += 0.5;
      }
      if (stick.brake) p.speed = Math.max(0, p.speed - 22 * dt);
    } else {
      p.y += vy * dt;
    }

    // Fuel burns with the throttle.
    const burn = (AIRCRAFT.fuelBase + AIRCRAFT.fuelFull * p.throttle) * dt;
    const hadFuel = state.fuel > 0;
    state.fuel = Math.max(0, state.fuel - burn);
    if (hadFuel && state.fuel <= 0) {
      events |= EV.fuelEmpty;
      state.banner = 'FUEL EMPTY — GLIDE TO THE RUNWAY';
      state.bannerUntil = state.time + 4;
    }

    // Rings: crossing the ring's plane inside its circle scores.
    const ring = state.rings[state.ringIndex];
    if (ring && !ring.passed) {
      const before = (p.x - ring.x) * ring.nx + (p.z - ring.z) * ring.nz;
      const px = p.x - fx * p.speed * dt, pz = p.z - fz * p.speed * dt;
      const beforePrev = (px - ring.x) * ring.nx + (pz - ring.z) * ring.nz;
      if (beforePrev * before <= 0 && beforePrev !== before) {
        const dist = Math.hypot(p.x - ring.x, p.y - ring.y, p.z - ring.z);
        if (dist < ring.radius + 6) {
          ring.passed = true;
          state.ringIndex += 1;
          state.score += RING_SCORE;
          events |= EV.ring;
          state.banner = state.ringIndex >= state.rings.length
            ? 'ALL RINGS! LAND ON THE RUNWAY'
            : `RING ${state.ringIndex}/${state.rings.length}  +100`;
          state.bannerUntil = state.time + 3;
        } else {
          state.banner = 'MISSED THE RING — TURN BACK';
          state.bannerUntil = state.time + 2.5;
        }
      }
    }

    // Ground contact.
    const groundNow = groundHeight(p.x, p.z);
    if (!p.onGround && p.y <= groundNow + 1.4) {
      const onStrip = stripFactor(p.x, p.z) > 0.55;
      const linedUp = Math.abs(wrapAngle(p.heading)) < 0.4 || Math.abs(wrapAngle(p.heading - Math.PI)) < 0.4;
      const gentle = Math.abs(p.vy) < 4.5 && p.speed < 48;
      if (onStrip && linedUp && gentle && !isSea(p.x, p.z)) {
        p.onGround = true;
        p.y = groundNow + 1.4;
        p.pitch = 0;
        p.roll *= 0.4;
        if (p.speed < 6) finishLanding();
      } else {
        state.screen = SCREEN.crashed;
        state.crashReason = isSea(p.x, p.z)
          ? 'Ditched in the sea'
          : p.speed > 55 ? 'Hit the ground too fast' : 'Clipped the terrain';
        events |= EV.crashed;
      }
    }

    // Rolled to a stop on the strip after flying: that is the landing.
    if (p.onGround && state.airborne && state.screen === SCREEN.play && p.speed < 6
      && stripFactor(p.x, p.z) > 0.55 && !isSea(p.x, p.z)) {
      finishLanding();
    }

    // Out of time.
    if (state.time > state.mission.limit) {
      state.screen = SCREEN.timeout;
      events |= EV.timeout;
    }

    // Stall and low-altitude warnings.
    if (stalling && state.time > state.lastStallWarn + 3) {
      state.lastStallWarn = state.time;
      state.banner = 'STALL! NOSE DOWN, ADD POWER';
      state.bannerUntil = state.time + 2;
      events |= EV.stall;
    }
    const agl = p.y - groundNow;
    if (!p.onGround && agl < 35 && p.vy < -2 && state.time > state.lastLowWarn + 4) {
      state.lastLowWarn = state.time;
      state.banner = 'TOO LOW — PULL UP';
      state.bannerUntil = state.time + 2;
    }
    return events;

    function finishLanding() {
      const fuelBonus = Math.round(state.fuel * (state.mission.fuelBonus ?? 1) * 5);
      const ringBonus = state.ringIndex * 25;
      state.landBonus = fuelBonus + ringBonus;
      state.score += state.landBonus;
      state.screen = SCREEN.landed;
    }
  }

  return { state, reset: fresh, step: advance, nextTarget, distanceToTarget };
}
