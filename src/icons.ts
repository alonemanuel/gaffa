/**
 * Line icons, drawn rather than typed. Each is a 24×24 stroke path that
 * inherits `currentColor`, so a card can colour its own icon.
 */
export type IconName =
  | 'goal'
  | 'attack'
  | 'press'
  | 'shield'
  | 'transition'
  | 'formation'
  | 'back'
  | 'play'
  | 'pause'
  | 'restart';

const PATHS: Record<IconName, string> = {
  // A goal frame: posts and crossbar, with the net only hinted at.
  goal: `
    <path d="M3.5 8.5h17v10h-17z" />
    <path d="M8.5 8.5v10M15.5 8.5v10M3.5 13.5h17" opacity=".4" />
    <path d="M2 18.5h20" />`,

  // Ball driven forward: a chevron pair pushing at a moving dot.
  attack: `
    <path d="M4 12h9" />
    <path d="M9.5 7.5 14 12l-4.5 4.5" />
    <circle cx="18.5" cy="12" r="2.5" />`,

  // Pressing trap: converging arrows onto a point.
  press: `
    <circle cx="12" cy="12" r="2.5" />
    <path d="M3.5 3.5 7 7M20.5 3.5 17 7M3.5 20.5 7 17M20.5 20.5 17 17" />
    <path d="M3.5 6.5v-3h3M20.5 6.5v-3h-3M3.5 17.5v3h3M20.5 17.5v3h-3" />`,

  shield: `
    <path d="M12 3.2 20 6v6.1c0 4.2-3.1 7.4-8 8.7-4.9-1.3-8-4.5-8-8.7V6z" />
    <path d="M12 3.4v17.2" opacity=".45" />`,

  // Possession changing hands: two arcs running opposite ways.
  transition: `
    <path d="M4.5 10.5a7.5 7.5 0 0 1 12.6-3.4L20 10" />
    <path d="M20 4.8V10h-5.2" />
    <path d="M19.5 13.5a7.5 7.5 0 0 1-12.6 3.4L4 14" />
    <path d="M4 19.2V14h5.2" />`,

  // A pitch seen end-on, with a back two and a man up top marked out.
  formation: `
    <rect x="4" y="2.5" width="16" height="19" rx="2" />
    <path d="M4 12h16" opacity=".4" />
    <circle cx="12" cy="12" r="3" opacity=".4" />
    <circle cx="8" cy="18" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="16" cy="18" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none" />`,

  back: `<path d="M14.5 5 8 12l6.5 7" />`,

  play: `<path d="M8 5.4 18 12 8 18.6z" fill="currentColor" stroke-linejoin="round" />`,

  pause: `<path d="M9.5 5.5v13M14.5 5.5v13" stroke-width="2.4" />`,

  restart: `
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20.4 4.4V10h-5.6" />`,
};

export const icon = (name: IconName): string =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
