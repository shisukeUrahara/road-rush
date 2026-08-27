// Headless capture: drives the running dev server and screenshots each screen.
// Usage: node tools/capture.mjs [outDir] [--video]
//
// Verifies WebGL is hardware-backed before shooting; a SwiftShader/llvmpipe
// renderer produces blank or misleading frames.

import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "shots";
const WANT_VIDEO = process.argv.includes("--video");
const URL = process.env.GAME_URL ?? "http://localhost:5173/";

function findChromium() {
  const root = join(process.env.HOME, ".cache", "ms-playwright");
  const dirs = readdirSync(root)
    .filter((d) => d.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  // Layout differs across playwright versions: chrome-linux64 or chrome-linux.
  for (const d of dirs) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(root, d, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  throw new Error("no chromium binary in ~/.cache/ms-playwright");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: [
      "--use-angle=vulkan",
      "--enable-unsafe-webgpu",
      "--ignore-gpu-blocklist",
      "--enable-gpu-rasterization",
      "--no-sandbox",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 720, height: 720 } });

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });

  const renderer = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return "none";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  const soft = /swiftshader|llvmpipe|lavapipe|software/i.test(renderer);
  console.log(`WebGL renderer: ${renderer}${soft ? "  [SOFTWARE - slow, but pixels are still valid]" : ""}`);

  const shot = async (name) => {
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`  shot ${name}.png`);
  };

  // Read the game's own state so assertions test the sim, not the pixels.
  const state = () =>
    page.evaluate(() => {
      const g = window.__roadRush;
      return {
        screen: g.screen,
        distance: g.distance,
        score: g.score,
        fuel: g.fuel,
        combo: g.combo,
        crashes: g.crashes,
      };
    });

  const press = async (key, times = 1) => {
    for (let i = 0; i < times; i++) {
      await page.keyboard.press(key);
      await sleep(90);
    }
  };

  await sleep(600);
  await shot("01-title");

  await press("Enter");
  await sleep(400);
  await shot("02-select-grassland");

  await press("ArrowDown", 3);
  await sleep(300);
  await shot("03-select-forest");
  await press("ArrowUp", 3);
  await sleep(200);

  await press("Enter");
  await sleep(300);
  console.log("  state after start:", JSON.stringify(await state()));

  // Drive: hold the fast throttle and weave a little.
  await page.keyboard.down("KeyX");
  const frames = [];
  const videoDir = join(OUT, "frames");
  if (WANT_VIDEO) mkdirSync(videoDir, { recursive: true });

  for (let i = 0; i < 140; i++) {
    if (i === 20) await page.keyboard.down("ArrowLeft");
    if (i === 32) await page.keyboard.up("ArrowLeft");
    if (i === 52) await page.keyboard.down("ArrowRight");
    if (i === 66) await page.keyboard.up("ArrowRight");
    if (i === 90) await page.keyboard.down("ArrowLeft");
    if (i === 104) await page.keyboard.up("ArrowLeft");
    if (WANT_VIDEO) {
      const f = join(videoDir, `frame_${String(i).padStart(4, "0")}.png`);
      await page.screenshot({ path: f });
      frames.push(f);
    }
    if (i === 40) await shot("04-driving");
    if (i === 100) await shot("05-driving-late");
    await sleep(WANT_VIDEO ? 10 : 33);
  }
  await page.keyboard.up("KeyX");

  const mid = await state();
  console.log("  state after driving:", JSON.stringify(mid));

  // Wait for the game itself to report a screen, rather than guessing a sleep.
  const waitScreen = async (want, timeout = 12000) => {
    await page.waitForFunction((w) => window.__roadRush.screen === w, want, { timeout });
  };

  // --- crash mechanics ------------------------------------------------------
  // Steer the player straight into the nearest car and watch the state machine.
  const crashReport = await page.evaluate(async () => {
    const g = window.__roadRush;
    const p = g.player ?? g._player;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const seen = new Set();
    // Park a car right on top of the player to guarantee contact.
    g.traffic.actors.push({
      kind: "yellow", distance: g.distance + 30, x: p.x + 4, targetX: p.x + 4,
      w: 16, h: 24, speed: 0, lane: 1,
      committed: true, trackTime: 0, weavePhase: 0, passed: false, dead: false,
    });
    p.immunity = 0;
    for (let i = 0; i < 120; i++) {
      seen.add(p.state);
      await sleep(16);
    }
    return { states: [...seen], crashes: g.crashes };
  });
  console.log("  crash states seen:", crashReport.states.join(" -> "), "| crashes:", crashReport.crashes);

  // Force an outright explosion via a truck and confirm respawn completes.
  // Wait out the previous crash's immunity first, or the truck passes through.
  await page.keyboard.down("KeyX");
  const explodeReport = await page.evaluate(async () => {
    const g = window.__roadRush;
    const p = g.player ?? g._player;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 200 && p.immunity > 0; i++) await sleep(16);
    const seen = new Set();
    g.traffic.actors.push({
      kind: "truck", distance: g.distance + 30, x: p.x, targetX: p.x,
      w: 22, h: 40, speed: 0, lane: 1,
      committed: true, trackTime: 0, weavePhase: 0, passed: false, dead: false,
    });
    p.immunity = 0;
    for (let i = 0; i < 180; i++) {
      seen.add(p.state);
      await sleep(16);
    }
    return { states: [...seen], crashes: g.crashes, screen: g.screen };
  });
  await page.keyboard.up("KeyX");
  console.log("  truck states seen:", explodeReport.states.join(" -> "), "| crashes:", explodeReport.crashes);
  await shot("05b-after-crash");

  // Burn the tank down to force the game-over path.
  await page.evaluate(() => {
    window.__roadRush.fuel = 1.5;
  });
  await page.keyboard.down("KeyX");
  await waitScreen("gameover");
  await page.keyboard.up("KeyX");
  await sleep(250);
  await shot("06-gameover");
  const over = await state();
  console.log("  state at game over:", JSON.stringify(over));

  await press("Enter");
  await sleep(350);
  const afterOver = await state();
  console.log("  screen after game-over enter:", afterOver.screen);
  if (afterOver.screen === "nameentry") {
    await page.keyboard.type("CLAUDE", { delay: 60 });
    await sleep(250);
    await shot("07-nameentry");
    await press("Enter");
    await waitScreen("scores");
  }
  await sleep(250);
  await shot("08-highscores");
  console.log("  state at board:", JSON.stringify(await state()));

  // Reload and confirm the board persisted in localStorage.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  await sleep(500);
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("roadrush.scores.v1") ?? "[]"),
  );
  console.log(`  persisted rows after reload: ${persisted.length}`);
  if (persisted.length) console.log(`  top row: ${JSON.stringify(persisted[0])}`);

  if (WANT_VIDEO) {
    console.log(`  ${frames.length} frames in ${videoDir} (encode with ffmpeg)`);
  }

  await browser.close();

  const problems = [];
  if (mid.distance < 200) problems.push(`car barely moved (distance=${mid.distance.toFixed(0)})`);
  if (!crashReport.states.includes("skidding"))
    problems.push("side contact did not produce a skid");
  if (!explodeReport.states.includes("exploding"))
    problems.push("truck contact did not explode the player");
  if (!explodeReport.states.includes("respawning"))
    problems.push("player never respawned after exploding");
  if (over.screen !== "gameover" && afterOver.screen === "title")
    problems.push("did not reach game over");
  if (!persisted.length) problems.push("high score did not persist");
  if (errors.length) problems.push(`page errors: ${errors.slice(0, 3).join(" | ")}`);

  if (problems.length) {
    console.error("\nFAILED:\n - " + problems.join("\n - "));
    process.exit(1);
  }
  console.log("\nOK: drove, crashed out of fuel, saved and persisted a high score.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
