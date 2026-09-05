import type { Formation } from './types';

export const FORMATIONS: Formation[] = [
  {
    id: '2-3-1',
    name: '2-3-1',
    nickname: 'The default',
    summary:
      'Two at the back, three across midfield, one up top. The most balanced shape in 7-a-side and the one to start from unless you have a reason not to. It gives you natural width and a spare man in the middle, and it only works if the centre midfielder holds his position.',
    strengths: [
      'Real width from two wide midfielders',
      'A spare man in the middle whenever the centre mid holds',
      'Easiest shape to explain to people who have never trained together',
    ],
    weaknesses: [
      'The lone striker gets isolated if nobody supports him',
      'Only two defenders against a fast counter',
      'Collapses the moment the centre mid starts chasing the ball',
    ],
    positions: [
      {
        id: 'GK',
        name: 'Goalkeeper',
        spot: [20, 4],
        purpose: 'Last defender and first attacker. In 7v7 the keeper touches the ball far more than anyone expects.',
        attacking: [
          'Start the attack. If you can roll it to a free centre-back, do that before you even think about kicking.',
          'Stay five to ten metres off your line when we have the ball, so we always have someone to pass back to.',
          'Never rush a goal kick. Count to two and look wide first.',
        ],
        defending: [
          'Own the space in front of you. Anything dropped short into the box is yours, not a defender’s.',
          'Talk. You are the only person who can see the whole pitch.',
          'Come for the through-ball early or not at all. Halfway is how goals get scored.',
        ],
        suits: 'Whoever talks the most. Organising matters more than shot-stopping at this level.',
      },
      {
        id: 'LCB',
        name: 'Left centre-back',
        spot: [13, 14],
        purpose: 'Half of a two-man defence. Almost everything you do is defined by what the other centre-back is doing.',
        attacking: [
          'Split wide to the corner of the box at goal kicks. Very wide. Uncomfortably wide.',
          'Carry the ball forward if nobody presses you — nothing breaks a 7v7 shape faster.',
          'Stop at halfway. You are the reason a counter does not become a 2v1.',
        ],
        defending: [
          'Ball on your side, you engage. Ball on the far side, you tuck in and drop a couple of metres behind your partner.',
          'Never both step out. One of you is always the spare man.',
          'Do not follow their striker when he drops deep. Pass him on and hold your line.',
        ],
        suits: 'Someone calm who can pass. Pace matters far less here than not panicking.',
      },
      {
        id: 'RCB',
        name: 'Right centre-back',
        spot: [27, 14],
        purpose: 'The other half of the pair. If your partner goes, you cover; if he covers, you go.',
        attacking: [
          'At goal kicks get to the corner of the box on your side and stay there until the ball moves.',
          'Your best forward pass is usually the diagonal to the far wide mid. Look for it before the square ball.',
          'If your partner has carried it forward, you stay. Never both.',
        ],
        defending: [
          'Watch the midfielder arriving late. He is more dangerous than the striker you can already see.',
          'Hold the line when their centre-back carries it at you. Stepping out is exactly what he wants.',
          'Ball on the far side and you become the spare man — tuck in, drop off.',
        ],
        suits: 'The more aggressive of your two defenders. This side tends to do the front-foot defending.',
      },
      {
        id: 'LM',
        name: 'Left midfielder',
        spot: [7, 30],
        purpose: 'Width when you attack, first line of defence on your side. The most running in the team, which is why people avoid it.',
        attacking: [
          'Hold the touchline. Every metre you drift inside makes the pitch smaller for your own team.',
          'Do not come and get the ball. Stay high and wide and make them choose between you and the middle.',
          'When the ball is on the far side you are the switch target. Face the play and be ready.',
        ],
        defending: [
          'Track their full-back when he overlaps. Nobody else is going to.',
          'Ball on the other side, tuck right in — you are briefly part of a back four.',
          'Do not press their centre-back head-on. Show him inside where your mids are.',
        ],
        suits: 'The fittest player available, or the fastest. Ideally both.',
      },
      {
        id: 'CM',
        name: 'Centre midfielder',
        spot: [20, 28],
        purpose: 'The anchor. The most important position in 7v7 and the one everybody underestimates.',
        attacking: [
          'Drop between your centre-backs to receive at goal kicks — after the ball moves, never before.',
          'First look is always forward. If the striker is not on, then switch it.',
          'Do not go past the ball. Somebody has to be behind it.',
        ],
        defending: [
          'You do not press the ball. Ever. Your job is the space in front of your centre-backs.',
          'If nobody has engaged their carrier by halfway, you step — and shout for a wide mid to take your spot.',
          'Screen the pass into their striker’s feet. If he never turns, they rarely score.',
        ],
        suits: 'Best positional sense, not best dribbler. Your oldest slowest player is often perfect here.',
      },
      {
        id: 'RM',
        name: 'Right midfielder',
        spot: [33, 30],
        purpose: 'The far-side outlet. On the ball a winger, off it a full-back. Both halves are real work.',
        attacking: [
          'Stay on the touchline even when nothing is happening — especially then. That is the entire point of you.',
          'One touch to control, one to go. Take three and their defence is set.',
          'When play is on the left, do not drift over to join in. You are the payoff for all of it.',
        ],
        defending: [
          'Get back level with your centre-backs when they attack down your side.',
          'If the centre mid steps out, drop into his spot immediately. No shout needed — just go.',
          'Force their wide player down the line. Inside is where the goals are.',
        ],
        suits: 'Someone who stays disciplined while bored. Harder to find than pace.',
      },
      {
        id: 'ST',
        name: 'Striker',
        spot: [20, 44],
        purpose: 'One striker against two defenders. You will not win by outmuscling them, so the job is movement, not finishing.',
        attacking: [
          'Come short, hard, into the ball. Even when you do not get it you have pulled a defender out of the line.',
          'The moment a midfielder runs past you, occupy the defender who should be tracking him.',
          'Play on the shoulder of the far centre-back, not between the two of them.',
        ],
        defending: [
          'Do not chase. Curve your run so your body cuts off one side and make them play where you want.',
          'Once they have gone wide, screen the pass back to their keeper.',
          'When we drop, you drop to halfway too. A striker loitering on their centre-backs is a spectator.',
        ],
        suits: 'Your most selfish player — but only if he will also press. If he will not press, pick someone else.',
      },
    ],
  },
  {
    id: '3-2-1',
    name: '3-2-1',
    nickname: 'The Christmas tree',
    summary:
      'Three at the back, two in the middle, one up top. Very hard to play through and very forgiving if you are missing pace at the back. The cost is width — the outside centre-backs have to push on, and after twenty minutes they usually stop.',
    strengths: [
      'Extremely hard to break down centrally',
      'Your midfielders are never alone',
      'Works when you have no pace in defence',
    ],
    weaknesses: [
      'No natural width unless the wide centre-backs push on',
      'The striker gets very lonely indeed',
      'The wing-back running is brutal and people quietly stop doing it',
    ],
    positions: [
      {
        id: 'GK',
        name: 'Goalkeeper',
        spot: [20, 4],
        purpose: 'With three in front of you the goal is well protected, but you will have more of the ball — they will happily let your back three keep it.',
        attacking: [
          'You will be free at goal kicks far more often than in a 2-3-1. Use it and become an extra player.',
          'Look for the middle centre-back first. He can turn and see everything.',
          'Roll it rather than kick it whenever anyone is free.',
        ],
        defending: [
          'Your back three will sit deep. Command the six-yard box hard or you will get crowded out.',
          'Push the line up when the ball goes backwards. Three defenders camped deep just invites shots.',
          'Talk constantly. A back three drifts apart without a voice behind it.',
        ],
        suits: 'The loudest player, same as always.',
      },
      {
        id: 'LCB',
        name: 'Left centre-back',
        spot: [10, 14],
        purpose: 'Left of a back three, and half a wing-back. That double job is the whole trick of this shape.',
        attacking: [
          'When we have it, get up the left touchline. Without you this formation has no width at all.',
          'Only go when the ball is on your side and the middle centre-back has shuffled across to cover.',
          'Get to the byline and pull it back. Crosses aimed at a lone striker are wasted.',
        ],
        defending: [
          'Sprint back to make it a three the moment we lose it. Every single time. This is the tax.',
          'Defend the channel outside the middle centre-back.',
          'If you cannot get back, shout — the near midfielder drops in for you.',
        ],
        suits: 'Your fittest defender. This is a running job wearing a defender’s shirt.',
      },
      {
        id: 'CB',
        name: 'Centre-back (middle)',
        spot: [20, 12],
        purpose: 'The spare man. You never mark anybody — you cover everybody.',
        attacking: [
          'Stay behind the ball at all times. You are the reason the other two are allowed to push on.',
          'Step into midfield with it if nobody presses. That creates a spare man higher up the pitch.',
          'Your best pass is the long diagonal to the far wing-back.',
        ],
        defending: [
          'You are free. Never get dragged out to mark a man — read it and slide across.',
          'Organise the line. The other two look at you, not at each other.',
          'When their striker drops off, let him go. Someone else takes him.',
        ],
        suits: 'Your best reader of the game. Being slow is completely fine here.',
      },
      {
        id: 'RCB',
        name: 'Right centre-back',
        spot: [30, 14],
        purpose: 'Right of the back three. Defend as a three, attack as a five — same deal as the left.',
        attacking: [
          'Push high on your touchline whenever the ball is on your side.',
          'Overlap your midfielder. The outside run is almost never tracked in 7v7.',
          'If in doubt, put it in behind them and chase. It resets the game 40 metres higher.',
        ],
        defending: [
          'First priority is always getting back into the three.',
          'Do not dive in out wide. Delay, and let the shape reform behind you.',
          'Ball on the far side, tuck right in. You are the cover.',
        ],
        suits: 'Someone who will genuinely track back. The temptation here is to stay forward and admire your work.',
      },
      {
        id: 'LCM',
        name: 'Left centre midfielder',
        spot: [13, 30],
        purpose: 'One of two central midfielders. You share every job with your partner, which means talking constantly.',
        attacking: [
          'One goes, one stays. Agree it before kickoff, then agree it again every single attack.',
          'Run beyond the striker when he drops. That is this formation’s only real goal threat from midfield.',
          'Recycle it to the back three when nothing is on. They have time — there is no shame in it.',
        ],
        defending: [
          'Press in pairs. On your own you will simply get played around.',
          'Cover the space your wing-back vacated. That is the hole in this shape and it is yours.',
          'Never both press the same man. Ever.',
        ],
        suits: 'Someone who communicates. The pairing matters more than either individual does.',
      },
      {
        id: 'RCM',
        name: 'Right centre midfielder',
        spot: [27, 30],
        purpose: 'The other central midfielder. The middle is where this shape is strong — use it, do not vacate it.',
        attacking: [
          'Take it on the half turn between their lines. In this shape you will get time there.',
          'Look for the far wing-back constantly. He is free more often than you think.',
          'If your partner goes forward, you sit. No exceptions.',
        ],
        defending: [
          'Screen the pass into their striker. Between the two of you it should never arrive cleanly.',
          'Shuttle across as a pair and stay within about ten metres of each other.',
          'Second balls are yours. In a 3-2-1 there are a lot of them.',
        ],
        suits: 'The better passer of your two mids. This role gets time on the ball.',
      },
      {
        id: 'ST',
        name: 'Striker',
        spot: [20, 44],
        purpose: 'Alone against three defenders. The loneliest job in 7v7 and it needs a specific kind of player.',
        attacking: [
          'Hold it up. You are often the only outlet and you need to buy three seconds for runners.',
          'Play on the last shoulder when your wing-backs get forward — suddenly it is 3v2.',
          'Do not drop deep too often or there is nobody left to aim at.',
        ],
        defending: [
          'Press their back line alone but always with a curved run. Never chase straight.',
          'Once they go wide, cut off the switch. You cannot win it alone but you can make them slow.',
          'You set the trigger. When you press, everyone presses — agree that before kickoff.',
        ],
        suits: 'Strong and patient rather than quick. He gets few touches and must not sulk about it.',
      },
    ],
  },
  {
    id: '2-2-2',
    name: '2-2-2',
    nickname: 'The box',
    summary:
      'Two banks of two with two strikers. Direct, aggressive, and exhausting. It presses better than any other 7v7 shape because you have two forwards to squeeze their back line — and it leaks badly through the middle if your two midfielders ever stop running.',
    strengths: [
      'Two strikers means you can actually press their defenders',
      'Simple to explain — everybody has a partner',
      'Direct: you can play forward from anywhere on the pitch',
    ],
    weaknesses: [
      'The middle is thin and good teams will pass straight through it',
      'Enormous physical demand on the two midfielders',
      'Two defenders left very exposed whenever the mids do not get back',
    ],
    positions: [
      {
        id: 'GK',
        name: 'Goalkeeper',
        spot: [20, 4],
        purpose: 'Two strikers stretches the pitch, which also stretches the space behind your two defenders. You will be busy.',
        attacking: [
          'Go long more often here — you have two targets rather than one.',
          'Aim between their defenders so both your strikers can compete for it.',
          'Restart fast. Quick goal kicks are lethal in this shape.',
        ],
        defending: [
          'Start higher up than feels comfortable. There is a lot of grass behind two defenders.',
          'Sweep. Anything played over the top is yours to attack.',
          'Warn your defenders about the runner going blind-side. They cannot see him.',
        ],
        suits: 'Someone brave enough to leave his line. This shape punishes a keeper who stays home.',
      },
      {
        id: 'LCB',
        name: 'Left centre-back',
        spot: [13, 14],
        purpose: 'One of only two defenders with a narrow midfield in front of you. You will be exposed and you have to accept it.',
        attacking: [
          'Stay home. Defenders attacking in this shape is how you end up losing 6-4.',
          'Your menu on the ball is short: sideways to your partner, forward to a mid, or long to a striker.',
          'Push to halfway when we attack, and no further.',
        ],
        defending: [
          'Cover the wide space when their winger runs at you — your midfielder may not get back in time.',
          'You and your partner are never more than twelve metres apart.',
          'Delay rather than dive in. With no cover behind you, the tackle you do not make is usually right.',
        ],
        suits: 'Your most disciplined defender. Anyone who likes dribbling out from the back is wrong here.',
      },
      {
        id: 'RCB',
        name: 'Right centre-back',
        spot: [27, 14],
        purpose: 'The other of the two. Two defenders against two strikers is a fair fight only while you stay together.',
        attacking: [
          'Keep it simple and keep it moving. This shape wants the ball forward quickly.',
          'Do not follow the ball across the pitch. Hold your side.',
          'Step up to squeeze when we win it high — but only as a pair.',
        ],
        defending: [
          'Mark loosely man-to-man: you take one striker, your partner takes the other, and you both watch the ball.',
          'Do not let them split you. If both their strikers drift the same way, go as a pair.',
          'Say out loud which one you have, every single time the ball turns over.',
        ],
        suits: 'The quicker of your two defenders. There is a lot of ground to cover here.',
      },
      {
        id: 'LM',
        name: 'Left midfielder',
        spot: [12, 30],
        purpose: 'One of two players covering the entire middle of the pitch. The hardest running job in any 7v7 shape.',
        attacking: [
          'You are the link. Receive, turn, feed a striker — do not slow it down.',
          'Overlap whichever striker drifts wide. Two on one side beats one every time.',
          'Shoot. Midfielders get more time in a 2-2-2 than in any other shape.',
        ],
        defending: [
          'Get back level with your defenders when they attack. Every time.',
          'You and your partner cover side to side, not up and down. Never both in the middle.',
          'You cannot press with only two. Sit in and force them wide instead.',
        ],
        suits: 'The best engine in your team, no exceptions. If your fittest player is not in one of these two spots, change it.',
      },
      {
        id: 'RM',
        name: 'Right midfielder',
        spot: [28, 30],
        purpose: 'The other half of a two-man midfield. Everything depends on you two staying connected.',
        attacking: [
          'Support whichever striker receives it, immediately. They are outnumbered without you.',
          'Switch play early. This shape works when the ball moves side to side quickly.',
          'Arrive late in the box. Nobody ever tracks the second midfielder.',
        ],
        defending: [
          'Shuttle across with your partner and stay within about ten metres.',
          'Screen the middle. Make them go round you rather than through you.',
          'If your partner presses, you drop. Automatically, without being told.',
        ],
        suits: 'Someone who reads where his partner is going without needing a shout.',
      },
      {
        id: 'LST',
        name: 'Left striker',
        spot: [14, 45],
        purpose: 'One of two up front. The entire point of this shape is that two defenders cannot mark you both properly.',
        attacking: [
          'Split when your partner comes short. One deep, one high — never both at the same depth.',
          'Attack the far post whenever the ball goes to the opposite side.',
          'Run in behind early and often. Two defenders cannot both turn at once.',
        ],
        defending: [
          'Press their defenders as a pair — you take one, your partner takes the other.',
          'Once you start pressing, do not stop. A half-press with two strikers is worse than none.',
          'Drop to halfway when we are under real pressure. You are not excused.',
        ],
        suits: 'Your quickest player. This role is about running in behind far more than finishing.',
      },
      {
        id: 'RST',
        name: 'Right striker',
        spot: [26, 45],
        purpose: 'The other striker. Most of your job is defined by what your partner just did.',
        attacking: [
          'Opposite movement, always. He goes short, you go long. He goes left, you go right.',
          'Be the one who stays central when he drifts wide. Somebody has to be in the box.',
          'First-time layoffs. With two of you, quick combinations beat dribbling.',
        ],
        defending: [
          'Cut the pass between their two defenders so they can only go wide.',
          'Track their midfielder if he steps forward — nobody behind you can.',
          'Set the press together or not at all.',
        ],
        suits: 'A finisher. Between the two of you, one should run and one should score.',
      },
    ],
  },
];

export const formationById = (id: string): Formation | undefined => {
  const found = FORMATIONS.find((f) => f.id === id);
  return found;
};
