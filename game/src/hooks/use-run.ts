"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTrade } from "@/context/TradeProvider";
import type { GameState } from "@/game/state";
import type { Side } from "@/lib/odds";

/**
 * A run, and the money riding on it.
 *
 * The two are one thing — a run is a wager on itself — so they are held together
 * here rather than left as a dozen `useState`s wired into each other inside the
 * screen. What the screen gets back is a state machine it can render: what the
 * pitch is doing, which side he is out there for, and whether money is moving.
 */
export function useRun() {
  const [state, setState] = useState<GameState>("paused");

  /** Bumping this rewinds the footballer to his penalty spot. */
  const [runId, setRunId] = useState(0);

  /** Whether the run that just ended ended with the ball in the net. */
  const [scored, setScored] = useState(false);

  /* Which side the run is being played for. Chosen on the curtain, and it is the
     whole of the difficulty: the shot is only offered while the market has this
     team as its favourite. */
  const [side, setSide] = useState<Side>("home");

  /* A buy is in flight: the team buttons are gone and a spinner stands in their
     place. Its own flag rather than a read of the trade's status, because the wait
     it covers is longer than the swap — it runs through the buy *and* the beat that
     lets the badge settle, and the buttons must not flash back for that beat. */
  const [buying, setBuying] = useState(false);

  const {
    trade,
    open: openPosition,
    close: closePosition,
    abandon: abandonPosition,
    reset: resetTrade,
  } = useTrade();

  /**
   * Start a run, for one side or the other — and back it with five cents.
   *
   * The stake is placed here rather than when the match was picked, because this
   * is the moment the game actually starts: the reel chooses *what* to play, and
   * this chooses to play it. It also makes the bet per-run, so a second go at the
   * same replay is a second position rather than a free ride on the first.
   *
   * The buy is awaited, so the ball does not move until the swap has confirmed on
   * chain. The -$0.05 the player watches land is therefore a settled trade, and the
   * position the final whistle sells is certain to exist.
   *
   * It cannot throw — a trade that fails reports itself on the badge and the run
   * goes ahead anyway. The football is the game; the money is the wager on it, and
   * losing the wager must not cost the player the match.
   */
  const play = useCallback(
    async (forSide: Side) => {
      // The reel's own guard, here: the buttons are gone while this runs, but a
      // double-tap can still land two calls before React has repainted, and each
      // would buy its own $0.05 while only one could ever be sold.
      if (buying) return;
      setBuying(true);

      // // Last run's badge goes with it. It says what the *previous* position closed
      // // at, and leaving it up through the next buy would have it contradicting the
      // // one now being opened.
      // resetTrade();

      await openPosition();

      // /* Let the badge land before the pitch takes the screen back. The counter
      //    rolls for 12 steps at 40ms; without this the -$0.05 would be torn away at
      //    the exact moment it finished counting, and the player would watch a number
      //    move and never see what it moved to. */
      // await new Promise((settle) => setTimeout(settle, 900));

      // setSide(forSide);
      // setRunId((id) => id + 1);
      // setScored(false);
      // setState("playing");
      // setBuying(false);
    },
    [buying, openPosition, resetTrade],
  );

  /** Identity has to be stable: the canvas stashes this in a ref every render. */
  const end = useCallback((goal: boolean) => {
    setScored(goal);
    setState("ended");
  }, []);

  const shoot = useCallback(() => setState("shooting"), []);

  /* How the run ends is how the money ends.
   *
   * A goal liquidates the position and the player gets their five cents back, plus
   * or minus whatever the token did while the ball was in play. Dying does not: the
   * position is abandoned where it stands, the tokens stay in the wallet unsold,
   * and the SOL that bought them is gone.
   *
   * That asymmetry is the point. Without it the trade is a decoration that always
   * pays itself back and the run is a spectator to it. With it, the goal is worth
   * something and missing costs something — which is what a wager is.
   *
   * Fired from an effect on the transition into `ended`, rather than from `end`
   * itself. `end` is a stable callback the canvas stashes in a ref at mount —
   * closing over `close` there would freeze the first render's copy of it, and that
   * copy holds a stale `ticket`. The effect always sees the live one.
   *
   * `settled` is what makes it happen exactly once. `close` changes identity as the
   * trade's own state moves (open → closing → closed), so the effect re-runs several
   * times per run; without the latch, each re-run would fire another sell. It is
   * keyed to `runId` so the *next* run arms it again. */
  const settled = useRef(-1);

  useEffect(() => {
    if (state !== "ended") return;
    if (settled.current === runId) return;
    settled.current = runId;

    if (scored) {
      // Never throws — a failed sell reports itself on the badge. See `close`.
      void closePosition();
    } else {
      // Nothing is sent. Losing is the absence of a transaction.
      abandonPosition();
    }
  }, [state, runId, scored, closePosition, abandonPosition]);

  /* Money is moving, in one direction or the other — buying at kickoff, or selling
     at the whistle. The curtain shows a spinner instead of buttons for the whole of
     it, so the two waits look like one thing: a trade, settling.

     `buying` is the local flag rather than `trade.status === "opening"` because it
     also covers the beat after the swap lands (see `play`). Selling can be read
     straight off the trade, since nothing follows it. */
  const trading = buying || trade.status === "closing";

  return { state, runId, scored, side, trading, play, end, shoot };
}
