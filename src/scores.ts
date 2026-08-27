import { MAX_NAME_LEN, MAX_SCORES, SCORES_KEY } from "./config";

export interface ScoreEntry {
  name: string;
  score: number;
  distance: number;
  terrain: string;
  date: string;
}

function isEntry(v: unknown): v is ScoreEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.name === "string" && typeof e.score === "number" && Number.isFinite(e.score);
}

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isEntry)
      .map((e) => ({
        name: e.name.slice(0, MAX_NAME_LEN),
        score: Math.max(0, Math.floor(e.score)),
        distance: Number.isFinite(e.distance) ? Math.floor(e.distance) : 0,
        terrain: typeof e.terrain === "string" ? e.terrain : "?",
        date: typeof e.date === "string" ? e.date : "",
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch {
    // Private mode, disabled storage, or corrupt JSON — play on without scores.
    return [];
  }
}

/** True when this score earns a spot on the board. */
export function qualifies(score: number, board = loadScores()): boolean {
  if (score <= 0) return false;
  if (board.length < MAX_SCORES) return true;
  return score > board[board.length - 1].score;
}

/** Insert and persist. Returns the new board plus the saved row's rank (0-based). */
export function saveScore(entry: ScoreEntry): { board: ScoreEntry[]; rank: number } {
  const board = loadScores();
  const row: ScoreEntry = { ...entry, name: entry.name.slice(0, MAX_NAME_LEN) || "PLAYER" };
  board.push(row);
  board.sort((a, b) => b.score - a.score);
  const rank = board.indexOf(row);
  const trimmed = board.slice(0, MAX_SCORES);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage unavailable — the board still shows for this session.
  }
  return { board: trimmed, rank: rank < MAX_SCORES ? rank : -1 };
}
