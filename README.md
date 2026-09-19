# Gaffa

A 7v7 football simulation you can pause and interrogate. Players move and pass.
Tap any player and it shows what he believes, the job he was given, what he
decided to do about it, and every alternative he weighed.

Decisions come from [Jev](https://docs.typesafe.ai), a System One model that
returns typed choices with probabilities instead of text. The simulation itself
contains no hand-written football logic: no pass-scoring formula, no positioning
weights, no tuned coefficients. What the code does is measure geometry and
execute whatever the model decided.

```bash
npm install
npm run dev
```

It runs immediately on a stand-in model, clearly labelled as such in the header.
See **Connecting Jev** below to switch to the real thing.

## What is in this build

Movement and passing, and nothing else. No dribbling, no interceptions, no
tackles, no shooting, no goals. That is deliberate. Each of those is a rung to
add once the decision layer is right.

## The model each player runs on

BDI, the standard agent architecture: belief, desire, intention. The inspector
shows all three, in that order, because each changes at a different rate.

| Layer | Changes | Example | Comes from |
|---|---|---|---|
| Belief | every tick | "I am 2.7m from a defender and could not receive" | measured, plus two judgments from the model |
| Task | per match | "cover the left of midfield and offer an outlet" | assigned at kickoff |
| Intent | every beat | "show for the ball" | chosen by the model |
| Motor target | every tick | "run to 31m, 14m at 4.0 m/s" | geometry |

## How it runs

Two loops.

```
120 Hz   physics   ball rolls under friction, players run toward their target
1 / 1.5s  beat     the carrier plus four others re-decide
```

Each beat builds **one view per player** and asks that player his own questions.
Nobody sees anybody else's view, which is what stops the team sharing a brain.
Two defenders can both conclude they should press, because each is reasoning
from where he personally stands.

While a round is in flight the clock slows to 0.35x rather than stalling, and
everyone carries on executing the intent they already hold. Real players commit
to a run rather than re-deciding every fifth of a second.

## The one design line

**Geometry is measured. Judgment is asked.**

"The nearest opponent is 2.1m away" is a measurement, so it lives in code.
"Am I free?" is a judgment, so it becomes a question. That split is what keeps
hand-tuned thresholds out, and it keeps each request small.

## The questions

All the football knowledge in this project is in `lib/decide/questions.ts`.
There are no coefficients anywhere. If the team plays badly, the fix is a better
written criterion.

Every player off the ball is asked three questions, evaluated in parallel:

| Question | Type | Returns |
|---|---|---|
| `key` | boolean | attacking, whether he could receive a pass. Defending, whether his man is a threat |
| `danger` | score | how much trouble his team is in, across three levels |
| `intent` | choice | one of five intents, with a probability for each |

The first one changes with the side of the ball. Asking a defender whether he
could receive a pass returns a number that means nothing, because his team does
not have the ball to give him.

The man on the ball is asked two more in the same call: who to pass to, over a
list of team-mates annotated with how tightly each is marked and how blocked the
lane to him is, and how far ahead of the receiver to aim.

**Confidence gates the switch.** Jev reports how concentrated a distribution is,
separately from the winning probability. When confidence is below 25% the player
keeps the intent he already had, and the inspector says so. That removes the
jitter you would otherwise get from re-deciding every second.

## Latency and the 503s

A round of five concurrent calls lands in roughly 500 to 800ms. Jev itself
answers a single call in about 300 to 450ms.

Under concurrency the gateway intermittently returns **503, Service temporarily
unavailable**, which is capacity on the model's side rather than a rate limit or
anything about the request. Those failures come back fast, at about half a
second, and a retry has always worked. Three things handle it:

- The round's calls are staggered 90ms apart, which makes a 503 much rarer.
- The SDK's own retry is off, because it waits two seconds before trying again
  and that turns one bad call into a visible stall. `withRetry` in the route
  waits 160ms, then 320ms, instead.
- Each call is caught on its own, so a player who cannot be reached falls back
  to the stand-in for that beat while everybody else gets a real answer.

Worst case for a round is now around 1.2s rather than 2.8s. Every knob here is
an environment variable: `JEV_RETRIES`, `JEV_RETRY_WAIT_MS`, `JEV_STAGGER_MS`.

## Connecting Jev

Access is through Vercel AI Gateway, so there is no TypeSafe API key to manage.

```bash
npm i -g vercel
vercel login
vercel link
vercel env pull
```

That writes a `VERCEL_OIDC_TOKEN` to your environment file, which the AI SDK
uses to route `typesafe-ai/jev` through the gateway. The token lasts 12 hours
locally, so re-run `vercel env pull` when a request starts returning 401.
Deployments get one automatically.

Jev also needs purchased credits rather than just a card on file, and Zero Data
Retention is a Pro-plan feature, so it stays off unless you set `GATEWAY_ZDR=1`.

With no token present, `/api/decide` falls back to the stand-in model in
`lib/decide/mock.ts` and says so in the response. That model is crude on
purpose. It exists so the plumbing runs without auth, and it is labelled `mock`
everywhere so it is never mistaken for a real answer.

To work on the game without spending anything, run the mock-only server:

```bash
npm run dev:mock     # port 5181, never calls Jev
```

Cost, for reference: a carrier's call is about 1,600 input tokens and an
off-ball call rather less. Five calls a beat at a beat every 1.5 seconds puts a
five-minute match at roughly four to six cents, with output tokens unmetered.

## Who decides on each beat

Not everybody. The man on the ball always decides, because his choice is the one
that moves the game. The others take turns four at a time, so each re-decides
about every third beat. That is a tenth of the traffic of asking everyone every
beat, and it is closer to how a team behaves, since players do not all
reconsider in lockstep.

## Layout

```
app/page.tsx            the match loop and the chrome
app/api/decide/route.ts one decision round, staggered parallel calls
components/Pitch.tsx    canvas, portrait, blue attacks up
components/Inspector.tsx belief, task, intent, alternatives
lib/types.ts            the vocabulary every layer shares
lib/pitch.ts            geometry and ball physics
lib/view.ts             match state to one view per player
lib/decide/questions.ts every football judgment in the project
lib/decide/mock.ts      the stand-in
lib/sim/engine.ts       the two loops
lib/sim/motor.ts        intent to a point on the grass
scripts/smoke.mjs       one call, one question, cheapest possible check
scripts/probe.mjs       one frozen position where the right answer is known
scripts/latency.mjs     eight sequential calls, timed
scripts/burst.mjs       five concurrent calls, to reproduce the 503s
legacy/standalone.html  the earlier single-file prototype
```

## Ball physics

The ball is a free body struck with a velocity and rolling under friction:

```
dv/dt = -(0.90 + 0.0115 * v^2)
```

The constant term is the turf, the quadratic is the air. `solveKick` binary
searches the strike speed so a pass arrives still doing about 5 m/s.
`interceptPoint` rolls the ball forward to find the earliest point a player can
reach in time, which is how a receiver decides where to run. The same function
will become the interception check.

## Does Jev understand a pitch

Yes. `scripts/probe.mjs` freezes a position where the football answer is
unambiguous: the carrier is pressed, one forward is high and free with a clear
lane, everything else is square or backwards. Jev picks the forward at 80%.

The telling part is the two square options. Both sit the same distance away on
opposite flanks, differing only in that one has an opponent 1.1m off the passing
lane and the other 2.4m. Jev gave the first **0.0%** and the second 5%. Nobody
wrote a lane-blocking rule. It read the number and understood what it meant.

## Next

- Dribbling, then interceptions, then shooting.
- A coach tier above the intents, written by an LLM once a minute, which is the
  layer a player would actually give instructions to.
