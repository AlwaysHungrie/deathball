import {
  fetchWorldCupFixtures,
  isFinished,
  isLive,
  toMatch,
  type Match,
} from "@/lib/txline";
import { flagSprite } from "@/lib/flags";

/**
 * The home page's one data call: every World Cup match worth showing.
 *
 * Split here rather than in the browser because the split needs the clock and
 * the flag table, and doing it once on the server keeps the page from shipping
 * either. `played` fills the carousel; `next` goes on the pitch.
 */

export type MatchesResponse = {
  /** Finished matches, most recent first -- the carousel's deck. */
  played: Match[];
  /** The match on the pitch: live now, or the next one to kick off. */
  next: (Match & { live: boolean }) | null;
};

/**
 * The feed is a live thing and the countdown is only as good as its freshness,
 * so this is never prerendered. A minute of caching still spares the upstream a
 * request per visitor without letting the pitch fall visibly behind.
 */
export const revalidate = 60;

export async function GET(): Promise<Response> {
  try {
    const now = Date.now();

    const matches = (await fetchWorldCupFixtures()).map(toMatch);

    // A match we cannot draw a flag for is a match the carousel cannot render.
    // The feed's World Cup is all real countries, so this drops nothing today --
    // but it is the difference between a missing flag and a broken card.
    const drawable = matches.filter(
      (match) => flagSprite(match.home) && flagSprite(match.away),
    );

    const played = drawable
      .filter((match) => isFinished(match, now))
      .sort((a, b) => b.startTime - a.startTime);

    // Live beats upcoming: if a match is being played, that is the one on the
    // pitch. Otherwise the soonest kick-off still ahead of us.
    const live = drawable.find((match) => isLive(match, now));
    const upcoming = drawable
      .filter((match) => match.startTime > now)
      .sort((a, b) => a.startTime - b.startTime)[0];

    const next = live ?? upcoming;

    const body: MatchesResponse = {
      played,
      next: next ? { ...next, live: Boolean(live) } : null,
    };

    return Response.json(body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 502 },
    );
  }
}
