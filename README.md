# Gaffa Moments

Chess-puzzle-style decision drills for 7v7 football. A frozen moment, a role
("you're the LCB", "now you're the LM"), a tap, a resolution, a verdict.

Score the decision, not the dice.

## How it works

Nothing is authored per scenario. The engine is a small stochastic possession
simulation graded by Monte Carlo rollouts:

- `src/sim/model.ts` — the only "opinion" in the system. Pass, dribble and
  clearance odds are computed from geometry: distance, lane openness (how close
  any defender is to the ball's path, widened for longer passes), pressure on
  passer and receiver. Terminal values: losing the ball costs more the closer to
  our goal it happens; keeping it rewards progress and calm; reaching the final
  third with room counts as a chance.
- `src/sim/policy.ts` — one tick (~1s) of movement for the twelve players not
  deciding. Defenders pick roles by utility: nearest presses, next covers the
  best forward option, the rest mark goal-side. Attackers sample nearby points
  and move where they are most receivable.
- `src/sim/step.ts` — resolves one action for the carrier, then advances a tick.
- `src/sim/rollout.ts` — for every option, roll the possession forward ~220
  times with a one-step-EV default policy and average the terminal value. That
  is the engine eval on the verdict card.
- `src/scenarios/buildup.ts` — seeds: a shape, a phase and a perturbation (how
  many join the press, who is marked). Same seed, same moment, so links share.

Every option is a button on the pitch. After you choose, the beat plays in slow
motion; a turnover keeps running so you watch their attack end in a goal, a save,
or a regain. A chance of yours ends in the shot.

Two views share every frame: a Canvas 2D top-down pitch (`src/render/pitch.ts`) and a
Three.js over-the-shoulder player view (`src/render/scene3d.ts`) with drag-to-look and
HUD buttons projected onto the players; options out of view pin to the edges.

The 2D renderer: top-down shirts with facing,
cover-shadow cones for pressers, lanes coloured by engine eval after you choose.

## Run

```bash
npm install
npm run dev
```

`#m/<seed>` in the URL reproduces a moment. "Daily" seeds from the date.

## Roadmap

1. Coach mode: instruct the front three (press with 2/3, trap the sideline,
   drop into a mid-block) as policy parameters for our sim agents, graded the
   same way.
2. More scenario families: switch of play, counter after regain, defending a
   2v1 in transition.
3. Calibration suite: sanity cases the model must pass (an unpressed 10m pass
   is >95%, a pass through a defender standing on the line is <10%).
4. Optional per-player attributes so you can load your actual squad.
5. Player view polish: rigged low-poly characters with run cycles, then a scan mechanic
   (turn your head during the prelude; the freeze shows only what you were looking at).
