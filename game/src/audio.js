'use strict';
/* Saltline: Vice Heat — synthesized WebAudio: engine, sirens, shots, impacts,
   pickups and a toggleable radio loop. Everything is generated; no assets. */
const SLAU = (() => {
  function createAudio() {
    let ctx = null, master = null, engineNodes = null, sirenNodes = null, radioNodes = null;
    let volume = 0.55, musicOn = true, started = false;

    function ensure() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
        started = true;
        return true;
      } catch { return false; }
    }
    function setVolume(v) { volume = v; if (master) master.gain.value = v; }
    function now() { return ctx ? ctx.currentTime : 0; }

    function env(gain, t0, a, peak, d) {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    }
    function tone(freq, type, a, d, peak, slideTo) {
      if (!ensure()) return;
      const t0 = now();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + a + d);
      env(g, t0, a, peak, d);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + a + d + 0.05);
    }
    function noise(dur, peak, filterFreq, type = 'lowpass') {
      if (!ensure()) return;
      const t0 = now();
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
      const g = ctx.createGain();
      env(g, t0, 0.005, peak, dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + dur + 0.05);
    }

    const sfx = {
      shot() { noise(0.12, 0.5, 2600, 'highpass'); tone(150, 'square', 0.004, 0.09, 0.25, 60); },
      swing() { noise(0.09, 0.2, 1200, 'bandpass'); },
      click() { tone(1200, 'square', 0.002, 0.03, 0.12); },
      crash() { noise(0.35, 0.6, 700); tone(70, 'sawtooth', 0.01, 0.3, 0.3, 40); },
      bump() { noise(0.12, 0.35, 500); },
      smoke() { noise(0.5, 0.15, 300); },
      alarm() { for (let i = 0; i < 3; i++) setTimeout(() => tone(880, 'square', 0.01, 0.12, 0.15, 660), i * 170); },
      pickup() { tone(660, 'sine', 0.01, 0.08, 0.2); setTimeout(() => tone(990, 'sine', 0.01, 0.12, 0.2), 70); },
      cash() { tone(1320, 'triangle', 0.005, 0.07, 0.22); setTimeout(() => tone(1760, 'triangle', 0.005, 0.1, 0.22), 60); },
      gate() { tone(520, 'sine', 0.01, 0.1, 0.2, 780); },
      repair() { tone(220, 'square', 0.01, 0.06, 0.12); setTimeout(() => tone(330, 'square', 0.01, 0.08, 0.12), 90); },
      thunder() { noise(1.4, 0.5, 160); },
      ui() { tone(440, 'sine', 0.004, 0.05, 0.12); },
    };
    function play(name) { if (sfx[name]) sfx[name](); }

    // engine loop: sawtooth pitch follows speed, gain follows throttle
    function engine(on, speedRatio, throttle) {
      if (!ensure()) return;
      if (on && !engineNodes) {
        const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o2.type = 'square';
        f.type = 'lowpass'; f.frequency.value = 420;
        g.gain.value = 0.0;
        o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
        o.start(); o2.start();
        engineNodes = { o, o2, g, f };
      }
      if (!engineNodes) return;
      if (!on) {
        engineNodes.g.gain.setTargetAtTime(0, now(), 0.1);
        const en = engineNodes; engineNodes = null;
        setTimeout(() => { try { en.o.stop(); en.o2.stop(); } catch { /* already stopped */ } }, 400);
        return;
      }
      const base = 55 + speedRatio * 165;
      engineNodes.o.frequency.setTargetAtTime(base, now(), 0.05);
      engineNodes.o2.frequency.setTargetAtTime(base * 0.5 + 2, now(), 0.05);
      engineNodes.f.frequency.setTargetAtTime(320 + speedRatio * 900, now(), 0.08);
      engineNodes.g.gain.setTargetAtTime(0.05 + throttle * 0.06 + speedRatio * 0.03, now(), 0.08);
    }

    // police siren loop while wanted
    function siren(on) {
      if (!ensure()) return;
      if (on && !sirenNodes) {
        const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = 800;
        lfo.type = 'sine'; lfo.frequency.value = 0.55; lg.gain.value = 160;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.value = 0.0;
        o.connect(g); g.connect(master);
        o.start(); lfo.start();
        sirenNodes = { o, lfo, g };
        g.gain.setTargetAtTime(0.035, now(), 0.4);
      }
      if (!on && sirenNodes) {
        const sn = sirenNodes; sirenNodes = null;
        sn.g.gain.setTargetAtTime(0, now(), 0.2);
        setTimeout(() => { try { sn.o.stop(); sn.lfo.stop(); } catch { /* already stopped */ } }, 600);
      }
    }

    // radio: a slow synthwave chord loop
    function radio(on) {
      musicOn = on;
      if (!ensure()) return;
      if (on && !radioNodes) {
        const g = ctx.createGain(); g.gain.value = 0.0; g.connect(master);
        g.gain.setTargetAtTime(0.05, now(), 0.6);
        const chords = [[110, 165, 220], [98, 147, 196], [87, 131, 175], [104, 156, 208]];
        let step = 0;
        const tick = () => {
          if (!radioNodes) return;
          const ch = chords[step % chords.length];
          for (const fq of ch) {
            const o = ctx.createOscillator(), og = ctx.createGain();
            o.type = 'triangle'; o.frequency.value = fq;
            og.gain.setValueAtTime(0.0001, now());
            og.gain.exponentialRampToValueAtTime(0.16, now() + 0.4);
            og.gain.exponentialRampToValueAtTime(0.0001, now() + 2.6);
            o.connect(og); og.connect(g);
            o.start(); o.stop(now() + 2.8);
          }
          step++;
          radioNodes.timer = setTimeout(tick, 2400);
        };
        radioNodes = { g, timer: null };
        tick();
      }
      if (!on && radioNodes) {
        const rn = radioNodes; radioNodes = null;
        clearTimeout(rn.timer);
        rn.g.gain.setTargetAtTime(0, now(), 0.3);
        setTimeout(() => { try { rn.g.disconnect(); } catch { /* gone */ } }, 800);
      }
    }

    return { ensure, play, engine, siren, radio, setVolume, get started() { return started; }, get musicOn() { return musicOn; } };
  }
  return { createAudio };
})();
