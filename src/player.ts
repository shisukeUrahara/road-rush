// Player car: two-speed throttle, arcade steering, and the skid/crash state
// machine that makes a graze recoverable but a barrier fatal.

import {
  ACCEL_FAST,
  ACCEL_LOW,
  DECEL_COAST,
  EXPLOSION_FRAME_TIME,
  HIGH_MAX,
  LOW_MAX,
  MEDIUM_MAX,
  PLAYER_H,
  PLAYER_W,
  RESPAWN_IMMUNITY,
  SKID_ENERGY_START,
  SKID_INSTABILITY_RATE,
  SKID_PUSH,
  SKID_RECOVERY_RATE,
  STEER_FAST,
  STEER_SLOW,
} from "./config";
import type { HeldState } from "./input";

export type PlayerState = "starting" | "driving" | "skidding" | "spinning" | "exploding" | "respawning";

export class Player {
  x = 128;
  speed = 0;
  state: PlayerState = "starting";
  /** -1 = sliding left, +1 = sliding right. */
  skidDir: -1 | 1 = 1;
  skidEnergy = 0;
  /** Counts down; while > 0 collisions are ignored. */
  immunity = 0;
  explosionFrame = 0;
  private explosionTimer = 0;
  private stateTimer = 0;
  /** Slowdown factor from a puddle, decays back to 1. */
  gripPenalty = 1;
  spinAngle = 0;
  /** -1/0/1 for the leaning sprite. */
  lean = 0;

  reset(x: number): void {
    this.x = x;
    this.speed = 0;
    this.state = "starting";
    this.skidEnergy = 0;
    this.immunity = RESPAWN_IMMUNITY;
    this.explosionFrame = 0;
    this.explosionTimer = 0;
    this.stateTimer = 0;
    this.gripPenalty = 1;
    this.spinAngle = 0;
    this.lean = 0;
  }

  get hitboxW(): number {
    return PLAYER_W;
  }
  get hitboxH(): number {
    return PLAYER_H;
  }

  get controllable(): boolean {
    return this.state === "driving" || this.state === "skidding" || this.state === "starting";
  }

  get crashed(): boolean {
    return this.state === "exploding" || this.state === "respawning";
  }

  beginSkid(dir: -1 | 1, strength = 1): void {
    if (this.state === "exploding" || this.state === "respawning") return;
    if (this.state === "skidding") {
      // Hit again mid-skid: this one is not survivable.
      this.explode();
      return;
    }
    this.state = "skidding";
    this.skidDir = dir;
    this.skidEnergy = SKID_ENERGY_START * strength;
    this.speed *= 0.82;
  }

  beginSpin(dir: -1 | 1): void {
    if (this.state === "exploding" || this.state === "respawning") return;
    this.state = "spinning";
    this.skidDir = dir;
    this.skidEnergy = SKID_ENERGY_START * 1.35;
    this.spinAngle = 0;
    this.speed *= 0.7;
  }

  explode(): void {
    if (this.state === "exploding" || this.state === "respawning") return;
    this.state = "exploding";
    this.explosionFrame = 0;
    this.explosionTimer = 0;
    this.speed = 0;
    this.skidEnergy = 0;
  }

  slowFromPuddle(): void {
    this.speed *= 0.7;
    this.gripPenalty = 0.55;
  }

  /**
   * Advance one fixed step. Returns "respawn" on the frame the wreck finishes
   * so the caller can clear traffic and reposition.
   */
  update(dt: number, held: HeldState, roadLeft: number, roadRight: number): "none" | "respawn" | "hitBarrier" {
    this.immunity = Math.max(0, this.immunity - dt);
    this.gripPenalty = Math.min(1, this.gripPenalty + dt * 0.6);

    if (this.state === "exploding") {
      this.explosionTimer += dt;
      if (this.explosionTimer >= EXPLOSION_FRAME_TIME) {
        this.explosionTimer -= EXPLOSION_FRAME_TIME;
        this.explosionFrame++;
      }
      if (this.explosionFrame >= 6) {
        this.state = "respawning";
        this.stateTimer = 0;
      }
      return "none";
    }

    if (this.state === "respawning") {
      this.stateTimer += dt;
      if (this.stateTimer >= 0.45) {
        this.state = "starting";
        this.immunity = RESPAWN_IMMUNITY;
        return "respawn";
      }
      return "none";
    }

    // --- throttle -----------------------------------------------------------
    let target = 0;
    let accel = DECEL_COAST;
    if (held.fast) {
      target = this.speed < MEDIUM_MAX ? MEDIUM_MAX : HIGH_MAX;
      accel = ACCEL_FAST;
    } else if (held.slow) {
      target = LOW_MAX;
      accel = this.speed < LOW_MAX ? ACCEL_LOW : DECEL_COAST;
    }
    target *= this.gripPenalty;
    if (this.speed < target) this.speed = Math.min(target, this.speed + accel * dt);
    else this.speed = Math.max(target, this.speed - accel * dt);

    if (this.state === "starting" && this.speed > 40) this.state = "driving";

    // --- steering / skid ----------------------------------------------------
    const ratio = Math.min(1, this.speed / HIGH_MAX);
    const steer = STEER_SLOW + (STEER_FAST - STEER_SLOW) * ratio;
    this.lean = 0;

    if (this.state === "spinning") {
      // A spin drags the car sideways and cannot be steered out of; it just
      // has to run its course (or end at a barrier).
      this.spinAngle += dt * 9;
      this.x += this.skidDir * SKID_PUSH * 0.8 * dt;
      this.skidEnergy -= dt * 0.75;
      if (this.skidEnergy <= 0) {
        this.state = "driving";
        this.spinAngle = 0;
      }
    } else if (this.state === "skidding") {
      this.x += this.skidDir * SKID_PUSH * dt;
      const counter =
        (this.skidDir < 0 && held.right) || (this.skidDir > 0 && held.left);
      this.skidEnergy += (counter ? -SKID_RECOVERY_RATE : SKID_INSTABILITY_RATE) * dt;
      this.lean = this.skidDir;
      if (this.skidEnergy <= 0) {
        this.state = "driving";
        this.skidEnergy = 0;
      } else if (this.skidEnergy > 2.2) {
        // Held the wrong way too long.
        this.explode();
        return "none";
      }
      // Partial steering authority remains during a skid.
      if (held.left) this.x -= steer * 0.35 * dt;
      if (held.right) this.x += steer * 0.35 * dt;
    } else {
      if (held.left) {
        this.x -= steer * dt;
        this.lean = -1;
      }
      if (held.right) {
        this.x += steer * dt;
        this.lean = 1;
      }
    }

    // --- barriers -----------------------------------------------------------
    const half = PLAYER_W / 2;
    if (this.x - half < roadLeft || this.x + half > roadRight) {
      this.x = Math.max(roadLeft + half, Math.min(roadRight - half, this.x));
      if (this.state === "skidding" || this.state === "spinning") {
        this.explode();
        return "hitBarrier";
      }
      // Grazing the edge while in control just scrubs speed.
      this.speed *= 0.97;
      return "none";
    }

    return "none";
  }
}
