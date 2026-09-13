/**
 * Canvas renderer. Portrait: we attack upward. Pitch metres -> screen pixels.
 * Tokens are top-down shirts (shoulders, head, number) so orientation reads at a glance.
 */
import { add, angleOf, dist, norm, scale, sub, type Vec } from '../sim/vec';
import { PITCH, type Team } from '../sim/types';

export interface FramePlayer {
  id: string;
  team: Team;
  num: number;
  pos: Vec;
  facing: number;
  /** m/s, filled in by the motion layer. */
  speed?: number;
  /** Run-cycle phase in radians, filled in by the motion layer. */
  stride?: number;
  /** Seconds alive, for idle sway. */
  idle?: number;
}

export interface Frame {
  players: FramePlayer[];
  ball: Vec;
  /** 0 on the ground, 1 at the top of a lofted ball; scales the ball sprite. */
  ballZ: number;
  ballSpeed?: number;
}

export interface Lane {
  to: Vec;
  /** 0..1, colours red -> green. */
  quality: number;
  width?: number;
}

export interface Overlay {
  carrierId?: string | null;
  tappable?: string[];
  /** The presser: drawn with a red ring. */
  threatId?: string | null;
  selectedId?: string | null;
  showShadows?: boolean;
  neutralLanes?: Vec[];
  lanes?: Lane[];
  /** Origin for lanes and the dribble arrow; defaults to the carrier's current position. */
  laneFrom?: Vec | null;
  dribbleTarget?: Vec | null;
  ballTrail?: Vec[];
  pulse?: number;
  /** What the panorama strip is showing: a wedge from the eye. */
  viewCone?: { from: Vec; yaw: number; hfov: number } | null;
}

const KIT: Record<Team, { shirt: string; sleeve: string; number: string }> = {
  us: { shirt: '#ffd84d', sleeve: '#e6bd2e', number: '#1a1608' },
  them: { shirt: '#e63963', sleeve: '#c02a50', number: '#ffffff' },
};

const MARGIN = 3;

export class PitchRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private s = 8;
  private padX = 0;
  private padY = 0;
  cssW = 0;
  cssH = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
  }

  resize(maxW: number, maxH: number): void {
    const sW = maxW / (PITCH.W + MARGIN * 2);
    const sH = maxH / (PITCH.L + MARGIN * 2);
    this.s = Math.max(4, Math.min(sW, sH));
    this.cssW = (PITCH.W + MARGIN * 2) * this.s;
    this.cssH = (PITCH.L + MARGIN * 2) * this.s;
    this.padX = MARGIN * this.s;
    this.padY = MARGIN * this.s;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toScreen(p: Vec): Vec {
    return { x: this.padX + p.y * this.s, y: this.padY + (PITCH.L - p.x) * this.s };
  }

  toPitch(sp: Vec): Vec {
    return { x: PITCH.L - (sp.y - this.padY) / this.s, y: (sp.x - this.padX) / this.s };
  }

  hitPlayer(frame: Frame, screenPt: Vec, ids?: string[]): string | null {
    const p = this.toPitch(screenPt);
    let best: string | null = null;
    let bestD = 2.4;
    for (const pl of frame.players) {
      if (ids && !ids.includes(pl.id)) continue;
      const d = dist(pl.pos, p);
      if (d < bestD) {
        bestD = d;
        best = pl.id;
      }
    }
    return best;
  }

  draw(frame: Frame, ov: Overlay): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    this.drawGrass();
    this.drawLines();
    if (ov.viewCone) this.drawViewCone(ov.viewCone);
    if (ov.showShadows) this.drawShadows(frame);
    if (ov.neutralLanes && ov.carrierId) this.drawNeutralLanes(frame, ov.carrierId, ov.neutralLanes);
    if (ov.lanes && ov.carrierId) this.drawLanes(frame, ov.carrierId, ov.lanes, ov.laneFrom ?? null);
    if (ov.dribbleTarget && ov.carrierId) this.drawDribble(frame, ov.carrierId, ov.dribbleTarget, ov.laneFrom ?? null);
    if (ov.ballTrail) this.drawTrail(ov.ballTrail);
    this.drawRings(frame, ov);
    const sorted = [...frame.players].sort((a, b) => a.pos.x - b.pos.x).reverse();
    for (const p of sorted) this.drawPlayer(p);
    this.drawBall(frame.ball, frame.ballZ);
  }

  private drawGrass(): void {
    const { ctx, s } = this;
    ctx.fillStyle = '#0b0f0c';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    const tl = this.toScreen({ x: PITCH.L, y: 0 });
    const w = PITCH.W * s;
    const h = PITCH.L * s;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 18 * (s / 8);
    ctx.fillStyle = '#1e5c33';
    ctx.fillRect(tl.x, tl.y, w, h);
    ctx.restore();
    const band = 6 * s;
    for (let i = 0; i < PITCH.L / 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1f6236' : '#1c5a31';
      ctx.fillRect(tl.x, tl.y + i * band, w, band);
    }
  }

  private drawLines(): void {
    const { ctx, s } = this;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = Math.max(1, s * 0.12);
    const line = (a: Vec, b: Vec): void => {
      const A = this.toScreen(a);
      const B = this.toScreen(b);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    };
    const rect = (x0: number, y0: number, x1: number, y1: number): void => {
      const A = this.toScreen({ x: x1, y: y0 });
      const B = this.toScreen({ x: x0, y: y1 });
      ctx.strokeRect(A.x, A.y, B.x - A.x, B.y - A.y);
    };
    rect(0, 0, PITCH.L, PITCH.W);
    line({ x: PITCH.L / 2, y: 0 }, { x: PITCH.L / 2, y: PITCH.W });
    const c = this.toScreen({ x: PITCH.L / 2, y: PITCH.W / 2 });
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5 * s, 0, Math.PI * 2);
    ctx.stroke();
    const boxW = 24;
    const y0 = (PITCH.W - boxW) / 2;
    rect(0, y0, 10, y0 + boxW);
    rect(PITCH.L - 10, y0, PITCH.L, y0 + boxW);
    const goalW = 6;
    const g0 = (PITCH.W - goalW) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    rect(-1.5, g0, 0, g0 + goalW);
    rect(PITCH.L, g0, PITCH.L + 1.5, g0 + goalW);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    for (const x of [8, PITCH.L - 8]) {
      const p = this.toScreen({ x, y: PITCH.W / 2 });
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawViewCone(cone: { from: Vec; yaw: number; hfov: number }): void {
    const { ctx, s } = this;
    const c = this.toScreen(cone.from);
    // Pitch direction (dx, dy) maps to screen (dy, -dx): screen angle = atan2(-dx, dy).
    const toScreenAngle = (a: number): number => Math.atan2(-Math.cos(a), Math.sin(a));
    const a0 = toScreenAngle(cone.yaw - cone.hfov / 2);
    const a1 = toScreenAngle(cone.yaw + cone.hfov / 2);
    const r = s * 26;
    const grad = ctx.createRadialGradient(c.x, c.y, s * 1.5, c.x, c.y, r);
    grad.addColorStop(0, 'rgba(255,255,255,.16)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, r, a0, a1, false);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Cover shadows: the space a defender near the ball can screen off. */
  private drawShadows(frame: Frame): void {
    const { ctx } = this;
    for (const d of frame.players) {
      if (d.team !== 'them') continue;
      const dd = dist(d.pos, frame.ball);
      if (dd > 11 || dd < 0.5) continue;
      const dir = norm(sub(d.pos, frame.ball));
      const perp = { x: -dir.y, y: dir.x };
      const near1 = this.toScreen(add(d.pos, scale(perp, 1.4)));
      const near2 = this.toScreen(add(d.pos, scale(perp, -1.4)));
      const farC = add(d.pos, scale(dir, 13));
      const far1 = this.toScreen(add(farC, scale(perp, 5.5)));
      const far2 = this.toScreen(add(farC, scale(perp, -5.5)));
      const start = this.toScreen(d.pos);
      const end = this.toScreen(farC);
      const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
      const strength = 0.22 * (1 - dd / 11) + 0.06;
      grad.addColorStop(0, `rgba(230,57,99,${strength.toFixed(3)})`);
      grad.addColorStop(1, 'rgba(230,57,99,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(near1.x, near1.y);
      ctx.lineTo(far1.x, far1.y);
      ctx.lineTo(far2.x, far2.y);
      ctx.lineTo(near2.x, near2.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  private carrierPos(frame: Frame, id: string): Vec | null {
    const c = frame.players.find((p) => p.id === id);
    return c ? c.pos : null;
  }

  private drawNeutralLanes(frame: Frame, carrierId: string, targets: Vec[]): void {
    const { ctx, s } = this;
    const from = this.carrierPos(frame, carrierId);
    if (!from) return;
    ctx.save();
    ctx.setLineDash([s * 0.5, s * 0.6]);
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = Math.max(1, s * 0.12);
    for (const t of targets) {
      const A = this.toScreen(from);
      const B = this.toScreen(t);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawLanes(frame: Frame, carrierId: string, lanes: Lane[], origin: Vec | null): void {
    const { ctx, s } = this;
    const from = origin ?? this.carrierPos(frame, carrierId);
    if (!from) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const lane of lanes) {
      const hue = 120 * lane.quality;
      ctx.strokeStyle = `hsla(${hue.toFixed(0)}, 85%, 58%, .8)`;
      ctx.lineWidth = lane.width ?? s * (0.15 + 0.4 * lane.quality);
      const A = this.toScreen(from);
      const B = this.toScreen(lane.to);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDribble(frame: Frame, carrierId: string, target: Vec, origin: Vec | null): void {
    const { ctx, s } = this;
    const from = origin ?? this.carrierPos(frame, carrierId);
    if (!from) return;
    const A = this.toScreen(from);
    const B = this.toScreen(target);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = Math.max(1, s * 0.16);
    ctx.setLineDash([s * 0.4, s * 0.4]);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(B.y - A.y, B.x - A.x);
    const h = s * 0.9;
    ctx.beginPath();
    ctx.moveTo(B.x, B.y);
    ctx.lineTo(B.x - h * Math.cos(ang - 0.5), B.y - h * Math.sin(ang - 0.5));
    ctx.lineTo(B.x - h * Math.cos(ang + 0.5), B.y - h * Math.sin(ang + 0.5));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawTrail(path: Vec[]): void {
    const { ctx, s } = this;
    if (path.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.setLineDash([s * 0.25, s * 0.35]);
    ctx.beginPath();
    const first = path[0];
    if (!first) return;
    const A = this.toScreen(first);
    ctx.moveTo(A.x, A.y);
    for (const p of path.slice(1)) {
      const B = this.toScreen(p);
      ctx.lineTo(B.x, B.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawRings(frame: Frame, ov: Overlay): void {
    const { ctx, s } = this;
    const pulse = ov.pulse ?? 0;
    for (const p of frame.players) {
      const sp = this.toScreen(p.pos);
      if (p.id === ov.carrierId) {
        ctx.save();
        ctx.strokeStyle = `rgba(255,216,77,${(0.55 + 0.35 * Math.sin(pulse * 4)).toFixed(3)})`;
        ctx.lineWidth = s * 0.18;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, s * (2 + 0.15 * Math.sin(pulse * 4)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (ov.selectedId === p.id) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,.22)';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, s * 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (ov.threatId === p.id) {
        ctx.save();
        ctx.strokeStyle = 'rgba(230,57,99,.85)';
        ctx.lineWidth = Math.max(1, s * 0.14);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, s * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (ov.tappable?.includes(p.id)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.lineWidth = Math.max(1, s * 0.1);
        ctx.setLineDash([s * 0.35, s * 0.35]);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, s * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawPlayer(p: FramePlayer): void {
    const { ctx, s } = this;
    const sp = this.toScreen(p.pos);
    const kit = KIT[p.team];
    // Pitch direction (dx, dy) maps to screen (dy, -dx).
    const theta = Math.atan2(-Math.cos(p.facing), Math.sin(p.facing));

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.38)';
    ctx.beginPath();
    ctx.ellipse(sp.x + s * 0.22, sp.y + s * 0.38, s * 1.3, s * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(theta);
    ctx.fillStyle = kit.sleeve;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(-s * 0.15, side * s * 1.05, s * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = kit.shirt;
    ctx.beginPath();
    ctx.roundRect(-s * 0.85, -s * 1.05, s * 1.7, s * 2.1, s * 0.7);
    ctx.fill();
    const bob = Math.sin(p.stride ?? 0) * Math.min(1, (p.speed ?? 0) / 4) * 0.12;
    ctx.fillStyle = '#2b1d16';
    ctx.beginPath();
    ctx.arc(s * 0.32, s * bob, s * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.arc(s * 0.22, -s * 0.12, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const back = add(sp, scale(norm({ x: Math.cos(theta), y: Math.sin(theta) }), -s * 0.42));
    ctx.save();
    ctx.fillStyle = kit.number;
    ctx.font = `700 ${(s * 0.95).toFixed(1)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.num), back.x, back.y);
    ctx.restore();
  }

  private drawBall(pos: Vec, z: number): void {
    const { ctx, s } = this;
    const sp = this.toScreen(pos);
    const r = s * 0.45 * (1 + 0.9 * z);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(sp.x + s * 0.2 + z * s * 1.5, sp.y + s * 0.3 + z * s * 1.5, r * 0.9, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(sp.x + Math.cos(a) * r * 0.5, sp.y + Math.sin(a) * r * 0.5, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export const facingBetween = (from: Vec, to: Vec, fallback: number): number => {
  const d = sub(to, from);
  return Math.hypot(d.x, d.y) < 0.2 ? fallback : angleOf(d);
};
