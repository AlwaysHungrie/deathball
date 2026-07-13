/* Reading the market at a moment.
 *
 * Pure functions over a replay: no React, no fetching, no state. They live apart
 * from `ReplayProvider` because they are questions anyone can ask of a replay —
 * the pitch gates the shot on `isFavourite`, and a test can ask the same thing
 * without mounting a provider to do it. */

import type { Match } from "@/lib/match";
import type { OddsPoint } from "@/lib/txline";

export type Replay = {
  match: Match;
  /** How the 1X2 moved, in time order. Chances in percent, summing to 100. */
  points: OddsPoint[];
};

/**
 * A match is ninety minutes, plus half-time, plus stoppage.
 *
 * This is where the market closes, and it has to be a decision rather than a
 * fact: the odds feed does not announce a final whistle, it simply stops
 * publishing. Something has to say when the game is over, and this is it.
 */
export const MATCH_LENGTH_MS = 105 * 60_000;

/** What the market gave the three outcomes, in percent. */
export type Chances = { home: number; draw: number; away: number };

/** Nothing is happening: before the first whistle, or after the last. */
const NOTHING: Chances = { home: 0, draw: 0, away: 0 };

/** Which of the two the run is being played for. */
export type Side = "home" | "away";

/**
 * Whether the chosen side is what the market likes best, right now.
 *
 * This is the condition the shot is gated on: you may only pull the trigger for
 * a team while the market has them ahead of *both* the draw and the opposition.
 * Not merely ahead of the other side — the draw is a real outcome, and a team
 * the market rates below a nil-nil is not a team anyone is backing to score.
 *
 * Strictly greater, so a dead heat is not a window. A market that cannot choose
 * between two outcomes has not made either of them the favourite, and the tie
 * has to break *against* the shot or it becomes a free one.
 *
 * Outside the match this is false for both sides: there is no market, so nobody
 * is the favourite. That is what closes the window once the whistle goes.
 */
export function isFavourite(chances: Chances, side: Side): boolean {
  const mine = side === "home" ? chances.home : chances.away;
  const theirs = side === "home" ? chances.away : chances.home;
  return mine > chances.draw && mine > theirs;
}

/**
 * The odds in force at a point in the match, `elapsed` ms after kick-off.
 *
 * Two rules, both about honesty rather than convenience:
 *
 * Only the match itself counts. The timeline is fetched with an hour of lead-in,
 * because the pre-match drift is worth having — but the clock on the pitch reads
 * from kick-off, so everything before the whistle is out of scope, and once the
 * match is over the market is gone. Both read as zeros, which is the truthful
 * answer to "what does the market think right now" when there is no market to
 * ask. Note this is why kick-off comes off `replay.match.startTime` and not off
 * the first point: the first point is an hour early by design.
 *
 * And within the match, this is a *step* lookup — the last price published at or
 * before the instant, held until it is replaced. Interpolating between two
 * quotes would invent a number the bookmaker never offered.
 */
export function chancesAt(replay: Replay, elapsed: number): Chances {
  if (elapsed < 0 || elapsed >= MATCH_LENGTH_MS) return NOTHING;

  const at = replay.match.startTime + elapsed;

  let held: OddsPoint | undefined;
  for (const point of replay.points) {
    if (point.t > at) break;
    held = point;
  }

  // Nothing published at or before this instant. A market that had not opened is
  // not a market at even money, so it says nothing rather than guessing.
  if (!held) return NOTHING;

  return { home: held.home, draw: held.draw, away: held.away };
}
