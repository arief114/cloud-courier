// Coral Island: heightfield, terrain colours, roads, the runway and the ring course.
// Everything here is a pure function of (x, z) and the seed, so the island never changes.
import { clamp, hash2, lerp, smoothstep } from './random.js';
import { RING_RADIUS, WORLD } from './config.js';

const { islandRadius } = WORLD;
const RUNWAY = WORLD.runway;

// Two gentle value-noise octaves, built from the cell hash so the terrain is smooth.
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, 11), b = hash2(ix + 1, iz, 11);
  const c = hash2(ix, iz + 1, 11), d = hash2(ix + 1, iz + 1, 11);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

function fbm(x, z) {
  return noise2(x * 0.0016, z * 0.0016) * 0.65 + noise2(x * 0.005 + 7.3, z * 0.005 + 2.9) * 0.35;
}

/** Is (x, z) inside the flattened runway strip (with a soft margin)? */
export function runwayFactor(x, z) {
  const dx = Math.abs(x - RUNWAY.cx);
  const dz = Math.abs(z - RUNWAY.cz);
  const fx = 1 - smoothstep(RUNWAY.width / 2, RUNWAY.width / 2 + 90, dx);
  const fz = 1 - smoothstep(RUNWAY.length / 2, RUNWAY.length / 2 + 90, dz);
  return Math.min(fx, fz);
}

/** Ground height in metres (sea is below 0). */
export function terrainHeight(x, z) {
  const d = Math.hypot(x, z - 300);
  const profile = smoothstep(islandRadius, islandRadius * 0.42, d);
  if (profile <= 0) return -6;
  let h = 34 * profile + 78 * fbm(x, z) * profile;
  // A rocky ridge in the north-east for a recognisable landmark.
  const ridge = Math.exp(-((x - 1900) * (x - 1900) + (z + 2100) * (z + 2100)) / (2 * 900 * 900));
  h += 95 * ridge * profile;
  // Flatten the runway and its approach.
  const rf = runwayFactor(x, z);
  h = lerp(h, 2, rf);
  // A flat valley along the runway's extended centreline, so the final approach
  // comes in over low ground instead of the island's hills.
  const corridorX = 1 - smoothstep(130, 240, Math.abs(x - RUNWAY.cx));
  const southOut = Math.max(0, z - (RUNWAY.cz + RUNWAY.length / 2));
  const northOut = Math.max(0, (RUNWAY.cz - RUNWAY.length / 2) - z);
  const corridorZ = 1 - smoothstep(0, 900, Math.max(southOut, northOut));
  const cf = Math.min(corridorX, corridorZ) * 0.9;
  h = lerp(h, Math.min(h, 22), cf);
  return h;
}

/** Is the point over water? */
export function isWater(x, z) {
  return terrainHeight(x, z) < 0.5;
}

// Roads: a coast road ring and a cross-island road from the town to the north field.
const ROADS = [
  // Coast ring, approximated as a circle of radius 2700 around (0, 300).
  { kind: 'circle', cx: 0, cz: 300, r: 2700, width: 14 },
  // Cross road: town -> runway -> north field.
  { kind: 'line', x1: 620, z1: 320, x2: 0, z2: -650, width: 12 },
  { kind: 'line', x1: 0, z1: -650, x2: -400, z2: -2400, width: 12 },
];

function distToSegment(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (pz - z1) * dz) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

function onRoad(x, z) {
  for (const road of ROADS) {
    if (road.kind === 'circle') {
      if (Math.abs(Math.hypot(x - road.cx, z - road.cz) - road.r) < road.width) return true;
    } else if (distToSegment(x, z, road.x1, road.z1, road.x2, road.z2) < road.width) {
      return true;
    }
  }
  return false;
}

const FIELD_COLORS = ['#79a94b', '#8cbb58', '#6d9a45', '#b3a24a', '#a4ad55', '#7fae4e', '#93b95e'];

/**
 * The colour of one terrain cell, by its centre. `cell` is the cell size in metres, used to
 * keep the field patchwork aligned to the grid so the fields read as separate plots.
 */
export function terrainColor(x, z, cell) {
  const h = terrainHeight(x, z);
  if (h < 0.5) {
    const v = hash2(Math.floor(x / 240), Math.floor(z / 240), 3);
    return v < 0.5 ? '#1e6ea6' : '#2278b4';
  }
  if (h < 3.2) return '#d9c48c'; // sand
  // The runway and roads are drawn as projected overlays by the renderer (a whole
  // 110 m cell would make a 14 m road look 110 m wide), so cells here stay fields.
  const townD = Math.hypot(x - WORLD.town.cx, z - WORLD.town.cz);
  if (townD < WORLD.town.radius) {
    const v = hash2(Math.floor(x / 70), Math.floor(z / 70), 5);
    return v < 0.45 ? '#9a8d7a' : v < 0.75 ? '#7d7468' : '#b0a58f';
  }
  if (h > 105) { // rocky ridge, varied by patch so it does not read as flat concrete
    const v = hash2(Math.floor(x / 90), Math.floor(z / 90), 11);
    return v < 0.33 ? '#8d8d80' : v < 0.66 ? '#7d7d72' : '#9a9a8c';
  }
  if (h > 68) { // high grassy hill, varied by patch
    const v = hash2(Math.floor(x / 90), Math.floor(z / 90), 13);
    return v < 0.33 ? '#5d7d49' : v < 0.66 ? '#527040' : '#688a54';
  }
  // Field patchwork: one colour per plot, plots sized by the cell grid.
  const ix = Math.floor(x / Math.max(cell, 90)), iz = Math.floor(z / Math.max(cell, 90));
  const v = hash2(ix, iz, 7);
  const base = FIELD_COLORS[Math.floor(v * FIELD_COLORS.length)];
  // Gentle slope shading for depth.
  const slope = Math.abs(terrainHeight(x + 24, z) - h) + Math.abs(terrainHeight(x, z + 24) - h);
  const shade = clamp(1 - slope * 0.012, 0.72, 1);
  const r = parseInt(base.slice(1, 3), 16), g = parseInt(base.slice(3, 5), 16), b = parseInt(base.slice(5, 7), 16);
  return `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`;
}

/** The road polylines the renderer strokes as overlays, at their true width. */
export function roadPaths() {
  const paths = [];
  // Coast ring.
  const ring = [];
  for (let i = 0; i <= 72; i += 1) {
    const a = (i / 72) * Math.PI * 2;
    ring.push([Math.cos(a) * 2700, 300 + Math.sin(a) * 2700]);
  }
  paths.push(ring);
  // Cross-island roads.
  paths.push([[620, 320], [0, -650], [-400, -2400]]);
  return paths;
}

/** The ring course: a loop around the island, altitudes from the mission. */
export function buildRings(mission) {
  const spots = [
    [900, -1500], [2100, -600], [2600, 900], [1500, 2200],
    [0, 2600], [-1600, 1900], [-2500, 400], [-1900, -1200],
  ];
  const start = startPose();
  const rings = [];
  for (let i = 0; i < mission.rings; i += 1) {
    const [x, z] = spots[i % spots.length];
    // Each ring faces the incoming plane: its normal points back along the leg
    // the plane flies to reach it (from the start for the first ring).
    const prev = i === 0 ? [start.x, start.z] : spots[(i - 1) % spots.length];
    const dx = prev[0] - x, dz = prev[1] - z;
    const len = Math.hypot(dx, dz) || 1;
    rings.push({
      x, z,
      y: mission.ringAltitude[i % mission.ringAltitude.length],
      nx: dx / len, nz: dz / len,
      radius: RING_RADIUS,
      passed: false,
    });
  }
  return rings;
}

/** The runway threshold the plane starts on, and its take-off heading. */
export function startPose() {
  return {
    x: RUNWAY.cx,
    y: terrainHeight(RUNWAY.cx, RUNWAY.cz + RUNWAY.length / 2 - 60) + 1.4,
    z: RUNWAY.cz + RUNWAY.length / 2 - 60,
    heading: 0, // north, down the strip
    pitch: 0,
    roll: 0,
  };
}

/** A point just past the threshold, used as the landing target. */
export function runwayTarget() {
  return { x: RUNWAY.cx, y: 60, z: RUNWAY.cz + RUNWAY.length / 2 + 350 };
}

/** Clouds: seeded clusters floating over the island. */
export function buildClouds(random, count) {
  const clouds = [];
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 600 + random() * 4200;
    clouds.push({
      x: Math.cos(angle) * radius,
      z: 300 + Math.sin(angle) * radius,
      y: 420 + random() * 320,
      size: 180 + random() * 260,
      puffs: 3 + Math.floor(random() * 3),
      seed: random() * 100,
    });
  }
  return clouds;
}
