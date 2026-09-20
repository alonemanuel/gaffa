'use client';

/**
 * The match loop and the shell around it.
 *
 * Physics runs at 120Hz in a ref, outside React, because re-rendering 14
 * players sixty times a second would be absurd. React owns only the chrome.
 *
 * A beat fires every 1.5s. While a decision round is in flight the clock slows
 * rather than stalling, and everyone carries on executing the intent they
 * already had. Real players commit to a run too.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PauseIcon, PlayIcon, ResetIcon } from '@/components/Icons';
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
import { PITCH } from '@/lib/pitch';
import { buildView, decidingPlayers } from '@/lib/view';
import type { DecideResponse, MatchState, Player } from '@/lib/types';

/** Taps on the edge this close together count as one burst. */
const BURST_MS = 800;

/** How much of the window the pitch may take, as the grip is dragged. */
const MIN_PITCH = 0.3;
const MAX_PITCH = 0.98;
/** Within this much of the natural height, the grip snaps to it. */
const SNAP = 0.03;

export default function Page() {
  const stateRef = useRef<MatchState>(newMatch());
  const inFlight = useRef(false);
  const lastBeat = useRef(-99);
  const wrapRef = useRef<HTMLElement>(null);

  const [running, setRunning] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Player | null>(null);
  const [hud, setHud] = useState({ clock: 0, passes: 0, beat: 0 });
  const [source, setSource] = useState<'jev' | 'mock' | 'none'>('none');
  const [latency, setLatency] = useState(0);
  const [thinking, setThinking] = useState(false);
  /**
   * Pitch height as a fraction of the window. Null means the natural height,
   * where the pitch fills the width exactly and there is no black either side.
   * That is where it opens, and the grip snaps back to it.
   */
  const [split, setSplit] = useState<number | null>(null);
  const [natural, setNatural] = useState(0.68);
  /** Edge flash after a step, and the running count of a fast burst of taps. */
  const [edge, setEdge] = useState<{ key: number; n: number } | null>(null);
  const burst = useRef({ n: 0, at: 0 });
  /** Centre flash after a play or pause tap. */
  const [mid, setMid] = useState<{ key: number; playing: boolean } | null>(null);

  /** One decision round for every player whose intent is open. */
  const runBeat = useCallback(async () => {
    const s = stateRef.current;
    if (inFlight.current) return;
    inFlight.current = true;
    setThinking(true);
    refreshBeliefs(s);

    const carrier = carrierOf(s);
    const carrierId = s.ball.holder;
    const views = decidingPlayers(s).map((p) => buildView(s, p));

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
      s.beat += 1;

      if (res.onBall && carrier && canPassNow(s) && s.ball.holder === carrierId) {
        if (res.onBall.passToShirt !== null) {
          const to = s.players.find(
            (p) => p.team === carrier.team && p.shirt === res.onBall!.passToShirt,
          );
          if (to) startPass(s, carrier, to, res.onBall.weight);
        }
      }
    } catch {
      // A failed round leaves everyone on the intent they already had.
    } finally {
      inFlight.current = false;
      setThinking(false);
    }
  }, []);

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
        acc += dt * (inFlight.current ? 0.35 : 1);
        let guard = 0;
        while (acc >= TICK && guard++ < 600) {
          tick(s, TICK);
          acc -= TICK;
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
  }, [running, selectedId, runBeat]);

  /* --- controls ---------------------------------------------------------- */
  const stepBeat = useCallback(() => {
    // Taps inside the window add up, so a quick double tap reads "2 beats"
    // rather than flashing "1 beat" twice.
    const now = Date.now();
    const n = now - burst.current.at < BURST_MS ? burst.current.n + 1 : 1;
    burst.current = { n, at: now };
    setEdge({ key: now, n });
    setRunning(false);
    const s = stateRef.current;
    const until = s.clock + BEAT;
    while (s.clock < until) tick(s, TICK);
    lastBeat.current = s.clock;
    void runBeat();
  }, [runBeat]);

  const onSelect = useCallback((p: Player | null) => {
    setSelectedId(p?.id ?? null);
    setSelected(p);
  }, []);

  const reset = useCallback(() => {
    stateRef.current = newMatch();
    lastBeat.current = -99;
    setSelectedId(null);
    setSelected(null);
    setRunning(true);
  }, []);

  /* --- the natural height, where the pitch fills the width exactly -------- */
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el || !el.clientHeight) return;
      const want = (el.clientWidth * (PITCH.L / PITCH.W)) / el.clientHeight;
      setNatural(Math.min(MAX_PITCH, Math.max(MIN_PITCH, want)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /* --- the drag between pitch and panel ---------------------------------- */
  const onGrip = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const h = wrapRef.current?.clientHeight ?? window.innerHeight;
      const next = Math.min(MAX_PITCH, Math.max(MIN_PITCH, ev.clientY / h));
      setSplit(Math.abs(next - natural) < SNAP ? null : next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [natural]);

  const mmss = `${Math.floor(hud.clock / 60)}:${String(Math.floor(hud.clock % 60)).padStart(2, '0')}`;

  return (
    <main className="wrap" ref={wrapRef}>
      <div className="stage" style={{ height: `${(split ?? natural) * 100}%` }}>
        <PitchView
          stateRef={stateRef}
          selectedId={selectedId}
          running={running}
          onSelect={onSelect}
          onTogglePlay={() => {
            setMid({ key: Date.now(), playing: !running });
            setRunning(!running);
          }}
          onStep={stepBeat}
        />
        {edge && (
          <div className="pulse" key={edge.key} aria-hidden="true">
            <span>&raquo;</span>
            <em>
              {edge.n} {edge.n === 1 ? 'beat' : 'beats'}
            </em>
          </div>
        )}
        {mid && (
          <div className="midflash" key={mid.key} aria-hidden="true">
            {mid.playing ? <PlayIcon /> : <PauseIcon />}
          </div>
        )}
        <div className="overlay">
          <span className={`timer${running ? '' : ' stopped'}`}>{mmss}</span>
          <button className="reset" onClick={reset} aria-label="Start over" title="Start over">
            <ResetIcon />
          </button>
        </div>
      </div>

      <div className="grip" onPointerDown={onGrip} role="separator" aria-label="Resize the panel">
        <i />
      </div>

      <section className="info">
        <header className="hud">
          <span className="meta">
            {hud.passes} {hud.passes === 1 ? 'pass' : 'passes'} &middot; beat {hud.beat}
          </span>
          <span className={`badge ${source}`}>
            {thinking ? 'deciding' : source === 'none' ? 'idle' : source}
            {latency > 0 && source === 'jev' && ` ${latency}ms`}
          </span>
        </header>
        <div className="scroll">
          <Inspector player={selected} />
        </div>
      </section>
    </main>
  );
}
