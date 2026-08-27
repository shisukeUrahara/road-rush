import {
  HITBOX_SCALE_CAR,
  HITBOX_SCALE_FUEL,
  HITBOX_SCALE_HAZARD,
  HITBOX_SCALE_PLAYER,
  HITBOX_SCALE_TRUCK,
  PLAYER_H,
  PLAYER_W,
} from "./config";
import type { Actor } from "./traffic";
import { isHazard } from "./traffic";

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function box(x: number, distance: number, w: number, h: number, scale: number): Rect {
  const hw = (w * scale) / 2;
  const hh = (h * scale) / 2;
  return { left: x - hw, right: x + hw, top: distance - hh, bottom: distance + hh };
}

export function playerBox(x: number, distance: number): Rect {
  return box(x, distance, PLAYER_W, PLAYER_H, HITBOX_SCALE_PLAYER);
}

export function actorBox(a: Actor): Rect {
  const scale =
    a.kind === "truck"
      ? HITBOX_SCALE_TRUCK
      : a.kind === "fuel"
        ? HITBOX_SCALE_FUEL
        : isHazard(a.kind)
          ? HITBOX_SCALE_HAZARD
          : HITBOX_SCALE_CAR;
  return box(a.x, a.distance, a.w, a.h, scale);
}

export type CollisionResult =
  | { type: "none" }
  | { type: "skid"; dir: -1 | 1; strength: number }
  | { type: "spin"; dir: -1 | 1 }
  | { type: "explode" }
  | { type: "slow" }
  | { type: "fuel" };

/** What happens when the player's box overlaps this actor. */
export function resolve(actor: Actor, playerX: number): CollisionResult {
  switch (actor.kind) {
    case "fuel":
      return { type: "fuel" };
    case "truck":
    case "rock":
      return { type: "explode" };
    case "oil":
      return { type: "spin", dir: playerX < actor.x ? -1 : 1 };
    case "puddle":
      return { type: "slow" };
    default: {
      // Side contact throws the player away from the other car.
      const dir: -1 | 1 = playerX < actor.x ? -1 : 1;
      const overlap = 1 - Math.min(1, Math.abs(playerX - actor.x) / actor.w);
      return { type: "skid", dir, strength: 0.8 + overlap * 0.6 };
    }
  }
}
