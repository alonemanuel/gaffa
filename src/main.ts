import './style.css';
import { PHASES, tacticById, tacticsForPhase } from './data';
import { icon } from './icons';
import { FORMATIONS } from './formations';
import { mountAnimation, mountFormationPitch, type AnimationHandle } from './pitch';
import type { Formation, Tactic } from './types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app is missing from the document');
const root = app;

let animation: AnimationHandle | null = null;

const esc = (value: string): string => {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped;
};

const topBar = (title: string, backHref: string | null): string => {
  const back = backHref ? `<a class="back" href="${backHref}" aria-label="Back">${icon('back')}</a>` : '<span class="back-spacer"></span>';
  const bar = `<header class="topbar">${back}<h1>${esc(title)}</h1></header>`;
  return bar;
};

const renderHome = (): void => {
  const cards = PHASES.map((phase) => {
    const count = tacticsForPhase(phase.id).length;
    return `
      <a class="card phase-card" href="#/phase/${phase.id}">
        <span class="phase-icon">${icon(phase.icon)}</span>
        <span class="phase-text">
          <span class="phase-name">${esc(phase.name)}</span>
          <span class="phase-blurb">${esc(phase.blurb)}</span>
        </span>
        <span class="phase-count">${count}</span>
      </a>`;
  }).join('');

  root.innerHTML = `
    <div class="screen">
      <header class="hero">
        <h1>Gaffa</h1>
        <p>Seven-a-side, decided before you get there.</p>
      </header>
      <p class="section-label">Build a formation</p>
      <a class="card formation-entry" href="#/formations">
        <span class="phase-icon">${icon('formation')}</span>
        <span class="phase-text">
          <span class="phase-name">Formations</span>
          <span class="phase-blurb">Tap any position to see its job, attacking and defending</span>
        </span>
        <span class="phase-count">${FORMATIONS.length}</span>
      </a>

      <p class="section-label">Pick a phase</p>
      <div class="stack">${cards}</div>
      <p class="footnote">Every phase holds the shapes that apply to it, and each one animates. Watch it once in the car, say one sentence on the pitch.</p>
    </div>`;
};

const renderFormations = (startId?: string): void => {
  const requested = FORMATIONS.findIndex((f) => f.id === startId);
  const startIndex = requested === -1 ? 0 : requested;

  const pills = FORMATIONS.map(
    (formation, index) =>
      `<button class="pill${index === startIndex ? ' active' : ''}" data-index="${index}">${esc(formation.name)}</button>`,
  ).join('');

  const slides = FORMATIONS.map(
    (formation) => `
      <div class="slide">
        <div class="pitch-wrap">
          <div class="pitch-host formation-host" data-formation="${formation.id}"></div>
          <p class="slide-caption">${esc(formation.nickname)}</p>
        </div>
      </div>`,
  ).join('');

  root.innerHTML = `
    <div class="screen">
      ${topBar('Formations', '#/')}
      <div class="pills" id="pills">${pills}</div>
      <div class="carousel" id="carousel">${slides}</div>
      <p class="tap-hint" id="tap-hint">Swipe for another shape · tap a position</p>
      <div id="position-detail"></div>
      <section class="body" id="formation-body"></section>
    </div>`;

  wireFormations(startIndex);
};

const wireFormations = (startIndex: number): void => {
  const carousel = document.getElementById('carousel');
  const pills = document.getElementById('pills');
  const hint = document.getElementById('tap-hint');
  const detail = document.getElementById('position-detail');
  const body = document.getElementById('formation-body');
  if (!carousel || !pills || !hint || !detail || !body) return;

  const hosts = [...carousel.querySelectorAll<HTMLElement>('.formation-host')];
  const selectors = hosts.map((host, index) => {
    const formation = FORMATIONS[index];
    const pitch = mountFormationPitch(
      host,
      formation.positions.map((position) => ({ id: position.id, spot: position.spot })),
      (id) => showPosition(formation, id, pitch, hint, detail),
    );
    return pitch;
  });

  const list = (items: string[]): string => items.map((item) => `<li>${esc(item)}</li>`).join('');
  const showFormation = (index: number): void => {
    const formation = FORMATIONS[index];
    for (const [i, pill] of [...pills.children].entries()) pill.classList.toggle('active', i === index);
    for (const selector of selectors) selector.select('');
    hint.textContent = 'Tap a position';
    detail.innerHTML = '';
    body.innerHTML = `
      <h2>The shape</h2>
      <p class="idea">${esc(formation.summary)}</p>
      <h2>Good for</h2>
      <ul class="bullets good">${list(formation.strengths)}</ul>
      <h2>Watch out for</h2>
      <ul class="bullets bad">${list(formation.weaknesses)}</ul>`;
  };

  let active = startIndex;
  carousel.addEventListener('scroll', () => {
    const index = Math.round(carousel.scrollLeft / carousel.clientWidth);
    if (index === active || !FORMATIONS[index]) return;
    active = index;
    showFormation(index);
  });

  pills.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.pill');
    if (!target) return;
    const index = Number(target.dataset.index);
    carousel.scrollTo({ left: index * carousel.clientWidth, behavior: 'smooth' });
  });

  showFormation(startIndex);
  // Jump rather than glide on first paint, and re-assert next frame — the browser
  // restores the previous scroll offset after we set it, which would land on the wrong shape.
  const jump = (): void => {
    carousel.scrollLeft = startIndex * carousel.clientWidth;
  };
  jump();
  requestAnimationFrame(jump);
};

const showPosition = (
  formation: Formation,
  id: string,
  pitch: { select: (id: string) => void },
  hint: HTMLElement,
  detail: HTMLElement,
): void => {
  const position = formation.positions.find((p) => p.id === id);
  if (!position) return;
  pitch.select(id);
  hint.textContent = position.name;
  detail.innerHTML = `
    <section class="position-card">
      <h3>${esc(position.name)}</h3>
      <p class="position-purpose">${esc(position.purpose)}</p>
      <h4 class="job attack">In possession</h4>
      <ul class="bullets">${position.attacking.map((job) => `<li>${esc(job)}</li>`).join('')}</ul>
      <h4 class="job defend">Out of possession</h4>
      <ul class="bullets">${position.defending.map((job) => `<li>${esc(job)}</li>`).join('')}</ul>
      <p class="suits"><span>Who to put here</span>${esc(position.suits)}</p>
    </section>`;
};

const renderPhase = (phaseId: string): void => {
  const phase = PHASES.find((p) => p.id === phaseId);
  if (!phase) {
    location.hash = '#/';
    return;
  }
  const tactics = tacticsForPhase(phaseId);
  const cards = tactics
    .map(
      (tactic) => `
      <a class="card tactic-card" href="#/tactic/${tactic.id}">
        <span class="chip">${esc(tactic.formation)}</span>
        <span class="tactic-title">${esc(tactic.title)}</span>
        <span class="tactic-problem">“${esc(tactic.problem)}”</span>
      </a>`,
    )
    .join('');

  root.innerHTML = `
    <div class="screen">
      ${topBar(phase.name, '#/')}
      <p class="phase-lead">${esc(phase.blurb)}</p>
      <div class="stack">${cards}</div>
    </div>`;
};

const renderTactic = (tacticId: string): void => {
  const tactic = tacticById(tacticId);
  if (!tactic) {
    location.hash = '#/';
    return;
  }
  const keys = tactic.keys
    .map(
      (key) => `
      <li class="key">
        <span class="key-who">${esc(key.who)}</span>
        <span class="key-what">${esc(key.what)}</span>
      </li>`,
    )
    .join('');

  root.innerHTML = `
    <div class="screen tactic-screen">
      ${topBar(tactic.title, `#/phase/${tactic.phase}`)}
      <div class="pitch-wrap">
        <div class="pitch-host" id="pitch-host"></div>
        <p class="note" id="note"></p>
        <div class="controls">
          <button class="ctrl" id="restart" aria-label="Restart">${icon('restart')}</button>
          <button class="ctrl primary" id="playpause" aria-label="Play or pause">${icon('play')}</button>
          <input class="scrub" id="scrub" type="range" min="0" max="1000" value="0" aria-label="Scrub" />
        </div>
      </div>
      <section class="body">
        <p class="quote">“${esc(tactic.problem)}”</p>
        <h2>The idea</h2>
        <p class="idea">${esc(tactic.idea)}</p>
        <h2>Who does what</h2>
        <ul class="keys">${keys}</ul>
      </section>
    </div>`;

  wireTactic(tactic);
};

const wireTactic = (tactic: Tactic): void => {
  const host = document.getElementById('pitch-host');
  const note = document.getElementById('note');
  const playpause = document.getElementById('playpause');
  const restart = document.getElementById('restart');
  const scrub = document.getElementById('scrub') as HTMLInputElement | null;
  if (!host || !note || !playpause || !restart || !scrub) return;

  let scrubbing = false;

  animation = mountAnimation(host, tactic, {
    onNote: (text) => {
      note.textContent = text;
    },
    onProgress: (fraction) => {
      if (!scrubbing) scrub.value = String(Math.round(fraction * 1000));
    },
    onPlayState: (playing) => {
      playpause.innerHTML = icon(playing ? 'pause' : 'play');
      playpause.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    },
  });

  playpause.addEventListener('click', () => animation?.toggle());
  restart.addEventListener('click', () => animation?.restart());
  host.addEventListener('click', () => animation?.toggle());
  scrub.addEventListener('pointerdown', () => {
    scrubbing = true;
    animation?.pause();
  });
  scrub.addEventListener('input', () => animation?.seekFraction(Number(scrub.value) / 1000));
  scrub.addEventListener('pointerup', () => {
    scrubbing = false;
  });

  animation.play();
};

const render = (): void => {
  animation?.destroy();
  animation = null;
  window.scrollTo(0, 0);

  const hash = location.hash.replace(/^#/, '') || '/';
  const phaseMatch = hash.match(/^\/phase\/(.+)$/);
  const tacticMatch = hash.match(/^\/tactic\/(.+)$/);
  const formationMatch = hash.match(/^\/formation\/(.+)$/);

  if (tacticMatch) renderTactic(tacticMatch[1]);
  else if (formationMatch) renderFormations(formationMatch[1]);
  else if (hash === '/formations') renderFormations();
  else if (phaseMatch) renderPhase(phaseMatch[1]);
  else renderHome();
};

window.addEventListener('hashchange', render);
render();
