// Sound: a small WebAudio synth — engine hum pitched by throttle, a chime
// when a ring is passed, a soft thump on touchdown, wind that rises with
// airspeed. Everything is generated; there are no audio files.
export function createSound() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // Engine: two detuned sawtooths through a low-pass, pitched by throttle.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55.7;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    osc2.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    osc2.start();
    // Wind: looped filtered noise, loud when fast.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buffer;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSrc.start();
  }

  function start() {
    ensure();
    if (!ctx || started) return;
    started = true;
    if (ctx.state === 'suspended') void ctx.resume();
  }

  function update(state) {
    if (!ctx || !started || muted) return;
    const p = state.plane;
    const targetEngine = state.screen === 'play' ? 0.02 + p.throttle * 0.05 : 0;
    engineGain.gain.setTargetAtTime(targetEngine, ctx.currentTime, 0.15);
    engineOsc.frequency.setTargetAtTime(48 + p.throttle * 42 + p.speed * 0.4, ctx.currentTime, 0.1);
    const wind = state.screen === 'play' ? Math.min(0.09, p.speed * 0.0011) : 0;
    windGain.gain.setTargetAtTime(wind, ctx.currentTime, 0.2);
  }

  function blip(freq, dur, type = 'sine', vol = 0.12) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  return {
    start,
    update,
    ring() {
      blip(880, 0.18, 'sine', 0.14);
      setTimeout(() => blip(1318, 0.28, 'sine', 0.12), 90);
    },
    land() {
      blip(120, 0.25, 'triangle', 0.2);
    },
    crash() {
      blip(90, 0.6, 'sawtooth', 0.16);
    },
    toggleMute() {
      muted = !muted;
      if (ctx) {
        if (engineGain) engineGain.gain.value = 0;
        if (windGain) windGain.gain.value = 0;
      }
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
