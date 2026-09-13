/**
 * Gives the sim's keyframed players mass. Each rendered player steers toward
 * where the timeline says they should be, with acceleration and turn limits,
 * so starts, stops and turns ease the way a body does. Stride phase drives the
 * run cycle. State persists across clips so nothing snaps at clip boundaries.
 */
import { add, angleOf, dist, len, scale, sub, type Vec } from '../sim/vec';
import type { Frame, FramePlayer } from './pitch';

interface Body {
  pos: Vec;
  vel: Vec;
  facing: number;
  stride: number;
  idle: number;
}

const VMAX = 7.5; // m/s
const AMAX = 11; // m/s^2, brisk enough to keep up with the sim, soft enough to ease
const TAU = 0.16; // seconds to close the gap to the target
const TURN = 7; // rad/s
const SNAP = 4; // metres behind the target before we give up and jump

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class MotionLayer {
  private readonly bodies = new Map<string, Body>();
  private ball: Vec = { x: 0, y: 0 };
  private ballVel: Vec = { x: 0, y: 0 };

  /** Hard reset to a frame: use when the state jumps (new moment, retry). */
  reset(frame: Frame): void {
    this.bodies.clear();
    for (const p of frame.players) {
      this.bodies.set(p.id, { pos: { ...p.pos }, vel: { x: 0, y: 0 }, facing: p.facing, stride: Math.random() * 6, idle: Math.random() * 6 });
    }
    this.ball = { ...frame.ball };
    this.ballVel = { x: 0, y: 0 };
  }

  /** Advance by dt seconds of sim time toward `target`, returning the smoothed frame. */
  step(target: Frame, dt: number): Frame {
    const d = Math.min(0.05, Math.max(0.001, dt));
    const players: FramePlayer[] = target.players.map((tp) => {
      let b = this.bodies.get(tp.id);
      if (!b) {
        b = { pos: { ...tp.pos }, vel: { x: 0, y: 0 }, facing: tp.facing, stride: 0, idle: 0 };
        this.bodies.set(tp.id, b);
      }
      const gap = sub(tp.pos, b.pos);
      if (len(gap) > SNAP) {
        b.pos = { ...tp.pos };
        b.vel = { x: 0, y: 0 };
      } else {
        let desired = scale(gap, 1 / TAU);
        const dl = len(desired);
        if (dl > VMAX) desired = scale(desired, VMAX / dl);
        let dv = sub(desired, b.vel);
        const dvl = len(dv);
        if (dvl > AMAX * d) dv = scale(dv, (AMAX * d) / dvl);
        b.vel = add(b.vel, dv);
        b.pos = add(b.pos, scale(b.vel, d));
      }
      const speed = len(b.vel);
      const want = speed > 0.7 ? angleOf(b.vel) : Math.atan2(target.ball.y - b.pos.y, target.ball.x - b.pos.x);
      const turn = wrap(want - b.facing);
      b.facing = wrap(b.facing + Math.sign(turn) * Math.min(Math.abs(turn), TURN * d));
      b.stride += speed * d * 4.2;
      b.idle += d;
      return { ...tp, pos: { ...b.pos }, facing: b.facing, speed, stride: b.stride, idle: b.idle };
    });
    // The ball follows its authored path closely; a light smoothing hides keyframe corners.
    const bg = sub(target.ball, this.ball);
    this.ball = dist(target.ball, this.ball) > 3 ? { ...target.ball } : add(this.ball, scale(bg, Math.min(1, d / 0.06)));
    this.ballVel = scale(bg, 1 / Math.max(d, 0.001));
    return { players, ball: { ...this.ball }, ballZ: target.ballZ, ballSpeed: len(this.ballVel) };
  }
}
