/**
 * The whole game is one of four things at any moment.
 *
 * - `paused`   — the world is drawn but frozen. Covers the pre-kickoff "I am
 *                ready" gate and any later pause.
 * - `playing`  — the footballer runs, the ground scrolls.
 * - `shooting` — he called for the shot. Everything stops dead where it stands —
 *                player, defenders, ball — but the pitch stays in full view: no
 *                curtain, because the whole point is to look at it.
 * - `ended`    — he reached the dirt. Frozen again, behind the game-over curtain.
 */
export type GameState = "paused" | "playing" | "shooting" | "ended";
