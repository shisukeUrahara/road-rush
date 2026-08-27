// HUD strip and all full-screen menus. Everything draws into the same 256x240
// context the world uses, so menus and gameplay share one pixel grid.

import { MAX_FUEL, VIEW_H, VIEW_W } from "./config";
import { drawText, drawTextCentered, textWidth } from "./font";
import { FIELD_W, HUD_W } from "./render";
import type { ScoreEntry } from "./scores";
import type { Terrain } from "./terrains";
import { TERRAINS } from "./terrains";

const HUD_X = FIELD_W;

function pad(n: number, len: number): string {
  return Math.max(0, Math.floor(n)).toString().padStart(len, "0");
}

export interface HudData {
  score: number;
  high: number;
  speed: number;
  fuel: number;
  distance: number;
  combo: number;
  terrain: Terrain;
  frame: number;
}

export function drawHud(ctx: CanvasRenderingContext2D, d: HudData): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(HUD_X, 0, HUD_W, VIEW_H);

  drawText(ctx, "1P", HUD_X + 6, 6, "#ffffff");
  drawText(ctx, pad(d.score, 7), HUD_X + 6, 16, "#ffffff");

  drawText(ctx, "TOP", HUD_X + 6, 30, "#f8d800");
  drawText(ctx, pad(d.high, 7), HUD_X + 6, 40, "#f8d800");

  // Speed, right-aligned above the km/h label.
  const spd = pad(d.speed, 3);
  drawText(ctx, spd, HUD_X + 6, 60, "#ff6060");
  drawText(ctx, "KM/H", HUD_X + 26, 60, "#ffffff");

  drawText(ctx, "M", HUD_X + 6, 74, "#3cbcfc");
  drawText(ctx, pad(d.distance, 6), HUD_X + 14, 74, "#3cbcfc");

  // Fuel gauge: box + vertical bar that turns red and flashes when low.
  const low = d.fuel < 25;
  const fuelColor = low ? (d.frame % 12 < 6 ? "#ff2020" : "#802020") : "#00e800";
  drawText(ctx, "FUEL", HUD_X + 6, 92, low && d.frame % 12 < 6 ? "#ff2020" : "#ffffff");
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.strokeRect(HUD_X + 6.5, 102.5, 14, 92);
  const pct = Math.max(0, Math.min(1, d.fuel / MAX_FUEL));
  const barH = Math.round(90 * pct);
  ctx.fillStyle = fuelColor;
  ctx.fillRect(HUD_X + 8, 103 + (90 - barH), 11, barH);

  drawText(ctx, pad(d.fuel, 3), HUD_X + 24, 104, "#ffffff");

  if (d.combo > 0) {
    drawText(ctx, "CHAIN", HUD_X + 24, 120, "#f878f8");
    drawText(ctx, pad(d.combo, 2), HUD_X + 32, 130, "#f878f8");
  }

  drawText(ctx, d.terrain.name.slice(0, 9), HUD_X + 4, 208, "#00e800");
  drawText(ctx, "Z X ARR", HUD_X + 4, 224, "#585858");
}

export function drawTitle(ctx: CanvasRenderingContext2D, frame: number, best: number): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Animated road-stripe backdrop.
  ctx.fillStyle = "#181818";
  ctx.fillRect(70, 0, 116, VIEW_H);
  ctx.fillStyle = "#303030";
  ctx.fillRect(70, 0, 3, VIEW_H);
  ctx.fillRect(183, 0, 3, VIEW_H);
  ctx.fillStyle = "#ffffff";
  for (let y = -20; y < VIEW_H; y += 28) {
    const yy = (y + ((frame * 2) % 28)) | 0;
    ctx.fillRect(126, yy, 3, 14);
  }

  drawTextCentered(ctx, "ROAD", VIEW_W / 2, 40, "#d82800", 4);
  drawTextCentered(ctx, "RUSH", VIEW_W / 2, 76, "#f8d800", 4);
  drawTextCentered(ctx, "AN INFINITE HIGHWAY RUN", VIEW_W / 2, 116, "#3cbcfc");

  if (frame % 40 < 26) {
    drawTextCentered(ctx, "PRESS ENTER TO START", VIEW_W / 2, 150, "#ffffff");
  }
  drawTextCentered(ctx, `BEST ${pad(best, 7)}`, VIEW_W / 2, 172, "#f8d800");
  drawTextCentered(ctx, "ARROWS STEER   X FAST   Z SLOW", VIEW_W / 2, 200, "#9c9c9c");
  drawTextCentered(ctx, "H HIGH SCORES", VIEW_W / 2, 214, "#9c9c9c");
}

export function drawTerrainSelect(
  ctx: CanvasRenderingContext2D,
  selected: number,
  frame: number,
): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextCentered(ctx, "SELECT ROUTE", VIEW_W / 2, 14, "#ffffff", 2);

  const cardH = 42;
  const top = 40;
  TERRAINS.forEach((t, i) => {
    const y = top + i * (cardH + 6);
    const on = i === selected;
    // Swatch of the terrain's own colours doubles as a preview.
    ctx.fillStyle = t.palette.ground;
    ctx.fillRect(10, y, 40, cardH);
    ctx.fillStyle = t.palette.road;
    ctx.fillRect(22, y, 16, cardH);
    ctx.fillStyle = t.palette.laneMark;
    for (let s = 4; s < cardH; s += 10) ctx.fillRect(29, y + s, 2, 5);
    ctx.fillStyle = t.palette.detail;
    ctx.fillRect(12, y + 6, 7, 7);
    ctx.fillRect(42, y + cardH - 16, 7, 7);

    ctx.strokeStyle = on ? (frame % 16 < 8 ? "#f8d800" : "#ffffff") : "#585858";
    ctx.strokeRect(9.5, y - 0.5, 41, cardH + 1);

    drawText(ctx, t.name, 60, y + 8, on ? "#f8d800" : "#ffffff");
    drawText(ctx, t.blurb, 60, y + 22, on ? "#ffffff" : "#787878");
    if (on) drawText(ctx, ">", 52, y + 8, "#f8d800");
  });

  drawTextCentered(ctx, "UP DOWN CHOOSE    ENTER GO", VIEW_W / 2, 226, "#9c9c9c");
}

export function drawPaused(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextCentered(ctx, "PAUSED", VIEW_W / 2, 100, "#ffffff", 3);
  drawTextCentered(ctx, "ENTER RESUME   ESC QUIT", VIEW_W / 2, 140, "#9c9c9c");
}

export interface GameOverData {
  score: number;
  distance: number;
  terrain: Terrain;
  fuelCars: number;
  best: number;
  qualified: boolean;
}

export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  d: GameOverData,
  frame: number,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextCentered(ctx, "OUT OF FUEL", VIEW_W / 2, 44, "#d82800", 3);

  drawTextCentered(ctx, `SCORE ${pad(d.score, 7)}`, VIEW_W / 2, 92, "#ffffff", 2);
  drawTextCentered(ctx, `DISTANCE ${pad(d.distance, 6)} M`, VIEW_W / 2, 118, "#3cbcfc");
  drawTextCentered(ctx, `FUEL CARS ${pad(d.fuelCars, 2)}`, VIEW_W / 2, 132, "#f878f8");
  drawTextCentered(ctx, `ROUTE ${d.terrain.name}`, VIEW_W / 2, 146, "#00e800");

  if (d.qualified) {
    if (frame % 30 < 20) {
      drawTextCentered(ctx, "NEW HIGH SCORE!", VIEW_W / 2, 174, "#f8d800", 2);
    }
    drawTextCentered(ctx, "PRESS ENTER TO SIGN IT", VIEW_W / 2, 202, "#ffffff");
  } else {
    drawTextCentered(ctx, `BEST ${pad(d.best, 7)}`, VIEW_W / 2, 178, "#f8d800");
    if (frame % 40 < 26) {
      drawTextCentered(ctx, "PRESS ENTER TO CONTINUE", VIEW_W / 2, 204, "#ffffff");
    }
  }
}

export function drawNameEntry(
  ctx: CanvasRenderingContext2D,
  name: string,
  score: number,
  frame: number,
): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextCentered(ctx, "ENTER YOUR NAME", VIEW_W / 2, 46, "#f8d800", 2);
  drawTextCentered(ctx, `SCORE ${pad(score, 7)}`, VIEW_W / 2, 74, "#ffffff");

  const shown = name.padEnd(1, "");
  const w = textWidth(shown) * 3;
  const x = VIEW_W / 2 - w / 2;
  drawText(ctx, shown, x, 112, "#ffffff", 3);
  if (frame % 20 < 12) {
    // Caret sits right after the last typed character.
    ctx.fillStyle = "#f8d800";
    ctx.fillRect(x + textWidth(name) * 3 + (name.length ? 3 : 0), 112, 10, 18);
  }

  drawTextCentered(ctx, "TYPE LETTERS   BACKSPACE FIX", VIEW_W / 2, 168, "#9c9c9c");
  drawTextCentered(ctx, "ENTER SAVE", VIEW_W / 2, 186, "#ffffff");
}

export function drawHighScores(
  ctx: CanvasRenderingContext2D,
  board: ScoreEntry[],
  highlight: number,
  frame: number,
): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextCentered(ctx, "TOP 10 DRIVERS", VIEW_W / 2, 12, "#f8d800", 2);

  drawText(ctx, "#", 12, 34, "#585858");
  drawText(ctx, "NAME", 26, 34, "#585858");
  drawText(ctx, "SCORE", 96, 34, "#585858");
  drawText(ctx, "M", 152, 34, "#585858");
  drawText(ctx, "ROUTE", 186, 34, "#585858");

  if (board.length === 0) {
    drawTextCentered(ctx, "NO RUNS YET", VIEW_W / 2, 110, "#787878");
  }

  board.forEach((e, i) => {
    const y = 48 + i * 16;
    const on = i === highlight;
    const color = on ? (frame % 16 < 8 ? "#f8d800" : "#ffffff") : i < 3 ? "#ffffff" : "#bcbcbc";
    drawText(ctx, `${i + 1}`.padStart(2, " "), 12, y, color);
    drawText(ctx, e.name.slice(0, 8), 26, y, color);
    drawText(ctx, pad(e.score, 7), 96, y, color);
    drawText(ctx, pad(e.distance, 5), 152, y, color);
    drawText(ctx, e.terrain.slice(0, 5), 186, y, color);
  });

  drawTextCentered(ctx, "ENTER RETURN TO TITLE", VIEW_W / 2, 226, "#9c9c9c");
}
