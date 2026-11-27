// Cloud Courier v2 — boot: wires one flight, the view, the controls and the
// sound together, then runs the loop at a fixed 60 Hz step. A screenshot
// (`?shot=cover|start|play|approach|end`) stages a pose and lets the
// autopilot hold it, so the dossier shots are real renders of the live game.
import { createFlight, SCREEN, EV } from './flight.js';
import { BEST_KEY } from './settings.js';
import { createView } from './view.js';
import { createControls } from './controls.js';
import { createSound } from './sound.js';
import { shotFromUrl, stageShot } from './scenes.js';
import { flyToward, approachTarget } from './pilot.js';

const canvas = document.getElementById('game');
const flight = createFlight(7, 0);
const state = flight.state;
state.autopilot = false;
const view = createView(canvas);
const sound = createSound();

const input = createControls(canvas, flight, {
  onFirstFly: () => sound.start(),
  onMuteToggle: () => sound.toggleMute(),
});

const shotName = shotFromUrl(window.location.search);
if (shotName) {
  stageShot(flight, shotName);
  state.autopilot = shotName !== 'end';
}

let best = 0;
try {
  best = Number(window.localStorage.getItem(BEST_KEY) || 0) || 0;
} catch {
  best = 0;
}

window.__game = {
  state,
  flight,
  get screen() {
    return state.screen;
  },
  set autopilot(v) {
    state.autopilot = v;
  },
  get autopilot() {
    return state.autopilot;
  },
};

/** Turn the keys and the mouse into a stick position for this frame. */
function stickFromInput() {
  const keys = input.keys;
  const mouse = input.mouse;
  let pitch = 0, roll = 0;
  if (keys.has('up')) pitch += 1;
  if (keys.has('down')) pitch -= 1;
  if (keys.has('left')) roll -= 1;
  if (keys.has('right')) roll += 1;
  if (mouse.active && !keys.size) {
    // Mouse steers: where the pointer sits relative to the centre is the
    // stick deflection, with a dead zone in the middle.
    const dx = mouse.x - 0.5;
    const dy = mouse.y - 0.5;
    if (Math.abs(dx) > 0.04) roll = Math.max(-1, Math.min(1, dx * 2.4));
    if (Math.abs(dy) > 0.04) pitch = Math.max(-1, Math.min(1, -dy * 2.4));
  }
  let throttle = state.plane.throttleTarget;
  if (keys.has('throttleUp')) throttle += 0.012;
  if (keys.has('throttleDown')) throttle -= 0.02;
  return {
    pitch, roll,
    throttle: Math.max(0, Math.min(1, throttle)),
    flaps: input.flaps,
    brake: input.brake,
  };
}

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    acc -= STEP;
    steps += 1;
    tick(STEP);
  }
  if (steps === 5) acc = 0;
  view.draw(state, state.screen, best);
  requestAnimationFrame(frame);
}

function tick(dt) {
  if (state.screen === SCREEN.title) {
    // Idle drift: the birds circle and the palms sway behind the title.
    state.time += dt;
    return;
  }
  if (state.screen !== SCREEN.play) return;
  let stick;
  if (state.autopilot) {
    const target = state.ringIndex < state.rings.length
      ? { ...state.rings[state.ringIndex], kind: 'ring' }
      : approachTarget(state);
    stick = flyToward(state, target);
  } else {
    stick = stickFromInput();
  }
  const events = flight.step(dt, stick);
  if (events & EV.ring) sound.ring();
  if (events & EV.landed) sound.land();
  if (events & EV.crashed) sound.crash();
  if (state.screen === SCREEN.landed && state.score > best) {
    best = state.score;
    try {
      window.localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Storage may be unavailable; the best score is a nicety, not a need.
    }
  }
  sound.update(state);
}

requestAnimationFrame(frame);
