"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The match clock: how far into the match the run has got.
 *
 * One second here is one second of the real match, so the odds read off it are
 * the odds that stood at that same second on the day — unless it is being held
 * down, which winds it on at `FAST_RATE` for as long as the press lasts. A match
 * is ninety minutes and a run is a couple of minutes, so at a walk the market
 * barely moves; the fast-forward is how you actually get to the goals.
 *
 * It starts on mount and never stops — not on a pause, not on the shot, not on
 * game over. The market did not stop for any of those either.
 */

/** How much faster the clock runs while it is held down. */
export const FAST_RATE = 16;

/**
 * Ticked four times a second, because the display is seconds and a quarter-second
 * tick keeps it from visibly lurching. Each tick reads the wall clock rather than
 * counting ticks — an interval is not a clock, and one throttled in a background
 * tab would silently run slow and desynchronise the odds from the time they claim
 * to be.
 */
const TICK_MS = 250;

export type MatchClock = {
  /** Match time, in ms since kick-off. */
  elapsed: number;
  /** Whether the clock is currently winding on. */
  fast: boolean;
  /** Hold to fast-forward; release to fall back to real time. */
  press: () => void;
  release: () => void;
};

export function useMatchClock(): MatchClock {
  const [elapsed, setElapsed] = useState(0);
  const [fast, setFast] = useState(false);

  /* Match time accrues at whatever rate is live at the time, so it cannot be
     derived from a single start instant — the clock would jump the moment the
     rate changed, backwards on release and forwards on press.

     So the elapsed time is banked at every change of rate, and only the time
     since that change is scaled. `banked` is match time already earned; `since`
     is the wall-clock instant the current rate started running from.

     `since` is anchored on mount rather than seeded here: reading the clock
     during render is impure, and the instant it would capture is the render's,
     not the mount's — which are not the same, and the gap between them would be
     silently counted as match time. */
  const banked = useRef(0);
  const since = useRef(0);

  /** Bank what the current rate has earned, and start the next one from now. */
  const settle = useCallback((rate: number) => {
    const now = Date.now();
    banked.current += (now - since.current) * rate;
    since.current = now;
  }, []);

  const press = useCallback(() => {
    // Everything up to this instant was earned at walking pace.
    settle(1);
    setFast(true);
  }, [settle]);

  const release = useCallback(() => {
    // And everything since the press was earned at speed.
    settle(FAST_RATE);
    setFast(false);
  }, [settle]);

  // Kick-off is the moment the pitch mounts. Its own effect, and first, because
  // the ticking effect below re-runs on every press and must not re-anchor.
  useEffect(() => {
    since.current = Date.now();
  }, []);

  useEffect(() => {
    const rate = fast ? FAST_RATE : 1;

    const read = () =>
      setElapsed(banked.current + (Date.now() - since.current) * rate);

    // Read once on the spot as well as on the interval, so a press or release
    // lands on the display immediately rather than up to a tick later.
    read();

    const tick = setInterval(read, TICK_MS);
    return () => clearInterval(tick);
  }, [fast]);

  return { elapsed, fast, press, release };
}

/** `MM:SS`, zero-padded. Minutes run past 59 rather than rolling into hours. */
export function formatClock(elapsed: number): string {
  const total = Math.max(0, Math.floor(elapsed / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
