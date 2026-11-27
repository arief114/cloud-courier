// Input: keyboard, mouse steering, and the click-to-start / click-to-pause
// behaviour. Everything here feeds the same `input` object the loop reads;
// nothing in this file touches the flight model directly. The flaps and brake
// live on `input` because the flight step overwrites the plane's own flags
// from the stick every frame.
import { CONTROL_KEYS, MISSIONS } from './settings.js';
import { SCREEN } from './flight.js';

const ACTION_FOR_CODE = {};
for (const [action, codes] of [
  ['up', CONTROL_KEYS.pitchUp],
  ['down', CONTROL_KEYS.pitchDown],
  ['left', CONTROL_KEYS.bankLeft],
  ['right', CONTROL_KEYS.bankRight],
  ['throttleUp', CONTROL_KEYS.powerUp],
  ['throttleDown', CONTROL_KEYS.powerDown],
]) {
  for (const code of codes) ACTION_FOR_CODE[code] = action;
}

export function createControls(canvas, flight, hooks) {
  const state = flight.state;
  const input = {
    keys: new Set(),
    mouse: { active: false, x: 0.5, y: 0.5 },
    flaps: false,
    brake: false,
  };

  function beginFlight() {
    if (state.screen === SCREEN.title) {
      state.screen = SCREEN.play;
      hooks.onFirstFly?.();
    }
  }

  function pauseToggle() {
    if (state.screen === SCREEN.play) state.screen = SCREEN.paused;
    else if (state.screen === SCREEN.paused) state.screen = SCREEN.play;
  }

  function restart() {
    if (state.screen === SCREEN.title) return;
    flight.reset();
    input.flaps = false;
    input.brake = false;
    state.screen = SCREEN.play;
  }

  function switchMission(id) {
    if (id < 0 || id >= MISSIONS.length) return;
    flight.reset(id);
    input.flaps = false;
    input.brake = false;
    state.screen = SCREEN.play;
    hooks.onFirstFly?.();
  }

  function onKeyDown(e) {
    const action = ACTION_FOR_CODE[e.code];
    if (action) {
      input.keys.add(action);
      if (['up', 'down', 'left', 'right', 'throttleDown'].includes(action)) e.preventDefault();
    }
    if (CONTROL_KEYS.confirm.includes(e.code)) {
      if (state.screen === SCREEN.title) beginFlight();
      else if (state.screen === SCREEN.paused) state.screen = SCREEN.play;
      else if (state.screen === SCREEN.landed) switchMission((state.missionId + 1) % MISSIONS.length);
      else if (state.screen === SCREEN.crashed || state.screen === SCREEN.timeout) restart();
      if (e.code === 'Space') e.preventDefault();
    }
    if (CONTROL_KEYS.pause.includes(e.code) && state.screen !== SCREEN.title) pauseToggle();
    if (CONTROL_KEYS.restart.includes(e.code)) restart();
    if (CONTROL_KEYS.flaps.includes(e.code) && state.screen === SCREEN.play) input.flaps = !input.flaps;
    if (CONTROL_KEYS.brake.includes(e.code) && state.screen === SCREEN.play) input.brake = !input.brake;
    if (CONTROL_KEYS.mute.includes(e.code)) hooks.onMuteToggle?.();
    if (CONTROL_KEYS.mission1.includes(e.code)) switchMission(0);
    if (CONTROL_KEYS.mission2.includes(e.code)) switchMission(1);
    if (CONTROL_KEYS.mission3.includes(e.code)) switchMission(2);
  }

  function onKeyUp(e) {
    const action = ACTION_FOR_CODE[e.code];
    if (action) input.keys.delete(action);
    if (CONTROL_KEYS.brake.includes(e.code)) input.brake = false;
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = (e.clientX - rect.left) / rect.width;
    input.mouse.y = (e.clientY - rect.top) / rect.height;
    input.mouse.active = true;
  }

  function onMouseDown() {
    beginFlight();
    if (state.screen === SCREEN.paused) state.screen = SCREEN.play;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  return input;
}
