// Capture the screenshots embedded in the README.
// Usage: node tools/docshots.mjs [outDir]

import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "docs/screenshots";
const URL = process.env.GAME_URL ?? "http://localhost:5173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const ROUTES = ["grassland", "bridge", "coast", "forest"];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ["--use-angle=vulkan", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  // Square viewport keeps the 256x240 field at a clean integer scale.
  const page = await browser.newPage({ viewport: { width: 768, height: 768 } });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });

  const shot = async (name) => {
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`  ${name}.png`);
  };

  await sleep(500);
  await shot("title");

  await page.keyboard.press("Enter");
  await sleep(500);
  await shot("route-select");

  // One action shot per route, far enough in that traffic is on screen.
  for (let i = 0; i < ROUTES.length; i++) {
    await page.evaluate((idx) => {
      const g = window.__roadRush;
      g.screen = "select";
      g.selectedTerrain = idx;
    }, i);
    await page.keyboard.press("Enter");
    await sleep(300);
    await page.keyboard.down("KeyX");
    await sleep(3000);
    await page.keyboard.up("KeyX");
    await sleep(150);
    await shot(`route-${ROUTES[i]}`);
  }

  // Build a believable score board rather than shipping an empty table.
  await page.evaluate(() => {
    const rows = [
      ["ALEX", 148300, 14820, "FOREST"],
      ["SAM", 121750, 12640, "COAST"],
      ["JORDAN", 98400, 10310, "BRIDGE"],
      ["RILEY", 76050, 8890, "FOREST"],
      ["CASEY", 61200, 7420, "GRASSLAND"],
      ["MORGAN", 44900, 6150, "COAST"],
      ["TAYLOR", 31700, 4980, "BRIDGE"],
      ["JAMIE", 22450, 3860, "GRASSLAND"],
      ["QUINN", 15300, 2940, "FOREST"],
      ["AVERY", 9850, 2110, "GRASSLAND"],
    ].map(([name, score, distance, terrain]) => ({
      name, score, distance, terrain, date: "2026-08-27",
    }));
    localStorage.setItem("roadrush.scores.v1", JSON.stringify(rows));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
  await page.evaluate(() => {
    window.__roadRush.screen = "scores";
  });
  await sleep(400);
  await shot("high-scores");

  // Game over, using the same populated board.
  await page.evaluate(() => {
    const g = window.__roadRush;
    g.screen = "select";
    g.selectedTerrain = 2;
  });
  await page.keyboard.press("Enter");
  await page.keyboard.down("KeyX");
  await sleep(2200);
  await page.evaluate(() => {
    window.__roadRush.fuel = 1;
  });
  await page.waitForFunction(() => window.__roadRush.screen === "gameover", { timeout: 12000 });
  await page.keyboard.up("KeyX");
  await sleep(300);
  await shot("game-over");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
