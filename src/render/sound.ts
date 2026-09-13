/** Tiny synthesized sound set: no assets, unlocked on the first gesture. */
let ctx: AudioContext | null = null;

const ensure = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

export const unlockAudio = (): void => {
  ensure();
};

/** Referee's whistle: two close tones with a fast vibrato. */
export const whistle = (): void => {
  const ac = ensure();
  if (!ac) return;
  const t0 = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
  gain.gain.setValueAtTime(0.18, t0 + 0.28);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
  gain.connect(ac.destination);
  for (const f of [2150, 2680]) {
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.value = f;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 38;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(osc.frequency);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    osc.connect(lp).connect(gain);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + 0.45);
    lfo.stop(t0 + 0.45);
  }
};

/** Boot on ball: a short filtered noise thump. */
export const kick = (strength = 1): void => {
  const ac = ensure();
  if (!ac) return;
  const t0 = ac.currentTime;
  const len = Math.floor(ac.sampleRate * 0.09);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420 + 300 * strength;
  const gain = ac.createGain();
  gain.gain.value = 0.5 * strength;
  src.connect(lp).connect(gain).connect(ac.destination);
  src.start(t0);
};

/** Soft UI tick. */
export const tick = (): void => {
  const ac = ensure();
  if (!ac) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  osc.frequency.value = 880;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.06, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.09);
};
