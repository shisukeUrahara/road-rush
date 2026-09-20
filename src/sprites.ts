// Sprite art loaded from PNGs under public/sprites/.
//
// Each sprite declares its size in *view units* (the original 256x240 space),
// not in source pixels: the PNGs are drawn several times larger so they carry
// real detail at the raised render scale, but gameplay geometry — lanes,
// hitboxes, the road — is still reasoned about in view units.
//
// Art is optional. Until an image loads, and forever if it 404s, a drawn
// fallback stands in, so the game is always playable and never blank.

export interface Sprite {
  image: CanvasImageSource;
  /** Draw size in view units. */
  w: number;
  h: number;
}

export interface SpriteSheet {
  player: Sprite;
  playerLeft: Sprite;
  playerRight: Sprite;
  yellow: Sprite;
  red: Sprite;
  blue: Sprite;
  cyan: Sprite;
  truck: Sprite;
  fuel: Sprite;
  oil: Sprite;
  puddle: Sprite;
  rock: Sprite;
  tree: Sprite;
  palm: Sprite;
  house: Sprite;
  girder: Sprite;
  wave: Sprite;
  explosion: Sprite[];
  mascot: Sprite;
}

/**
 * Draw size in view units, matched to the pixel-art grids this replaced
 * (16x24 cars, 22x16 truck, 20x14 hazards, 16x14 rock).
 *
 * These are not cosmetic. Collision boxes in config.ts were tuned against
 * those dimensions, so drawing wider art turns glancing contacts into head-on
 * hits — the player stops skidding past traffic and explodes on it instead.
 */
const SIZES: Record<string, [number, number]> = {
  player: [16, 24],
  yellow: [16, 24],
  blue: [16, 24],
  cyan: [16, 24],
  truck: [22, 34],
  fuel: [16, 24],
  oil: [20, 14],
  puddle: [20, 14],
  rock: [16, 14],
  explosion0: [24, 24],
  explosion1: [28, 28],
  explosion2: [32, 32],
  explosion3: [32, 32],
  explosion4: [26, 26],
  tree: [24, 26],
  palm: [24, 24],
  house: [22, 22],
  girder: [20, 12],
  wave: [18, 16],
  flag: [18, 20],
};

/** A flat colour block used until (or instead of) the real art. */
function placeholder(w: number, h: number, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * 4));
  c.height = Math.max(1, Math.round(h * 4));
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, c.width - 4, c.height - 4);
  }
  return c;
}

/**
 * Start loading one sprite. The returned object is usable immediately with its
 * placeholder image and swaps to the real art in place once that arrives, so
 * no caller has to wait or re-read the sheet.
 */
function load(name: string, fallbackColor: string, onReady?: (s: Sprite) => void): Sprite {
  const [w, h] = SIZES[name] ?? [18, 24];
  const sprite: Sprite = { image: placeholder(w, h, fallbackColor), w, h };
  const img = new Image();
  img.onload = () => {
    sprite.image = img;
    onReady?.(sprite);
  };
  // A missing file leaves the placeholder in place; the game still runs.
  img.src = `sprites/${name}.png`;
  return sprite;
}

/**
 * Shear a sprite sideways for the leaning player frames, so the car tips into
 * a turn without needing separate artwork per direction.
 *
 * Derived into `target` in place: the source starts out as a placeholder and is
 * replaced when the real art loads, so this is re-run at that point rather than
 * baked once from whatever happened to be there first.
 */
function applyLean(target: Sprite, base: Sprite, dir: -1 | 1): void {
  const src = base.image as HTMLImageElement | HTMLCanvasElement;
  const sw = (src as HTMLImageElement).naturalWidth || (src as HTMLCanvasElement).width;
  const sh = (src as HTMLImageElement).naturalHeight || (src as HTMLCanvasElement).height;
  if (!sw || !sh) return;
  const c = document.createElement("canvas");
  // Widen the canvas so the shear cannot push the car's nose off its own edge.
  const pad = Math.ceil(sh * 0.16);
  c.width = sw + pad * 2;
  c.height = sh;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.translate(c.width / 2, sh / 2);
  ctx.transform(1, 0, dir * 0.16, 1, 0, 0);
  ctx.drawImage(src, -sw / 2, -sh / 2);
  target.image = c;
  // Keep the drawn width identical to the upright car. Widening it here would
  // change how much of the road the player appears to occupy mid-turn, which
  // reads as unfair contact against a hitbox that never changes.
  target.w = base.w;
  target.h = base.h;
}

export function buildSprites(): SpriteSheet {
  const playerLeft: Sprite = { image: placeholder(18, 26, "#d82800"), w: 18, h: 26 };
  const playerRight: Sprite = { image: placeholder(18, 26, "#d82800"), w: 18, h: 26 };
  const player = load("player", "#d82800", (p) => {
    applyLean(playerLeft, p, -1);
    applyLean(playerRight, p, 1);
  });
  // Derive from the placeholder too, so the lean frames are never empty.
  applyLean(playerLeft, player, -1);
  applyLean(playerRight, player, 1);

  return {
    player,
    playerLeft,
    playerRight,
    yellow: load("yellow", "#f8d800"),
    // The player's car is the red one, so oncoming "red" traffic reuses the
    // yellow body to stay visually distinct from the car you are driving.
    red: load("yellow", "#d82800"),
    blue: load("blue", "#0078f8"),
    cyan: load("cyan", "#3cbcfc"),
    truck: load("truck", "#ffffff"),
    fuel: load("fuel", "#00b800"),
    oil: load("oil", "#101010"),
    puddle: load("puddle", "#3cbcfc"),
    rock: load("rock", "#9c9c9c"),
    tree: load("tree", "#00a800"),
    palm: load("palm", "#00a800"),
    house: load("house", "#d82800"),
    girder: load("girder", "#787878"),
    wave: load("wave", "#3cbcfc"),
    explosion: [0, 1, 2, 3, 4].map((f) => load(`explosion${f}`, "#f87858")),
    mascot: load("flag", "#ffffff"),
  };
}
