'use client';

/** Top-down canvas view. Portrait, so blue attacks up the screen. */

import { useEffect, useRef } from 'react';
import { PITCH } from '@/lib/pitch';
import type { MatchState, Player } from '@/lib/types';

interface Props {
  stateRef: React.RefObject<MatchState>;
  selectedId: string | null;
  showTargets: boolean;
  onSelect: (p: Player | null) => void;
}

const BLUE = '#0000ff';
const RED = '#ff0000';
const GRASS = '#0a6b3a';
const SURROUND = '#064024';
const LINES = 'rgba(255,255,255,0.78)';

export default function Pitch({ stateRef, selectedId, showTargets, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ s: 1, ox: 0, oy: 0, w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Mobile first: fill the width exactly and sit flush against the top.
      // The stage is sized to the pitch in CSS, so on a phone there is nothing
      // left over. On a screen too short for the full length, the height binds
      // instead and the pitch centres horizontally.
      const s = Math.min(w / PITCH.W, h / PITCH.L);
      viewRef.current = { s, ox: (w - PITCH.W * s) / 2, oy: 0, w, h };
    };

    const sx = (p: { x: number; y: number }) => viewRef.current.ox + p.y * viewRef.current.s;
    const sy = (p: { x: number; y: number }) =>
      viewRef.current.oy + (PITCH.L - p.x) * viewRef.current.s;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const s = stateRef.current;
      if (!s) return;
      const { s: sc, ox, oy, w: vw, h: vh } = viewRef.current;
      const W = PITCH.W * sc;
      const L = PITCH.L * sc;

      // Flat grass. The surround is a shade darker only so you can see where
      // the pitch ends on a screen that does not fill.
      ctx.fillStyle = SURROUND;
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = GRASS;
      ctx.fillRect(ox, oy, W, L);

      // Markings are painted about 25cm wide in real life. Scaling with the
      // pitch keeps them the same weight whatever the screen.
      ctx.strokeStyle = LINES;
      ctx.lineWidth = Math.max(2.5, 0.3 * sc);
      ctx.strokeRect(ox, oy, W, L);
      ctx.beginPath();
      ctx.moveTo(ox, oy + L / 2);
      ctx.lineTo(ox + W, oy + L / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ox + W / 2, oy + L / 2, 7 * sc, 0, Math.PI * 2);
      ctx.stroke();

      // 7v7 penalty areas: 20m across and 9m deep, rather than the full-size
      // box, which swallows a third of a pitch this short.
      const boxW = 20 * sc;
      const boxD = 9 * sc;
      ctx.strokeRect(ox + (W - boxW) / 2, oy, boxW, boxD);
      ctx.strokeRect(ox + (W - boxW) / 2, oy + L - boxD, boxW, boxD);

      // Goals, drawn heavier so each end reads at a glance.
      const goalW = 6 * sc;
      ctx.lineWidth = Math.max(4, 0.5 * sc);
      ctx.beginPath();
      ctx.moveTo(ox + (W - goalW) / 2, oy);
      ctx.lineTo(ox + (W + goalW) / 2, oy);
      ctx.moveTo(ox + (W - goalW) / 2, oy + L);
      ctx.lineTo(ox + (W + goalW) / 2, oy + L);
      ctx.stroke();

      // where everyone is running to
      if (showTargets) {
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        for (const p of s.players) {
          if (Math.hypot(p.targetX - p.x, p.targetY - p.y) < 0.8) continue;
          ctx.strokeStyle = p.team === 'blue' ? 'rgba(0,0,255,.6)' : 'rgba(255,0,0,.6)';
          ctx.beginPath();
          ctx.moveTo(sx(p), sy(p));
          ctx.lineTo(sx({ x: p.targetX, y: p.targetY }), sy({ x: p.targetX, y: p.targetY }));
          ctx.stroke();
        }
        ctx.restore();
      }

      // the intended pass
      if (s.ball.aim && s.ball.from) {
        const a = s.players.find((q) => q.id === s.ball.from);
        if (a) {
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = a.team === 'blue' ? 'rgba(0,0,255,.8)' : 'rgba(255,0,0,.8)';
          ctx.beginPath();
          ctx.moveTo(sx(s.ball), sy(s.ball));
          ctx.lineTo(sx(s.ball.aim), sy(s.ball.aim));
          ctx.stroke();
          ctx.restore();
        }
      }

      const r = Math.max(9, 1.35 * sc);
      for (const p of s.players) {
        const x = sx(p);
        const y = sy(p);
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 0.4) {
          ctx.strokeStyle = p.team === 'blue' ? 'rgba(0,0,255,.45)' : 'rgba(255,0,0,.45)';
          ctx.lineWidth = r * 0.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx({ x: p.x - p.vx * 0.22, y: p.y - p.vy * 0.22 }),
                     sy({ x: p.x - p.vx * 0.22, y: p.y - p.vy * 0.22 }));
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        if (p.id === selectedId) {
          ctx.beginPath();
          ctx.arc(x, y, r + 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        // No outline and no halo. The ball is drawn on top of whoever has it,
        // which is marker enough.
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = p.team === 'blue' ? BLUE : RED;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `600 ${Math.round(r * 1.05)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(p.shirt), x, y + 0.5);
      }

      const br = Math.max(4, 0.55 * sc);
      ctx.beginPath();
      ctx.arc(sx(s.ball), sy(s.ball), br, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.stroke();
    };

    const click = (e: MouseEvent) => {
      const s = stateRef.current;
      if (!s) return;
      const rect = canvas.getBoundingClientRect();
      const v = viewRef.current;
      const my = (e.clientX - rect.left - v.ox) / v.s;
      const mx = PITCH.L - (e.clientY - rect.top - v.oy) / v.s;
      let best: Player | null = null;
      let bd = Infinity;
      for (const p of s.players) {
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      onSelect(bd > 4.5 ? null : best);
    };

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('click', click);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', click);
    };
  }, [stateRef, selectedId, showTargets, onSelect]);

  return <canvas ref={canvasRef} className="pitch" />;
}
