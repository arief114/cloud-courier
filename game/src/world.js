// The world: one flight. Fixed-step arcade physics, rings, fuel, scoring, landing and crashes.
// Screens: title, play, paused, landed, crashed, timeout.
import { MISSIONS, PLANE, RING_RADIUS, STEP, WORLD } from './config.js';
import { clamp, wrapAngle } from './random.js';
import { buildClouds, buildRings, isWater, runwayFactor, runwayTarget, startPose, terrainHeight } from './terrain.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LANDED = 'landed';
export const SCREEN_CRASHED = 'crashed';
export const SCREEN_TIMEOUT = 'timeout';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_TIMEOUT = 8;
export const EVENT_FUEL_EMPTY = 16;
export const EVENT_STALL = 32;

const RUNWAY = WORLD.runway;

export function createWorld(random, missionId) {
  const mission = MISSIONS[missionId] ?? MISSIONS[0];
  const pose = startPose();
  const state = {
    mission,
    missionId,
    screen: SCREEN_TITLE,
    random,
    clouds: buildClouds(random, 42),
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
    messages: [],
    banner: null,
    bannerUntil: 0,
    crashed: null,
    landedBonus: 0,
    hasFlown: false, // set once the plane first leaves the ground (so sitting on the strip at the start is not a "landing")
    muted: false,
    // Steering inputs for this step; the loop writes them, shots/autopilot too.
    input: { pitch: 0, roll: 0, throttle: null, flaps: false, brake: false },
  };
  return {
    state,
    reset(missionIdNext) {
      const next = createWorld(state.random, missionIdNext ?? state.missionId);
      Object.keys(state).forEach((k) => { state[k] = next.state[k]; });
    },
    /** Advance one fixed step. Returns an event bitmask. */
    step(dt, input) {
      const s = state;
      if (s.screen !== SCREEN_PLAY) return 0;
      s.time += dt;
      const p = s.plane;
      const stallSpeed = p.flaps ? PLANE.stallSpeedFlaps : PLANE.stallSpeed;

      // Throttle eases toward its target; fuel starvation forces it to idle.
      if (input.throttle !== null && input.throttle !== undefined) p.throttleTarget = input.throttle;
      if (s.fuel <= 0) p.throttleTarget = 0;
      p.throttle += clamp(p.throttleTarget - p.throttle, -dt * 0.7, dt * 0.5);
      p.flaps = !!input.flaps;

      // Bank and pitch ease toward the stick.
      const rollTarget = clamp(input.roll, -1, 1) * 1.05;
      const pitchTarget = clamp(input.pitch, -1, 1) * 0.55;
      p.roll += (rollTarget - p.roll) * Math.min(1, dt * 2.2);
      p.pitch += (pitchTarget - p.pitch) * Math.min(1, dt * 1.6);

      const stalling = p.speed < stallSpeed && !p.onGround;
      if (stalling) p.pitch += (0 - p.pitch) * Math.min(1, dt * 1.2) - dt * 0.25;

      // Speed: thrust against drag and the climb.
      const drag = PLANE.drag * (p.flaps ? 1.7 : 1) * p.speed * p.speed;
      const climbDrag = 9.8 * Math.sin(p.pitch) * 0.4;
      p.speed += (p.throttle * PLANE.maxThrust - drag - climbDrag) * dt;
      p.speed = clamp(p.speed, 0, PLANE.maxSpeed);

      // A banked turn: the heading follows the bank, faster when slow.
      const turnRate = p.speed > 4 ? (9.8 * Math.tan(p.roll * 0.85)) / Math.max(p.speed, 12) : 0;
      p.heading = wrapAngle(p.heading + turnRate * dt);

      // Move along the nose.
      const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
      const fx = Math.sin(p.heading) * cp, fy = sp, fz = -Math.cos(p.heading) * cp;
      let vy = p.speed * fy;
      if (!p.onGround && p.speed < stallSpeed) vy -= (stallSpeed - p.speed) * 0.55;
      p.vy = vy;
      p.x += fx * p.speed * dt;
      p.z += fz * p.speed * dt;

      const ground = terrainHeight(p.x, p.z);
      let events = 0;

      if (p.onGround) {
        p.y = ground + 1.4;
        // Rotate and lift off once fast enough and pulling up.
        if (p.speed > stallSpeed * 0.95 && p.pitch > 0.06) {
          p.onGround = false;
          s.hasFlown = true;
          p.y += 0.5;
        }
        if (input.brake) p.speed = Math.max(0, p.speed - 22 * dt);
      } else {
        p.y += vy * dt;
      }

      // Fuel burns with the throttle.
      const burn = (PLANE.fuelBurnBase + PLANE.fuelBurnThrottle * p.throttle) * dt;
      const hadFuel = s.fuel > 0;
      s.fuel = Math.max(0, s.fuel - burn);
      if (hadFuel && s.fuel <= 0) {
        events |= EVENT_FUEL_EMPTY;
        s.banner = 'FUEL EMPTY — GLIDE TO THE RUNWAY';
        s.bannerUntil = s.time + 4;
      }

      // Rings: crossing the ring's plane inside its circle scores. The crossing is
      // a sign change of the plane's offset from the ring's plane, either way.
      const ring = s.rings[s.ringIndex];
      if (ring && !ring.passed) {
        const before = (p.x - ring.x) * ring.nx + (p.z - ring.z) * ring.nz;
        const px = p.x - fx * p.speed * dt, pz = p.z - fz * p.speed * dt;
        const beforePrev = (px - ring.x) * ring.nx + (pz - ring.z) * ring.nz;
        if (beforePrev * before <= 0 && beforePrev !== before) {
          const dx = p.x - ring.x, dy = p.y - ring.y, dz = p.z - ring.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist < ring.radius + 6) {
            ring.passed = true;
            s.ringIndex += 1;
            s.score += 100;
            events |= EVENT_RING;
            s.banner = s.ringIndex >= s.rings.length
              ? 'ALL RINGS! LAND ON THE RUNWAY'
              : `RING ${s.ringIndex}/${s.rings.length}  +100`;
            s.bannerUntil = s.time + 3;
          } else {
            s.banner = 'MISSED THE RING — TURN BACK';
            s.bannerUntil = s.time + 2.5;
          }
        }
      }

      // Ground contact.
      const groundNow = terrainHeight(p.x, p.z);
      if (!p.onGround && p.y <= groundNow + 1.4) {
        const onStrip = runwayFactor(p.x, p.z) > 0.55;
        const aligned = Math.abs(wrapAngle(p.heading - 0)) < 0.4 || Math.abs(wrapAngle(p.heading - Math.PI)) < 0.4;
        const gentle = Math.abs(p.vy) < 4.5 && p.speed < 48;
        if (onStrip && aligned && gentle && !isWater(p.x, p.z)) {
          p.onGround = true;
          p.y = groundNow + 1.4;
          p.pitch = 0;
          p.roll *= 0.4;
          if (p.speed < 6) {
            const fuelBonus = Math.round(s.fuel * (s.mission.fuelBonus ?? 1) * 5);
            const ringBonus = s.ringIndex * 25;
            s.landedBonus = fuelBonus + ringBonus;
            s.score += s.landedBonus;
            s.screen = SCREEN_LANDED;
            events |= EVENT_LANDED;
          }
        } else {
          s.screen = SCREEN_CRASHED;
          s.crashed = isWater(p.x, p.z)
            ? 'Ditched in the sea'
            : p.speed > 55 ? 'Hit the ground too fast' : 'Clipped the terrain';
          events |= EVENT_CRASHED;
        }
      }

      // Rolled to a stop on the strip after flying: a landing. (The touchdown
      // itself usually happens above 6 m/s, so the rollout is what counts.)
      if (p.onGround && s.hasFlown && s.screen === SCREEN_PLAY && p.speed < 6
        && runwayFactor(p.x, p.z) > 0.55 && !isWater(p.x, p.z)) {
        const fuelBonus = Math.round(s.fuel * (s.mission.fuelBonus ?? 1) * 5);
        const ringBonus = s.ringIndex * 25;
        s.landedBonus = fuelBonus + ringBonus;
        s.score += s.landedBonus;
        s.screen = SCREEN_LANDED;
        events |= EVENT_LANDED;
      }

      // Out of time.
      if (s.time > s.mission.timeLimit) {
        s.screen = SCREEN_TIMEOUT;
        events |= EVENT_TIMEOUT;
      }

      // Stall and low-altitude warnings.
      if (stalling && s.time > (s.lastStallWarn ?? -9) + 3) {
        s.lastStallWarn = s.time;
        s.banner = 'STALL! NOSE DOWN, ADD POWER';
        s.bannerUntil = s.time + 2;
        events |= EVENT_STALL;
      }
      const agl = p.y - groundNow;
      if (!p.onGround && agl < 35 && p.vy < -2 && s.time > (s.lastLowWarn ?? -9) + 4) {
        s.lastLowWarn = s.time;
        s.banner = 'TOO LOW — PULL UP';
        s.bannerUntil = s.time + 2;
      }
      return events;
    },
    /** Where the pilot should aim next: the next ring, or the runway when the rings are done. */
    nextTarget() {
      const s = state;
      const ring = s.rings[s.ringIndex];
      if (ring) return { x: ring.x, y: ring.y, z: ring.z, kind: 'ring' };
      const t = runwayTarget();
      return { x: t.x, y: t.y, z: t.z, kind: 'runway' };
    },
    /** Distance to the next target, in metres. */
    distanceToTarget() {
      const s = state;
      const t = this.nextTarget();
      return Math.hypot(t.x - s.plane.x, t.y - s.plane.y, t.z - s.plane.z);
    },
  };
}

/** A fresh world for a seed. */
export function createGame(seed, missionId) {
  return createWorld(createRandom(seed), missionId ?? 0);
}
