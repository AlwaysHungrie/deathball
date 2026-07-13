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

  /* The beat after a trade settles, on either curtain: the spinner is gone, the
     badge is up, and nothing else is — no buttons at kickoff, no restart at the
     whistle. It is what makes the trade the only thing on screen for as long as it
     takes to read it.

     A flag rather than a read of the trade's status because it outlives the trade
     landing by RECEIPT_MS, and because both ends of the run need the same beat from
     two different statuses (`open` at kickoff, `closed` at the whistle). One flag,
     one meaning: the money is being shown. */
  const [showing, setShowing] = useState(false);

  /* The restart is on offer. Only ever true on the game-over curtain, and only after
     the receipt has had its beat — the card stays up underneath it, so this is not
     "the receipt is done" but "there is now also something to press".

     Its own flag rather than a read of `!trading`, which goes false the instant the
     sell lands: the button would appear the moment the number did, and the beat that
     makes the number readable would buy nothing. */
  const [ready, setReady] = useState(false);

  const {
    trade,
    open: openPosition,
    close: closePosition,
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
   * chain. The figure the player watches land is therefore a settled trade, and the
   * position the final whistle sells is certain to exist.
   *
   * Then the receipt holds the curtain on its own for a beat, because a number that
   * is torn away as it finishes counting is a number nobody read. Only after it does
   * the pitch take the screen.
   *
   * It cannot throw — a trade that fails reports itself on the badge and the run
   * goes ahead anyway. The football is the game; the money is the wager on it, and
   * losing the wager must not cost the player the match.
   */
  const play = useCallback(
    async (forSide: Side) => {
      // The reel's own guard, here: the buttons are gone while this runs, but a
      // double-tap can still land two calls before React has repainted, and each
      // would buy its own stake while only one could ever be sold.
      if (buying) return;
      setBuying(true);

      /* The last run's restart goes with its receipt. Both are still on screen — this
         is the button that was just pressed — and neither belongs to the run now
         starting. */
      setReady(false);
      setShowing(false);

      /* Last run's badge goes with it. It says what the *previous* position closed
         at, and leaving it up through the next buy would have it contradicting the
         one now being opened. */
      resetTrade();

      await openPosition();

      /* Bought — so the spinner comes down and the receipt goes up in the space it
         was occupying. The two never share the screen: `buying` off and `showing`
         on is a single render, so the swap is a replacement rather than a moment
         where both are up or neither is. */
      setBuying(false);
      setShowing(true);

      await wait(RECEIPT_MS);

      // Read, and the pitch takes the screen back.
      setShowing(false);

      setSide(forSide);
      setRunId((id) => id + 1);
      setScored(false);
      setState("playing");
    },
    [buying, openPosition, resetTrade],
  );

  /** Identity has to be stable: the canvas stashes this in a ref every render. */
  const end = useCallback((goal: boolean) => {
    setScored(goal);
    setState("ended");
  }, []);

  const shoot = useCallback(() => setState("shooting"), []);

  /* The whistle sells the position, however the run ended.
   *
   * Every run liquidates: the token is sold back into the curve it came from and the
   * player gets back whatever it did while the ball was in play. Scoring does not
   * decide whether the trade settles, only the football does — a goal and a death
   * both end the run and both cash it out.
   *
   * Fired from an effect on the transition into `ended`, rather than from `end`
   * itself. `end` is a stable callback the canvas stashes in a ref at mount —
   * closing over `close` there would freeze the first render's copy of it, and that
   * copy holds a stale `ticket`. The effect always sees the live one.
   *
   * `settled` is what makes it happen exactly once. It is keyed to `runId` so the
   * *next* run arms it again. */
  const settled = useRef(-1);

  useEffect(() => {
    if (state !== "ended") return;
    if (settled.current === runId) return;
    settled.current = runId;

    /* The same beat the kickoff has, and then one difference that matters.

       The spinner holds the curtain alone until the sell lands, and then the receipt
       goes up — so far, identical. But here the receipt *stays*: the run is over, and
       what it made is the thing the player came for. The restart arrives underneath
       it after the beat rather than in place of it, so the number is still on screen
       while they decide whether to have another go.

       At kickoff the card has to go, because the pitch needs the screen. Here nothing
       is waiting for it, so nothing takes it away.

       Never throws — a failed sell reports itself on the badge. See `close`. */
    void (async () => {
      await closePosition();

      setShowing(true);
      await wait(RECEIPT_MS);
      setReady(true);
    })();
  }, [state, runId, closePosition]);

  /* Money is moving, in one direction or the other — buying at kickoff, or selling
     at the whistle. The curtain shows a spinner instead of buttons for the whole of
     it, so the two waits look like one thing: a trade, settling.

     `buying` is the local flag rather than `trade.status === "opening"` because it
     is raised the instant the button is pressed, before the request is even out.
     Selling can be read straight off the trade. */
  const trading = buying || trade.status === "closing";

  return { state, runId, scored, side, trading, showing, ready, play, end, shoot };
}

/** How long the settled trade holds the curtain on its own, at both ends of the run.
 *
 *  Long enough to read a six-decimal figure that spends the first half-second of it
 *  counting up to itself, and short enough that it is a beat in the game rather than
 *  a screen in it. */
const RECEIPT_MS = 3000;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
