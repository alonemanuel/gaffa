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

const BLUE = '#4b9cf5';
const RED = '#f2564c';

export default function Pitch({ stateRef, selectedId, showTargets, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ s: 1, ox: 0, oy: 0 });

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
      const pad = 8;
      const s = Math.min((w - pad * 2) / PITCH.W, (h - pad * 2) / PITCH.L);
      viewRef.current = { s, ox: (w - PITCH.W * s) / 2, oy: (h - PITCH.L * s) / 2 };
    };

    const sx = (p: { x: number; y: number }) => viewRef.current.ox + p.y * viewRef.current.s;
    const sy = (p: { x: number; y: number }) =>
      viewRef.current.oy + (PITCH.L - p.x) * viewRef.current.s;

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const s = stateRef.current;
      if (!s) return;
      const { s: sc, ox, oy } = viewRef.current;
      const W = PITCH.W * sc;
      const L = PITCH.L * sc;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      roundRect(ox, oy, W, L, 6);
      ctx.clip();
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#1e7540' : '#1b6b3a';
        ctx.fillRect(ox, oy + (L / 10) * i, W, L / 10 + 1);
      }
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      roundRect(ox, oy, W, L, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox, oy + L / 2);
      ctx.lineTo(ox + W, oy + L / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ox + W / 2, oy + L / 2, 7 * sc, 0, Math.PI * 2);
      ctx.stroke();
      const boxW = 24 * sc;
      const boxD = 13 * sc;
      ctx.strokeRect(ox + (W - boxW) / 2, oy, boxW, boxD);
      ctx.strokeRect(ox + (W - boxW) / 2, oy + L - boxD, boxW, boxD);

      // where everyone is running to
      if (showTargets) {
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        for (const p of s.players) {
          if (Math.hypot(p.targetX - p.x, p.targetY - p.y) < 0.8) continue;
          ctx.strokeStyle = p.team === 'blue' ? 'rgba(75,156,245,.55)' : 'rgba(242,86,76,.55)';
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
          ctx.strokeStyle = a.team === 'blue' ? 'rgba(75,156,245,.75)' : 'rgba(242,86,76,.75)';
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
          ctx.strokeStyle = p.team === 'blue' ? 'rgba(75,156,245,.4)' : 'rgba(242,86,76,.4)';
          ctx.lineWidth = r * 0.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx({ x: p.x - p.vx * 0.22, y: p.y - p.vy * 0.22 }),
                     sy({ x: p.x - p.vx * 0.22, y: p.y - p.vy * 0.22 }));
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        if (s.ball.holder === p.id) {
          ctx.beginPath();
          ctx.arc(x, y, r + 5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,.18)';
          ctx.fill();
        }
        if (p.id === selectedId) {
          ctx.beginPath();
          ctx.arc(x, y, r + 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = p.team === 'blue' ? BLUE : RED;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = s.ball.holder === p.id ? '#fff' : 'rgba(0,0,0,.35)';
        ctx.stroke();
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
