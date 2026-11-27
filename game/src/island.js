// Coral Island v2: the heightfield, its colours, roads, runway, ring course,
// and the dressing — palm groves, town houses, boats and birds.
// Everything is a pure function of (x, z) and the seed: the island never changes.
import { clamp, cellHash, mix, smooth } from './rng.js';
import { ISLAND, RING_R } from './settings.js';

const R = ISLAND.radius;
const STRIP = ISLAND.strip;

// Two soft value-noise octaves from the cell hash.
function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = cellHash(ix, iz, 11), b = cellHash(ix + 1, iz, 11);
  const c = cellHash(ix, iz + 1, 11), d = cellHash(ix + 1, iz + 1, 11);
  return mix(mix(a, b, sx), mix(c, d, sx), sz);
}

function rolling(x, z) {
  return valueNoise(x * 0.0016, z * 0.0016) * 0.65
    + valueNoise(x * 0.005 + 7.3, z * 0.005 + 2.9) * 0.35;
}

/** How much (x, z) is flattened into the runway strip (1 = fully flat). */
export function stripFactor(x, z) {
  const dx = Math.abs(x - STRIP.x);
  const dz = Math.abs(z - STRIP.z);
  const fx = 1 - smooth(STRIP.width / 2, STRIP.width / 2 + 90, dx);
  const fz = 1 - smooth(STRIP.length / 2, STRIP.length / 2 + 90, dz);
  return Math.min(fx, fz);
}

/** Ground height in metres; the sea is below 0. */
export function groundHeight(x, z) {
  const d = Math.hypot(x, z - ISLAND.centreZ);
  const land = smooth(R, R * 0.42, d);
  if (land <= 0) return -6;
  let h = 34 * land + 78 * rolling(x, z) * land;
  // Rocky ridge north-east: the island's landmark.
  const rx = x - 1900, rz = z + 2100;
  h += 95 * Math.exp(-(rx * rx + rz * rz) / (2 * 900 * 900)) * land;
  // Flatten the strip and its approach.
  h = mix(h, 2, stripFactor(x, z));
  // A low valley along the strip's extended centreline for the final approach.
  const side = 1 - smooth(130, 240, Math.abs(x - STRIP.x));
  const beyond = Math.max(0, z - (STRIP.z + STRIP.length / 2), (STRIP.z - STRIP.length / 2) - z);
  const along = 1 - smooth(0, 900, beyond);
  h = mix(h, Math.min(h, 22), Math.min(side, along) * 0.9);
  return h;
}

export function isSea(x, z) { return groundHeight(x, z) < 0.5; }

// Roads: a coast ring and a cross-island road through the town and the strip.
const ROADS = [
  { kind: 'circle', cx: 0, cz: ISLAND.centreZ, r: 2700, width: 14 },
  { kind: 'line', x1: 620, z1: 320, x2: 0, z2: -650, width: 12 },
  { kind: 'line', x1: 0, z1: -650, x2: -400, z2: -2400, width: 12 },
];

function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (pz - z1) * dz) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

function nearRoad(x, z) {
  for (const road of ROADS) {
    if (road.kind === 'circle') {
      if (Math.abs(Math.hypot(x - road.cx, z - road.cz) - road.r) < road.width) return true;
    } else if (segDist(x, z, road.x1, road.z1, road.x2, road.z2) < road.width) {
      return true;
    }
  }
  return false;
}

const FIELDS = ['#79a94b', '#8cbb58', '#6d9a45', '#b3a24a', '#a4ad55', '#7fae4e', '#93b95e', '#c2b25a'];
const FOREST = ['#3f6b34', '#4a7a3c', '#355e2e', '#548c44'];

/** Shade an rgb triple by a factor and return a css colour. */
function shade(hex, f) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

/**
 * Colour of one terrain cell, by its centre. `cell` is the cell size in metres;
 * the patchwork stays aligned to the grid so fields read as separate plots.
 */
export function groundColor(x, z, cell) {
  const h = groundHeight(x, z);
  if (h < 0.5) {
    // Open water, two tones so the sea is not a flat sheet.
    const v = cellHash(Math.floor(x / 240), Math.floor(z / 240), 3);
    return v < 0.5 ? '#1e6ea6' : '#2278b4';
  }
  if (stripFactor(x, z) > 0.5) return '#7fae4e'; // the graded airfield: mown grass
  if (h < 3.2) return '#dcc78f'; // pale sand beach
  const townD = Math.hypot(x - ISLAND.town.x, z - ISLAND.town.z);
  if (townD < ISLAND.town.radius) {
    const v = cellHash(Math.floor(x / 70), Math.floor(z / 70), 5);
    return v < 0.45 ? '#9a8d7a' : v < 0.75 ? '#7d7468' : '#b0a58f';
  }
  // Steep ground reads as cliff rock.
  const slope = Math.abs(groundHeight(x + 24, z) - h) + Math.abs(groundHeight(x, z + 24) - h);
  if (slope > 9) {
    const v = cellHash(Math.floor(x / 90), Math.floor(z / 90), 17);
    return v < 0.5 ? '#8a8172' : '#776e60';
  }
  if (h > 105) { // the ridge, patchy rock
    const v = cellHash(Math.floor(x / 90), Math.floor(z / 90), 11);
    return v < 0.33 ? '#8d8d80' : v < 0.66 ? '#7d7d72' : '#9a9a8c';
  }
  if (h > 68) { // high grassy hill
    const v = cellHash(Math.floor(x / 90), Math.floor(z / 90), 13);
    return v < 0.33 ? '#5d7d49' : v < 0.66 ? '#527040' : '#688a54';
  }
  // Forest patches where the noise runs high, fields elsewhere.
  const wood = valueNoise(x * 0.004 + 31, z * 0.004 + 17);
  if (wood > 0.62) {
    const v = cellHash(Math.floor(x / 80), Math.floor(z / 80), 19);
    const base = FOREST[Math.floor(v * FOREST.length)];
    return shade(base, clamp(1 - slope * 0.008, 0.75, 1));
  }
  const ix = Math.floor(x / Math.max(cell, 90)), iz = Math.floor(z / Math.max(cell, 90));
  const v = cellHash(ix, iz, 7);
  const base = FIELDS[Math.floor(v * FIELDS.length)];
  return shade(base, clamp(1 - slope * 0.012, 0.72, 1));
}

/** Road polylines, stroked at true width by the renderer. */
export function roadPaths() {
  const ring = [];
  for (let i = 0; i <= 72; i += 1) {
    const a = (i / 72) * Math.PI * 2;
    ring.push([Math.cos(a) * 2700, ISLAND.centreZ + Math.sin(a) * 2700]);
  }
  return [ring, [[620, 320], [0, -650], [-400, -2400]]];
}

/** The ring course for a mission: a loop around the island. */
export function buildRings(mission) {
  const spots = ISLAND.ringSpots;
  const start = takeOffPose();
  const rings = [];
  for (let i = 0; i < mission.rings; i += 1) {
    const [x, z] = spots[i % spots.length];
    // Each ring faces the leg the plane flies to reach it.
    const prev = i === 0 ? [start.x, start.z] : spots[(i - 1) % spots.length];
    const dx = prev[0] - x, dz = prev[1] - z;
    const len = Math.hypot(dx, dz) || 1;
    rings.push({
      x, z,
      y: mission.heights[i % mission.heights.length],
      nx: dx / len, nz: dz / len,
      radius: RING_R,
      passed: false,
    });
  }
  return rings;
}

/** Where the plane waits on the strip, facing north down the runway. */
export function takeOffPose() {
  return {
    x: STRIP.x,
    y: groundHeight(STRIP.x, STRIP.z + STRIP.length / 2 - 60) + 1.4,
    z: STRIP.z + STRIP.length / 2 - 60,
    heading: 0,
    pitch: 0,
    roll: 0,
  };
}

/** A point far out on the extended centreline, for the landing approach. */
export function stripApproach() {
  return { x: STRIP.x, y: 60, z: STRIP.z + STRIP.length / 2 + 350 };
}

/** Clouds in two layers: big puffs up high and thin wisps near the horizon. */
export function buildClouds(rng, count) {
  const puffs = [], wisps = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 600 + rng() * 4200;
    puffs.push({
      x: Math.cos(angle) * radius,
      z: ISLAND.centreZ + Math.sin(angle) * radius,
      y: 420 + rng() * 320,
      size: 180 + rng() * 260,
      puffs: 3 + Math.floor(rng() * 3),
      seed: rng() * 100,
    });
  }
  for (let i = 0; i < 16; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 5200 + rng() * 2600;
    wisps.push({
      x: Math.cos(angle) * radius,
      z: ISLAND.centreZ + Math.sin(angle) * radius,
      y: 240 + rng() * 160,
      size: 420 + rng() * 420,
      seed: rng() * 100,
    });
  }
  return { puffs, wisps };
}

/** Palm trees along the beaches: deterministic from the cell hash. */
export function buildPalms() {
  const palms = [];
  for (let gx = -34; gx <= 34; gx += 1) {
    for (let gz = -34; gz <= 34; gz += 1) {
      const x = gx * 140 + 70, z = ISLAND.centreZ + gz * 140 + 70;
      const h = groundHeight(x, z);
      if (h < 2.5 || h > 26) continue;
      if (stripFactor(x, z) > 0) continue; // no palms on the graded airfield
      const v = cellHash(gx, gz, 23);
      if (v > 0.06) continue; // sparse: only a few cells hold a palm
      const px = x + cellHash(gx, gz, 29) * 90;
      const pz = z + cellHash(gx, gz, 31) * 90;
      if (stripFactor(px, pz) > 0) continue; // no palms on the graded airfield
      palms.push({
        x: px,
        z: pz,
        lean: (cellHash(gx, gz, 37) - 0.5) * 0.35,
        size: 14 + cellHash(gx, gz, 41) * 8,
        sway: cellHash(gx, gz, 43) * Math.PI * 2,
      });
    }
  }
  return palms;
}

/** Town houses: small boxes with pitched roofs, inside the town circle. */
export function buildHouses(rng) {
  const houses = [];
  for (let i = 0; i < 64; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * (ISLAND.town.radius - 60);
    const x = ISLAND.town.x + Math.cos(a) * r;
    const z = ISLAND.town.z + Math.sin(a) * r;
    if (groundHeight(x, z) < 3) continue;
    const walls = ['#e8dcc0', '#d9c9a8', '#cbb89a', '#e6d3ae', '#d4bfa0'][Math.floor(rng() * 5)];
    const roofs = ['#b5503c', '#a34a38', '#8f5a3a', '#7d6a4a', '#c25a40'][Math.floor(rng() * 5)];
    houses.push({
      x, z,
      w: 14 + rng() * 12, d: 12 + rng() * 10, h: 7 + rng() * 5,
      angle: rng() * Math.PI,
      walls, roofs,
    });
  }
  return houses;
}

/** Little sailboats drifting on the open water. */
export function buildBoats(rng) {
  const boats = [];
  for (let i = 0; i < 9; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = 1600 + rng() * 3200;
    const x = Math.cos(a) * r;
    const z = ISLAND.centreZ + Math.sin(a) * r;
    if (!isSea(x, z)) continue;
    boats.push({
      x, z,
      angle: rng() * Math.PI * 2,
      scale: 0.8 + rng() * 0.7,
      sail: ['#f2ead8', '#e8b64c', '#d96a4a', '#7fb3d9'][Math.floor(rng() * 4)],
    });
  }
  return boats;
}

/** Seabirds circling over the coast. */
export function buildBirds(rng) {
  const birds = [];
  for (let i = 0; i < 14; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = 900 + rng() * 2600;
    birds.push({
      cx: Math.cos(a) * r,
      cz: ISLAND.centreZ + Math.sin(a) * r,
      r: 90 + rng() * 160,
      y: 120 + rng() * 180,
      phase: rng() * Math.PI * 2,
      speed: 0.12 + rng() * 0.1,
    });
  }
  return birds;
}
