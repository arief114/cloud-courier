// Keyboard and mouse: arrows or WASD steer, W/S (or Shift/Ctrl) work the throttle,
// F toggles flaps, B brakes on the ground, P pauses, Enter confirms, R restarts, M mutes.
// The mouse steers too: where the pointer sits, relative to the centre, is the stick.
import { KEYS } from './config.js';

function matches(event, codes) {
  return codes.includes(event.code);
}

export function createInput(canvas, onAction) {
  const keys = new Set();
  let mouseX = 0.5, mouseY = 0.5, mouseSeen = false, mouseDown = false;

  function keydown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (matches(event, KEYS.confirm)) onAction('confirm');
    else if (matches(event, KEYS.pause)) onAction('pause');
    else if (matches(event, KEYS.restart)) onAction('restart');
    else if (matches(event, KEYS.mute)) onAction('mute');
    else if (matches(event, KEYS.mission1)) onAction('mission', 0);
    else if (matches(event, KEYS.mission2)) onAction('mission', 1);
    else if (matches(event, KEYS.mission3)) onAction('mission', 2);
    else if (matches(event, KEYS.flaps)) onAction('flaps');
  }
  function keyup(event) {
    keys.delete(event.code);
  }
  function pointermove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / Math.max(rect.width, 1);
    mouseY = (event.clientY - rect.top) / Math.max(rect.height, 1);
    mouseSeen = true;
  }
  function pointerdown(event) {
    mouseDown = true;
    pointermove(event);
  }
  function pointerup() {
    mouseDown = false;
  }

  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  canvas.addEventListener('pointermove', pointermove);
  canvas.addEventListener('pointerdown', pointerdown);
  window.addEventListener('pointerup', pointerup);

  return {
    /** The stick for this frame: keys win over the mouse; the mouse steers when it moved. */
    read(flapsOn) {
      let pitch = 0, roll = 0;
      if (keys.has('ArrowUp') || keys.has('KeyI')) pitch += 1;
      if (keys.has('ArrowDown') || keys.has('KeyK')) pitch -= 1;
      if (keys.has('ArrowLeft') || keys.has('KeyJ')) roll -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyL')) roll += 1;
      if (pitch === 0 && roll === 0 && mouseSeen && mouseDown) {
        roll = (mouseX - 0.5) * 2.4;
        pitch = -(mouseY - 0.5) * 1.8;
      }
      let throttle = null;
      if (KEYS.throttleUp.some((c) => keys.has(c))) throttle = 1;
      else if (KEYS.throttleDown.some((c) => keys.has(c))) throttle = 0;
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        throttle,
        flaps: flapsOn,
        brake: keys.has('KeyB'),
      };
    },
    destroy() {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      canvas.removeEventListener('pointermove', pointermove);
      canvas.removeEventListener('pointerdown', pointerdown);
      window.removeEventListener('pointerup', pointerup);
    },
  };
}
