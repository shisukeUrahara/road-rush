// Tuning constants. Speeds are in "displayed km/h"; the world scroll converts
// them to world units so the numbers on the HUD stay arcade-authentic.

export const VIEW_W = 256;
export const VIEW_H = 240;

/** Where the player's car sits on screen (y grows downward). */
export const PLAYER_SCREEN_Y = VIEW_H - 46;

export const LOW_MAX = 224;
export const MEDIUM_MAX = 340;
export const HIGH_MAX = 400;

export const ACCEL_LOW = 80; // km/h per second
export const ACCEL_FAST = 130;
export const DECEL_COAST = 90;

/** World units travelled per second at HIGH_MAX. Tuned for readability. */
export const MAX_SCROLL = 340;

export const STEER_SLOW = 95; // world units/sec at a standstill
export const STEER_FAST = 150; // ...and at top speed

export const MAX_FUEL = 100;
export const FUEL_BURN_IDLE = 0.65; // units/sec
export const FUEL_BURN_MAX = 1.15;
export const FUEL_CRASH_PENALTY = 6;
export const FUEL_PICKUP = 11;

export const PLAYER_W = 18;
export const PLAYER_H = 24;

/** Collision boxes are smaller than the art so near-misses feel fair. */
export const HITBOX_SCALE_PLAYER = 0.66;
export const HITBOX_SCALE_CAR = 0.7;
export const HITBOX_SCALE_TRUCK = 0.8;
export const HITBOX_SCALE_FUEL = 1.05;
export const HITBOX_SCALE_HAZARD = 0.85;

export const SKID_PUSH = 78; // world units/sec sideways while skidding
export const SKID_ENERGY_START = 1.0;
export const SKID_RECOVERY_RATE = 1.9; // per second when countersteering
export const SKID_INSTABILITY_RATE = 0.55; // per second otherwise

export const EXPLOSION_FRAME_TIME = 0.09;
export const RESPAWN_IMMUNITY = 1.6;

export const FUEL_COMBO_SCORES = [300, 500, 1000, 2000, 3000, 5000, 10000];

export const SCORE_PASS_CAR = 60;
export const SCORE_PASS_TRUCK = 200;
export const SCORE_PER_METER = 1;
export const MASCOT_BONUS = 3000;
/** Crash-free distance needed for the flying mascot to show up. */
export const MASCOT_INTERVAL = 3000;

export const SCORES_KEY = "roadrush.scores.v1";
export const MAX_SCORES = 10;
export const MAX_NAME_LEN = 8;
