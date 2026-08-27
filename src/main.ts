import { Display } from "./display";
import { Game } from "./game";
import { GameAudio } from "./audio";
import { Input } from "./input";
import { Renderer } from "./render";
import { buildSprites } from "./sprites";

const STEP = 1 / 60;
const MAX_CATCHUP = 0.25;

function boot(): void {
  const host = document.getElementById("game") as HTMLCanvasElement | null;
  if (!host) throw new Error("#game canvas missing");

  const renderer = new Renderer(buildSprites());
  const input = new Input(host);
  const audio = new GameAudio();
  const game = new Game(renderer, input, audio);
  const display = new Display(host, renderer.canvas);

  host.focus();
  // Audio can only start from a gesture, so arm it on the first interaction.
  const arm = (): void => audio.resume();
  window.addEventListener("keydown", arm, { once: true });
  window.addEventListener("pointerdown", arm, { once: true });

  let previous = performance.now();
  let accumulator = 0;

  display.engine.runRenderLoop(() => {
    const now = performance.now();
    accumulator += Math.min((now - previous) / 1000, MAX_CATCHUP);
    previous = now;
    while (accumulator >= STEP) {
      game.update(STEP);
      accumulator -= STEP;
    }
    game.render();
    display.present();
  });

  // Expose a handle for the headless capture script to read state.
  (window as unknown as Record<string, unknown>).__roadRush = game;
  (window as unknown as Record<string, unknown>).__ready = true;
}

boot();
