// Shared constants for Cloud Courier: a small prop plane, a coral island, rings and a runway.
// All distances in metres, speeds in m/s, angles in radians, time in seconds.
export const STEP = 1 / 60;

export const WORLD = {
  islandRadius: 4600,
  seaLevel: 0,
  runway: {
    // A flat strip along the z axis (heading north, -z), centred near the island's south field.
    cx: 0,
    cz: -200,
    length: 1200,
    width: 42,
    heading: 0, // north
  },
  town: { cx: 620, cz: 320, radius: 420 },
};

export const PLANE = {
  maxThrust: 42, // m/s^2 at full throttle
  drag: 0.0052, // quadratic drag
  stallSpeed: 27,
  stallSpeedFlaps: 22,
  maxSpeed: 82,
  cruiseThrottle: 0.62,
  turnAuthority: 1.0,
  fuelBurnBase: 0.05, // per second
  fuelBurnThrottle: 0.22, // per second at full throttle
  wingspan: 11,
};

export const SKIES = {
  day: {
    top: '#2f6fd0', mid: '#7db3e8', horizon: '#cfe8f7',
    sun: '#fff3c4', sunX: 0.72, sunY: 0.2,
    cloud: 'rgba(255,255,255,0.92)', cloudShade: 'rgba(226,238,248,0.9)',
    fog: 'rgba(207,232,247,0.55)',
  },
  golden: {
    top: '#3d4a8f', mid: '#e08a4c', horizon: '#f7c98a',
    sun: '#ffd27a', sunX: 0.18, sunY: 0.3,
    cloud: 'rgba(255,226,196,0.95)', cloudShade: 'rgba(238,190,150,0.9)',
    fog: 'rgba(247,201,138,0.5)',
  },
  dawn: {
    top: '#274060', mid: '#b6789e', horizon: '#f2b28c',
    sun: '#ffe9b0', sunX: 0.5, sunY: 0.34,
    cloud: 'rgba(255,214,196,0.92)', cloudShade: 'rgba(214,170,190,0.9)',
    fog: 'rgba(242,178,140,0.5)',
  },
};

export const MISSIONS = [
  {
    id: 0, name: 'Ring Run', short: 'RING RUN',
    blurb: 'Fly all 8 sky rings, then land on Coral Field runway.',
    rings: 8, fuel: 100, timeLimit: 360, sky: 'day',
    ringAltitude: [150, 190, 220, 170, 240, 200, 160, 140],
  },
  {
    id: 1, name: 'Golden Hour Hop', short: 'GOLDEN HOP',
    blurb: 'Six rings over the golden fields, then home to the strip.',
    rings: 6, fuel: 78, timeLimit: 300, sky: 'golden',
    ringAltitude: [170, 210, 180, 230, 190, 150],
  },
  {
    id: 2, name: 'Dawn Patrol', short: 'DAWN PATROL',
    blurb: 'Eight rings on a thin tank. Land with fuel to spare for a bonus.',
    rings: 8, fuel: 62, timeLimit: 420, sky: 'dawn', fuelBonus: 2,
    ringAltitude: [150, 200, 230, 180, 250, 210, 170, 140],
  },
];

export const RING_RADIUS = 26;
export const RING_POINTS = 8;

export const KEYS = {
  up: ['ArrowUp', 'KeyI'],
  down: ['ArrowDown', 'KeyK'],
  left: ['ArrowLeft', 'KeyJ'],
  right: ['ArrowRight', 'KeyL'],
  throttleUp: ['KeyW', 'ShiftLeft', 'ShiftRight'],
  throttleDown: ['KeyS', 'ControlLeft', 'ControlRight'],
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
