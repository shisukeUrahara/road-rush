// Procedural NES-style pixel art. Each sprite is an ASCII grid; a palette maps
// characters to colors. No external asset files.

export type Palette = Record<string, string>;

/** Shared NES-ish palette keys used by the car grids below. */
const NES = {
  K: "#000000", // outline black
  W: "#ffffff",
  S: "#d8d8d8", // silver / window shine
  G: "#585858", // dark grey
  L: "#9c9c9c", // light grey
  R: "#d82800", // red
  r: "#7c1800", // dark red
  Y: "#f8d800", // yellow
  y: "#ac7c00", // dark yellow
  B: "#0078f8", // blue
  b: "#0000bc", // dark blue
  C: "#3cbcfc", // cyan
  O: "#f87858", // salmon / player accent
  E: "#00b800", // green
  e: "#008800", // dark green
  P: "#f878f8", // pink/magenta
  N: "#503000", // brown
  A: "#a04000", // orange-brown
  F: "#fc9838", // orange flame
  I: "#bcbcbc", // ice/water highlight
  T: "#7c7c7c", // tarmac
} as const;

/** Draw an ASCII grid onto a canvas at 1 char = 1 pixel. "." = transparent. */
export function gridToCanvas(rows: string[], palette: Palette): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

/** A car seen from directly above, pointing "up" the screen. 16x24. */
function carGrid(body: string, dark: string, roof: string): string[] {
  // b = body, d = dark body shade, w = window/roof, K = outline
  const rows = [
    "....KKKKKKKK....",
    "...KbbbbbbbbK...",
    "..KbbwwwwwwbbK..",
    "..KbwwwwwwwwbK..",
    "..KbwwwwwwwwbK..",
    "..KbbwwwwwwbbK..",
    ".KbbbbbbbbbbbbK.",
    "KbbbbbbbbbbbbbbK",
    "KbdbbbbbbbbbbdbK",
    "KbdbbbbbbbbbbdbK",
    "KbbbbbbbbbbbbbbK",
    "KbbbwwwwwwwwbbbK",
    "KbbwwwwwwwwwwbbK",
    "KbbwwwwwwwwwwbbK",
    "KbbbwwwwwwwwbbbK",
    "KbbbbbbbbbbbbbbK",
    "KKdbbbbbbbbbbdKK",
    "KKdbbbbbbbbbbdKK",
    "KbbbbbbbbbbbbbbK",
    ".KbbbbbbbbbbbbK.",
    "..KbbbbbbbbbbK..",
    "..KKbbbbbbbbKK..",
    "...KKKKKKKKKK...",
    "....KKKKKKKK....",
  ];
  return rows.map((r) => r.replace(/b/g, "1").replace(/d/g, "2").replace(/w/g, "3"))
    .map((r) => r.replace(/1/g, body).replace(/2/g, dark).replace(/3/g, roof));
}

/** Big rig truck: wide and long, 22x40. */
function truckGrid(): string[] {
  const rows: string[] = [];
  rows.push("....KKKKKKKKKKKKKK....");
  rows.push("...KGGGGGGGGGGGGGGK...");
  rows.push("..KGGSSSSSSSSSSSSGGK..");
  rows.push("..KGSSSSSSSSSSSSSSGK..");
  rows.push("..KGSSSSSSSSSSSSSSGK..");
  rows.push("..KGGSSSSSSSSSSSSGGK..");
  rows.push(".KGGGGGGGGGGGGGGGGGGK.");
  rows.push("KGGGGGGGGGGGGGGGGGGGGK");
  rows.push("KKKKKKKKKKKKKKKKKKKKKK");
  // trailer body
  for (let i = 0; i < 27; i++) {
    if (i % 6 === 0) rows.push("KLLLLLLLLLLLLLLLLLLLLK");
    else if (i % 6 === 3) rows.push("KLGGGGGGGGGGGGGGGGGGLK".slice(0, 22));
    else rows.push("KLLGGGGGGGGGGGGGGGGLLK");
  }
  rows.push("KKKKKKKKKKKKKKKKKKKKKK");
  rows.push(".KKKKKKKKKKKKKKKKKKKK.");
  rows.push("..KKKKKKKKKKKKKKKKKK..");
  rows.push("...KKKKKKKKKKKKKKKK...");
  return rows;
}

/** Flashing fuel car: checkered multicolor, unmistakable. */
function fuelCarGrid(): string[] {
  return [
    "....KKKKKKKK....",
    "...KPPPPPPPPK...",
    "..KPPWWWWWWPPK..",
    "..KPWWWWWWWWPK..",
    "..KPWWWWWWWWPK..",
    "..KPPWWWWWWPPK..",
    ".KPPPPPPPPPPPPK.",
    "KPPCCPPPPPPCCPPK",
    "KPCCCCPPPPCCCCPK",
    "KPCCCCPPPPCCCCPK",
    "KPPCCPPPPPPCCPPK",
    "KPPPWWWWWWWWPPPK",
    "KPPWWWWWWWWWWPPK",
    "KPPWWWYYYYWWWPPK",
    "KPPPWWWWWWWWPPPK",
    "KPPPPPPPPPPPPPPK",
    "KKCPPPPPPPPPPCKK",
    "KKCPPPPPPPPPPCKK",
    "KPPPPPPPPPPPPPPK",
    ".KPPPPPPPPPPPPK.",
    "..KPPPPPPPPPPK..",
    "..KKPPPPPPPPKK..",
    "...KKKKKKKKKK...",
    "....KKKKKKKK....",
  ];
}

/** Player car — red with white roof, mirrors the reference screenshot. */
function playerGrid(): string[] {
  return [
    "....KKKKKKKK....",
    "...KWWWWWWWWK...",
    "..KWWWWWWWWWWK..",
    "..KWWWWWWWWWWK..",
    "..KWWWWWWWWWWK..",
    "..KKWWWWWWWWKK..",
    ".KRRRRRRRRRRRRK.",
    "KRRRRRRRRRRRRRRK",
    "KRrRRRRRRRRRRrRK",
    "KRrRRRRRRRRRRrRK",
    "KRRRRRRRRRRRRRRK",
    "KRRRCCCCCCCCRRRK",
    "KRRCCCCCCCCCCRRK",
    "KRRCCCCCCCCCCRRK",
    "KRRRCCCCCCCCRRRK",
    "KRRRRRRRRRRRRRRK",
    "KKrRRRRRRRRRRrKK",
    "KKrRRRRRRRRRRrKK",
    "KRRRRRRRRRRRRRRK",
    ".KRRRRRRRRRRRRK.",
    "..KRRRRRRRRRRK..",
    "..KKRRRRRRRRKK..",
    "...KKKKKKKKKK...",
    "....KKKKKKKK....",
  ];
}

/** Oil slick — dark irregular blob, 20x14. */
function oilGrid(): string[] {
  return [
    "......KKKKKK........",
    "....KKGGGGGGKK......",
    "..KKGGGGGGGGGGKK....",
    ".KGGGGGGGGGGGGGGK...",
    "KGGGGKKGGGGGGGGGGK..",
    "KGGGKKKKGGGGGGGGGGK.",
    "KGGGGKKGGGGGGGGGGGGK",
    "KGGGGGGGGGGKKGGGGGGK",
    ".KGGGGGGGGKKKKGGGGK.",
    "..KGGGGGGGGKKGGGGK..",
    "...KGGGGGGGGGGGGK...",
    "....KKGGGGGGGGKK....",
    "......KKGGGGKK......",
    "........KKKK........",
  ];
}

/** Water puddle — blue translucent-looking splash. */
function puddleGrid(): string[] {
  return [
    "......IIIIII........",
    "....IIBBBBBBII......",
    "..IIBBBBBBBBBBII....",
    ".IBBBBIIBBBBBBBBI...",
    "IBBBBIIIIBBBBBBBBI..",
    "IBBBBBIIBBBBBBBBBBI.",
    "IBBBBBBBBBBBBBBBBBBI",
    "IBBBBBBBBBBIIBBBBBBI",
    ".IBBBBBBBBIIIIBBBBI.",
    "..IBBBBBBBBIIBBBBI..",
    "...IBBBBBBBBBBBBI...",
    "....IIBBBBBBBBII....",
    "......IIBBBBII......",
    "........IIII........",
  ];
}

/** Roadblock boulder / barrel. */
function rockGrid(): string[] {
  return [
    "....KKKKKKKK....",
    "..KKLLLLLLLLKK..",
    ".KLLLLLLLLLLLLK.",
    "KLLLLGGGGLLLLLLK",
    "KLLLGGGGGGGLLLLK",
    "KLLGGGGGGGGGLLLK",
    "KLGGGGGGGGGGGLLK",
    "KLGGGGGGGGGGGGLK",
    "KLGGGGGGGGGGGGLK",
    "KLLGGGGGGGGGGLLK",
    "KLLLGGGGGGGGLLLK",
    ".KLLLGGGGGGLLLK.",
    "..KKLLLLLLLLKK..",
    "....KKKKKKKK....",
  ];
}

/** Explosion frames — expanding fireball. */
function explosionGrid(frame: number): string[] {
  const size = 24;
  const rows: string[] = [];
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const outer = 3 + frame * 3.2;
  const mid = outer * 0.68;
  const core = outer * 0.36;
  for (let y = 0; y < size; y++) {
    let row = "";
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      // Jagged edge: cheap deterministic wobble so it doesn't look like a disc.
      const wobble = 1 + 0.22 * Math.sin(Math.atan2(dy, dx) * 5 + frame);
      const d = Math.hypot(dx, dy) / wobble;
      if (d > outer) row += ".";
      else if (d > mid) row += frame > 3 ? "G" : "R";
      else if (d > core) row += frame > 3 ? "R" : "F";
      else row += frame > 3 ? "F" : "Y";
    }
    rows.push(row);
  }
  return rows;
}

/** Flying hero mascot — original design (cape + goggles), not Konami Man. */
function mascotGrid(): string[] {
  return [
    "........EEEE........",
    "......EEEEEEEE......",
    ".....EEWWWWWWEE.....",
    ".....EWKWWWWKWE.....",
    ".....EWWWWWWWWE.....",
    "......EEWWWWEE......",
    ".......EEEEEE.......",
    "..CC..EEEEEEEE..CC..",
    ".CCCCEEEEOOEEEECCCC.",
    "CCCCCEEEOOOOEEECCCCC",
    "CCCC.EEEOOOOEEE.CCCC",
    "CC...EEEEOOEEEE...CC",
    ".....EEEEEEEEEE.....",
    "......EEE..EEE......",
    "......EEE..EEE......",
    ".....OOO....OOO.....",
    ".....OOO....OOO.....",
    "....KKK......KKK....",
  ];
}

export interface SpriteSheet {
  player: HTMLCanvasElement;
  playerLeft: HTMLCanvasElement;
  playerRight: HTMLCanvasElement;
  yellow: HTMLCanvasElement;
  red: HTMLCanvasElement;
  blue: HTMLCanvasElement;
  cyan: HTMLCanvasElement;
  truck: HTMLCanvasElement;
  fuel: HTMLCanvasElement;
  oil: HTMLCanvasElement;
  puddle: HTMLCanvasElement;
  rock: HTMLCanvasElement;
  explosion: HTMLCanvasElement[];
  mascot: HTMLCanvasElement;
}

/** Shear a car canvas sideways to fake a lean while steering. */
function leanCanvas(src: HTMLCanvasElement, dir: -1 | 1): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width + 2;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < src.height; y++) {
    // Front of the car (top) slides further than the rear.
    const shift = Math.round(((src.height - y) / src.height) * 2) * dir;
    ctx.drawImage(src, 0, y, src.width, 1, 1 + shift, y, src.width, 1);
  }
  return out;
}

export function buildSprites(): SpriteSheet {
  const p: Palette = { ...NES };
  const player = gridToCanvas(playerGrid(), p);
  return {
    player,
    playerLeft: leanCanvas(player, -1),
    playerRight: leanCanvas(player, 1),
    yellow: gridToCanvas(carGrid("Y", "y", "K"), p),
    red: gridToCanvas(carGrid("R", "r", "K"), p),
    blue: gridToCanvas(carGrid("B", "b", "S"), p),
    cyan: gridToCanvas(carGrid("C", "B", "K"), p),
    truck: gridToCanvas(truckGrid(), p),
    fuel: gridToCanvas(fuelCarGrid(), p),
    oil: gridToCanvas(oilGrid(), p),
    puddle: gridToCanvas(puddleGrid(), p),
    rock: gridToCanvas(rockGrid(), p),
    explosion: [0, 1, 2, 3, 4, 5].map((f) => gridToCanvas(explosionGrid(f), p)),
    mascot: gridToCanvas(mascotGrid(), p),
  };
}
