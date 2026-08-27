// The run itself: fixed-timestep simulation, scoring, fuel, and the state
// machine that moves between title, route select, play, and the score board.

import {
  FUEL_BURN_IDLE,
  FUEL_BURN_MAX,
  FUEL_COMBO_SCORES,
  FUEL_CRASH_PENALTY,
  FUEL_PICKUP,
  HIGH_MAX,
  MASCOT_BONUS,
  MASCOT_INTERVAL,
  MAX_FUEL,
  MAX_NAME_LEN,
  MAX_SCROLL,
  PLAYER_SCREEN_Y,
  SCORE_PASS_CAR,
  SCORE_PASS_TRUCK,
  SCORE_PER_METER,
  VIEW_H,
  VIEW_W,
} from "./config";
import { actorBox, overlaps, playerBox, resolve } from "./collide";
import { GameAudio } from "./audio";
import type { Input } from "./input";
import { Player } from "./player";
import { LANES, laneX, roadAt } from "./road";
import { FIELD_W, Renderer } from "./render";
import { loadScores, qualifies, saveScore, type ScoreEntry } from "./scores";
import { TERRAINS, type Terrain } from "./terrains";
import { difficultyAt, isVehicle, TrafficSystem } from "./traffic";
import {
  drawGameOver,
  drawHighScores,
  drawHud,
  drawNameEntry,
  drawPaused,
  drawTerrainSelect,
  drawTitle,
} from "./hud";

export type Screen =
  | "title"
  | "select"
  | "playing"
  | "paused"
  | "gameover"
  | "nameentry"
  | "scores";

interface Popup {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

/** km/h -> world units per second. */
const SPEED_TO_UNITS = MAX_SCROLL / HIGH_MAX;

export class Game {
  screen: Screen = "title";
  frame = 0;

  // Public so the headless capture harness can drive and inspect a run.
  readonly player = new Player();
  traffic: TrafficSystem;
  terrain: Terrain = TERRAINS[0];
  selectedTerrain = 0;

  distance = 0;
  score = 0;
  fuel = MAX_FUEL;
  combo = 0;
  fuelCarsCollected = 0;
  crashes = 0;
  private crashFreeSince = 0;
  private mascot: { x: number; y: number; life: number } | null = null;
  private popups: Popup[] = [];
  private nameBuffer = "";
  private board: ScoreEntry[] = [];
  private highlightRank = -1;
  private pendingQualify = false;

  constructor(
    private renderer: Renderer,
    private input: Input,
    private audio: GameAudio,
  ) {
    this.traffic = new TrafficSystem(this.terrain, 1, 0);
    this.board = loadScores();
  }

  private get best(): number {
    return this.board.length ? this.board[0].score : 0;
  }

  /** Road edges at the player's position — used by the headless test harness. */
  roadShape() {
    return roadAt(this.terrain, this.distance);
  }

  startRun(terrain: Terrain): void {
    this.terrain = terrain;
    this.distance = 0;
    this.score = 0;
    this.fuel = MAX_FUEL;
    this.combo = 0;
    this.fuelCarsCollected = 0;
    this.crashes = 0;
    this.crashFreeSince = 0;
    this.mascot = null;
    this.popups.length = 0;
    const shape = roadAt(terrain, 0);
    this.player.reset(shape.centerX);
    // Seed from the clock so consecutive runs on one route still differ, while
    // any single run stays internally deterministic.
    this.traffic = new TrafficSystem(terrain, (Date.now() & 0xffff) | 1, 0);
    this.traffic.spawnAhead(0, VIEW_H * 3, difficultyAt(terrain, 0));
    this.audio.startEngine();
    this.screen = "playing";
  }

  /** One fixed 1/60s step. */
  update(dt: number): void {
    this.frame++;
    switch (this.screen) {
      case "title":
        this.updateTitle();
        break;
      case "select":
        this.updateSelect();
        break;
      case "playing":
        this.updatePlaying(dt);
        break;
      case "paused":
        this.updatePaused();
        break;
      case "gameover":
        this.updateGameOver();
        break;
      case "nameentry":
        this.updateNameEntry();
        break;
      case "scores":
        this.updateScores();
        break;
    }
  }

  private updateTitle(): void {
    for (const k of this.input.drainMenu()) {
      if (k === "confirm") {
        this.audio.resume();
        this.audio.select();
        this.screen = "select";
      }
    }
    // "H" jumps straight to the board.
    const typed = this.input.drainTyped();
    if (typed.text.toLowerCase().includes("h")) {
      this.board = loadScores();
      this.highlightRank = -1;
      this.screen = "scores";
    }
  }

  private updateSelect(): void {
    for (const k of this.input.drainMenu()) {
      if (k === "up") {
        this.selectedTerrain = (this.selectedTerrain + TERRAINS.length - 1) % TERRAINS.length;
        this.audio.select();
      } else if (k === "down") {
        this.selectedTerrain = (this.selectedTerrain + 1) % TERRAINS.length;
        this.audio.select();
      } else if (k === "confirm") {
        this.audio.resume();
        this.audio.confirm();
        this.startRun(TERRAINS[this.selectedTerrain]);
      } else if (k === "back") {
        this.screen = "title";
      }
    }
    this.input.drainTyped();
  }

  private updatePaused(): void {
    for (const k of this.input.drainMenu()) {
      if (k === "confirm") this.screen = "playing";
      else if (k === "back") {
        this.audio.stopEngine();
        this.endRun();
      }
    }
    this.input.drainTyped();
  }

  private updatePlaying(dt: number): void {
    for (const k of this.input.drainMenu()) {
      if (k === "back") {
        this.screen = "paused";
        return;
      }
    }
    this.input.drainTyped();

    const held = this.input.held();
    const shape = roadAt(this.terrain, this.distance);
    const outcome = this.player.update(dt, held, shape.left, shape.right);

    if (outcome === "hitBarrier") this.registerCrash();
    if (outcome === "respawn") this.respawn();

    // --- world scroll -------------------------------------------------------
    const moved = this.player.speed * SPEED_TO_UNITS * dt;
    this.distance += moved;
    this.score += moved * SCORE_PER_METER * 0.1;

    const diff = difficultyAt(this.terrain, this.distance);
    this.traffic.spawnAhead(this.distance, VIEW_H * 3, diff);
    this.traffic.update(dt, this.distance, this.player.x, diff, SPEED_TO_UNITS, );

    // --- fuel ---------------------------------------------------------------
    if (!this.player.crashed) {
      const ratio = Math.min(1, this.player.speed / HIGH_MAX);
      const burn = (FUEL_BURN_IDLE + (FUEL_BURN_MAX - FUEL_BURN_IDLE) * ratio) *
        diff.fuelBurnMultiplier;
      this.fuel = Math.max(0, this.fuel - burn * dt);
    }
    if (this.fuel < 25 && this.fuel > 0) this.audio.lowFuelTick(this.frame / 60);
    if (this.fuel <= 0) {
      this.audio.stopEngine();
      this.audio.gameOver();
      this.endRun();
      return;
    }

    this.checkCollisions();
    this.checkPasses();
    this.checkMascot(dt);

    for (const p of this.popups) {
      p.life -= dt;
      p.y -= 22 * dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);

    this.audio.updateEngine(this.player.speed, this.player.state === "skidding");
  }

  private checkCollisions(): void {
    if (this.player.immunity > 0 || this.player.crashed) return;
    const pbox = playerBox(this.player.x, this.distance);
    for (const a of this.traffic.actors) {
      if (a.dead) continue;
      if (!overlaps(pbox, actorBox(a))) continue;

      const r = resolve(a, this.player.x);
      switch (r.type) {
        case "fuel": {
          a.dead = true;
          this.collectFuel();
          break;
        }
        case "explode":
          a.dead = a.kind === "rock";
          this.player.explode();
          this.audio.explode();
          this.registerCrash();
          return;
        case "spin":
          a.dead = true;
          this.player.beginSpin(r.dir);
          this.audio.skid();
          break;
        case "slow":
          a.dead = true;
          this.player.slowFromPuddle();
          this.audio.bump();
          break;
        case "skid":
          this.player.beginSkid(r.dir, r.strength);
          if (this.player.state === "exploding") {
            this.audio.explode();
            this.registerCrash();
            return;
          }
          this.audio.skid();
          // Nudge the other car away so we aren't stuck inside it.
          a.x += -r.dir * 6;
          break;
        case "none":
          break;
      }
    }
  }

  private collectFuel(): void {
    this.fuel = Math.min(MAX_FUEL, this.fuel + FUEL_PICKUP);
    const idx = Math.min(this.combo, FUEL_COMBO_SCORES.length - 1);
    const pts = FUEL_COMBO_SCORES[idx];
    this.score += pts;
    this.combo++;
    this.fuelCarsCollected++;
    this.audio.fuel(this.combo);
    this.popups.push({
      text: `+${pts}`,
      x: this.player.x * (FIELD_W / VIEW_W),
      y: PLAYER_SCREEN_Y - 20,
      life: 1.1,
      color: "#f8d800",
    });
  }

  /** Award points once per car the player gets past, and drop missed fuel. */
  private checkPasses(): void {
    for (const a of this.traffic.actors) {
      if (a.passed || a.dead) continue;
      if (a.distance > this.distance - 6) continue;
      a.passed = true;
      if (a.kind === "truck") {
        this.score += SCORE_PASS_TRUCK;
        this.audio.pass();
      } else if (isVehicle(a.kind)) {
        this.score += SCORE_PASS_CAR;
        this.audio.pass();
      } else if (a.kind === "fuel") {
        // Missing a fuel car breaks the chain, same as the arcade.
        this.combo = 0;
      }
    }
  }

  private checkMascot(dt: number): void {
    if (this.mascot) {
      this.mascot.life -= dt;
      this.mascot.y += 26 * dt;
      this.mascot.x += 18 * dt;
      if (this.mascot.life <= 0) this.mascot = null;
      return;
    }
    if (this.distance - this.crashFreeSince < MASCOT_INTERVAL) return;
    this.crashFreeSince = this.distance;
    this.score += MASCOT_BONUS;
    this.audio.mascot();
    this.mascot = { x: 12, y: -20, life: 3.2 };
    this.popups.push({
      text: `+${MASCOT_BONUS}`,
      x: 40,
      y: 60,
      life: 1.6,
      color: "#3cbcfc",
    });
  }

  private registerCrash(): void {
    this.crashes++;
    this.combo = 0;
    this.crashFreeSince = this.distance;
    this.fuel = Math.max(0, this.fuel - FUEL_CRASH_PENALTY);
  }

  /** Put the player back on a clear stretch of road after a wreck. */
  private respawn(): void {
    const shape = roadAt(this.terrain, this.distance);
    this.traffic.clearNear(this.distance, 220);
    // Pick the lane whose center is furthest from anything still on screen.
    let bestX = shape.centerX;
    let bestGap = -1;
    for (let l = 0; l < LANES; l++) {
      const x = laneX(shape, l, LANES);
      let nearest = 9999;
      for (const a of this.traffic.actors) {
        if (a.distance < this.distance || a.distance > this.distance + 260) continue;
        nearest = Math.min(nearest, Math.abs(a.x - x));
      }
      if (nearest > bestGap) {
        bestGap = nearest;
        bestX = x;
      }
    }
    this.player.x = bestX;
    this.audio.startEngine();
  }

  private endRun(): void {
    this.score = Math.floor(this.score);
    this.board = loadScores();
    this.pendingQualify = qualifies(this.score, this.board);
    this.nameBuffer = "";
    this.highlightRank = -1;
    this.screen = "gameover";
  }

  private updateGameOver(): void {
    this.input.drainTyped();
    for (const k of this.input.drainMenu()) {
      if (k === "confirm") {
        if (this.pendingQualify) {
          this.screen = "nameentry";
        } else {
          this.board = loadScores();
          this.screen = "scores";
        }
        return;
      }
    }
  }

  private updateNameEntry(): void {
    const typed = this.input.drainTyped();
    for (let i = 0; i < typed.backspaces; i++) {
      this.nameBuffer = this.nameBuffer.slice(0, -1);
    }
    for (const ch of typed.text) {
      if (this.nameBuffer.length >= MAX_NAME_LEN) break;
      if (/[A-Za-z0-9 .\-]/.test(ch)) this.nameBuffer += ch.toUpperCase();
    }
    for (const k of this.input.drainMenu()) {
      if (k === "confirm") {
        const saved = saveScore({
          name: this.nameBuffer.trim() || "PLAYER",
          score: this.score,
          distance: Math.floor(this.distance),
          terrain: this.terrain.name,
          date: new Date().toISOString().slice(0, 10),
        });
        this.board = saved.board;
        this.highlightRank = saved.rank;
        this.audio.confirm();
        this.screen = "scores";
        return;
      }
    }
  }

  private updateScores(): void {
    this.input.drainTyped();
    for (const k of this.input.drainMenu()) {
      if (k === "confirm" || k === "back") {
        this.screen = "title";
        return;
      }
    }
  }

  // --------------------------------------------------------------- rendering
  render(): void {
    const ctx = this.renderer.ctx;
    switch (this.screen) {
      case "title":
        drawTitle(ctx, this.frame, this.best);
        return;
      case "select":
        drawTerrainSelect(ctx, this.selectedTerrain, this.frame);
        return;
      case "nameentry":
        drawNameEntry(ctx, this.nameBuffer, this.score, this.frame);
        return;
      case "scores":
        drawHighScores(ctx, this.board, this.highlightRank, this.frame);
        return;
      case "playing":
      case "paused":
      case "gameover":
        this.renderField();
        if (this.screen === "paused") drawPaused(ctx);
        if (this.screen === "gameover") {
          drawGameOver(
            ctx,
            {
              score: Math.floor(this.score),
              distance: Math.floor(this.distance),
              terrain: this.terrain,
              fuelCars: this.fuelCarsCollected,
              best: this.best,
              qualified: this.pendingQualify,
            },
            this.frame,
          );
        }
        return;
    }
  }

  private renderField(): void {
    const r = this.renderer;
    r.clear("#000000");
    r.drawWorld(this.terrain, this.distance);

    // Far actors first so nearer ones overlap them correctly.
    const sorted = [...this.traffic.actors].sort((a, b) => b.distance - a.distance);
    for (const a of sorted) r.drawActor(a, this.distance, this.frame);

    if (this.mascot) r.drawMascot(this.mascot.x, this.mascot.y);

    if (this.player.state === "exploding") {
      r.drawExplosion(this.player.x, this.player.explosionFrame);
    } else if (this.player.state !== "respawning") {
      r.drawPlayer(
        this.player.x,
        this.player.lean,
        this.player.spinAngle,
        this.player.immunity > 0,
        this.frame,
      );
    }

    for (const p of this.popups) r.drawPopup(p.text, p.x, p.y, p.color);

    drawHud(this.renderer.ctx, {
      score: Math.floor(this.score),
      high: Math.max(this.best, Math.floor(this.score)),
      speed: Math.round(this.player.speed),
      fuel: Math.ceil(this.fuel),
      distance: Math.floor(this.distance),
      combo: this.combo,
      terrain: this.terrain,
      frame: this.frame,
    });
  }
}
