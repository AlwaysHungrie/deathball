import "server-only";

import type { Match } from "./match";

/**
 * TxLINE, read with the game's own wallet.
 *
 * phutball asks the player's browser wallet to subscribe and sign, and keeps the
 * resulting credentials per-wallet. The game has no player to ask: it owns a
 * keypair, subscribed with it once (scripts/txline-subscribe.mjs), and reads the
 * credentials straight out of the environment. Nothing here touches a wallet --
 * by the time this module runs, the signing is long done.
 *
 * The credentials never reach the browser. This is server-only, and the route
 * that uses it hands the client fixtures, not tokens.
 */

const API_ORIGIN =
  process.env.TXLINE_NETWORK === "mainnet"
    ? "https://txline.txodds.com"
    : "https://txline-dev.txodds.com";

/** The World Cup. The feed also carries Friendlies, which we do not want. */
export const WORLD_CUP_COMPETITION_ID = 72;

/** A fixture, as the feed sends it. Only the fields we actually read. */
export type Fixture = {
  FixtureId: number;
  Competition: string;
  CompetitionId: number;
  Participant1: string;
  Participant2: string;
  Participant1IsHome: boolean;
  /** Kick-off, epoch ms. */
  StartTime: number;
  /** Feed's own status. 3 means finished; see `isFinished`. */
  GameState?: number;
};

/* The match itself -- its shape, and the clock rules that say whether one is on --
   lives in `@/lib/match`, which is not `server-only` and so can be read by the
   browser too. Re-exported here because everything on the server that fetches a
   fixture also wants to ask those questions of it, and importing the two halves
   separately at every call site would be busywork. */
export { isFinished, isLive, type Match } from "./match";

/**
 * `/api/fixtures/snapshot` returns fixtures within about 30 days of
 * `startEpochDay`, so a whole tournament takes several calls. Windows are
 * fetched together and deduplicated on FixtureId, which the feed repeats across
 * overlapping windows.
 */
const WINDOW_DAYS = 30;

/**
 * How far back the carousel looks. The 2026 World Cup group stage opens in
 * mid-June, so a couple of months covers the tournament without pulling in a
 * year of friendlies we would only throw away.
 */
const HISTORY_DAYS = 90;

/** And how far forward, to find the next match. */
const FUTURE_DAYS = 60;

/**
 * A guest JWT. The one minted at subscribe time expires; this endpoint hands out
 * a fresh one for nothing, and the long-lived API token is what actually proves
 * the subscription. So rather than storing a JWT that goes stale, mint one per
 * server-side fetch and pair it with the token.
 */
async function guestJwt(): Promise<string> {
  const response = await fetch(`${API_ORIGIN}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`TxLINE guest auth failed (${response.status})`);
  }

  const { token } = (await response.json()) as { token: string };
  return token;
}

async function authHeaders(): Promise<Record<string, string>> {
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      "TXLINE_API_TOKEN is not set. Run `node scripts/txline-subscribe.mjs`.",
    );
  }

  return {
    Authorization: `Bearer ${await guestJwt()}`,
    "X-Api-Token": apiToken,
  };
}

/** Epoch day -- the unit the fixtures endpoint counts windows in. */
function epochDay(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

/**
 * Every World Cup fixture the feed knows about, from HISTORY_DAYS ago to
 * FUTURE_DAYS ahead, in kick-off order.
 *
 * The competition filter is a query parameter, so the feed does the filtering
 * and we are not shipping a few hundred friendlies across the wire to drop them
 * here.
 */
export async function fetchWorldCupFixtures(): Promise<Fixture[]> {
  const headers = await authHeaders();
  const today = epochDay(Date.now());

  const windows: number[] = [];
  for (
    let day = today - HISTORY_DAYS;
    day <= today + FUTURE_DAYS;
    day += WINDOW_DAYS
  ) {
    windows.push(day);
  }

  const pages = await Promise.all(
    windows.map(async (startEpochDay) => {
      const url = new URL(`${API_ORIGIN}/api/fixtures/snapshot`);
      url.searchParams.set("startEpochDay", String(startEpochDay));
      url.searchParams.set("competitionId", String(WORLD_CUP_COMPETITION_ID));

      const response = await fetch(url, { headers, cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          `TxLINE fixtures failed (${response.status}) for day ${startEpochDay}`,
        );
      }
      return (await response.json()) as Fixture[];
    }),
  );

  // Windows overlap, so the same fixture arrives more than once.
  const byId = new Map<number, Fixture>();
  for (const page of pages) {
    for (const fixture of page) byId.set(fixture.FixtureId, fixture);
  }

  return [...byId.values()].sort((a, b) => a.StartTime - b.StartTime);
}

export function toMatch(fixture: Fixture): Match {
  // `Participant1IsHome` decides which way round the two are named. At a neutral
  // tournament it is not a venue claim, only the feed's ordering -- but it is the
  // ordering everyone else prints, so we keep it.
  const home = fixture.Participant1IsHome
    ? fixture.Participant1
    : fixture.Participant2;
  const away = fixture.Participant1IsHome
    ? fixture.Participant2
    : fixture.Participant1;

  return {
    id: fixture.FixtureId,
    home,
    away,
    startTime: fixture.StartTime,
    participant1IsHome: fixture.Participant1IsHome,
  };
}

/* -- Odds ------------------------------------------------------------------ */

/** One odds message, as the feed sends it. Only the fields we actually read. */
export type Odds = {
  FixtureId: number;
  Ts: number;
  /** The market. `1X2...` is the one we want; the feed carries ~30 others. */
  SuperOddsType: string;
  /** Parallel arrays: `PriceNames[i]` labels `Prices[i]`. */
  PriceNames?: string[];
  Prices?: number[];
  /** Market line and period, e.g. `half=1`. Absent on the full-match 1X2. */
  MarketParameters?: string;
  MarketPeriod?: string;
};

/**
 * Prices arrive as integers with the decimal point removed: 1763 is 1.763.
 *
 * The feed cannot ship a float. These records are hashed and anchored on Solana,
 * and a hash has to match byte for byte -- binary floating point does not
 * round-trip reliably enough for that, so the wire carries a scaled integer.
 */
const ODDS_SCALE = 1000;

/**
 * The chance the market gave an outcome, as a percentage.
 *
 * Only meaningful because this feed is demargined -- a real bookmaker's prices
 * sum to ~105%, the extra being their cut. These sum to 100, so the inverse is
 * an honest probability rather than a price with the margin baked in.
 */
function impliedPercent(raw: number): number {
  return (ODDS_SCALE / raw) * 100;
}

/** The 5-minute bucket historical odds are addressed by. */
type IntervalCoord = { epochDay: number; hourOfDay: number; interval: number };

const INTERVAL_MS = 5 * 60_000;

/** Four in flight at a time keeps a match quick without tripping the feed's limits. */
const ODDS_CONCURRENCY = 4;

/** Odds are published ahead of kick-off, and the pre-match drift is part of the story. */
const LEAD_IN_MS = 60 * 60_000;

/** Ninety minutes, half-time, and enough stoppage to reach the whistle. */
const MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;

/** A point on the line: the moment, and what the market gave each outcome. */
export type OddsPoint = {
  /** Epoch ms, as stamped on the message itself. */
  t: number;
  /** Chances, in percent. The three sum to 100. */
  home: number;
  draw: number;
  away: number;
};

/** Odds published in one historical 5-minute bucket, for one fixture. */
async function fetchOddsInterval(
  headers: Record<string, string>,
  fixtureId: number,
  { epochDay, hourOfDay, interval }: IntervalCoord,
): Promise<Odds[]> {
  const url = new URL(
    `${API_ORIGIN}/api/odds/updates/${epochDay}/${hourOfDay}/${interval}`,
  );
  url.searchParams.set("fixtureId", String(fixtureId));

  const response = await fetch(url, { headers, cache: "no-store" });

  if (!response.ok) {
    throw new OddsIntervalError(response.status);
  }
  return (await response.json()) as Odds[];
}

/** A failed bucket, carrying the status so the caller can tell 404 from 401. */
class OddsIntervalError extends Error {
  constructor(readonly status: number) {
    super(`TxLINE odds interval failed (${status})`);
  }
}

/** The 5-minute buckets, in order, covering `fromMs` through `toMs`. */
function intervalRange(fromMs: number, toMs: number): IntervalCoord[] {
  const coords: IntervalCoord[] = [];
  const first = Math.floor(fromMs / INTERVAL_MS) * INTERVAL_MS;

  for (let startMs = first; startMs <= toMs; startMs += INTERVAL_MS) {
    const date = new Date(startMs);
    coords.push({
      epochDay: epochDay(startMs),
      hourOfDay: date.getUTCHours(),
      interval: Math.floor(date.getUTCMinutes() / 5),
    });
  }

  return coords;
}

/**
 * How the 1X2 moved across a match: the chance of a home win, a draw, and an
 * away win, from an hour before kick-off to the final whistle.
 *
 * The API has no "give me the whole match" odds route -- history is addressed
 * one 5-minute bucket at a time, so a 4-hour window is ~48 requests. The fan-out
 * happens here, on the server, and the browser gets one flat series back.
 *
 * The bucket is only the *address*, not the resolution: each holds every message
 * published inside it, and each message carries its own millisecond `Ts`. They
 * are all kept, so the line is as fine-grained as the bookmaker actually was --
 * several points a minute while the market moves, none at all while it sleeps.
 */
export async function fetchOddsTimeline(
  fixtureId: number,
  startTime: number,
  participant1IsHome: boolean,
): Promise<OddsPoint[]> {
  const headers = await authHeaders();
  const coords = intervalRange(
    startTime - LEAD_IN_MS,
    startTime + MATCH_WINDOW_MS,
  );

  const messages: Odds[] = [];

  // Chunked rather than one Promise.all over the whole range: upstream is a
  // metered feed, and 48 simultaneous connections is a good way to get a 429
  // instead of a timeline.
  for (let i = 0; i < coords.length; i += ODDS_CONCURRENCY) {
    const batch = coords.slice(i, i + ODDS_CONCURRENCY);

    const settled = await Promise.all(
      batch.map(async (coord) => {
        try {
          return await fetchOddsInterval(headers, fixtureId, coord);
        } catch (error) {
          // One dead bucket must not sink the whole match -- a 404 on a quiet
          // interval is ordinary. But an expired session fails *every* bucket,
          // and swallowing that would render as "no odds were published", which
          // is a lie about the data rather than a report about the account.
          if (
            error instanceof OddsIntervalError &&
            (error.status === 401 || error.status === 403)
          ) {
            throw error;
          }
          return [] as Odds[];
        }
      }),
    );

    for (const odds of settled) messages.push(...odds);
  }

  return toTimeline(messages, participant1IsHome);
}

/**
 * The full-match 1X2 messages, as a line.
 *
 * Every other market the feed publishes is dropped. We want one question --
 * who wins -- and the feed asks about thirty, most of them the same three
 * questions at a dozen difficulty settings each.
 *
 * The odds name their outcomes `part1`/`part2` -- the feed's participant order,
 * which is *not* its home/away order. `Match` is named the other way round (see
 * `toMatch`), so the two are reconciled here rather than left to whoever draws
 * the line: getting it wrong silently swaps the two teams' chances, and the
 * chart would look entirely plausible while saying the opposite of the truth.
 */
function toTimeline(messages: Odds[], participant1IsHome: boolean): OddsPoint[] {
  const points: OddsPoint[] = [];

  for (const message of messages) {
    if (!message.SuperOddsType.startsWith("1X2")) continue;
    // The first-half 1X2 is a different question, asked of the same three
    // outcomes -- so it survives every other filter and has to be named.
    if (isFirstHalf(message)) continue;
    if (!message.Prices?.length || !message.PriceNames?.length) continue;

    // `PriceNames[i]` labels `Prices[i]`, so which outcome an index refers to is
    // read off the message rather than assumed from its position.
    const priced = new Map<string, number>();
    message.PriceNames.forEach((name, index) => {
      const raw = message.Prices?.[index];
      if (raw) priced.set(name.toLowerCase(), impliedPercent(raw));
    });

    const part1 = priced.get("part1");
    const draw = priced.get("draw");
    const part2 = priced.get("part2");

    // A 1X2 quote is all three prices or it is not a 1X2 quote. A partial
    // message would draw a line that dips to zero and back for no reason.
    if (part1 === undefined || draw === undefined || part2 === undefined) {
      continue;
    }

    points.push({
      t: message.Ts,
      home: participant1IsHome ? part1 : part2,
      draw,
      away: participant1IsHome ? part2 : part1,
    });
  }

  // Sorted by the timestamp on the message, not by the bucket it was filed
  // under -- the bucket is a coarse address, the `Ts` is the truth.
  return points.sort((a, b) => a.t - b.t);
}

/** The period arrives as `half=1`, on either field depending on the market. */
function isFirstHalf(odds: Odds): boolean {
  return `${odds.MarketPeriod ?? ""}${odds.MarketParameters ?? ""}`.includes(
    "half=1",
  );
}
