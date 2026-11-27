// Cloud Courier v2 — tuning and mission data.
// All distances in metres, speeds in m/s, angles in radians, time in seconds.
// The mission table (ring counts, fuel, time limits, ring altitudes) is the
// competition entry's course: it must not change between versions.
export const TICK = 1 / 60;

export const ISLAND = {
  radius: 4600,
  centreZ: 300,
  strip: {
    // Flat runway along the z axis (heading north, -z), in the south field.
    x: 0,
    z: -200,
    length: 1200,
    width: 42,
  },
  town: { x: 620, z: 320, radius: 420 },
  // The ring course: a loop around the island, in flying order.
  ringSpots: [
    [900, -1500], [2100, -600], [2600, 900], [1500, 2200],
    [0, 2600], [-1600, 1900], [-2500, 400], [-1900, -1200],
  ],
};

export const AIRCRAFT = {
  thrust: 42,          // m/s^2 at full throttle
  drag: 0.0052,        // quadratic drag coefficient
  stall: 27,           // m/s, clean
  stallFlaps: 22,      // m/s, flaps down
  topSpeed: 82,
  cruise: 0.62,
  fuelBase: 0.05,      // burn per second, idle
  fuelFull: 0.22,      // burn per second at full throttle
  span: 11,            // wingspan, metres
};

export const LIGHTING = {
  day: {
    top: '#2b6ccf', mid: '#79b2e6', low: '#cfe8f7',
    sun: '#fff3c4', sunX: 0.72, sunY: 0.18,
    puff: 'rgba(255,255,255,0.92)', puffShade: 'rgba(224,236,248,0.9)',
    haze: 'rgba(207,232,247,0.55)', glitter: 'rgba(255,250,220,0.55)',
  },
  golden: {
    top: '#3a458c', mid: '#e08a4c', low: '#f7c98a',
    sun: '#ffd27a', sunX: 0.18, sunY: 0.28,
    puff: 'rgba(255,226,196,0.95)', puffShade: 'rgba(236,188,148,0.9)',
    haze: 'rgba(247,201,138,0.5)', glitter: 'rgba(255,205,120,0.7)',
  },
  dawn: {
    top: '#274060', mid: '#b6789e', low: '#f2b28c',
    sun: '#ffe9b0', sunX: 0.5, sunY: 0.32,
    puff: 'rgba(255,214,196,0.92)', puffShade: 'rgba(212,168,188,0.9)',
    haze: 'rgba(242,178,140,0.5)', glitter: 'rgba(255,220,180,0.55)',
  },
};

export const MISSIONS = [
  {
    id: 0, name: 'Ring Run', tag: 'RING RUN',
    blurb: 'Fly all 8 sky rings, then land on Coral Field runway.',
    rings: 8, fuel: 100, limit: 360, light: 'day',
    heights: [150, 190, 220, 170, 240, 200, 160, 140],
  },
  {
    id: 1, name: 'Golden Hour Hop', tag: 'GOLDEN HOP',
    blurb: 'Six rings over the golden fields, then home to the strip.',
    rings: 6, fuel: 78, limit: 300, light: 'golden',
    heights: [170, 210, 180, 230, 190, 150],
  },
  {
    id: 2, name: 'Dawn Patrol', tag: 'DAWN PATROL',
    blurb: 'Eight rings on a thin tank. Land with fuel to spare for a bonus.',
    rings: 8, fuel: 62, limit: 420, light: 'dawn', fuelBonus: 2,
    heights: [150, 200, 230, 180, 250, 210, 170, 140],
  },
];

export const RING_R = 26;
export const RING_SCORE = 100;

export const CONTROL_KEYS = {
  pitchUp: ['ArrowUp', 'KeyI'],
  pitchDown: ['ArrowDown', 'KeyK'],
  bankLeft: ['ArrowLeft', 'KeyJ'],
  bankRight: ['ArrowRight', 'KeyL'],
  powerUp: ['KeyW', 'ShiftLeft', 'ShiftRight'],
  powerDown: ['KeyS', 'ControlLeft', 'ControlRight'],
  flaps: ['KeyF'],
  brake: ['KeyB'],
  pause: ['KeyP', 'Escape'],
  confirm: ['Enter', 'Space'],
  restart: ['KeyR'],
  mute: ['KeyM'],
  mission1: ['Digit1'],
  mission2: ['Digit2'],
  mission3: ['Digit3'],
};

export const BEST_KEY = 'cloud-courier-best';
