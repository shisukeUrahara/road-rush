// Headless simulation checks — no browser, no rendering.
// Run: npm test
//
// The one thing that must never break: the player must always be able to get
// through. A wall of traffic with no gap is an unwinnable frame.

import assert from "node:assert/strict";
import { TrafficSystem, difficultyAt, hasPassableGap } from "../src/traffic.ts";
import { TERRAINS } from "../src/terrains.ts";
import { loadScores } from "../src/scores.ts";
import { HIGH_MAX, MAX_SCROLL } from "../src/config.ts";

const SPEED_TO_UNITS = MAX_SCROLL / HIGH_MAX;
const SEEDS = [1, 7, 13, 29, 101];
const SECONDS = 90; // ~30 km at top speed, well past the full difficulty ramp

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name}\n       ${e.message}`);
  }
};

/** Drive a terrain at top speed and sample the road. */
function driveTerrain(terrain, seed, onSample) {
  const ts = new TrafficSystem(terrain, seed, 0);
  let dist = 0;
  ts.spawnAhead(0, 720, difficultyAt(terrain, 0));
  for (let i = 0; i < 60 * SECONDS; i++) {
    dist += HIGH_MAX * SPEED_TO_UNITS / 60;
    const d = difficultyAt(terrain, dist);
    ts.spawnAhead(dist, 720, d);
    ts.update(1 / 60, dist, 128, d, SPEED_TO_UNITS);
    onSample(ts, dist, i);
  }
  return { ts, dist };
}

console.log("traffic passability");
for (const terrain of TERRAINS) {
  check(`${terrain.name}: road is never sealed at the player`, () => {
    let blocked = 0;
    let samples = 0;
    for (const seed of SEEDS) {
      driveTerrain(terrain, seed, (ts, dist, i) => {
        if (i % 6 !== 0) return;
        samples++;
        if (!hasPassableGap(ts.actors, terrain, dist)) blocked++;
      });
    }
    assert.equal(blocked, 0, `${blocked}/${samples} samples had no gap`);
  });
}

console.log("traffic density");
for (const terrain of TERRAINS) {
  check(`${terrain.name}: road stays populated but not packed`, () => {
    const counts = [];
    driveTerrain(TERRAINS.find((t) => t.id === terrain.id), 7, (ts, dist, i) => {
      if (i % 30 !== 0) return;
      counts.push(ts.actors.filter((a) => a.distance > dist - 30 && a.distance < dist + 230).length);
    });
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const emptyRatio = counts.filter((c) => c === 0).length / counts.length;
    assert.ok(avg >= 1.5, `too sparse: avg ${avg.toFixed(2)} cars on screen`);
    assert.ok(avg <= 8, `too dense: avg ${avg.toFixed(2)} cars on screen`);
    assert.ok(emptyRatio < 0.25, `empty road ${(emptyRatio * 100).toFixed(0)}% of the time`);
  });
}

console.log("determinism");
check("same seed replays identically", () => {
  const run = () => {
    const out = [];
    driveTerrain(TERRAINS[0], 42, (ts, dist, i) => {
      if (i % 300 === 0) out.push(ts.actors.length + ":" + Math.round(dist));
    });
    return out.join("|");
  };
  assert.equal(run(), run());
});

console.log("difficulty ramp");
check("difficulty rises with distance then plateaus", () => {
  const t = TERRAINS[0];
  const near = difficultyAt(t, 0);
  const mid = difficultyAt(t, 6000);
  const far = difficultyAt(t, 12000);
  const beyond = difficultyAt(t, 40000);
  assert.ok(mid.trafficDensity > near.trafficDensity, "density should rise");
  assert.ok(far.enemyLateralSpeed > near.enemyLateralSpeed, "enemies should get faster");
  assert.ok(far.fuelCarFrequency < near.fuelCarFrequency, "fuel should get scarcer");
  assert.deepEqual(beyond, far, "ramp must plateau, not run away");
});

console.log("scores storage");
check("loadScores survives missing localStorage", () => {
  // Node has no localStorage; the module must degrade instead of throwing.
  assert.deepEqual(loadScores(), []);
});

check("loadScores rejects corrupt data", () => {
  globalThis.localStorage = {
    getItem: () => '[{"name":"X"},{"bogus":true},"nope",{"name":"OK","score":50}]',
    setItem: () => {},
  };
  const board = loadScores();
  assert.equal(board.length, 1, "only well-formed rows should survive");
  assert.equal(board[0].name, "OK");
  delete globalThis.localStorage;
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 1 && 0 : 1);
