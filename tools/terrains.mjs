// Screenshot each route mid-drive so the four palettes can be compared.
// Usage: node tools/terrains.mjs [outDir]

import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "shots/terrains";
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
  const page = await browser.newPage({ viewport: { width: 720, height: 720 } });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });

  for (let i = 0; i < ROUTES.length; i++) {
    // Drop onto the route-select screen with the wanted row already highlighted,
    // then confirm it the way a player would.
    await page.evaluate((idx) => {
      const g = window.__roadRush;
      g.screen = "select";
      g.selectedTerrain = idx;
    }, i);
    await page.keyboard.press("Enter");
    await sleep(400);

    await page.keyboard.down("KeyX");
    await sleep(2600); // drive far enough that traffic is on screen
    await page.keyboard.up("KeyX");
    await sleep(120);

    const st = await page.evaluate(() => ({
      route: window.__roadRush.terrain?.name ?? "?",
      distance: Math.round(window.__roadRush.distance),
      cars: window.__roadRush.traffic.actors.length,
    }));
    const name = `${String(i + 1).padStart(2, "0")}-${ROUTES[i]}`;
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`  ${name}.png  route=${st.route} dist=${st.distance}m actors=${st.cars}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
