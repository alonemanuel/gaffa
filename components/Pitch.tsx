'use client';

/**
 * Top-down canvas view. Portrait, so blue attacks up the screen.
 *
 * The pitch is also the control surface. There are no buttons on it beyond
 * reset:
 *   tap a player      select him, or tap him again to let go
 *   tap the right edge  advance one decision round
 *   tap anywhere else   play or pause
 */

import { useEffect, useRef } from 'react';
import { PITCH } from '@/lib/pitch';
import type { MatchState, Player } from '@/lib/types';

interface Props {
  stateRef: React.RefObject<MatchState>;
  selectedId: string | null;
  running: boolean;
  onSelect: (p: Player | null) => void;
  onTogglePlay: () => void;
  onStep: () => void;
}

const BLUE = '#0000ff';
const RED = '#ff0000';
/* Sampled off an aerial photograph of a real pitch: a rich mid-green that is
 * brighter where the light falls and drops away toward the corners. */
/** Metres from the goal line to the penalty spot, and the radius of the D. */
const PEN_SPOT = 6;
const ARC_R = 7;

const GRASS_LIT = '#3f8038';
const GRASS_MID = '#2f6b2d';
const GRASS_EDGE = '#1d4f22';
// Black, so the letterbox beside a narrow pitch reads as the page rather
// than as a border drawn around the grass.
const SURROUND = '#000000';
const LINES = 'rgba(255,255,255,0.78)';



/* --- a ball that actually rolls -------------------------------------------
 * The ball is treated as a real sphere carrying the twelve dark panels of a
 * football, at the vertices of an icosahedron. Each frame it is rotated by the
 * distance it has travelled, about the axis a rolling ball turns on.
 *
 * Each panel is a real pentagon, built in the tangent plane at its centre and
 * projected straight down, so it foreshortens on its own as it turns toward
 * the rim. A vertex that has gone over the horizon is pinned to the silhouette
 * rather than folding back across the face.
 *
 * Rolling without slipping puts the angular velocity at (-vy, vx, 0) / r.
 */
const PHI = (1 + Math.sqrt(5)) / 2;
const PANELS: Array<[number, number, number]> = (() => {
  const raw: Array<[number, number, number]> = [];
  for (const a of [1, -1])
    for (const b of [PHI, -PHI]) {
      raw.push([0, a, b]);
      raw.push([a, b, 0]);
      raw.push([b, 0, a]);
    }
  const n = Math.hypot(1, PHI);
  return raw.map(([x, y, z]) => [x / n, y / n, z / n] as [number, number, number]);
})();

/** How wide one panel is on the ball, as an angle from its centre. */
const PANEL_R = 0.38;
/** How far along each edge a corner is rounded off, as a fraction of it. */
const CORNER = 0.26;

type Mat3 = number[];
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Rodrigues: a rotation of `a` radians about the unit axis (x, y, z). */
const axisAngle = (x: number, y: number, z: number, a: number): Mat3 => {
  const c = Math.cos(a);
  const si = Math.sin(a);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y - si * z, t * x * z + si * y,
    t * x * y + si * z, t * y * y + c, t * y * z - si * x,
    t * x * z - si * y, t * y * z + si * x, t * z * z + c,
  ];
};

const mul = (a: Mat3, b: Mat3): Mat3 => {
  const o = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};

/** The right-hand strip of the pitch steps one round instead of pausing. */
const STEP_ZONE = 0.22;

export default function Pitch({
  stateRef,
  selectedId,
  running,
  onSelect,
  onTogglePlay,
  onStep,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ s: 1, ox: 0, oy: 0, w: 0, h: 0 });
  /** The ball's orientation, and where it was last frame. */
  const spin = useRef<Mat3>(IDENTITY);
  const wasAt = useRef<{ x: number; y: number } | null>(null);

  // Handlers live in refs so the draw loop never has to be torn down and
  // rebuilt when a parent re-renders.
  const cb = useRef({ selectedId, running, onSelect, onTogglePlay, onStep });
  cb.current = { selectedId, running, onSelect, onTogglePlay, onStep };

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
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = Math.min(w / PITCH.W, h / PITCH.L);
      viewRef.current = { s, ox: (w - PITCH.W * s) / 2, oy: (h - PITCH.L * s) / 2, w, h };
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
      const { selectedId: sel } = cb.current;

      ctx.fillStyle = SURROUND;
      ctx.fillRect(0, 0, vw, vh);
      // Light falling across the pitch, then a vignette pulling the corners
      // down. Together they stop it reading as a flat green rectangle.
      const turf = ctx.createRadialGradient(
        ox + W * 0.44, oy + L * 0.36, Math.min(W, L) * 0.1,
        ox + W * 0.5, oy + L * 0.5, Math.max(W, L) * 0.8,
      );
      turf.addColorStop(0, GRASS_LIT);
      turf.addColorStop(0.5, GRASS_MID);
      turf.addColorStop(1, GRASS_EDGE);
      ctx.fillStyle = turf;
      ctx.fillRect(ox, oy, W, L);

      const vignette = ctx.createRadialGradient(
        ox + W * 0.5, oy + L * 0.5, Math.min(W, L) * 0.34,
        ox + W * 0.5, oy + L * 0.5, Math.max(W, L) * 0.74,
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = vignette;
      ctx.fillRect(ox, oy, W, L);

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

      const boxW = 20 * sc;
      const boxD = 9 * sc;
      ctx.strokeRect(ox + (W - boxW) / 2, oy, boxW, boxD);
      ctx.strokeRect(ox + (W - boxW) / 2, oy + L - boxD, boxW, boxD);

      // Penalty spots, and the arc of each D where it reaches outside the box.
      // The arc starts where it clears the box edge, which is what sets the
      // angle: the spot is PEN_SPOT from the goal line and the box is boxD.
      const half = Math.acos(Math.min(1, (9 - PEN_SPOT) / ARC_R));
      const spotAt = (xm: number) => ({ x: ox + 20 * sc, y: oy + (PITCH.L - xm) * sc });

      for (const [xm, aim] of [
        [PEN_SPOT, 0],
        [PITCH.L - PEN_SPOT, Math.PI],
      ] as const) {
        const c = spotAt(xm);
        ctx.beginPath();
        // Pitch angles map to screen angles by a quarter turn, because pitch x
        // runs up the screen.
        ctx.arc(c.x, c.y, ARC_R * sc, aim - half - Math.PI / 2, aim + half - Math.PI / 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(1.6, 0.3 * sc), 0, Math.PI * 2);
        ctx.fillStyle = LINES;
        ctx.fill();
      }

      // The centre spot.
      ctx.beginPath();
      ctx.arc(ox + W / 2, oy + L / 2, Math.max(1.8, 0.34 * sc), 0, Math.PI * 2);
      ctx.fillStyle = LINES;
      ctx.fill();

      const goalW = 6 * sc;
      ctx.lineWidth = Math.max(4, 0.5 * sc);
      ctx.beginPath();
      ctx.moveTo(ox + (W - goalW) / 2, oy);
      ctx.lineTo(ox + (W + goalW) / 2, oy);
      ctx.moveTo(ox + (W - goalW) / 2, oy + L);
      ctx.lineTo(ox + (W + goalW) / 2, oy + L);
      ctx.stroke();

      // Where the selected player is running to. Only his, so the pitch stays
      // readable and the line means something.
      const chosen = sel ? s.players.find((q) => q.id === sel) : null;
      if (chosen && Math.hypot(chosen.targetX - chosen.x, chosen.targetY - chosen.y) > 0.8) {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(sx(chosen), sy(chosen));
        ctx.lineTo(
          sx({ x: chosen.targetX, y: chosen.targetY }),
          sy({ x: chosen.targetX, y: chosen.targetY }),
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(
          sx({ x: chosen.targetX, y: chosen.targetY }),
          sy({ x: chosen.targetX, y: chosen.targetY }),
          3,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
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
        if (p.id === sel) {
          ctx.beginPath();
          ctx.arc(x, y, r + 7, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        // A plain disc with a small arrowhead on the rim, pointing where he is
        // looking. Pitch x runs up the screen and pitch y across it, so the
        // heading has to be turned into screen space first.
        const phi = Math.atan2(-Math.cos(p.facing), Math.sin(p.facing));

        // The man in possession glows, so you can see who has it at a glance.
        // A hard ring is reserved for the player you have selected.
        const carrying = s.ball.holder === p.id;
        if (carrying) {
          ctx.shadowColor = 'rgba(255,255,255,0.95)';
          ctx.shadowBlur = r * 1.15;
        }
        ctx.fillStyle = p.team === 'blue' ? BLUE : RED;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        const tip = r * 1.42;
        const base = r * 0.92;
        const spread = 0.42;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(phi) * tip, y + Math.sin(phi) * tip);
        ctx.lineTo(x + Math.cos(phi + spread) * base, y + Math.sin(phi + spread) * base);
        ctx.lineTo(x + Math.cos(phi - spread) * base, y + Math.sin(phi - spread) * base);
        ctx.closePath();
        ctx.fill();
        if (carrying) {
          // A second pass deepens the glow without washing out the shirt.
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = '#fff';
        ctx.font = `600 ${Math.round(r * 1.05)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(p.shirt), x, y + 0.5);
      }

      // Turn the ball by however far it has moved since the last frame.
      const br = Math.max(7, 0.7 * sc);
      const ballR = br / sc; // the drawn radius, in metres
      if (wasAt.current) {
        const dx = s.ball.x - wasAt.current.x;
        const dy = s.ball.y - wasAt.current.y;
        const d = Math.hypot(dx, dy);
        if (d > 1e-4) {
          spin.current = mul(axisAngle(-dy / d, dx / d, 0, d / ballR), spin.current);
        }
      }
      wasAt.current = { x: s.ball.x, y: s.ball.y };

      const bx = sx(s.ball);
      const by = sy(s.ball);

      // A soft shadow, offset as though the light comes from the top left. It
      // is what lifts the ball off the grass instead of letting it read as a
      // white disc painted on it.
      const shR = br * 1.15;
      const shX = bx + br * 0.34;
      const shY = by + br * 0.42;
      const shade = ctx.createRadialGradient(shX, shY, 0, shX, shY, shR);
      shade.addColorStop(0, 'rgba(0,0,0,0.34)');
      shade.addColorStop(0.55, 'rgba(0,0,0,0.2)');
      shade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(shX, shY, shR, 0, Math.PI * 2);
      ctx.fill();

      // Lit from the top left: bright where it faces the light, falling away
      // toward the far rim. The same light drives the shadow above.
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      const lit = ctx.createRadialGradient(
        bx - br * 0.36, by - br * 0.4, br * 0.08,
        bx, by, br * 1.06,
      );
      lit.addColorStop(0, '#ffffff');
      lit.addColorStop(0.5, '#f1f1ee');
      lit.addColorStop(1, '#bdbdb8');
      ctx.fillStyle = lit;
      ctx.fill();
      ctx.clip();
      const m = spin.current;
      const cosR = Math.cos(PANEL_R);
      const sinR = Math.sin(PANEL_R);
      ctx.fillStyle = 'rgba(18,18,20,0.94)';
      for (const [px, py, pz] of PANELS) {
        const nx = m[0] * px + m[1] * py + m[2] * pz;
        const ny = m[3] * px + m[4] * py + m[5] * pz;
        const nz = m[6] * px + m[7] * py + m[8] * pz;
        if (nz <= -sinR) continue; // wholly round the back

        // A tangent basis at the panel's centre, so the pentagon can be laid
        // out flat on the ball's surface before it is projected.
        const ax = Math.abs(nx) < 0.9 ? 1 : 0;
        const ay = Math.abs(nx) < 0.9 ? 0 : 1;
        let t1x = ay * nz - 0 * ny;
        let t1y = 0 * nx - ax * nz;
        let t1z = ax * ny - ay * nx;
        const t1n = Math.hypot(t1x, t1y, t1z) || 1;
        t1x /= t1n;
        t1y /= t1n;
        t1z /= t1n;
        const t2x = ny * t1z - nz * t1y;
        const t2y = nz * t1x - nx * t1z;
        const t2z = nx * t1y - ny * t1x;

        const corner: Array<[number, number]> = [];
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          const ca = Math.cos(a) * sinR;
          const sa = Math.sin(a) * sinR;
          let vx = nx * cosR + t1x * ca + t2x * sa;
          let vy = ny * cosR + t1y * ca + t2y * sa;
          const vz = nz * cosR + t1z * ca + t2z * sa;
          if (vz < 0) {
            // Over the horizon: pin it to the silhouette instead of letting it
            // fold back over the front of the ball.
            const f = Math.hypot(vx, vy) || 1;
            vx /= f;
            vy /= f;
          }
          // Pitch x runs up the screen and pitch y runs across it.
          corner.push([bx + vy * br, by - vx * br]);
        }

        // Round each corner by pulling back along both of its edges and
        // curving through the corner itself, the way a stitched panel sits.
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const [cx2, cy2] = corner[k];
          const [ax2, ay2] = corner[(k + 4) % 5];
          const [nx2, ny2] = corner[(k + 1) % 5];
          const inx = cx2 + (ax2 - cx2) * CORNER;
          const iny = cy2 + (ay2 - cy2) * CORNER;
          const outx = cx2 + (nx2 - cx2) * CORNER;
          const outy = cy2 + (ny2 - cy2) * CORNER;
          if (k === 0) ctx.moveTo(inx, iny);
          else ctx.lineTo(inx, iny);
          ctx.quadraticCurveTo(cx2, cy2, outx, outy);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Darken toward the rim over the top of the panels, so black and white
      // curve away together rather than the panels sitting flat on a lit ball.
      const curve = ctx.createRadialGradient(
        bx - br * 0.36, by - br * 0.4, br * 0.12,
        bx, by, br * 1.14,
      );
      curve.addColorStop(0, 'rgba(0,0,0,0)');
      curve.addColorStop(0.58, 'rgba(0,0,0,0.07)');
      curve.addColorStop(1, 'rgba(0,0,0,0.46)');
      ctx.fillStyle = curve;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);

      // A small specular, which is what actually reads as "sphere".
      const hx = bx - br * 0.4;
      const hy = by - br * 0.44;
      const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, br * 0.6);
      spec.addColorStop(0, 'rgba(255,255,255,0.72)');
      spec.addColorStop(0.5, 'rgba(255,255,255,0.22)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spec;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      ctx.restore();

      // A faint terminator rather than a hard outline, which would flatten it.
      ctx.beginPath();
      ctx.arc(bx, by, br - 0.4, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.22)';
      ctx.stroke();


    };

    /* --- taps --------------------------------------------------------- */
    const down = { x: 0, y: 0, t: 0, ok: false };

    const onDown = (e: PointerEvent) => {
      down.x = e.clientX;
      down.y = e.clientY;
      down.t = Date.now();
      down.ok = true;
    };

    const onUp = (e: PointerEvent) => {
      if (!down.ok) return;
      down.ok = false;
      // A drag is not a tap.
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;

      const s = stateRef.current;
      if (!s) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const v = viewRef.current;
      const my = (px - v.ox) / v.s;
      const mx = PITCH.L - (py - v.oy) / v.s;

      let best: Player | null = null;
      let bd = Infinity;
      for (const p of s.players) {
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }

      if (best && bd <= 4.5) {
        // Tapping the selected man again lets go of him.
        cb.current.onSelect(best.id === cb.current.selectedId ? null : best);
        return;
      }
      if (px > v.w * (1 - STEP_ZONE)) cb.current.onStep();
      else cb.current.onTogglePlay();
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
    };
  }, [stateRef]);

  return <canvas ref={canvasRef} className="pitch" />;
}
