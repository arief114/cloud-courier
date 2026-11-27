// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is there.
// The game moves between five screens: title, play, paused, landed, crashed and timeout.
// ?seed=N fixes the island and the ring course. ?shot=start|play|approach|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot. ?mission=0|1|2 picks the starting mission.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createGame, EVENT_CRASHED, EVENT_LANDED, EVENT_RING, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TIMEOUT, SCREEN_TITLE } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const missionParam = Number.parseInt(params.get('mission') ?? '0', 10);
const missionId = Number.isInteger(missionParam) && missionParam >= 0 && missionParam <= 2 ? missionParam : 0;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createGame(seed, missionId);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

// A debug hook for play-testing: the state the page is in, nothing more.
window.__game = {
  get screen() { return world.state.screen; },
  get score() { return world.state.score; },
  get speed() { return world.state.plane.speed; },
  get altitude() { return world.state.plane.y; },
  get rings() { return world.state.ringIndex; },
  get fuel() { return world.state.fuel; },
  get throttle() { return world.state.plane.throttle; },
};

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    try {
      renderer.draw(world.state, scene.screen, scene.best);
    } catch (err) {
      window.__paintError = String((err && err.stack) || err);
      return;
    }
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, onAction);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let flaps = false;
  let accumulator = 0;
  let last = performance.now();

  function onAction(action, arg) {
    audio.unlock();
    if (action === 'confirm') {
      if (screen === SCREEN_TITLE) {
        world.state.screen = SCREEN_PLAY;
        screen = SCREEN_PLAY;
        audio.click();
      } else if (screen === SCREEN_PAUSED) {
        world.state.screen = SCREEN_PLAY;
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_LANDED || screen === SCREEN_CRASHED || screen === SCREEN_TIMEOUT) {
        const next = screen === SCREEN_LANDED ? (world.state.missionId + 1) % 3 : world.state.missionId;
        world.reset(next);
        world.state.screen = SCREEN_PLAY;
        screen = SCREEN_PLAY;
        flaps = false;
      }
    } else if (action === 'pause') {
      if (screen === SCREEN_PLAY) {
        world.state.screen = SCREEN_PAUSED;
        screen = SCREEN_PAUSED;
      } else if (screen === SCREEN_PAUSED) {
        world.state.screen = SCREEN_PLAY;
        screen = SCREEN_PLAY;
      }
    } else if (action === 'restart') {
      if (screen !== SCREEN_TITLE) {
        world.reset(world.state.missionId);
        world.state.screen = SCREEN_PLAY;
        screen = SCREEN_PLAY;
        flaps = false;
      }
    } else if (action === 'mission') {
      if (screen === SCREEN_TITLE && arg !== world.state.missionId) {
        world.reset(arg);
      }
    } else if (action === 'flaps') {
      flaps = !flaps;
    } else if (action === 'mute') {
      world.state.muted = !world.state.muted;
    }
  }

  canvas.addEventListener('pointerdown', () => {
    audio.unlock();
    if (screen === SCREEN_TITLE) onAction('confirm');
    else if (screen === SCREEN_PAUSED) onAction('pause');
  });

  function frame(now) {
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    if (screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        const stick = input.read(flaps);
        const events = world.step(STEP, stick);
        if (events & EVENT_RING) audio.ring();
        if (events & EVENT_LANDED) {
          audio.land();
          if (world.state.score > best) {
            best = world.state.score;
            saveBest(best);
          }
        }
        if (events & EVENT_CRASHED) {
          audio.crash();
          if (world.state.score > best) {
            best = world.state.score;
            saveBest(best);
          }
        }
        screen = world.state.screen;
        if (screen !== SCREEN_PLAY) break;
      }
      audio.update(world.state.plane.throttle, world.state.plane.speed, screen === SCREEN_PLAY);
    }
    renderer.draw(world.state, screen, best);
    status.textContent = `Cloud Courier: ${screen}, score ${world.state.score}, rings ${world.state.ringIndex} of ${world.state.rings.length}`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
