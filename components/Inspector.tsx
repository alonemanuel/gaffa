'use client';

/**
 * The bottom panel. Empty until a player is tapped, then it holds everything
 * that applies to him: what he believes, the job he was given, what he decided
 * to do about it, every alternative he weighed, and how that becomes movement.
 *
 * Every number here is the one the engine actually acted on.
 */

import { INTENT_TEXT } from '@/lib/types';
import type { Intent, Player } from '@/lib/types';

interface Props {
  player: Player | null;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const label = (k: string) => k.replace(/_/g, ' ');
const DANGER = ['comfortable', 'under some pressure', 'about to lose it'];

export default function Inspector({ player }: Props) {
  if (!player) {
    return (
      <div className="empty">
        <p>Tap a player to read his mind.</p>
        <p className="hint">
          Tap the grass to play or pause, the right edge to step one round.
        </p>
      </div>
    );
  }

  const p = player;
  const rows = Object.entries(p.intentProbs).sort((a, b) => b[1] - a[1]);

  return (
    <div className="panel">
      <h2>
        <span className={`dot ${p.team}`} /> {p.team} #{p.shirt}
        <span className="src">
          {p.intentSource}
          {p.intentConfidence > 0 && ` · ${pct(p.intentConfidence)} sure`}
        </span>
      </h2>

      <div className="tier">Belief, what he thinks is true</div>
      <dl className="kv">
        <div>
          <dt>Ball</dt>
          <dd>
            {p.belief.distToBallM.toFixed(1)}m, about {p.belief.timeToBallS.toFixed(1)}s for him
          </dd>
        </div>
        <div>
          <dt>Nearest opponent</dt>
          <dd>{p.belief.nearestOpponentM.toFixed(1)}m</dd>
        </div>
        <div>
          <dt>{p.belief.keyJudgmentLabel}</dt>
          <dd>{pct(p.belief.keyJudgment)} likely</dd>
        </div>
        <div>
          <dt>Reads the situation as</dt>
          <dd>{DANGER[Math.round(p.belief.danger)] ?? DANGER[1]}</dd>
        </div>
      </dl>

      <div className="tier">Task, the job he was given</div>
      <p className="body">He is there to {p.task}.</p>

      <div className="tier">Intent, what he is doing about it</div>
      <p className="body">
        <strong>{label(p.intent)}.</strong> {INTENT_TEXT[p.intent as Intent]}
      </p>
      {p.intentNote && <p className="note">{p.intentNote}</p>}

      {rows.length > 0 && (
        <>
          <div className="tier">Everything he could have done</div>
          <table>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className={k === p.intent ? 'pick' : ''}>
                  <td>{label(k)}</td>
                  <td className="bar">
                    <i style={{ width: `${Math.max(2, v * 100)}%` }} />
                  </td>
                  <td className="num">{pct(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="tier">Motor, how the intent becomes movement</div>
      <dl className="kv">
        <div>
          <dt>Running to</dt>
          <dd>
            {p.targetX.toFixed(0)}m, {p.targetY.toFixed(0)}m
          </dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>
            {Math.hypot(p.vx, p.vy).toFixed(1)} of {p.pace.toFixed(1)} m/s
          </dd>
        </div>
      </dl>
    </div>
  );
}
