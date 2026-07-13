"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { OddsResponse } from "@/app/api/odds/route";
import type { Replay } from "@/lib/odds";
import type { Match } from "@/lib/match";

/**
 * The replay: the match picked off the reel, and how the market read it.
 *
 * The pitch is a route of its own, so what the start screen learned has to
 * survive a navigation. A query string cannot carry it -- a match is a few
 * hundred quotes, which is kilobytes of JSON -- so it is held in a context
 * mounted in the root layout, above both routes. Navigating between them
 * re-renders the pages under the provider without remounting it, so the odds
 * fetched on the start screen are simply *there* when the pitch asks.
 *
 * The cost of that is a hard reload of `/game`: the provider comes back empty,
 * because a client context is memory and a reload is a new process. So `replay`
 * is nullable and every reader has to cope.
 *
 * Only the holding lives here. Reading the market at a moment -- `chancesAt`,
 * `isFavourite` -- is pure, and lives in `@/lib/odds`, so those questions can be
 * asked of a replay without a provider mounted to answer them.
 */

type ReplayContext = {
  replay: Replay | null;
  /**
   * Reads a match's odds and holds them. Resolves when the replay is ready to
   * play -- the carousel awaits this, so the spinner on the card runs for
   * exactly as long as the fetch does. Throws if the odds cannot be had.
   */
  load: (match: Match) => Promise<void>;
};

const Context = createContext<ReplayContext | null>(null);

export function ReplayProvider({ children }: { children: React.ReactNode }) {
  const [replay, setReplay] = useState<Replay | null>(null);

  const load = useCallback(async (match: Match) => {
    const query = new URLSearchParams({
      fixtureId: String(match.id),
      startTime: String(match.startTime),
      participant1IsHome: String(match.participant1IsHome),
    });

    const response = await fetch(`/api/odds?${query}`);
    if (!response.ok) {
      throw new Error(`Could not read the odds (${response.status})`);
    }

    const { points } = (await response.json()) as OddsResponse;

    // A match with no odds is not a replay. The whole point of the run is that
    // it is played against the market, and there is nothing here to play
    // against -- so this fails rather than sending the player to an empty pitch.
    if (points.length === 0) {
      throw new Error("No odds were published for this match");
    }

    setReplay({ match, points });
  }, []);

  return (
    <Context.Provider value={{ replay, load }}>{children}</Context.Provider>
  );
}

export function useReplay(): ReplayContext {
  const context = useContext(Context);
  if (!context) {
    throw new Error("useReplay must be used inside a ReplayProvider");
  }
  return context;
}
