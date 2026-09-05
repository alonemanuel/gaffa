import type { Phase, Tactic } from './types';

export const PHASES: Phase[] = [
  {
    id: 'our-goal-kick',
    name: 'Our goal kick',
    blurb: 'Getting out from the back without hoofing it',
    icon: '🥅',
  },
  {
    id: 'attacking',
    name: 'Attacking',
    blurb: 'We have it in their half and need an idea',
    icon: '⚡',
  },
  {
    id: 'their-goal-kick',
    name: 'Their goal kick',
    blurb: 'Pressing high, and how to do it with six players',
    icon: '🎯',
  },
  {
    id: 'defending',
    name: 'Defending',
    blurb: 'Shape, cover, and who is allowed to leave it',
    icon: '🛡️',
  },
  {
    id: 'transition',
    name: 'Transitions',
    blurb: 'The seconds right after the ball changes hands',
    icon: '🔄',
  },
];

export const TACTICS: Tactic[] = [
  // ─────────────────────────────────────────────────────── our goal kick
  {
    id: 'split-the-cbs',
    phase: 'our-goal-kick',
    formation: '2-3-1',
    title: 'Split the centre-backs',
    problem: 'They press our goal kick and we just kick it high.',
    idea:
      'You hoof it because at the moment the keeper looks up, every short option is marked. The fix is not bravery, it is geometry. Two players standing very wide and very deep force their one striker to make a choice, and whichever choice he makes, he leaves someone free. The keeper is not looking for a good pass — he is waiting for an obvious one.',
    keys: [
      { who: 'Keeper', what: 'Do not rush. Wait until both centre-backs are level with the corners of the box. If nothing appears, that is what the next tactic is for.' },
      { who: 'Centre-backs', what: 'Go wide and deep — corners of the box, almost the touchline. It feels wrong. That feeling is the point; it is dragging their striker with it.' },
      { who: 'Centre mid', what: 'Drop in only AFTER the ball has left the keeper. Drop early and you just bring a marker into the space you wanted.' },
      { who: 'Wide mids', what: 'Stay high. You are not an option, you are a pin — you are the reason their full-backs cannot come and squash this.' },
      { who: 'Striker', what: 'Stay central and high, as the emergency exit. If the whole thing jams, the keeper needs one long option that is not a lottery.' },
    ],
    frames: [
      {
        t: 0,
        ball: 'GK',
        us: { GK: [20, 3], LCB: [14, 9], RCB: [26, 9], LM: [9, 24], CM: [20, 20], RM: [31, 24], ST: [20, 35] },
        them: { OGK: [20, 57], OLB: [13, 40], ORB: [27, 40], OLM: [13, 19], OCM: [20, 27], ORM: [27, 19], OST: [20, 14] },
        note: 'Their striker is on our keeper, both their mids are ready to jump. Right now there genuinely is nothing on.',
      },
      {
        t: 1500,
        ball: 'GK',
        us: { LCB: [6, 8], RCB: [34, 8], LM: [8, 26], RM: [32, 26] },
        them: { OST: [20, 13] },
        note: 'Centre-backs split to the corners of the box. One striker cannot cover both of them.',
      },
      {
        t: 2900,
        ball: 'LCB',
        us: { GK: [20, 4], LM: [8, 30], CM: [18, 18] },
        them: { OST: [12, 12], OLM: [11, 22] },
        note: 'Ball goes left. Their striker jumps across to press it — and vacates the middle he was standing in.',
      },
      {
        t: 4300,
        ball: 'CM',
        us: { LM: [8, 32], CM: [16, 16] },
        them: { OST: [9, 10], OCM: [19, 23] },
        note: 'Centre mid drops in behind the press. He is the free man, and he was always going to be.',
      },
      {
        t: 5800,
        ball: 'RM',
        us: { LCB: [8, 12], RCB: [34, 10], RM: [33, 30], ST: [20, 36] },
        them: { OLM: [12, 24], ORM: [28, 28] },
        note: 'One touch to turn, then switch to the far side. Press beaten — and you never kicked it long.',
      },
    ],
  },
  {
    id: 'long-but-on-purpose',
    phase: 'our-goal-kick',
    formation: '2-3-1',
    title: 'Going long, on purpose',
    problem: 'Short really is blocked and I do not want to gift them the ball.',
    idea:
      'Going long is not the sin. Going long with nobody moving is. A kick down the middle to a standing striker is a 20% ball. The same kick into the channel outside their centre-back, with your striker already running and a mid sprinting for the knock-down, is a 50% ball that starts 40 metres up the pitch.',
    keys: [
      { who: 'Keeper', what: 'Aim for the channel outside their centre-back, never the middle. The middle is where all three of their players already are.' },
      { who: 'Striker', what: 'Attack it with a running start. Never stand and wait — a jumping player beats a standing player even when he is smaller.' },
      { who: 'Nearest mid', what: 'Start running the moment the keeper does. The second ball is where possession is actually won and it lands roughly 10 metres behind the contest.' },
      { who: 'Far mid', what: 'Tuck in centrally. If it breaks badly you need a body in the middle, or their counter starts with nobody in front of it.' },
    ],
    frames: [
      {
        t: 0,
        ball: 'GK',
        us: { GK: [20, 3], LCB: [7, 8], RCB: [33, 8], LM: [9, 26], CM: [19, 19], RM: [31, 26], ST: [20, 34] },
        them: { OGK: [20, 57], OLB: [13, 42], ORB: [27, 42], OLM: [9, 17], OCM: [19, 24], ORM: [31, 17], OST: [19, 11] },
        note: 'Man for man across every short option. This is the exact moment the aimless hoof normally happens.',
      },
      {
        t: 1300,
        ball: 'GK',
        us: { ST: [14, 36], CM: [19, 21], LM: [10, 30] },
        them: {},
        note: 'The striker does not wait to see the kick. He picks the channel outside their centre-back and goes.',
      },
      {
        t: 2600,
        ball: [16, 44],
        us: { ST: [16, 42], CM: [18, 28], LM: [11, 34], RM: [30, 30] },
        them: { OLB: [15, 44], OCM: [20, 30] },
        note: 'Into the channel, not the middle. He is running onto it while the defender is still turning.',
      },
      {
        t: 4000,
        ball: [17, 46],
        us: { ST: [17, 45], CM: [18, 34], LM: [12, 38], RM: [29, 34] },
        them: { OLB: [17, 46], OCM: [20, 34] },
        note: 'You may well lose this header. That is completely fine — it was never about the first ball.',
      },
      {
        t: 5400,
        ball: 'CM',
        us: { ST: [18, 46], CM: [18, 39] },
        them: { OLB: [18, 47], OCM: [21, 36] },
        note: 'The second ball is the real one, and your mid is there because he set off at the same time the ball did.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────── attacking
  {
    id: 'drop-and-run-beyond',
    phase: 'attacking',
    formation: '2-3-1',
    title: 'Striker drops, a mid runs beyond',
    problem: 'We get the ball in the middle and we do not know what to do with it.',
    idea:
      'Nothing is on because everybody is in front of the ball, static, and marked. Static players are easy to defend at any level. One pair of movements fixes it: the striker comes short and drags a centre-back out of the line, and the mid nearest the ball runs into the hole he leaves. You are not trying to find a pass — you are trying to make one exist.',
    keys: [
      { who: 'Striker', what: 'Come short hard, into the ball. It does not matter if you never receive it. Moving their centre-back is the job.' },
      { who: 'Nearest mid', what: 'The instant the striker moves toward you, run PAST him. Same moment, opposite direction — that is the entire trick.' },
      { who: 'Ball carrier', what: 'Your first look is the runner, not the striker\'s feet. If you look at the striker you will play the safe ball and the run dies.' },
      { who: 'Wide players', what: 'Hold your width and do not drift in. You are the reason their defence cannot squeeze the middle shut.' },
    ],
    frames: [
      {
        t: 0,
        ball: 'CM',
        us: { GK: [20, 5], LCB: [13, 16], RCB: [27, 16], LM: [7, 30], CM: [20, 30], RM: [33, 30], ST: [20, 44] },
        them: { OGK: [20, 57], OLB: [14, 48], ORB: [26, 48], OLM: [12, 32], OCM: [20, 34], ORM: [28, 32], OST: [20, 20] },
        note: 'Ball is in the middle. Everyone is in front of it, standing still and marked. This is the sideways-pass moment.',
      },
      {
        t: 1400,
        ball: 'CM',
        us: { ST: [20, 38] },
        them: { ORB: [23, 44] },
        note: 'Striker comes short — hard, into the ball. Whether he actually gets it is not the point yet.',
      },
      {
        t: 2700,
        ball: 'CM',
        us: { ST: [20, 37], RM: [33, 32], LM: [7, 32] },
        them: { ORB: [22, 41] },
        note: 'Their centre-back follows him out. There is now a hole exactly where that defender was standing.',
      },
      {
        t: 3900,
        ball: 'CM',
        us: { RM: [30, 44] },
        them: { OLB: [16, 47] },
        note: 'The mid nearest the ball runs PAST the striker into that hole. This is the whole move.',
      },
      {
        t: 5200,
        ball: 'RM',
        us: { RM: [30, 48], CM: [21, 32], LM: [8, 36] },
        them: {},
        note: 'Ball over the top to the runner. First look is always the runner, never the striker\'s feet.',
      },
    ],
  },
  {
    id: 'overload-and-switch',
    phase: 'attacking',
    formation: '2-3-1',
    title: 'Overload one side, switch to the free man',
    problem: 'We keep the ball but we never actually get anywhere with it.',
    idea:
      'A 7v7 pitch is narrow, so a whole team can shift across it in about three seconds. That is normally why you get stuck — but it is also the weapon. Deliberately pull four players to one side, let them come, then switch. The far winger has been standing alone doing nothing for thirty seconds, and that was his job.',
    keys: [
      { who: 'Ball side', what: 'Get bodies over. Short passes, close together, even the striker drifts across. Make it look like this is where the plan is.' },
      { who: 'Far winger', what: 'Do NOT come and help. Stay on your touchline and stay awake. You will get one ball and you must already be facing the right way.' },
      { who: 'Centre mid', what: 'You are the hinge. Do not go all the way over — stay central enough that the switch is one pass, not two.' },
      { who: 'Everyone', what: 'Count to three before switching. Switching too early is the most common mistake — they have not committed yet.' },
    ],
    frames: [
      {
        t: 0,
        ball: 'LM',
        us: { GK: [20, 5], LCB: [13, 18], RCB: [27, 18], LM: [8, 36], CM: [16, 32], RM: [33, 34], ST: [18, 44] },
        them: { OGK: [20, 57], OLB: [15, 48], ORB: [25, 48], OLM: [12, 34], OCM: [18, 34], ORM: [26, 34], OST: [20, 24] },
        note: 'Ball on the left. Their shape is still roughly central and compact.',
      },
      {
        t: 1500,
        ball: 'LM',
        us: { CM: [13, 34], ST: [15, 42], LCB: [12, 24] },
        them: { OST: [15, 28], OLM: [9, 34], OCM: [14, 36], ORM: [21, 34] },
        note: 'Pull more bodies to the left. Even the striker drifts over. Sell it.',
      },
      {
        t: 3000,
        ball: 'CM',
        us: {},
        them: { ORM: [18, 34], ORB: [20, 48], OCM: [13, 37], OLB: [13, 46] },
        note: 'They shift with you. On a pitch this narrow the whole team is over inside three seconds.',
      },
      {
        t: 4200,
        ball: 'RM',
        us: { RM: [34, 36], ST: [17, 44] },
        them: { ORM: [19, 35] },
        note: 'Now switch. He has been alone on that touchline this whole time — that was the point of him.',
      },
      {
        t: 5600,
        ball: 'RM',
        us: { RM: [34, 44], ST: [22, 46], CM: [20, 36] },
        them: { ORB: [26, 48], ORM: [26, 38] },
        note: 'He carries it into a completely empty side. Two touches and you are at the byline.',
      },
    ],
  },

  // ────────────────────────────────────────────────────── their goal kick
  {
    id: 'curved-press',
    phase: 'their-goal-kick',
    formation: '2-3-1',
    title: 'Press with a curved run',
    problem: 'We press their goal kick and they just play round us every time.',
    idea:
      'One striker cannot cover two centre-backs, so stop asking him to. If he runs straight at the keeper, both centre-backs are live and your mids are guessing. If he curves his run so his body blocks one side, there is only one pass left — and now your mids are not guessing, they are arriving. Pressing is not about running harder, it is about removing options until only the one you want is left.',
    keys: [
      { who: 'Striker', what: 'Never run straight at the keeper. Curve it so your body cuts off one centre-back. You are a one-way valve, not a chaser.' },
      { who: 'Mid on the open side', what: 'Start moving before the pass. You know where it is going because your striker decided for them.' },
      { who: 'Other two mids', what: 'Shuffle across and cover the inside pass. The one thing you cannot allow is a clean ball into their centre mid.' },
      { who: 'Centre-backs', what: 'Push up to halfway. If you sit deep the whole press is pointless — you leave 30 metres for them to play into.' },
    ],
    frames: [
      {
        t: 0,
        ball: 'OGK',
        us: { GK: [20, 4], LCB: [15, 18], RCB: [25, 18], LM: [10, 32], CM: [20, 30], RM: [30, 32], ST: [20, 42] },
        them: { OGK: [20, 57], OLB: [13, 50], ORB: [27, 50], OLM: [11, 38], OCM: [20, 36], ORM: [29, 38], OST: [20, 26] },
        note: 'Their keeper has it. If your striker runs straight at him, both centre-backs stay free.',
      },
      {
        t: 1400,
        ball: 'OGK',
        us: { ST: [26, 46] },
        them: {},
        note: 'Instead he curves his run, approaching from one side so his body blocks the pass to that centre-back.',
      },
      {
        t: 2600,
        ball: 'OLB',
        us: { ST: [24, 48], RM: [30, 36], CM: [20, 32], LM: [12, 34] },
        them: {},
        note: 'They can only go one way. That is not luck any more — you chose it for them.',
      },
      {
        t: 3800,
        ball: 'OLB',
        us: { LM: [13, 42], CM: [17, 34], RM: [28, 34], ST: [20, 46], LCB: [16, 24], RCB: [26, 24] },
        them: { OLM: [10, 40] },
        note: 'Your left mid jumps early — he knew which side it was going before it went.',
      },
      {
        t: 5200,
        ball: 'LM',
        us: { LM: [12, 46], CM: [16, 38], ST: [18, 46] },
        them: {},
        note: 'Won high. This is the cheapest goal in 7v7 and it starts with the shape of one run.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────── defending
  {
    id: 'someone-always-sits',
    phase: 'defending',
    formation: '2-3-1',
    title: 'Someone always sits',
    problem: 'They have a centre-back who always carries it through the middle and nobody covers him.',
    idea:
      'This is a role problem, not an effort problem — which is why shouting at people never fixes it. It happens because all three of your midfielders go to the ball, so the moment he plays round one of them the middle is completely empty. The fix is one rule, and it is uncomfortable because it looks like laziness: one player never presses the ball. Ever. This animation shows the problem first, then the same situation with the rule applied.',
    keys: [
      { who: 'Centre mid (the anchor)', what: 'You do not press the ball. Ever. Your only job is the space in front of your two centre-backs. It will feel like you are doing nothing. You are doing the most important thing.' },
      { who: 'The anchor, exception', what: 'If he crosses halfway and nobody has engaged him, you step — and a wide mid immediately drops into your spot. There is always one anchor; it just is not always the same person.' },
      { who: 'Centre-backs', what: 'Do NOT step out to meet him. That is exactly what he wants; that is the pass he is carrying it to create. Hold the line and let the anchor delay him.' },
      { who: 'Striker', what: 'Do not chase him from behind. Show him to one side, then cut the pass back. You are the lid, not the tackler.' },
    ],
    frames: [
      {
        t: 0,
        ball: 'ORB',
        us: { GK: [20, 4], LCB: [15, 16], RCB: [25, 16], LM: [9, 28], CM: [20, 26], RM: [31, 28], ST: [20, 38] },
        them: { OGK: [20, 57], OLB: [14, 50], ORB: [26, 48], OLM: [10, 36], OCM: [20, 38], ORM: [30, 36], OST: [20, 22] },
        note: 'THE PROBLEM — their centre-back has it and starts walking forward.',
      },
      {
        t: 1500,
        ball: 'ORB',
        us: { LM: [12, 34], CM: [22, 32], RM: [28, 32], ST: [22, 40] },
        them: { ORB: [25, 44] },
        note: 'Everyone goes to the ball. It feels like effort, which is exactly why nobody ever stops doing it.',
      },
      {
        t: 2800,
        ball: 'ORB',
        us: { CM: [24, 34], ST: [22, 42] },
        them: { ORB: [23, 36] },
        note: 'He plays round one of them, and now he is through the middle with nobody in front of him.',
      },
      {
        t: 4200,
        ball: 'ORB',
        us: { GK: [20, 4], LCB: [15, 16], RCB: [25, 16], LM: [11, 26], CM: [20, 22], RM: [29, 26], ST: [20, 36] },
        them: { ORB: [26, 48] },
        note: 'THE FIX — same situation, one rule changed: the centre mid never presses the ball.',
      },
      {
        t: 5600,
        ball: 'ORB',
        us: { ST: [22, 38], LM: [12, 28], RM: [28, 28] },
        them: { ORB: [24, 40] },
        note: 'Striker shows him one way, wide mids hold. The anchor does not move — he guards the space, not the man.',
      },
      {
        t: 7000,
        ball: 'ORB',
        us: { CM: [20, 24], RM: [27, 24] },
        them: { ORB: [22, 33] },
        note: 'Only now does the anchor step — and a wide mid drops straight into his spot as the new anchor.',
      },
      {
        t: 8400,
        ball: 'CM',
        us: { CM: [21, 29], LCB: [15, 17], RCB: [25, 17] },
        them: { ORB: [22, 31] },
        note: 'Delay, then take it. The centre-backs never stepped out — which is what he was banking on.',
      },
    ],
  },

  // ────────────────────────────────────────────────────────── transition
  {
    id: 'first-five-seconds',
    phase: 'transition',
    formation: '2-3-1',
    title: 'The first five seconds',
    problem: 'Every time we lose the ball high up we get countered and it is 2v2 before we blink.',
    idea:
      'The three seconds after you lose it decide the next thirty. There are only two acceptable choices and jogging is not one of them: either everybody presses immediately and you win it back within five seconds, or everybody stops, drops and rebuilds the shape. The disaster is half the team doing one and half doing the other, which is what always happens by default.',
    keys: [
      { who: 'Nearest player', what: 'Press instantly — not to win it, but to stop him lifting his head. A carrier who cannot look up cannot play the pass that hurts you.' },
      { who: 'Everyone else', what: 'Squeeze IN, not back. Kill the easy forward pass. Running straight backwards just invites him to run at you with the ball.' },
      { who: 'The call', what: 'You shout one word — "PRESS" or "DROP". Nobody decides individually. Half-pressing is the worst of both and is how you concede.' },
      { who: 'Centre-backs', what: 'If the shout is DROP, you set the line at your own centre circle and hold it. Do not keep backing up to your own box.' },
    ],
    frames: [
      {
        t: 0,
        ball: 'OCM',
        us: { GK: [20, 5], LCB: [14, 22], RCB: [26, 22], LM: [8, 38], CM: [19, 36], RM: [32, 38], ST: [20, 48] },
        them: { OGK: [20, 57], OLB: [14, 50], ORB: [26, 50], OLM: [11, 40], OCM: [20, 42], ORM: [29, 40], OST: [20, 30] },
        note: 'You have just lost it high up the pitch. Six of you are in front of the ball.',
      },
      {
        t: 1200,
        ball: 'OCM',
        us: { CM: [19, 39] },
        them: {},
        note: 'The nearest player presses instantly — not to win it, but to stop him lifting his head.',
      },
      {
        t: 2500,
        ball: 'OCM',
        us: { LM: [12, 38], RM: [28, 38], ST: [20, 44] },
        them: { OCM: [19, 40] },
        note: 'Everyone else squeezes IN, not back. Kill the easy forward pass, not the pitch behind you.',
      },
      {
        t: 3800,
        ball: 'CM',
        us: { CM: [19, 40], LM: [13, 40], RM: [27, 40] },
        them: {},
        note: 'Five seconds. Either you win it here...',
      },
      {
        t: 5200,
        ball: 'OCM',
        us: { LCB: [15, 20], RCB: [25, 20], CM: [19, 28], LM: [11, 30], RM: [29, 30], ST: [20, 40] },
        them: { OCM: [20, 44] },
        note: '...or you stop, drop and get the shape back. What you cannot do is jog. Decide, then commit together.',
      },
    ],
  },
];

export const tacticsForPhase = (phase: string): Tactic[] => {
  const matching = TACTICS.filter((t) => t.phase === phase);
  return matching;
};

export const tacticById = (id: string): Tactic | undefined => {
  const found = TACTICS.find((t) => t.id === id);
  return found;
};
