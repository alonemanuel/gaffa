/**
 * The action bar's icons, drawn inline so there is no icon dependency and no
 * external request. All of them inherit `currentColor`, so the active state
 * only has to change the colour of the button.
 */

interface Props {
  className?: string;
}

const Svg = ({ children, className }: Props & { children: React.ReactNode }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width="21"
    height="21"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const PlayIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M8 5.2v13.6L19 12z" fill="currentColor" stroke="none" />
  </Svg>
);

export const PauseIcon = (p: Props) => (
  <Svg {...p}>
    <rect x="7" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.6" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const SpeedIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 6.5 10 12l-5.5 5.5" />
    <path d="M13 6.5 18.5 12 13 17.5" />
  </Svg>
);

/** One decision round forward: play, then a wall. */
export const StepIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M5.5 5.8v12.4L15 12z" fill="currentColor" stroke="none" />
    <path d="M18.5 5.5v13" />
  </Svg>
);

/** Where everyone is running to: a dashed track with an arrow on the end. */
export const RunsIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M4 19c6.5 0 8.5-6.5 13-12.5" strokeDasharray="3.2 3" />
    <path d="M12.6 6.5H17v4.4" />
  </Svg>
);

export const ResetIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1" />
    <path d="M3.4 4.2v5h5" />
  </Svg>
);
