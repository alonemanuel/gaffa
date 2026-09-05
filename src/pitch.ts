import type { Frame, Pt, Tactic } from './types';

interface ResolvedFrame {
  t: number;
  ball: Pt;
  us: Record<string, Pt>;
  them: Record<string, Pt>;
  note: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const END_HOLD_MS = 1200;

const el = (name: string, attrs: Record<string, string | number>): SVGElement => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

const lerp = (a: number, b: number, k: number): number => {
  const value = a + (b - a) * k;
  return value;
};

/** Data has y=0 at our own goal, but SVG y grows downward — flip so we attack up the screen. */
const PITCH_LENGTH = 60;
const toSvgY = (y: number): number => {
  const flipped = PITCH_LENGTH - y;
  return flipped;
};

const lerpPt = (a: Pt, b: Pt, k: number): Pt => {
  const point: Pt = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  return point;
};

/**
 * Frames after the first only list what moved, so fill the gaps forward.
 * The ball may name a player instead of a point; resolve it once here.
 */
const resolveFrames = (frames: Frame[]): ResolvedFrame[] => {
  const resolved: ResolvedFrame[] = [];
  let us: Record<string, Pt> = {};
  let them: Record<string, Pt> = {};

  for (const frame of frames) {
    us = { ...us, ...frame.us };
    them = { ...them, ...frame.them };
    const ball = typeof frame.ball === 'string' ? (us[frame.ball] ?? them[frame.ball]) : frame.ball;
    if (!ball) throw new Error(`Frame at ${frame.t}ms references unknown player "${String(frame.ball)}"`);
    resolved.push({ t: frame.t, ball: [...ball] as Pt, us: { ...us }, them: { ...them }, note: frame.note });
  }
  return resolved;
};

export const buildPitch = (): SVGElement => {
  const svg = el('svg', {
    viewBox: '-2.5 -2.5 45 65',
    class: 'pitch',
    preserveAspectRatio: 'xMidYMid meet',
  });

  svg.appendChild(el('rect', { x: 0, y: 0, width: 40, height: 60, rx: 0.5, class: 'grass' }));

  const lines = el('g', { class: 'lines' });
  lines.appendChild(el('rect', { x: 0, y: 0, width: 40, height: 60 }));
  lines.appendChild(el('line', { x1: 0, y1: 30, x2: 40, y2: 30 }));
  lines.appendChild(el('circle', { cx: 20, cy: 30, r: 6 }));
  // Penalty areas
  lines.appendChild(el('rect', { x: 8, y: 0, width: 24, height: 11 }));
  lines.appendChild(el('rect', { x: 8, y: 49, width: 24, height: 11 }));
  // Six-yard boxes
  lines.appendChild(el('rect', { x: 14, y: 0, width: 12, height: 4.5 }));
  lines.appendChild(el('rect', { x: 14, y: 55.5, width: 12, height: 4.5 }));
  svg.appendChild(lines);

  const goals = el('g', { class: 'goals' });
  goals.appendChild(el('rect', { x: 16.5, y: -1, width: 7, height: 1 }));
  goals.appendChild(el('rect', { x: 16.5, y: 60, width: 7, height: 1 }));
  svg.appendChild(goals);

  return svg;
};

const buildToken = (id: string, side: 'us' | 'them'): SVGElement => {
  const group = el('g', { class: `token ${side}` });
  group.appendChild(el('circle', { r: side === 'us' ? 2.1 : 1.85, cx: 0, cy: 0 }));
  const label = el('text', { x: 0, y: 0.75, 'text-anchor': 'middle' });
  label.textContent = side === 'us' ? id : id.replace(/^O/, '');
  group.appendChild(label);
  return group;
};

export interface AnimationHandle {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  seekFraction: (fraction: number) => void;
  isPlaying: () => boolean;
  destroy: () => void;
}

export interface AnimationCallbacks {
  onNote: (note: string) => void;
  onProgress: (fraction: number) => void;
  onPlayState: (playing: boolean) => void;
}

export const mountAnimation = (
  container: HTMLElement,
  tactic: Tactic,
  callbacks: AnimationCallbacks,
): AnimationHandle => {
  const frames = resolveFrames(tactic.frames);
  const duration = frames[frames.length - 1].t;

  const svg = buildPitch();
  const themLayer = el('g', { class: 'layer-them' });
  const usLayer = el('g', { class: 'layer-us' });
  svg.appendChild(themLayer);
  svg.appendChild(usLayer);

  const tokens = new Map<string, SVGElement>();
  for (const id of Object.keys(frames[0].them)) {
    const token = buildToken(id, 'them');
    themLayer.appendChild(token);
    tokens.set(id, token);
  }
  for (const id of Object.keys(frames[0].us)) {
    const token = buildToken(id, 'us');
    usLayer.appendChild(token);
    tokens.set(id, token);
  }

  const ball = el('circle', { r: 1.05, cx: 0, cy: 0, class: 'ball' });
  svg.appendChild(ball);
  container.replaceChildren(svg);

  let elapsed = 0;
  let playing = false;
  let rafId = 0;
  let lastStamp = 0;
  let lastNote = '';

  const paint = (ms: number): void => {
    const clamped = Math.max(0, Math.min(ms, duration));
    let index = 0;
    while (index < frames.length - 2 && frames[index + 1].t <= clamped) index += 1;

    const from = frames[index];
    const to = frames[Math.min(index + 1, frames.length - 1)];
    const span = to.t - from.t;
    const k = span <= 0 ? 1 : Math.max(0, Math.min(1, (clamped - from.t) / span));
    // Ease so movement starts and stops the way players do, rather than sliding linearly.
    const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

    for (const [id, token] of tokens) {
      const a = from.us[id] ?? from.them[id];
      const b = to.us[id] ?? to.them[id];
      if (!a || !b) continue;
      const [x, y] = lerpPt(a, b, eased);
      token.setAttribute('transform', `translate(${x} ${toSvgY(y)})`);
    }

    // The ball travels flat out rather than easing — it is kicked, not carried.
    const [bx, by] = lerpPt(from.ball, to.ball, k);
    ball.setAttribute('cx', String(bx));
    ball.setAttribute('cy', String(toSvgY(by)));

    const note = clamped >= duration ? frames[frames.length - 1].note : from.note;
    if (note !== lastNote) {
      lastNote = note;
      callbacks.onNote(note);
    }
    callbacks.onProgress(duration === 0 ? 1 : clamped / duration);
  };

  const tick = (stamp: number): void => {
    if (!playing) return;
    const delta = lastStamp === 0 ? 0 : stamp - lastStamp;
    lastStamp = stamp;
    elapsed += delta;
    if (elapsed >= duration + END_HOLD_MS) elapsed = 0;
    paint(elapsed);
    rafId = requestAnimationFrame(tick);
  };

  const play = (): void => {
    if (playing) return;
    if (elapsed >= duration) elapsed = 0;
    playing = true;
    lastStamp = 0;
    callbacks.onPlayState(true);
    rafId = requestAnimationFrame(tick);
  };

  const pause = (): void => {
    playing = false;
    cancelAnimationFrame(rafId);
    callbacks.onPlayState(false);
  };

  paint(0);

  const handle: AnimationHandle = {
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    restart: () => {
      elapsed = 0;
      paint(0);
      play();
    },
    seekFraction: (fraction: number) => {
      elapsed = fraction * duration;
      paint(elapsed);
    },
    isPlaying: () => playing,
    destroy: () => {
      playing = false;
      cancelAnimationFrame(rafId);
    },
  };
  return handle;
};

/**
 * A still pitch with tappable positions, for the formation browser.
 * No timeline — the dots never move; tapping one selects it.
 */
export const mountFormationPitch = (
  container: HTMLElement,
  positions: { id: string; spot: Pt }[],
  onSelect: (id: string) => void,
): { select: (id: string) => void } => {
  const svg = buildPitch();
  const layer = el('g', { class: 'layer-us' });
  svg.appendChild(layer);

  const tokens = new Map<string, SVGElement>();
  for (const position of positions) {
    const token = buildToken(position.id, 'us');
    token.classList.add('tappable');
    token.setAttribute('transform', `translate(${position.spot[0]} ${toSvgY(position.spot[1])})`);
    // Invisible disc so a thumb hits the position rather than the gap next to it.
    token.appendChild(el('circle', { r: 4.2, cx: 0, cy: 0, class: 'hit' }));
    token.addEventListener('click', () => onSelect(position.id));
    layer.appendChild(token);
    tokens.set(position.id, token);
  }
  container.replaceChildren(svg);

  const select = (id: string): void => {
    for (const [tokenId, token] of tokens) token.classList.toggle('selected', tokenId === id);
  };
  return { select };
};
