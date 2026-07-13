/**
 * A match, and where it sits in time.
 *
 * This is deliberately its own module, and it is deliberately not `server-only`.
 * Both sides need it: the route sorts the reel with `isFinished` and puts the live
 * match on the pitch with `isLive`, and the browser reads the very same rules to
 * decide whether the fixture on the grass is being played right now.
 *
 * `txline.ts` cannot be that shared module. It reads the game's credentials out of
 * the environment, so it is `server-only`, and a client component importing so much
 * as a function from it drags the whole thing -- keys and all -- into the browser
 * bundle, which the build rightly refuses. So the *shape* and the *rules* live here,
 * where anyone may have them, and the fetching stays over there with the secrets.
 * Same split, and the same reason, as `stake.ts` beside `jupiter.ts`.
 *
 * The alternative is for the client to keep its own copy of the two hours. That is
 * what it used to do, and it is a duplicated constant that decides whether a match
 * is on -- exactly the kind that drifts.
 */

/** What the home page needs: a match, and where it sits in time. */
export type Match = {
  id: number;
  home: string;
  away: string;
  /** Kick-off, epoch ms. */
  startTime: number;
  /**
   * Which way round the feed lists the two. Carried because the odds name their
   * outcomes `part1`/`part2` -- participant order, not home/away order -- and
   * reading a timeline needs to know which is which. See `toTimeline`.
   */
  participant1IsHome: boolean;
};

/** A match is roughly two hours of football, once stoppage and half-time are in. */
const MATCH_MS = 2 * 60 * 60 * 1000;

/**
 * Whether a match is being played right now.
 *
 * Derived from the clock, not from the feed's `GameState`. That field goes stale --
 * there are fixtures still marked in-progress days after kick-off -- so it is
 * treated as a hint and the clock is treated as the truth.
 */
export function isLive(match: Match, now: number = Date.now()): boolean {
  return now >= match.startTime && now < match.startTime + MATCH_MS;
}

/** Whether a match has been played out. Same reasoning as `isLive`. */
export function isFinished(match: Match, now: number = Date.now()): boolean {
  return now >= match.startTime + MATCH_MS;
}
