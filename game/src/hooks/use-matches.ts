"use client";

import { useEffect, useState } from "react";
import type { MatchesResponse } from "@/app/api/matches/route";

/**
 * Every World Cup match the feed knows: the finished ones fill the reel, and the
 * next one stands on the pitch.
 *
 * Null until the fetch lands — the reel is not rendered before then, so there is
 * nothing to show a skeleton for. Null is also what a *failed* fetch leaves behind,
 * and deliberately: the start screen still works without a feed. No reel, no fixture
 * on the pitch, but the game is still reachable, and failing loudly here would take
 * the whole page down over a fixture list.
 */
export function useMatches(): MatchesResponse | null {
  const [matches, setMatches] = useState<MatchesResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/matches");
        if (!response.ok) return;
        const data = (await response.json()) as MatchesResponse;
        if (!cancelled) setMatches(data);
      } catch {
        // See above: a missing feed is a quieter start screen, not a broken one.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return matches;
}
