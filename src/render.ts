// Everything is painted at 256x240 into an offscreen canvas; Babylon puts that
// canvas on screen as a nearest-neighbour texture (see display.ts).

import { PLAYER_SCREEN_Y, RENDER_SCALE, VIEW_H, VIEW_W } from "./config";
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
    // The backing canvas is RENDER_SCALE times larger than the view, but every
    // draw call still works in view units: the transform below does the
    // conversion once, so no drawing code needs to know about the scale.
    this.canvas.width = VIEW_W * RENDER_SCALE;
    this.canvas.height = VIEW_H * RENDER_SCALE;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.ctx.scale(RENDER_SCALE, RENDER_SCALE);
    // Smoothing on: the artwork is now drawn above 1:1, so interpolation
    // helps it rather than blurring hand-placed pixels.
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
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

    // Road rows stay at view resolution. Sub-dividing them multiplied fillRect
    // calls by RENDER_SCALE and halved the frame rate, while buying nothing:
    // these are flat horizontal bands, so a finer vertical step cannot add
    // detail. Horizontal edges are already smooth, because the left/right
    // coordinates are fractional and the canvas is no longer quantised to
    // whole view units.
    const STEP = 1;

    // Ground: alternating horizontal bands so motion is readable even on grass.
    for (let y = 0; y < VIEW_H; y += STEP) {
      const d = playerDistance + (PLAYER_SCREEN_Y - y);
      ctx.fillStyle = Math.floor(d / 16) % 2 === 0 ? p.ground : p.groundAlt;
      ctx.fillRect(0, y, FIELD_W, STEP);
    }

    // Road surface + markings, row by row (the road curves, so per-row is
    // simplest and still cheap at this resolution).
    for (let y = 0; y < VIEW_H; y += STEP) {
      const d = playerDistance + (PLAYER_SCREEN_Y - y);
      const shape = roadAt(terrain, d);
      const left = this.fx(shape.left);
      const right = this.fx(shape.right);

      if (terrain.shoulder) {
        ctx.fillStyle = terrain.shoulder;
        ctx.fillRect(Math.max(0, left - 10 * scale), y, 10 * scale, STEP);
        ctx.fillRect(right, y, Math.min(FIELD_W - right, 10 * scale), STEP);
      }

      ctx.fillStyle = p.road;
      ctx.fillRect(left, y, right - left, STEP);

      // Edge stripes.
      ctx.fillStyle = p.roadEdge;
      ctx.fillRect(left, y, 2, STEP);
      ctx.fillRect(right - 2, y, 2, STEP);

      // Barrier: dashed colour blocks so speed reads at the edge of the road.
      const barrierOn = Math.floor(d / 12) % 2 === 0;
      ctx.fillStyle = barrierOn ? p.barrier : p.barrierAlt;
      ctx.fillRect(Math.max(0, left - 4), y, 4, STEP);
      ctx.fillRect(right, y, 4, STEP);

      // Lane dashes.
      if (Math.floor(d / 14) % 2 === 0) {
        ctx.fillStyle = p.laneMark;
        for (let l = 1; l < LANES; l++) {
          const lx = left + ((right - left) / LANES) * l;
          ctx.fillRect(lx - 1, y, 2, STEP);
        }
      }
    }

    this.drawScenery(terrain, playerDistance);
  }

  /** Roadside props, positioned deterministically from their course distance. */
  private drawScenery(terrain: Terrain, playerDistance: number): void {
    const spacing = 46;
    const first = Math.floor((playerDistance - 40) / spacing) * spacing;

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
        this.drawProp(kind, x, yy);
      }
    }
  }

  /** Soft ground shadow so a prop reads as standing on the ground. */
  private propShadow(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(x + w / 2 + 1.5, y + h - h * 0.12, w * 0.36, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Props are all sprites now, so no palette is needed: their colour comes
  // from the artwork rather than the terrain's palette.
  private drawProp(kind: string, x: number, y: number): void {
    const ctx = this.ctx;
    switch (kind) {
      // Both tree kinds use the generated canopy art. A soft elliptical shadow
      // sits under it so the prop reads as standing on the ground rather than
      // pasted onto it.
      case "tree":
      case "pine": {
        const s = this.sprites.tree;
        this.propShadow(x, y, s.w, s.h);
        ctx.drawImage(s.image, x, y, s.w, s.h);
        break;
      }
      case "palm": {
        const s = this.sprites.palm;
        this.propShadow(x, y, s.w, s.h);
        ctx.drawImage(s.image, x, y, s.w, s.h);
        break;
      }
      case "house": {
        const s = this.sprites.house;
        this.propShadow(x, y, s.w, s.h);
        ctx.drawImage(s.image, x, y, s.w, s.h);
        break;
      }
      case "girder": {
        const s = this.sprites.girder;
        ctx.drawImage(s.image, x, y, s.w, s.h);
        break;
      }
      case "rock": {
        const s = this.sprites.rock;
        this.propShadow(x, y, s.w, s.h);
        ctx.drawImage(s.image, x, y, s.w, s.h);
        break;
      }
      case "wave": {
        const s = this.sprites.wave;
        ctx.drawImage(s.image, x, y, s.w, s.h);
        break;
      }
    }
  }

  drawActor(a: Actor, playerDistance: number, flashFrame: number): void {
    const y = this.screenY(a.distance, playerDistance);
    if (y < -60 || y > VIEW_H + 60) return;
    const scale = FIELD_W / VIEW_W;
    const x = a.x * scale;
    let img;
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
    ctx.drawImage(img.image, x - img.w / 2, y - img.h / 2, img.w, img.h);
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
      ctx.drawImage(img.image, -img.w / 2, -img.h / 2, img.w, img.h);
      ctx.restore();
    } else {
      ctx.drawImage(img.image, px - img.w / 2, PLAYER_SCREEN_Y - img.h / 2, img.w, img.h);
    }
  }

  drawExplosion(x: number, frame: number): void {
    const img = this.sprites.explosion[Math.min(frame, this.sprites.explosion.length - 1)];
    const scale = FIELD_W / VIEW_W;
    this.ctx.drawImage(
      img.image,
      x * scale - img.w / 2,
      PLAYER_SCREEN_Y - img.h / 2,
      img.w,
      img.h,
    );
  }

  drawMascot(x: number, y: number): void {
    const img = this.sprites.mascot;
    this.ctx.drawImage(img.image, x - img.w / 2, y - img.h / 2, img.w, img.h);
  }

  /** Floating "+300" style popups. */
  drawPopup(text: string, x: number, y: number, color: string): void {
    drawText(this.ctx, text, Math.round(x - text.length * 2), Math.round(y), color);
  }
}
