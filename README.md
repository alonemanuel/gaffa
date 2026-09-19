# Gaffa

A 7v7 football simulation you can pause, step through one decision at a time, and
interrogate. Tap any player and it tells you exactly why he moved or passed where
he did, using the numbers the engine actually used.

The long-term goal is a phone game that teaches tactics: watch a match, change
shape and instructions while it runs, and see the consequence. This repo is the
engine being built up one rung at a time.

Open `index.html`. There is no build step and no dependencies.

## How it runs

Two loops at different rates.

```
every 0.2s    retarget()   role  ->  desired point  ->  smoothed target
every 1/120s  moveAll()    target -> velocity (capped) -> position
              moveBall()   roll under friction
```

A player holds an intent of the form "go to that point", and that intent is
recomputed five times a second. Between recomputes he just runs, under a speed
cap and an acceleration limit. The target itself is eased rather than snapped,
and anyone within 1.3m of his spot stands still, which is what keeps the movement
from looking frantic.

The pitch is continuous. Positions are metres in a 60 by 40 space, and there is
no grid.

## The decision stack

| Tier | Rate | What it decides |
|---|---|---|
| Coach | static for now | line, width, support band, how many press |
| Roles | 5 Hz | press, cover, support, receive, hold shape |
| Motor target | 5 Hz | a point on the pitch and a speed |
| Physics | 120 Hz | where everyone actually ends up |

The Brain button shows all four tiers live while the match runs, including which
roles changed on the last cycle.

## The policies, in full

Three rules drive everything. They are deliberately small and deliberately
visible, because the next step is replacing them with something learned and you
need a baseline to beat.

| Policy | The rule |
|---|---|
| Pass choice | `forward metres x 0.16 - range x 0.05`, minus 0.90 for returning it to the player who just gave it to you, then a softmax at temperature 0.45 |
| Support position | step off any opponent inside 7m at 0.42x, unstack from a team-mate inside 6m at 0.30x, hold a 9m to 22m band from the ball |
| Press | rank yourself by time to the ball, go if your rank is below the coach's number, stop 1.6m short |

Nobody is assigned to press. Each defender estimates his own time to the ball,
guesses the same for each team-mate from where he can see them standing, and
counts how many he thinks beat him there. Every player carries a personal bias in
how he rates others, so two of them can both believe they are quickest and both
go. There is no shared brain and no central allocator.

## Ball physics

The ball is a free body. It is struck with a velocity and rolls under friction:

```
dv/dt = -(0.90 + 0.0115 * v^2)
```

The constant term is the turf and the quadratic term is the air. Nothing animates
the ball along a path and nothing decides in advance when it arrives.

`solveKick` binary-searches the strike speed so a pass arrives still doing about
5 m/s. `interceptPoint` rolls the ball forward to find the earliest point a given
player can reach in time, which is how a receiver decides where to run. That same
function is what an interception will use.

## Controls

| Control | What it does |
|---|---|
| Pause | stops the clock |
| 1x | cycles 1x, 2x, 4x |
| Step | advances one unit while paused |
| Brain | opens the live decision stack |
| Reset | new seed |
| tap a player | pauses and explains his last decision |

Step size is set inside the Brain panel and can be one decision cycle (0.2s), one
physics tick (1/120s), or one ball event. The seed lives in the URL hash, so
`#12345` replays the same match.

## Where this is going

- **P0** fixed positions, players pass. Done.
- **P1** players move, ball has real physics. Done.
- **P2** dribbling.
- **P3** interceptions, and defenders who block passing lanes.
- **P4** shooting and goals.
- **P5** lofted passes.

Two things are missing that everything later depends on. There is no value
function, so nothing can yet say whether a decision was good, which is the gate
in front of both search and any learned policy. And the pass scorer contains no
reference to the opposing team at all, so a pass straight through a defender
scores the same as a pass into open grass.
