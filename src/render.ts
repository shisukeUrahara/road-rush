// Everything is painted at 256x240 into an offscreen canvas; Babylon puts that
// canvas on screen as a nearest-neighbour texture (see display.ts).

import { PLAYER_SCREEN_Y, VIEW_H, VIEW_W } from "./config";
import { LANES, roadAt } from "./road";
import type { Terrain } from "./terrains";
import type { Actor } from "./traffic";
import type { SpriteSheet } from "./sprites";
import { drawText } from "./font";

export const HUD_W = 64;
/** The drivable viewport is everything left of the HUD strip. */
export const FIELD_W = VIEW_W - HUD_W;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(private sprites: SpriteSheet) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  clear(color = "#000000"): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /** Convert a course distance to a screen row. */
  screenY(distance: number, playerDistance: number): number {
    return PLAYER_SCREEN_Y - (distance - playerDistance);
  }

  /** Field x is the same as world x, but shifted so the road sits left of HUD. */
  private fx(x: number): number {
    return x * (FIELD_W / VIEW_W);
  }

  drawWorld(terrain: Terrain, playerDistance: number): void {
    const ctx = this.ctx;
    const p = terrain.palette;
    const scale = FIELD_W / VIEW_W;

    // Ground: alternating horizontal bands so motion is readable even on grass.
    for (let y = 0; y < VIEW_H; y++) {
      const d = playerDistance + (PLAYER_SCREEN_Y - y);
      ctx.fillStyle = Math.floor(d / 16) % 2 === 0 ? p.ground : p.groundAlt;
      ctx.fillRect(0, y, FIELD_W, 1);
    }

    // Road surface + markings, row by row (the road curves, so per-row is
    // simplest and still cheap at this resolution).
    for (let y = 0; y < VIEW_H; y++) {
      const d = playerDistance + (PLAYER_SCREEN_Y - y);
      const shape = roadAt(terrain, d);
      const left = this.fx(shape.left);
      const right = this.fx(shape.right);

      if (terrain.shoulder) {
        ctx.fillStyle = terrain.shoulder;
        ctx.fillRect(Math.max(0, left - 10 * scale), y, 10 * scale, 1);
        ctx.fillRect(right, y, Math.min(FIELD_W - right, 10 * scale), 1);
      }

      ctx.fillStyle = p.road;
      ctx.fillRect(left, y, right - left, 1);

      // Edge stripes.
      ctx.fillStyle = p.roadEdge;
      ctx.fillRect(left, y, 2, 1);
      ctx.fillRect(right - 2, y, 2, 1);

      // Barrier: dashed colour blocks so speed reads at the edge of the road.
      const barrierOn = Math.floor(d / 12) % 2 === 0;
      ctx.fillStyle = barrierOn ? p.barrier : p.barrierAlt;
      ctx.fillRect(Math.max(0, left - 4), y, 4, 1);
      ctx.fillRect(right, y, 4, 1);

      // Lane dashes.
      if (Math.floor(d / 14) % 2 === 0) {
        ctx.fillStyle = p.laneMark;
        for (let l = 1; l < LANES; l++) {
          const lx = left + ((right - left) / LANES) * l;
          ctx.fillRect(lx - 1, y, 2, 1);
        }
      }
    }

    this.drawScenery(terrain, playerDistance);
  }

  /** Roadside props, positioned deterministically from their course distance. */
  private drawScenery(terrain: Terrain, playerDistance: number): void {
    const p = terrain.palette;
    const spacing = 46;
    const first = Math.floor((playerDistance - 40) / spacing) * spacing;
    const scale = FIELD_W / VIEW_W;

    for (let d = first; d < playerDistance + VIEW_H + 60; d += spacing) {
      const y = this.screenY(d, playerDistance);
      if (y < -40 || y > VIEW_H + 40) continue;
      const shape = roadAt(terrain, d);
      const kind = terrain.scenery[Math.abs(Math.floor(d / spacing)) % terrain.scenery.length];
      const leftX = this.fx(shape.left) - 26;
      const rightX = this.fx(shape.right) + 10;
      for (const [x, side] of [
        [leftX, -1],
        [rightX, 1],
      ] as const) {
        if (x < -20 || x > FIELD_W + 4) continue;
        // Stagger the two sides so they don't look like a mirrored corridor.
        const yy = y + (side > 0 ? spacing / 2 : 0);
        if (yy < -40 || yy > VIEW_H + 40) continue;
        this.drawProp(kind, x, yy, p, scale);
      }
    }
  }

  private drawProp(
    kind: string,
    x: number,
    y: number,
    p: Terrain["palette"],
    _scale: number,
  ): void {
    const ctx = this.ctx;
    switch (kind) {
      case "tree":
        // Drop shadow first, canopy over it: seen from above, the shadow falls
        // toward the bottom of the screen.
        ctx.fillStyle = "#000000";
        ctx.fillRect(x + 4, y + 8, 10, 10);
        ctx.fillStyle = p.detail;
        ctx.fillRect(x + 2, y + 1, 12, 12);
        ctx.fillRect(x, y + 4, 16, 6);
        ctx.fillStyle = "#00e800";
        ctx.fillRect(x + 4, y + 3, 5, 4);
        break;
      case "pine":
        ctx.fillStyle = "#000000";
        ctx.fillRect(x + 5, y + 12, 10, 9);
        ctx.fillStyle = p.detail;
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 6 - i * 2, y + 1 + i * 4, 4 + i * 4, 5);
        break;
      case "palm":
        ctx.fillStyle = p.detail;
        ctx.fillRect(x + 1, y + 3, 15, 4);
        ctx.fillRect(x + 4, y, 9, 4);
        ctx.fillRect(x, y + 6, 5, 3);
        ctx.fillRect(x + 12, y + 6, 5, 3);
        ctx.fillStyle = "#503000";
        ctx.fillRect(x + 7, y + 7, 3, 15);
        break;
      case "house":
        ctx.fillStyle = "#000000";
        ctx.fillRect(x - 1, y - 1, 20, 20);
        ctx.fillStyle = p.detailAlt;
        ctx.fillRect(x, y, 18, 18);
        ctx.fillStyle = "#d82800";
        ctx.fillRect(x, y, 18, 6);
        ctx.fillStyle = "#000000";
        ctx.fillRect(x + 12, y + 8, 5, 8);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + 3, y + 9, 5, 5);
        break;
      case "girder":
        ctx.fillStyle = "#000000";
        ctx.fillRect(x + 2, y, 14, 22);
        ctx.fillStyle = p.detailAlt;
        ctx.fillRect(x + 4, y + 2, 10, 18);
        ctx.fillStyle = "#787878";
        ctx.fillRect(x + 6, y + 4, 6, 14);
        break;
      case "rock":
        ctx.fillStyle = "#000000";
        ctx.fillRect(x + 2, y + 4, 14, 12);
        ctx.fillStyle = "#9c9c9c";
        ctx.fillRect(x + 3, y + 5, 12, 10);
        ctx.fillStyle = "#585858";
        ctx.fillRect(x + 5, y + 7, 6, 5);
        break;
      case "wave":
        ctx.fillStyle = p.detail;
        ctx.fillRect(x, y + 6, 16, 3);
        ctx.fillRect(x + 4, y + 11, 12, 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + 2, y + 6, 6, 1);
        break;
    }
  }

  drawActor(a: Actor, playerDistance: number, flashFrame: number): void {
    const y = this.screenY(a.distance, playerDistance);
    if (y < -60 || y > VIEW_H + 60) return;
    const scale = FIELD_W / VIEW_W;
    const x = a.x * scale;
    let img: HTMLCanvasElement;
    switch (a.kind) {
      case "yellow":
        img = this.sprites.yellow;
        break;
      case "red":
        img = this.sprites.red;
        break;
      case "blueDelayed":
      case "blueWeaver":
        img = this.sprites.blue;
        break;
      case "blueAggressive":
        img = this.sprites.cyan;
        break;
      case "truck":
        img = this.sprites.truck;
        break;
      case "fuel":
        img = this.sprites.fuel;
        break;
      case "oil":
        img = this.sprites.oil;
        break;
      case "puddle":
        img = this.sprites.puddle;
        break;
      case "rock":
        img = this.sprites.rock;
        break;
    }
    const ctx = this.ctx;
    if (a.kind === "fuel") {
      // Flash so the pickup is unmistakable.
      ctx.globalAlpha = flashFrame % 8 < 4 ? 1 : 0.65;
    }
    ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
    ctx.globalAlpha = 1;
  }

  drawPlayer(x: number, lean: number, spin: number, immune: boolean, frame: number): void {
    if (immune && frame % 8 < 4) return; // blink during respawn immunity
    const scale = FIELD_W / VIEW_W;
    const img =
      lean < 0 ? this.sprites.playerLeft : lean > 0 ? this.sprites.playerRight : this.sprites.player;
    const ctx = this.ctx;
    const px = x * scale;
    if (spin !== 0) {
      ctx.save();
      ctx.translate(px, PLAYER_SCREEN_Y);
      ctx.rotate(spin);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    } else {
      ctx.drawImage(img, Math.round(px - img.width / 2), Math.round(PLAYER_SCREEN_Y - img.height / 2));
    }
  }

  drawExplosion(x: number, frame: number): void {
    const img = this.sprites.explosion[Math.min(frame, this.sprites.explosion.length - 1)];
    const scale = FIELD_W / VIEW_W;
    this.ctx.drawImage(
      img,
      Math.round(x * scale - img.width / 2),
      Math.round(PLAYER_SCREEN_Y - img.height / 2),
    );
  }

  drawMascot(x: number, y: number): void {
    const img = this.sprites.mascot;
    this.ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
  }

  /** Floating "+300" style popups. */
  drawPopup(text: string, x: number, y: number, color: string): void {
    drawText(this.ctx, text, Math.round(x - text.length * 2), Math.round(y), color);
  }
}
