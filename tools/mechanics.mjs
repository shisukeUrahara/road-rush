// Exercise the gameplay mechanics the plain capture run never reaches:
// fuel-car combo scoring, oil spins, puddles, boulders and the mascot bonus.
// Usage: node tools/mechanics.mjs

import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.GAME_URL ?? "http://localhost:5173/";

function findChromium() {
  const root = join(process.env.HOME, ".cache", "ms-playwright");
  const dirs = readdirSync(root)
    .filter((d) => d.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(root, d, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  throw new Error("no chromium binary found");
}

const problems = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) problems.push(name);
};

async function main() {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ["--use-angle=vulkan", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });

  // Start a run and hold the throttle for the whole test.
  await page.evaluate(() => {
    const g = window.__roadRush;
    g.screen = "select";
    g.selectedTerrain = 0;
  });
  await page.keyboard.press("Enter");
  await page.keyboard.down("KeyX");
  await page.waitForFunction(() => window.__roadRush.player.speed > 200, { timeout: 8000 });

  // Drop an actor directly in the player's path and wait for contact.
  const feed = (kind, size) =>
    page.evaluate(
      async ([k, w, h]) => {
        const g = window.__roadRush;
        const p = g.player;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        // Clear the road and wait until the car is actually driving again;
        // firing a hazard at a wreck mid-explosion measures nothing.
        g.traffic.actors.length = 0;
        for (let i = 0; i < 200 && p.state !== "driving"; i++) {
          p.immunity = 0;
          await sleep(16);
        }
        p.immunity = 0;
        // Leave headroom so a refill is visible instead of clipping at full.
        if (g.fuel > 60) g.fuel = 60;
        const before = {
          fuel: g.fuel, score: g.score, combo: g.combo,
          collected: g.fuelCarsCollected, crashes: g.crashes,
          distance: g.distance,
        };
        // Hazards are re-snapped to their lane centre every frame, so the lane
        // has to be the one the player is actually in — steering the car to a
        // lane centre is the reliable way to line the two up.
        const lanes = 4;
        const road = g.roadShape();
        const lane = Math.max(
          0,
          Math.min(lanes - 1, Math.floor(((p.x - road.left) / road.width) * lanes)),
        );
        const laneCentre = road.left + (road.width / lanes) * (lane + 0.5);
        p.x = laneCentre; // park the car dead centre of its lane
        g.traffic.actors.push({
          kind: k, distance: g.distance + 40, x: laneCentre, targetX: laneCentre,
          w, h, speed: 0, lane,
          committed: true, trackTime: 0, weavePhase: 0, passed: false, dead: false,
        });
        // Sample every animation frame: a 6-frame explosion can slip between
        // setTimeout ticks and make a working crash look like it never fired.
        const states = new Set();
        let stop = false;
        const watch = () => {
          states.add(p.state);
          if (!stop) requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
        for (let i = 0; i < 90; i++) await sleep(16);
        stop = true;
        return {
          before,
          after: {
            fuel: g.fuel, score: g.score, combo: g.combo,
            collected: g.fuelCarsCollected, crashes: g.crashes,
            distance: g.distance,
          },
          states: [...states],
        };
      },
      [kind, size[0], size[1]],
    );

  // Driving also scores 0.1/unit, so back that out to isolate the pickup award.
  const pickupPoints = (r) =>
    Math.round(r.after.score - r.before.score - (r.after.distance - r.before.distance) * 0.1);

  console.log("fuel cars");
  const f1 = await feed("fuel", [16, 24]);
  check("fuel car is collected", f1.after.collected > f1.before.collected);
  check("fuel car refills the tank", f1.after.fuel > f1.before.fuel,
    `${f1.before.fuel.toFixed(1)} -> ${f1.after.fuel.toFixed(1)}`);
  check("fuel car does not crash the player", f1.after.crashes === f1.before.crashes);
  check("first pickup scores 300", pickupPoints(f1) === 300, `+${pickupPoints(f1)}`);

  const f2 = await feed("fuel", [16, 24]);
  check("second pickup scores 500 (chain rising)", pickupPoints(f2) === 500, `+${pickupPoints(f2)}`);
  const f3 = await feed("fuel", [16, 24]);
  check("third pickup scores 1000", pickupPoints(f3) === 1000, `+${pickupPoints(f3)}`);

  console.log("hazards");
  const oil = await feed("oil", [20, 14]);
  check("oil sends the car into a spin", oil.states.includes("spinning"),
    oil.states.join(" -> "));

  const puddle = await feed("puddle", [20, 14]);
  check("puddle slows without crashing", puddle.after.crashes === puddle.before.crashes);

  const rock = await feed("rock", [16, 14]);
  check("boulder explodes the player", rock.states.includes("exploding"),
    rock.states.join(" -> "));
  check("crash resets the fuel chain", rock.after.combo === 0);
  check("crash costs fuel", rock.after.fuel < rock.before.fuel);

  console.log("mascot bonus");
  const mascot = await page.evaluate(async () => {
    const g = window.__roadRush;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    g.traffic.actors.length = 0;
    g.player.immunity = 999;               // stay crash-free
    const before = g.score;
    // Fast-forward to just before the crash-free bonus threshold.
    g.distance += 3000;
    for (let i = 0; i < 40; i++) await sleep(16);
    return { gained: g.score - before };
  });
  check("crash-free bonus awards points", mascot.gained >= 3000,
    `+${Math.round(mascot.gained)}`);

  await page.keyboard.up("KeyX");
  check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  await browser.close();
  if (problems.length) {
    console.error(`\n${problems.length} mechanic(s) failed`);
    process.exit(1);
  }
  console.log("\nall mechanics verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
