// Traffic personalities and the formation spawner.
//
// Nothing is spawned by pure chance at the last moment: each 260m chunk picks a
// formation from a table with a seeded RNG, so a run is reproducible and every
// formation is authored to leave a gap the player can actually fit through.

import { LANES, laneX, roadAt, widthAt } from "./road";
import type { Terrain } from "./terrains";
import { HIGH_MAX, PLAYER_W } from "./config";

export type ActorKind =
  | "yellow"
  | "red"
  | "blueDelayed"
  | "blueWeaver"
  | "blueAggressive"
  | "truck"
  | "fuel"
  | "oil"
  | "puddle"
  | "rock";

export interface Actor {
  kind: ActorKind;
  /** Course-space position; screenY is derived from the player's distance. */
  distance: number;
  x: number;
  targetX: number;
  w: number;
  h: number;
  /** Speed the actor itself travels forward, in km/h. */
  speed: number;
  lane: number;
  /** Per-behavior scratch state. */
  committed: boolean;
  trackTime: number;
  weavePhase: number;
  passed: boolean;
  dead: boolean;
}

export const ACTOR_SIZE: Record<ActorKind, { w: number; h: number }> = {
  yellow: { w: 16, h: 24 },
  red: { w: 16, h: 24 },
  blueDelayed: { w: 16, h: 24 },
  blueWeaver: { w: 16, h: 24 },
  blueAggressive: { w: 16, h: 24 },
  truck: { w: 22, h: 40 },
  fuel: { w: 16, h: 24 },
  oil: { w: 20, h: 14 },
  puddle: { w: 20, h: 14 },
  rock: { w: 16, h: 14 },
};

const CAR_SPEEDS: Partial<Record<ActorKind, number>> = {
  yellow: 150,
  red: 175,
  blueDelayed: 185,
  blueWeaver: 180,
  blueAggressive: 200,
  truck: 120,
  fuel: 165,
};

export function isHazard(kind: ActorKind): boolean {
  return kind === "oil" || kind === "puddle" || kind === "rock";
}

export function isVehicle(kind: ActorKind): boolean {
  return !isHazard(kind) && kind !== "fuel";
}

/** Deterministic 32-bit PRNG (mulberry32) so a seed replays identically. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Difficulty {
  trafficDensity: number;
  enemyReactionDistance: number;
  enemyLateralSpeed: number;
  hazardFrequency: number;
  fuelCarFrequency: number;
  fuelBurnMultiplier: number;
}

/** Difficulty ramps with distance and never exceeds the caps below. */
export function difficultyAt(terrain: Terrain, distance: number): Difficulty {
  const km = distance / 1000;
  const ramp = Math.min(1, km / 12); // fully ramped by 12 km
  return {
    trafficDensity: terrain.trafficDensity * (0.75 + ramp * 0.95),
    enemyReactionDistance: 150 + ramp * 60,
    enemyLateralSpeed: (26 + ramp * 30) * (0.85 + terrain.aggressiveBias * 0.25),
    hazardFrequency: 0.25 + ramp * 0.55,
    fuelCarFrequency: Math.max(0.55, 1.15 - ramp * 0.45),
    fuelBurnMultiplier: 1 + ramp * 0.18,
  };
}

function makeActor(kind: ActorKind, distance: number, lane: number, x: number): Actor {
  const size = ACTOR_SIZE[kind];
  return {
    kind,
    distance,
    x,
    targetX: x,
    w: size.w,
    h: size.h,
    speed: CAR_SPEEDS[kind] ?? 0,
    lane,
    committed: false,
    trackTime: 0,
    weavePhase: 0,
    passed: false,
    dead: false,
  };
}

interface Formation {
  /** Lanes occupied by ordinary traffic. */
  cars: { lane: number; kind?: ActorKind; offset?: number }[];
  hazards?: { lane: number; offset?: number }[];
  /** Depth of the formation in world units; the next one starts after it. */
  depth: number;
  /** Minimum difficulty ramp (0..1) before this shows up. */
  minRamp?: number;
}

// Every formation leaves at least one lane free across its whole depth.
const FORMATIONS: Formation[] = [
  { cars: [{ lane: 0 }], depth: 80 },
  { cars: [{ lane: 3 }], depth: 80 },
  { cars: [{ lane: 1 }, { lane: 2, offset: 50 }], depth: 130 },
  { cars: [{ lane: 0 }, { lane: 1 }], depth: 110 },
  { cars: [{ lane: 2 }, { lane: 3 }], depth: 110 },
  { cars: [{ lane: 0 }, { lane: 3 }], depth: 110 },
  { cars: [{ lane: 1, kind: "red" }], depth: 100, minRamp: 0.1 },
  { cars: [{ lane: 2, kind: "red" }, { lane: 0, offset: 60 }], depth: 140, minRamp: 0.15 },
  { cars: [{ lane: 1, kind: "blueDelayed" }, { lane: 3, offset: 70 }], depth: 140, minRamp: 0.2 },
  { cars: [{ lane: 2, kind: "blueWeaver" }], depth: 120, minRamp: 0.25 },
  {
    cars: [{ lane: 0 }, { lane: 1, offset: 40 }, { lane: 2, offset: 80 }],
    depth: 180,
    minRamp: 0.3,
  },
  {
    cars: [{ lane: 3 }, { lane: 2, offset: 40 }, { lane: 1, offset: 80 }],
    depth: 180,
    minRamp: 0.3,
  },
  { cars: [{ lane: 1, kind: "truck" }], depth: 140, minRamp: 0.15 },
  { cars: [{ lane: 2, kind: "truck" }, { lane: 0, offset: 80 }], depth: 180, minRamp: 0.35 },
  {
    cars: [{ lane: 0, kind: "truck" }, { lane: 3, kind: "yellow", offset: 30 }],
    depth: 190,
    minRamp: 0.45,
  },
  { cars: [{ lane: 2, kind: "blueAggressive" }], depth: 130, minRamp: 0.4 },
  {
    cars: [{ lane: 1, kind: "blueAggressive" }, { lane: 3, kind: "yellow", offset: 50 }],
    depth: 160,
    minRamp: 0.5,
  },
  { cars: [{ lane: 0 }, { lane: 2 }], hazards: [{ lane: 3, offset: 70 }], depth: 150, minRamp: 0.2 },
  { cars: [{ lane: 3, kind: "red" }], hazards: [{ lane: 1, offset: 30 }], depth: 140, minRamp: 0.25 },
  {
    cars: [{ lane: 0, kind: "yellow" }, { lane: 1, kind: "yellow", offset: 30 }],
    hazards: [{ lane: 3, offset: 80 }],
    depth: 180,
    minRamp: 0.4,
  },
  {
    cars: [
      { lane: 0, kind: "truck" },
      { lane: 2, kind: "blueWeaver", offset: 70 },
      { lane: 3, kind: "yellow", offset: 120 },
    ],
    depth: 230,
    minRamp: 0.6,
  },
];

/** Owns the actor list and decides what appears where. */
export class TrafficSystem {
  actors: Actor[] = [];
  private rng: () => number;
  /** Course distance where the next formation will be planted. */
  private nextSpawn: number;
  private nextFuel: number;

  constructor(
    private terrain: Terrain,
    seed: number,
    startDistance: number,
  ) {
    this.rng = makeRng(seed);
    this.nextSpawn = startDistance + 260;
    this.nextFuel = startDistance + 900;
  }

  reset(startDistance: number): void {
    this.actors.length = 0;
    this.nextSpawn = startDistance + 260;
    this.nextFuel = startDistance + 900;
  }

  /** Remove everything close to the player — used after a crash. */
  clearNear(distance: number, ahead: number): void {
    this.actors = this.actors.filter(
      (a) => a.distance < distance - 40 || a.distance > distance + ahead,
    );
  }

  /** How many 16-wide cars fit side by side while leaving a player-width gap. */
  private maxAbreast(roadWidth: number): number {
    const need = PLAYER_W + 8;
    return Math.max(1, Math.floor((roadWidth - need) / 16));
  }

  private pickFormation(ramp: number): Formation {
    const eligible = FORMATIONS.filter((f) => (f.minRamp ?? 0) <= ramp);
    return eligible[Math.floor(this.rng() * eligible.length)];
  }

  private hazardKind(): ActorKind {
    const t = this.terrain;
    const total = t.oilBias + t.puddleBias + t.rockBias;
    const r = this.rng() * total;
    if (r < t.oilBias) return "oil";
    if (r < t.oilBias + t.puddleBias) return "puddle";
    return "rock";
  }

  /** Plant formations far enough ahead that they scroll in naturally. */
  spawnAhead(distance: number, horizon: number, diff: Difficulty): void {
    const ramp = Math.min(1, distance / 12000);
    while (this.nextSpawn < distance + horizon) {
      const at = this.nextSpawn;
      const shape = roadAt(this.terrain, at);
      const f = this.pickFormation(ramp);

      // A narrow road physically cannot hold every formation. Work out how many
      // cars can stand abreast and still leave a player-width gap, and drop the
      // overflow rather than spawning a wall nothing can get through.
      const abreast = this.maxAbreast(shape.width);
      let placedNear = 0;

      for (const c of f.cars) {
        const d = at + (c.offset ?? 0);
        const s = roadAt(this.terrain, d);
        const kind = c.kind ?? (this.rng() < 0.75 ? "yellow" : "red");
        if (kind === "truck" && this.rng() > this.terrain.truckBias * 0.7) continue;
        // Cars spread far enough apart lengthwise are not part of the same wall.
        const inSameRow = (c.offset ?? 0) < 60;
        if (inSameRow) {
          if (placedNear >= abreast) continue;
          placedNear++;
        }
        this.actors.push(makeActor(kind, d, c.lane, laneX(s, c.lane, LANES)));
      }
      for (const h of f.hazards ?? []) {
        if (this.rng() > diff.hazardFrequency) continue;
        const d = at + (h.offset ?? 0);
        const s = roadAt(this.terrain, d);
        this.actors.push(makeActor(this.hazardKind(), d, h.lane, laneX(s, h.lane, LANES)));
      }

      // Gaps are tuned against the ~240u visible field: too wide and the road
      // looks empty, too narrow and waves overlap into an unpassable wall.
      const gap = Math.max(60, (150 - ramp * 60) / diff.trafficDensity);
      this.nextSpawn = at + f.depth + gap * (0.7 + this.rng() * 0.7);
      void shape;
    }

    while (this.nextFuel < distance + horizon) {
      const at = this.nextFuel;
      const s = roadAt(this.terrain, at);
      const lane = Math.floor(this.rng() * LANES);
      // Keep the fuel car clear of anything already planted nearby, otherwise
      // it can be impossible to reach.
      const blocked = this.actors.some(
        (a) => Math.abs(a.distance - at) < 90 && Math.abs(a.x - laneX(s, lane, LANES)) < 26,
      );
      if (!blocked) this.actors.push(makeActor("fuel", at, lane, laneX(s, lane, LANES)));
      this.nextFuel = at + (900 + this.rng() * 700) / diff.fuelCarFrequency;
    }
  }

  /**
   * Advance every actor. `playerDistance`/`playerX` drive the blocking AI;
   * actors behind the player are culled.
   */
  update(
    dt: number,
    playerDistance: number,
    playerX: number,
    diff: Difficulty,
    scrollUnitsPerKmh: number,
  ): void {
    const behind = playerDistance - 120;
    for (const a of this.actors) {
      if (a.dead) continue;

      // Forward motion in course space.
      if (a.speed > 0) a.distance += a.speed * scrollUnitsPerKmh * dt;

      const shape = roadAt(this.terrain, a.distance);
      const gap = playerDistance === 0 ? 9999 : a.distance - playerDistance;
      const approaching = gap > 0 && gap < diff.enemyReactionDistance;

      switch (a.kind) {
        case "red":
          if (!a.committed && approaching) {
            a.committed = true;
            // Slide one lane toward the player, never straight onto them.
            const dir = playerX < a.x ? -1 : 1;
            a.targetX = clampToRoad(a.x + dir * (shape.width / LANES), shape.left, shape.right, a.w);
          }
          break;
        case "blueDelayed":
          if (!a.committed && gap > 0 && gap < diff.enemyReactionDistance * 0.6) {
            a.committed = true;
            a.targetX = clampToRoad(playerX, shape.left, shape.right, a.w);
          }
          break;
        case "blueWeaver": {
          a.weavePhase += dt * 0.9;
          const half = (shape.width / 2 - a.w) * 0.8;
          a.targetX = shape.centerX + Math.sin(a.weavePhase) * half;
          break;
        }
        case "blueAggressive":
          if (approaching && a.trackTime < 1.1) {
            a.trackTime += dt;
            a.targetX = clampToRoad(playerX, shape.left, shape.right, a.w);
          }
          break;
        default:
          // yellow / truck / fuel / hazards hold their lane.
          if (!isHazard(a.kind)) a.targetX = laneX(shape, a.lane, LANES);
          break;
      }

      if (isHazard(a.kind)) {
        // Hazards are painted on the road, so they follow the road's curve.
        a.x = laneX(shape, a.lane, LANES);
      } else {
        const lateral =
          diff.enemyLateralSpeed * (a.kind === "blueAggressive" ? 1.35 : 1) * dt;
        a.x += Math.max(-lateral, Math.min(lateral, a.targetX - a.x));
        a.x = clampToRoad(a.x, shape.left, shape.right, a.w);
      }

      if (a.distance < behind) a.dead = true;
    }
    if (this.actors.some((a) => a.dead)) this.actors = this.actors.filter((a) => !a.dead);

    this.keepRoadPassable(playerDistance);
  }

  /**
   * The blocking AI decides each car's target independently, so on the narrow
   * routes a few of them can converge and seal the road. Walk each cluster of
   * side-by-side cars and shove the least-committed one aside so a
   * player-width gap always survives.
   */
  private keepRoadPassable(playerDistance: number): void {
    const need = PLAYER_W + 8;
    // Only rows the player is about to reach matter.
    const ahead = this.actors.filter(
      (a) =>
        isVehicle(a.kind) &&
        // Include rows level with the player: a car alongside still counts
        // toward the wall the player is threading right now.
        a.distance > playerDistance - 40 &&
        a.distance < playerDistance + 420,
    );
    if (ahead.length < 2) return;

    // Cluster by distance. The threshold must be at least as wide as the window
    // hasPassableGap() scans, otherwise two adjacent waves that together seal
    // the road are each judged passable on their own.
    ahead.sort((p, q) => p.distance - q.distance);
    let i = 0;
    while (i < ahead.length) {
      let j = i + 1;
      while (j < ahead.length && ahead[j].distance - ahead[j - 1].distance < 60) j++;
      const row = ahead.slice(i, j);
      i = j;
      if (row.length < 2) continue;

      const shape = roadAt(this.terrain, row[0].distance);
      if (this.widestGap(row, shape.left, shape.right) >= need) continue;

      // Pack the row hard against whichever edge is nearer. Cars end up nose to
      // nose on that side, which leaves one wide opening on the other — the
      // classic Road Fighter "thread the gap" shape, and always passable.
      row.sort((p, q) => p.x - q.x);
      const toLeft = row[0].x - shape.left <= shape.right - row[row.length - 1].x;
      const ordered = toLeft ? row : [...row].reverse();
      const dir = toLeft ? -1 : 1;

      // Close rows must finish packing before the player arrives, so the nearer
      // the wall the faster it shuffles.
      const lead = row[0].distance - playerDistance;
      const step = lead < 90 ? 9 : lead < 160 ? 5 : 2.5;

      let edge = toLeft ? shape.left : shape.right;
      for (const car of ordered) {
        const targetX = edge + dir * (car.w / 2);
        car.x += Math.max(-step, Math.min(step, targetX - car.x));
        car.x = clampToRoad(car.x, shape.left, shape.right, car.w);
        car.targetX = car.x;
        edge += dir * car.w;
      }
    }
  }

  private widestGap(row: Actor[], left: number, right: number): number {
    const spans = row
      .map((a) => [a.x - a.w / 2, a.x + a.w / 2] as const)
      .sort((p, q) => p[0] - q[0]);
    let cursor = left;
    let widest = 0;
    for (const [lo, hi] of spans) {
      widest = Math.max(widest, lo - cursor);
      cursor = Math.max(cursor, hi);
    }
    return Math.max(widest, right - cursor);
  }
}

function clampToRoad(x: number, left: number, right: number, w: number): number {
  const half = w / 2;
  return Math.max(left + half, Math.min(right - half, x));
}

/**
 * Sanity check used by the self-test: at the given distance, is there a lateral
 * gap wide enough for the player among the actors within one "reaction window"?
 */
export function hasPassableGap(actors: Actor[], terrain: Terrain, distance: number): boolean {
  const window = actors.filter((a) => Math.abs(a.distance - distance) < 30 && isVehicle(a.kind));
  if (window.length === 0) return true;
  const width = widthAt(terrain, distance);
  const shape = roadAt(terrain, distance);
  const blocked = window
    .map((a) => [a.x - a.w / 2, a.x + a.w / 2] as const)
    .sort((p, q) => p[0] - q[0]);
  let cursor = shape.centerX - width / 2;
  const need = PLAYER_W + 6;
  for (const [lo, hi] of blocked) {
    if (lo - cursor >= need) return true;
    cursor = Math.max(cursor, hi);
  }
  return shape.centerX + width / 2 - cursor >= need;
}

/** km/h -> world-units-per-second conversion shared by player and traffic. */
export const KMH_TO_UNITS = 1 / HIGH_MAX;
