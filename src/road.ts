// The road is defined as a function of distance, not a list of segments, so any
// point of the infinite course can be evaluated directly (and reproducibly).

import { VIEW_W } from "./config";
import type { Terrain } from "./terrains";

export interface RoadShape {
  centerX: number;
  width: number;
  left: number;
  right: number;
}

const CENTER = VIEW_W / 2;

/** Road width shrinks slowly with distance, floored so it stays drivable. */
export function widthAt(terrain: Terrain, distance: number): number {
  const shrink = Math.min(18, distance / 1400);
  return Math.max(76, terrain.roadWidth - shrink);
}

export function roadAt(terrain: Terrain, distance: number): RoadShape {
  const a = terrain.curveAmount;
  // Two incommensurate sines: the road wanders without an obvious repeat.
  const centerX =
    CENTER +
    (a > 0
      ? Math.sin(distance / 620) * a + Math.sin(distance / 231 + 1.7) * (a * 0.35)
      : 0);
  const width = widthAt(terrain, distance);
  return { centerX, width, left: centerX - width / 2, right: centerX + width / 2 };
}

/** Lane center for lane index 0..lanes-1. */
export function laneX(shape: RoadShape, lane: number, lanes: number): number {
  const step = shape.width / lanes;
  return shape.left + step * (lane + 0.5);
}

export const LANES = 4;
