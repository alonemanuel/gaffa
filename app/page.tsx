'use client';

/**
 * The match loop.
 *
 * Physics runs at 120Hz in a ref, outside React, because re-rendering 14
 * players sixty times a second would be absurd. React only owns the chrome:
 * the clock, the buttons and the inspector.
 *
 * A beat fires about once a second. While a decision round is in flight the
 * clock slows rather than stalling, and everyone carries on executing the
 * intent they already had. Real players commit to a run too.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Inspector from '@/components/Inspector';
import PitchView from '@/components/Pitch';
import {
  BEAT,
  TICK,
  applyDecision,
  canPassNow,
  carrierOf,
  newMatch,
  refreshBeliefs,
  startPass,
  tick,
} from '@/lib/sim/engine';
import { buildView, decidingPlayers } from '@/lib/view';
import type { DecideResponse, MatchState, Player } from '@/lib/types';

interface LogLine {
  at: number;
  text: string;
}

export default function Page() {
  const stateRef = useRef<MatchState>(newMatch());
  const inFlight = useRef(false);
  const lastBeat = useRef(-99);

  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showTargets, setShowTargets] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Player | null>(null);
  const [hud, setHud] = useState({ clock: 0, passes: 0, beat: 0 });
  const [source, setSource] = useState<'jev' | 'mock' | 'none'>('none');
  const [latency, setLatency] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);

  const push = useCallback((at: number, text: string) => {
    setLog((l) => [{ at, text }, ...l].slice(0, 3));
  }, []);

  /** One decision round for every player whose intent is open. */
  const runBeat = useCallback(async () => {
    const s = stateRef.current;
    if (inFlight.current) return;
    inFlight.current = true;
    setThinking(true);
    refreshBeliefs(s);

    const carrier = carrierOf(s);
    const carrierId = s.ball.holder;
    const who = decidingPlayers(s);
    const views = who.map((p) => buildView(s, p));

    try {
      const r = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ views, carrierId }),
      });
      const res = (await r.json()) as DecideResponse;

      applyDecision(s, res);
      setSource(res.source);
      setLatency(res.latencyMs);
      setErr(res.error ?? null);
      s.beat += 1;

      // Play the pass the man on the ball asked for.
      if (res.onBall && carrier && canPassNow(s) && s.ball.holder === carrierId) {
        if (res.onBall.passToShirt !== null) {
          const to = s.players.find(
            (p) => p.team === carrier.team && p.shirt === res.onBall!.passToShirt,
          );
          if (to) startPass(s, carrier, to, res.onBall.weight);
        } else {
          push(s.clock, `${carrier.team} #${carrier.shirt} holds it, nobody is on`);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setThinking(false);
    }
  }, [push]);

  /* --- the loop ---------------------------------------------------------- */
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let acc = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;

      const s = stateRef.current;

      if (running) {
        // Slow down rather than stall while a round is in flight.
        acc += dt * speed * (inFlight.current ? 0.35 : 1);
        let guard = 0;
        while (acc >= TICK && guard++ < 600) {
          const ev = tick(s, TICK);
          acc -= TICK;
          if (ev) push(ev.at, ev.text);
        }
        if (s.clock - lastBeat.current >= BEAT && !inFlight.current) {
          lastBeat.current = s.clock;
          void runBeat();
        }
      }

      setHud({ clock: s.clock, passes: s.passes, beat: s.beat });
      if (selectedId) {
        const p = s.players.find((q) => q.id === selectedId);
        if (p) setSelected({ ...p, belief: { ...p.belief }, intentProbs: { ...p.intentProbs } });
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, selectedId, runBeat, push]);

  /** Advance exactly one decision round while paused. */
  const stepBeat = useCallback(() => {
    setRunning(false);
    const s = stateRef.current;
    const until = s.clock + BEAT;
    while (s.clock < until) {
      const ev = tick(s, TICK);
      if (ev) push(ev.at, ev.text);
    }
    lastBeat.current = s.clock;
    void runBeat();
  }, [runBeat, push]);

  const onSelect = useCallback((p: Player | null) => {
    setSelectedId(p?.id ?? null);
    setSelected(p);
    if (p) setRunning(false);
  }, []);

  const mmss = `${Math.floor(hud.clock / 60)}:${String(Math.floor(hud.clock % 60)).padStart(2, '0')}`;

  return (
    <main className="wrap">
      <header className="hud">
        <span className="clock">{mmss}</span>
        <span className="meta">
          {hud.passes} {hud.passes === 1 ? 'pass' : 'passes'} &middot; beat {hud.beat}
        </span>
        <span className={`badge ${source}`}>
          {thinking ? 'deciding' : source === 'none' ? 'idle' : source}
          {latency > 0 && source === 'jev' && ` ${latency}ms`}
        </span>
      </header>

      {source === 'mock' && (
        <p className="warn">
          Running on the stand-in model. Connect the AI Gateway to let Jev decide.
          {err && <> Last error: {err}</>}
        </p>
      )}

      <div className="stage">
        <PitchView
          stateRef={stateRef}
          selectedId={selectedId}
          showTargets={showTargets}
          onSelect={onSelect}
        />
      </div>

      <div className="log">
        {log.map((l, i) => (
          <div key={`${l.at}-${i}`}>
            {Math.floor(l.at / 60)}:{String(Math.floor(l.at % 60)).padStart(2, '0')} {l.text}
          </div>
        ))}
      </div>

      <nav className="bar">
        <button onClick={() => setRunning((r) => !r)} className={running ? '' : 'on'}>
          {running ? 'Pause' : 'Play'}
        </button>
        <button onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 0.5 : 1))}>
          {speed}&times;
        </button>
        <button onClick={stepBeat}>Step</button>
        <button onClick={() => setShowTargets((v) => !v)} className={showTargets ? 'on' : ''}>
          Runs
        </button>
        <button
          onClick={() => {
            stateRef.current = newMatch();
            lastBeat.current = -99;
            setLog([]);
            setSelectedId(null);
            setSelected(null);
          }}
        >
          Reset
        </button>
      </nav>

      <Inspector player={selected} onClose={() => onSelect(null)} />
    </main>
  );
}
