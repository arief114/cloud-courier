// Synthesised sound: no audio files, everything is made with the Web Audio API.
// An engine hum that follows the throttle, wind that follows the speed, a ring chime,
// a landing thud and a crash. All of it guarded: silent when audio is unavailable.
export function createAudio() {
  let ctx = null, engineOsc = null, engineGain = null, windSrc = null, windGain = null, windFilter = null;
  let started = false;

  function ensure() {
    if (started) return !!ctx;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      const noiseLen = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i += 1) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buffer;
      windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter).connect(windGain).connect(ctx.destination);
      windSrc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime + when);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + dur + 0.05);
    } catch { /* silent */ }
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    /** Continuous engine and wind, called every frame while flying. */
    update(throttle, speed, flying) {
      if (!ctx || !engineOsc) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(48 + throttle * 62 + speed * 0.35, t, 0.1);
      engineGain.gain.setTargetAtTime(flying ? 0.045 + throttle * 0.05 : 0.02, t, 0.15);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.09, speed * 0.0011) : 0, t, 0.2);
      windFilter.frequency.setTargetAtTime(500 + speed * 9, t, 0.2);
    },
    ring() {
      if (!ctx) return;
      tone(880, 0.35, 'sine', 0.16);
      tone(1318, 0.5, 'sine', 0.14, 0.09);
    },
    land() {
      if (!ctx) return;
      tone(140, 0.3, 'sine', 0.22);
      tone(523, 0.4, 'sine', 0.1, 0.08);
      tone(784, 0.55, 'sine', 0.1, 0.16);
    },
    crash() {
      if (!ctx) return;
      try {
        const dur = 0.7;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        const gain = ctx.createGain();
        gain.gain.value = 0.3;
        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start();
      } catch { /* silent */ }
      tone(70, 0.6, 'sine', 0.25);
    },
    click() { tone(660, 0.08, 'sine', 0.08); },
  };
}
