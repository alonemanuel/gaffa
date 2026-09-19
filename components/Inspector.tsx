'use client';

/**
 * Pause and read a player's mind.
 *
 * Belief, task and intent, in that order, plus the full probability
 * distribution the decision model returned. Every number here is the one the
 * engine actually acted on.
 */

import { INTENT_TEXT } from '@/lib/types';
import type { Intent, Player } from '@/lib/types';

interface Props {
  player: Player | null;
  onClose: () => void;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const label = (k: string) => k.replace(/_/g, ' ');

const DANGER = ['comfortable', 'under some pressure', 'about to lose it'];

export default function Inspector({ player, onClose }: Props) {
  if (!player) return null;
  const p = player;
  const rows = Object.entries(p.intentProbs).sort((a, b) => b[1] - a[1]);

  return (
    <aside className="sheet" role="dialog" aria-label={`${p.team} number ${p.shirt}`}>
      <button className="sheet-close" onClick={onClose} aria-label="Close">
        &times;
      </button>

      <h2>
        <span className={`dot ${p.team}`} /> {p.team} #{p.shirt}
      </h2>
      <p className="sub">
        Decided by <strong>{p.intentSource}</strong>
        {p.intentConfidence > 0 && ` at ${pct(p.intentConfidence)} confidence`}
      </p>

      <div className="tier">Belief, what he thinks is true</div>
      <dl className="kv">
        <div>
          <dt>Ball</dt>
          <dd>
            {p.belief.distToBallM.toFixed(1)}m away, about{' '}
            {p.belief.timeToBallS.toFixed(1)}s for him
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
    </aside>
  );
}
