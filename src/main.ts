import './style.css';
import { generateBuildup, type Moment } from './scenarios/buildup';
import { evaluateOptions, type OptionEval } from './sim/rollout';
import { availableActions, resolveAction, simulateFallout } from './sim/step';
import { dribbleTarget, nearestOpponent } from './sim/model';
import { createRng, hashString } from './sim/rng';
import { actionKey, playerById, type Action, type Outcome, type Resolution, type State } from './sim/types';
import { add, norm, scale, sub } from './sim/vec';
import { PitchRenderer, type Frame, type Overlay } from './render/pitch';
import { sampleTimeline } from './sim/timeline';
import { Scene3D } from './render/scene3d';
import { MotionLayer } from './render/motion';
import { kick, tick, unlockAudio } from './render/sound';
import { attackDir } from './sim/model';

// ---------------------------------------------------------------- DOM
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');
app.innerHTML = `
  <header class="top">
    <span class="brand">Gaffa <small>Moments</small></span>
    <span class="top-actions">
      <span class="streak" id="streak"></span>
      <button class="ghost" id="map-toggle" aria-pressed="false">Map</button>
      <button class="ghost" id="daily">Daily</button>
      <button id="random">Random</button>
    </span>
  </header>
  <div class="pitch-wrap" id="wrap">
    <div class="strip" id="strip">
      <canvas id="pitch3d"></canvas>
      <div class="seq" id="seq"></div>
      <div class="banner hidden" id="banner"></div>
      <div class="caption hidden" id="caption"></div>
    </div>
    <div class="prompt" id="prompt"><div class="title"></div><div class="text"></div><div class="hint"></div></div>
    <div class="radar" id="radar">
      <canvas id="pitch"></canvas>
    </div>
    <div class="actionbar" id="bar"></div>
    <div id="card" class="sheet"></div>
  </div>
`;
const $ = <T extends HTMLElement>(sel: string): T => {
  const el = app.querySelector<T>(sel);
  if (!el) throw new Error(sel);
  return el;
};
const canvas = $<HTMLCanvasElement>('#pitch');
const canvas3d = $<HTMLCanvasElement>('#pitch3d');
const stripEl = $<HTMLDivElement>('#strip');
const radarEl = $<HTMLDivElement>('#radar');
const promptEl = $<HTMLDivElement>('#prompt');
const bannerEl = $<HTMLDivElement>('#banner');
const captionEl = $<HTMLDivElement>('#caption');
const barEl = $<HTMLDivElement>('#bar');
const cardEl = $<HTMLDivElement>('#card');
const seqEl = $<HTMLDivElement>('#seq');
const streakEl = $<HTMLSpanElement>('#streak');
const renderer = new PitchRenderer(canvas);
const scene = new Scene3D(canvas3d);
const motion = new MotionLayer();
let lastNow = performance.now();

let povYawTarget = 0;
const mapKey = 'gaffa.map';
let showMap = false;
try {
  showMap = localStorage.getItem(mapKey) === '1';
} catch {
  /* private mode */
}

// ---------------------------------------------------------------- game state
type Phase = 'intro' | 'decide' | 'playing' | 'verdict' | 'summary';
type Grade = 'best' | 'fine' | 'costly' | 'blunder';

interface Decision {
  prompt: string;
  chosen: OptionEval;
  best: OptionEval;
  grade: Grade;
  outcome: Outcome;
}

interface Clip {
  res: Resolution;
  duration: number;
  /** 'live' plays the beat as football happens; 'slow' unfolds ball first, then reactions. */
  mode: 'live' | 'slow';
  /** Show the outcome banner when the ball lands. */
  banner: boolean;
  /** Optional time warp: playback progress -> sim progress (for slow-motion ramps). */
  warp?: (u: number) => number;
}

const MAX_MOMENTS = 4;
/** Playback speed as a fraction of real time. */
const SPEED = { prelude: 0.55, decision: 0.45, fallout: 0.55 } as const;

let phase: Phase = 'intro';
let moment: Moment;
let evals: OptionEval[] = [];
let clips: Clip[] = [];
let clipIndex = 0;
let onClipsDone: () => void = () => undefined;
let decision: Resolution | null = null;
let finalState: State | null = null;
let finalOutcome: Outcome | null = null;
let sequence: Decision[] = [];
let seed = 0;
let animStart = 0;
let animDuration = 0;

const gradeOf = (gap: number): Grade => (gap <= 0.03 ? 'best' : gap <= 0.12 ? 'fine' : gap <= 0.3 ? 'costly' : 'blunder');
const GRADE_TEXT: Record<Grade, string> = { best: 'Best call', fine: 'Fine', costly: 'Costly', blunder: 'Blunder' };

const streakKey = 'gaffa.streak';
const readStreak = (): number => {
  try {
    return Number(localStorage.getItem(streakKey) ?? 0) || 0;
  } catch {
    return 0;
  }
};
const writeStreak = (n: number): void => {
  try {
    localStorage.setItem(streakKey, String(n));
  } catch {
    /* private mode */
  }
  streakEl.textContent = n > 0 ? `streak ${n}` : '';
};

// ---------------------------------------------------------------- frames
const frameOf = (s: State, ballZ = 0): Frame => ({
  players: s.players.map((p) => ({ id: p.id, team: p.team, num: p.num, pos: p.pos, facing: p.facing })),
  ball: s.ball,
  ballZ,
});


/** One resolution, sampled from its recorded timeline. */
const clipFrame = (clip: Clip, t: number): Frame => {
  const { after, timeline } = clip.res;
  const u = clip.warp ? clip.warp(t) : t;
  const sm = sampleTimeline(timeline, u * timeline.duration);
  const players = after.players.map((p, i) => {
    const pos = sm.players[i] ?? p.pos;
    const facing = sm.facings[i] ?? Math.atan2(sm.ball.y - pos.y, sm.ball.x - pos.x);
    return { id: p.id, team: p.team, num: p.num, pos, facing };
  });
  return { players, ball: sm.ball, ballZ: sm.z };
};

const currentFrame = (now: number): Frame => {
  const t = animDuration > 0 ? Math.min(1, (now - animStart) / animDuration) : 1;
  if (phase === 'intro' || phase === 'playing') {
    const clip = clips[clipIndex];
    return clip ? clipFrame(clip, t) : frameOf(moment.state);
  }
  if ((phase === 'verdict' || phase === 'summary') && finalState) return frameOf(finalState);
  return frameOf(moment.state);
};

const currentOverlay = (now: number): Overlay => {
  const s = moment.state;
  const carrier = playerById(s, moment.carrierId);
  const teammates = s.players.filter((p) => p.team === 'us' && p.id !== carrier.id);
  if (phase === 'decide') {
    return {
      carrierId: carrier.id,
      tappable: teammates.map((p) => p.id),
      threatId: nearestOpponent(s, carrier.pos, carrier.team).player.id,
      showShadows: true,
      neutralLanes: teammates.map((p) => p.pos),
      pulse: now / 1000,
    };
  }
  if (phase === 'intro' || phase === 'playing') {
    const clip = clips[clipIndex];
    return { ballTrail: clip ? clip.res.ballPath : [], pulse: now / 1000 };
  }
  if (decision) {
    const evs = evals.map((e) => e.ev);
    const lo = Math.min(...evs);
    const hi = Math.max(...evs);
    const q = (ev: number): number => (hi - lo < 1e-6 ? 1 : (ev - lo) / (hi - lo));
    const lanes = evals
      .filter((e) => e.action.kind === 'pass')
      .map((e) => ({ to: playerById(s, (e.action as { to: string }).to).pos, quality: q(e.ev) }));
    return {
      carrierId: finalState?.holder === carrier.id ? carrier.id : null,
      laneFrom: carrier.pos,
      lanes,
      dribbleTarget: decision.action.kind !== 'dribble' ? dribbleTarget(s, carrier) : null,
      ballTrail: decision.ballPath,
      showShadows: false,
    };
  }
  return {};
};

// ---------------------------------------------------------------- layout & loop
const wrapEl = $<HTMLDivElement>('#wrap');
const layout = (): void => {
  const w = wrapEl.clientWidth;
  wrapEl.classList.toggle('show-map', showMap);
  radarEl.hidden = !showMap;
  $('#map-toggle').setAttribute('aria-pressed', String(showMap));
  // Angular pixels stay near square: 140 degrees across, 100 tall, stretched at most 1.3x.
  const natural = w * scene.aspect * 1.05;
  const cap = showMap ? wrapEl.clientHeight * 0.38 : wrapEl.clientHeight - 40 - 70 - 120;
  const stripH = Math.round(Math.min(natural, cap));
  stripEl.style.height = `${stripH}px`;
  scene.resize(w, stripH);
  // Leave room under the radar for the action bar.
  if (showMap) renderer.resize(w - 8, Math.max(160, radarEl.clientHeight - 100));
};
window.addEventListener('resize', layout);
new ResizeObserver(() => layout()).observe(radarEl);
layout();

const loop = (now: number): void => {
  if ((phase === 'intro' || phase === 'playing') && now - animStart >= animDuration) nextClip();
  const realDt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  const playing = phase === 'intro' || phase === 'playing';
  const clip = clips[clipIndex];
  // Sim-time step for the motion layer: match the playback speed of the current clip.
  const simDt = playing && clip ? realDt * ((clip.res.timeline.duration * 1000) / clip.duration) : realDt;
  const frame = motion.step(currentFrame(now), simDt);
  if (phase === 'decide') scene.setYaw(povYawTarget);
  scene.setMarkers(phase === 'decide' ? markers3d() : null);
  const lanes = phase === 'decide' ? moment.state.players.filter((p) => p.team === 'us' && p.id !== moment.carrierId).map((p) => p.pos) : null;
  scene.draw(frame, moment.carrierId, playing, lanes, simDt);
  const me = frame.players.find((p) => p.id === moment.carrierId);
  const overlay = currentOverlay(now);
  if (me && phase !== 'summary') overlay.viewCone = { from: me.pos, yaw: scene.yaw, hfov: scene.hfov };
  if (showMap) renderer.draw(frame, overlay);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

// ---------------------------------------------------------------- helpers
const setPrompt = (title: string, text: string, hint: string, visible = true): void => {
  promptEl.classList.toggle('hidden', !visible);
  promptEl.querySelector('.title')!.textContent = title;
  promptEl.querySelector('.text')!.textContent = text;
  promptEl.querySelector('.hint')!.textContent = hint;
};

const showBanner = (text: string, tone: 'good' | 'bad' | 'gold' | 'neutral' | null): void => {
  bannerEl.className = `banner ${tone ?? 'hidden'}`;
  bannerEl.textContent = text;
};

const showCaption = (text: string | null): void => {
  captionEl.classList.toggle('hidden', !text);
  captionEl.textContent = text ?? '';
};

const renderSequenceBar = (): void => {
  const dots: string[] = [];
  for (let i = 0; i < MAX_MOMENTS; i++) {
    const d = sequence[i];
    const cls = d ? d.grade : i === sequence.length && phase !== 'summary' ? 'now' : '';
    dots.push(`<i class="${cls}"></i>`);
  }
  seqEl.innerHTML = dots.join('');
};

// ---------------------------------------------------------------- on-pitch actions
const markers3d = (): Map<string, number> => {
  const s = moment.state;
  const carrier = playerById(s, moment.carrierId);
  const m = new Map<string, number>();
  for (const p of s.players) if (p.team === 'us' && p.id !== carrier.id) m.set(p.id, 0xffd84d);
  m.set(nearestOpponent(s, carrier.pos, carrier.team).player.id, 0xe63963);
  return m;
};

/** Bottom bar: replay, numbered teammate chips, dribble, clear. The pitch itself is the primary target. */
const buildBar = (): void => {
  const s = moment.state;
  const carrier = playerById(s, moment.carrierId);
  const presser = nearestOpponent(s, carrier.pos, carrier.team).player;
  const chips: string[] = availableActions(s, carrier.id)
    .map((a) => {
      if (a.kind === 'pass') {
        const mate = playerById(s, a.to);
        return `<button class="chip mate" data-key="${actionKey(a)}" title="Pass to ${mate.role}"><b>${mate.num}</b><small>${mate.role}</small></button>`;
      }
      if (a.kind === 'dribble') return `<button class="chip act dribble" data-key="dribble"><i>⟿</i><span>Dribble past ${presser.num}</span></button>`;
      return `<button class="chip act clear" data-key="clear"><i>↟</i><span>Clear</span></button>`;
    });
  const replay = moment.prelude.length > 0 ? '<button class="chip act replay" id="replay-prelude" title="Replay the play"><i>↺</i><span>Replay</span></button>' : '';
  const mates = chips.filter((c) => c.includes('chip mate')).join('');
  const acts = chips.filter((c) => !c.includes('chip mate')).join('');
  barEl.innerHTML = `<div class="actionbar-col"><div class="actionbar-row">${mates}</div><div class="actionbar-row">${replay}${acts}</div></div>`;
  barEl.querySelector('#replay-prelude')?.addEventListener('click', playPrelude);
  barEl.querySelectorAll<HTMLButtonElement>('button[data-key]').forEach((b) => {
    b.addEventListener('click', () => {
      const key = b.dataset.key ?? '';
      if (key === 'dribble') choose({ kind: 'dribble' });
      else if (key === 'clear') choose({ kind: 'clear' });
      else if (key.startsWith('pass:')) choose({ kind: 'pass', to: key.slice(5) });
    });
  });
};

/** Tap on the 3D view: nearest marked player within reach of the finger. */
const hitPlayer3d = (sx: number, sy: number): string | null => {
  const s = moment.state;
  const carrier = playerById(s, moment.carrierId);
  const presser = nearestOpponent(s, carrier.pos, carrier.team).player;
  const candidates = [...s.players.filter((p) => p.team === 'us' && p.id !== carrier.id), presser];
  let best: string | null = null;
  let bestD = 48;
  for (const p of candidates) {
    const pr = scene.project(p.pos, 1.0);
    if (!pr.onScreen) continue;
    const d = Math.hypot(pr.x - sx, pr.y - sy);
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
};

/** Where your player naturally looks at the freeze: up the pitch, drawn toward the presser. */
const defaultYaw = (): number => {
  const s = moment.state;
  const carrier = playerById(s, moment.carrierId);
  const presser = nearestOpponent(s, carrier.pos, carrier.team).player;
  const toP = norm(sub(presser.pos, carrier.pos));
  const dir = add({ x: attackDir(carrier.team), y: 0 }, scale(toP, 0.7));
  return Math.atan2(dir.y, dir.x);
};

// ---------------------------------------------------------------- phases
const startMoment = (m: Moment, withIntro: boolean): void => {
  moment = m;
  decision = null;
  finalState = null;
  finalOutcome = null;
  clips = [];
  evals = [];
  cardEl.innerHTML = '';
  barEl.innerHTML = '';
  showBanner('', null);
  showCaption(null);
  renderSequenceBar();
  setTimeout(() => {
    evals = evaluateOptions(m.state, m.carrierId, m.id);
  }, 0);
  if (withIntro && m.prelude.length > 0) {
    playPrelude();
  } else {
    phase = 'intro';
    setPrompt(`Moment ${sequence.length + 1} of ${MAX_MOMENTS} · ${m.title}`, m.prompt, '');
    clips = [];
    if (!withIntro || m.prelude.length === 0) motion.reset(frameOf(m.state));
    onClipsDone = enterDecide;
    clipIndex = -1;
    nextClip();
  }
};

const rampIntoFreeze = (u: number): number => 1 - Math.pow(1 - u, 2.1);

const playPrelude = (): void => {
  if (moment.prelude.length === 0) return;
  barEl.innerHTML = '';
  wrapEl.classList.remove('frozen');
  showBanner('', null);
  setPrompt(`Moment ${sequence.length + 1} of ${MAX_MOMENTS} · ${moment.title}`, 'Watch the play.', '');
  phase = 'intro';
  clips = moment.prelude.map((res, i) => {
    const last = i === moment.prelude.length - 1;
    return {
      res,
      duration: ((res.timeline.duration * 1000) / SPEED.prelude) * (last ? 1.45 : 1),
      mode: 'live' as const,
      banner: false,
      ...(last ? { warp: rampIntoFreeze } : {}),
    };
  });
  const first = clips[0];
  if (first) motion.reset(frameOf(first.res.before));
  onClipsDone = enterDecide;
  clipIndex = -1;
  nextClip();
};

const enterDecide = (): void => {
  phase = 'decide';
  showCaption(null);
  wrapEl.classList.add('frozen');
  setPrompt(`Moment ${sequence.length + 1} of ${MAX_MOMENTS} · ${moment.title}`, moment.prompt, 'Frozen. Every option is a button on the pitch.');
  showBanner('YOUR MOVE', 'gold');
  window.setTimeout(() => {
    if (phase === 'decide') showBanner('', null);
  }, 900);
  povYawTarget = defaultYaw();
  scene.setBallAnchorYaw(povYawTarget);
  buildBar();
};

const choose = (action: Action): void => {
  if (phase !== 'decide') return;
  if (evals.length === 0) evals = evaluateOptions(moment.state, moment.carrierId, moment.id);
  const rng = createRng((Math.random() * 2 ** 32) >>> 0);
  decision = resolveAction(moment.state, action, rng);
  clips = [{ res: decision, duration: (decision.timeline.duration * 1000) / SPEED.decision, mode: 'slow', banner: true }];
  if (decision.outcome === 'lost' || decision.outcome === 'chance') {
    for (const res of simulateFallout(decision.after, rng)) {
      clips.push({ res, duration: (res.timeline.duration * 1000) / SPEED.fallout, mode: 'slow', banner: false });
    }
  }
  const lastClip = clips[clips.length - 1];
  if (lastClip) lastClip.banner = true;
  const last = clips[clips.length - 1];
  finalState = last ? last.res.after : decision.after;
  finalOutcome = last ? last.res.outcome : decision.outcome;
  barEl.innerHTML = '';
  wrapEl.classList.remove('frozen');
  promptEl.classList.add('hidden');
  showBanner('', null);
  tick();
  navigator.vibrate?.(12);
  window.setTimeout(() => kick(action.kind === 'clear' ? 1.4 : 0.9), 320 / SPEED.decision);
  phase = 'playing';
  onClipsDone = enterVerdict;
  clipIndex = -1;
  nextClip();
};

const toneOf = (o: Outcome): 'good' | 'bad' | 'gold' | 'neutral' => {
  if (o === 'lost' || o === 'goal') return 'bad';
  if (o === 'chance') return 'gold';
  if (o === 'cleared' || o === 'saved') return 'neutral';
  return 'good';
};

const bannerText = (res: Resolution, first: boolean): string => {
  const ours = res.before.holder ? playerById(res.before, res.before.holder).team === 'us' : true;
  switch (res.outcome) {
    case 'lost':
      return ours ? 'POSSESSION LOST' : 'WON IT BACK';
    case 'chance':
      return ours ? 'CHANCE CREATED' : 'THEY ARE IN';
    case 'cleared':
      return ours ? 'CLEARED' : 'THEY GO LONG';
    case 'goal':
      return ours ? 'GOAL' : 'GOAL CONCEDED';
    case 'saved':
      return ours ? 'SAVED' : 'SAVED BY #1';
    default:
      return first ? 'BALL KEPT' : ours ? 'STILL OURS' : 'THEY KEEP IT';
  }
};

const bannerTone = (res: Resolution): 'good' | 'bad' | 'gold' | 'neutral' => {
  const ours = res.before.holder ? playerById(res.before, res.before.holder).team === 'us' : true;
  if (!ours) {
    if (res.outcome === 'lost') return 'good';
    if (res.outcome === 'goal') return 'bad';
    if (res.outcome === 'saved' || res.outcome === 'cleared') return 'neutral';
    return 'bad';
  }
  return toneOf(res.outcome);
};

const nextClip = (): void => {
  clipIndex += 1;
  const clip = clips[clipIndex];
  if (!clip) {
    onClipsDone();
    return;
  }
  animStart = performance.now();
  animDuration = clip.duration;
  showCaption(clip.res.text);
  showBanner('', null);
  if (phase === 'playing' && clipIndex > 0) window.setTimeout(() => kick(0.8), (0.35 / (clip.res.timeline.duration || 1)) * clip.duration);
  if (phase === 'intro') window.setTimeout(() => kick(0.7), (0.35 / (clip.res.timeline.duration || 1)) * clip.duration);
  if (!clip.banner) return;
  const first = clipIndex === 0;
  // Reveal the banner once the ball has landed.
  window.setTimeout(() => {
    if (clips[clipIndex] === clip) showBanner(bannerText(clip.res, first), bannerTone(clip.res));
  }, clip.duration * 0.6);
};

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const fmtEv = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`;

const headlineFor = (): { text: string; tone: string } => {
  const o = finalOutcome ?? 'retained';
  const d = decision?.outcome ?? 'retained';
  if (o === 'goal' && d === 'lost') return { text: 'Goal conceded', tone: 'bad' };
  if (o === 'goal') return { text: 'Goal', tone: 'good' };
  if (d === 'lost') return { text: o === 'saved' ? 'Turnover, shot saved' : o === 'lost' ? 'Turnover, won it back' : 'Possession lost', tone: 'bad' };
  if (d === 'chance') return { text: o === 'saved' ? 'Chance created, saved' : 'Chance created', tone: 'gold' };
  if (d === 'cleared') return { text: 'Cleared', tone: 'neutral' };
  return { text: 'Ball kept', tone: 'good' };
};

const enterVerdict = (): void => {
  if (!decision) return;
  phase = 'verdict';
  showCaption(null);
  const key = actionKey(decision.action);
  const chosen = evals.find((e) => e.key === key);
  const best = evals[0];
  if (!chosen || !best) return;
  const gap = best.ev - chosen.ev;
  const grade = gradeOf(gap);
  sequence.push({ prompt: moment.prompt, chosen, best, grade, outcome: decision.outcome });
  writeStreak(grade === 'best' || grade === 'fine' ? readStreak() + 1 : 0);
  renderSequenceBar();

  const lo = Math.min(...evals.map((e) => e.ev));
  const hi = Math.max(...evals.map((e) => e.ev));
  const span = Math.max(1e-6, hi - lo);
  const rows = evals
    .map((e) => {
      const cls = [e.key === key ? 'you' : '', e === best ? 'best' : ''].join(' ');
      const w = ((e.ev - lo) / span) * 100;
      const hue = Math.round((120 * (e.ev - lo)) / span);
      const tags = [e.key === key ? '<span class="tag">you</span>' : '', e === best ? '<span class="tag">best</span>' : ''].join('');
      return `<div class="opt ${cls}">
        <span class="name">${e.label}${tags}</span>
        <span class="ev">${fmtEv(e.ev)}</span>
        <span class="stats"><span class="bar"><i style="left:0;width:${w.toFixed(0)}%;background:hsl(${hue},80%,55%)"></i></span>
          <span>${pct(e.immediate)} on · keep ${pct(e.retain)} · lose deep ${pct(e.lostDanger)}</span></span>
      </div>`;
    })
    .join('');

  const canPlayOn = decision.outcome === 'retained' && sequence.length < MAX_MOMENTS;
  const head = headlineFor();
  const why =
    grade === 'best'
      ? 'That was the strongest option on the board.'
      : `${best.label} graded ${fmtEv(best.ev)} against your ${fmtEv(chosen.ev)}.`;
  const story = clips.map((c) => c.res.text).join(' ');

  barEl.innerHTML = '';
  cardEl.innerHTML = `<div class="verdict-strip ${head.tone}"><span>${head.text}</span><span class="grade ${grade}">${GRADE_TEXT[grade]}</span></div>
  <div class="card">
    <p class="sub">${story} ${why}</p>
    <div class="options">${rows}</div>
    <div class="card-actions">
      ${canPlayOn ? '<button class="primary" id="playon">Play on</button>' : '<button class="primary" id="summary">Sequence summary</button>'}
      <button id="replay">Replay</button>
      <button id="retry">Retry</button>
    </div>
  </div>`;
  cardEl.querySelector('#playon')?.addEventListener('click', playOn);
  cardEl.querySelector('#summary')?.addEventListener('click', enterSummary);
  cardEl.querySelector('#replay')?.addEventListener('click', () => {
    sequence.pop();
    phase = 'playing';
    barEl.innerHTML = '';
    cardEl.innerHTML = '';
    if (decision) motion.reset(frameOf(decision.before));
    onClipsDone = enterVerdict;
    clipIndex = -1;
    nextClip();
  });
  cardEl.querySelector('#retry')?.addEventListener('click', () => {
    sequence.pop();
    startMoment(moment, false);
  });
};

const playOn = (): void => {
  if (!decision) return;
  const after = decision.after;
  const holderId = after.holder;
  if (!holderId) return;
  const carrier = playerById(after, holderId);
  const next: Moment = {
    id: (moment.id * 31 + after.tick) >>> 0,
    title: 'Play on',
    prompt: `Now you're the ${carrier.role}. Keep it moving.`,
    state: after,
    carrierId: carrier.id,
    prelude: [decision],
  };
  startMoment(next, false);
};

const enterSummary = (): void => {
  phase = 'summary';
  renderSequenceBar();
  barEl.innerHTML = '';
  const gaps = sequence.map((d) => d.best.ev - d.chosen.ev);
  const avgGap = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
  const finish =
    finalOutcome === 'goal' && decision?.outcome === 'lost'
      ? 'It ended in a goal against you.'
      : finalOutcome === 'goal'
        ? 'You scored.'
        : decision?.outcome === 'lost'
          ? 'It ended in a turnover.'
          : decision?.outcome === 'chance'
            ? 'You worked it into the final third.'
            : decision?.outcome === 'cleared'
              ? 'You went long.'
              : 'You kept it.';
  const items = sequence
    .map(
      (d, i) => `<li>
        <span><b>${i + 1}.</b> ${d.chosen.label} <span class="grade ${d.grade}">${GRADE_TEXT[d.grade]}</span></span>
        <span class="muted">${d.grade === 'best' ? '' : `best: ${d.best.label}`}</span>
      </li>`,
    )
    .join('');
  cardEl.innerHTML = `<div class="card">
    <h2>Sequence over</h2>
    <p class="sub">${finish} Average gap to the best call: ${avgGap.toFixed(2)}.</p>
    <ul class="summary-list">${items}</ul>
    <div class="card-actions">
      <button class="primary" id="again">New sequence</button>
      <button id="share">Copy link</button>
    </div>
  </div>`;
  cardEl.querySelector('#again')?.addEventListener('click', () => newSequence((Math.random() * 2 ** 31) >>> 0));
  cardEl.querySelector('#share')?.addEventListener('click', () => {
    void navigator.clipboard?.writeText(`${location.origin}${location.pathname}#m/${seed}`);
  });
};

const newSequence = (s: number): void => {
  seed = s;
  sequence = [];
  location.hash = `m/${seed}`;
  startMoment(generateBuildup(seed), true);
};

// ---------------------------------------------------------------- input
canvas.addEventListener('pointerdown', (ev) => {
  if (phase !== 'decide') return;
  const rect = canvas.getBoundingClientRect();
  const pt = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  const carrier = playerById(moment.state, moment.carrierId);
  const presser = nearestOpponent(moment.state, carrier.pos, carrier.team).player;
  const ids = [...moment.state.players.filter((p) => p.team === 'us').map((p) => p.id), presser.id];
  const hit = renderer.hitPlayer(frameOf(moment.state), pt, ids);
  if (hit === null) return;
  if (hit === moment.carrierId || hit === presser.id) choose({ kind: 'dribble' });
  else choose({ kind: 'pass', to: hit });
});

let dragX: number | null = null;
let dragStart: { x: number; y: number } | null = null;
let dragged = false;
canvas3d.addEventListener('pointerdown', (ev) => {
  if (phase !== 'decide') return;
  dragX = ev.clientX;
  dragStart = { x: ev.clientX, y: ev.clientY };
  dragged = false;
  canvas3d.setPointerCapture(ev.pointerId);
});
canvas3d.addEventListener('pointermove', (ev) => {
  if (dragX === null || phase !== 'decide') return;
  const dx = ev.clientX - dragX;
  dragX = ev.clientX;
  if (dragStart && Math.hypot(ev.clientX - dragStart.x, ev.clientY - dragStart.y) > 8) dragged = true;
  if (dragged) povYawTarget += dx * 0.007;
});
canvas3d.addEventListener('pointerup', (ev) => {
  if (dragX !== null && !dragged && phase === 'decide') {
    const rect = canvas3d.getBoundingClientRect();
    const hit = hitPlayer3d(ev.clientX - rect.left, ev.clientY - rect.top);
    if (hit) {
      const carrier = playerById(moment.state, moment.carrierId);
      const presser = nearestOpponent(moment.state, carrier.pos, carrier.team).player;
      if (hit === presser.id) choose({ kind: 'dribble' });
      else choose({ kind: 'pass', to: hit });
    }
  }
  dragX = null;
  dragStart = null;
});
canvas3d.addEventListener('pointercancel', () => {
  dragX = null;
  dragStart = null;
});
window.addEventListener('pointerdown', unlockAudio, { once: true });

$('#map-toggle').addEventListener('click', () => {
  showMap = !showMap;
  try {
    localStorage.setItem(mapKey, showMap ? '1' : '0');
  } catch {
    /* private mode */
  }
  layout();
});

$('#daily').addEventListener('click', () => newSequence(hashString(new Date().toISOString().slice(0, 10))));
$('#random').addEventListener('click', () => newSequence((Math.random() * 2 ** 31) >>> 0));

window.addEventListener('hashchange', () => {
  const m = /^#m\/(\d+)$/.exec(location.hash);
  if (m?.[1] && Number(m[1]) !== seed) newSequence(Number(m[1]));
});

// ---------------------------------------------------------------- boot
writeStreak(readStreak());
const fromHash = /^#m\/(\d+)$/.exec(location.hash);
newSequence(fromHash?.[1] ? Number(fromHash[1]) : hashString(new Date().toISOString().slice(0, 10)));
