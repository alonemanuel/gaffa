/**
 * One decision round.
 *
 * The client sends the match state. The server builds a separate view for each
 * player and puts that player's questions to Jev, all in parallel. Nobody's
 * view includes anybody else's conclusions.
 *
 * Falls back to the mock model when there is no gateway token, so the game is
 * always playable. The response says which one answered.
 */

import { experimental_evaluate as evaluate } from 'ai';
import { mockDecide } from '@/lib/decide/mock';
import { offBallQuestions, onBallQuestions } from '@/lib/decide/questions';
import { JUDGMENT_LABEL } from '@/lib/types';
import type { CallTrace, DecideResponse, Intent, PlayerDecision, PlayerView } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'typesafe-ai/jev';

/** FORCE_MOCK=1 runs the whole game on the stand-in, so testing costs nothing. */
const hasGateway = (): boolean =>
  process.env.FORCE_MOCK !== '1' &&
  Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

/**
 * Concurrent calls sometimes come back 503, Service temporarily unavailable,
 * which is capacity on the model's side rather than anything about the request.
 * They fail fast, at about half a second, and a retry has always worked.
 *
 * The SDK's own retry waits two seconds before trying again, which turns a
 * round into a visible stall. So the SDK retry is off and this one runs
 * instead, waiting long enough to be polite and short enough to stay in budget.
 */
const RETRIES = Number(process.env.JEV_RETRIES ?? 2);
const RETRY_WAIT_MS = Number(process.env.JEV_RETRY_WAIT_MS ?? 160);

/** Spreading the round's calls out also reduces how often 503s happen at all. */
const STAGGER_MS = Number(process.env.JEV_STAGGER_MS ?? 90);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt) await sleep(RETRY_WAIT_MS * attempt);
    try {
      return await fn();
    } catch (err) {
      last = err;
    }
  }
  throw last;
};

interface Body {
  views: PlayerView[];
  carrierId: string | null;
}

/** The AI SDK wants plain JSON for `state`, and a PlayerView already is one. */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const asJson = (v: PlayerView): { [k: string]: Json } => v as unknown as { [k: string]: Json };

/** Ask one player his questions. Everything in the call sees only his view. */
const askOne = async (v: PlayerView, isCarrier: boolean) => {
  const questions = isCarrier
    ? { ...offBallQuestions(v), ...onBallQuestions(v) }
    : offBallQuestions(v);

  const started = Date.now();
  const result = await withRetry(() =>
    evaluate({
      model: MODEL,
      state: asJson(v),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      questions: questions as any,
      maxRetries: 0, // handled above, with a much shorter wait
      // Zero Data Retention needs a Pro plan, so it is opt-in via env.
      ...(process.env.GATEWAY_ZDR === '1'
        ? { providerOptions: { gateway: { zeroDataRetention: true } } }
        : {}),
    }),
  );
  const ms = Date.now() - started;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = result.answers as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conf = (result as any).providerMetadata?.typesafe?.confidence ?? {};

  const decision: PlayerDecision = {
    intent: a.intent.choice as Intent,
    probabilities: a.intent.probabilities ?? {},
    confidence: conf.intent ?? 0.5,
    keyJudgment: a.key?.probability ?? 0.5,
    keyJudgmentLabel: JUDGMENT_LABEL[v.role],
    danger: a.danger?.score ?? 1,
  };

  const onBall = isCarrier
    ? {
        passToShirt:
          a.pass_to.choice === 'hold' ? null : Number(String(a.pass_to.choice).replace('shirt_', '')),
        probabilities: a.pass_to.probabilities ?? {},
        confidence: conf.pass_to ?? 0.5,
        weight: a.weight?.score ?? 1,
      }
    : null;

  return { decision, onBall, ms };
};

export async function POST(request: Request): Promise<Response> {
  const { views, carrierId } = (await request.json()) as Body;

  if (!hasGateway()) {
    return Response.json(mockDecide(views, carrierId));
  }

  const started = Date.now();
  // One player's call failing should cost that player his turn, never the
  // whole round, so each is caught on its own and filled in from the stand-in.
  const standIn = mockDecide(views, carrierId);

  const results = await Promise.all(
    views.map(async (v, i) => {
      if (i) await sleep(i * STAGGER_MS);
      const t0 = Date.now();
      try {
        const r = await askOne(v, v.id === carrierId);
        return { ...r, trace: { id: v.id, ms: r.ms } as CallTrace };
      } catch (err) {
        return {
          decision: standIn.players[v.id],
          onBall: v.id === carrierId ? standIn.onBall : null,
          ms: Date.now() - t0,
          trace: {
            id: v.id,
            ms: Date.now() - t0,
            error: err instanceof Error ? err.message : String(err),
          } as CallTrace,
        };
      }
    }),
  );

  const players: DecideResponse['players'] = {};
  const calls: CallTrace[] = [];
  let onBall: DecideResponse['onBall'] = null;
  views.forEach((v, i) => {
    players[v.id] = results[i].decision;
    calls.push(results[i].trace);
    if (results[i].onBall) onBall = results[i].onBall;
  });

  const failed = calls.filter((c) => c.error);
  const total = Date.now() - started;
  // A round is only as fast as its slowest call, so print them all when one
  // drags. That is how a silent retry shows itself.
  if (total > 1200 || failed.length) {
    console.warn(
      `[decide] round ${total}ms:`,
      calls.map((c) => `${c.id}=${c.ms}ms${c.error ? ' FAILED' : ''}`).join(' '),
    );
  }

  return Response.json({
    source: failed.length === views.length ? 'mock' : 'jev',
    latencyMs: total,
    players,
    onBall,
    calls,
    error: failed[0]?.error,
  } satisfies DecideResponse);
}
