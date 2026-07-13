"use client";

import Flag from "@/components/ui/Flag";
import Spinner from "@/components/ui/Spinner";
import TradeTicker from "@/components/trade/TradeTicker";
import { toCountry } from "@/lib/flags";
import type { Side } from "@/lib/odds";

/**
 * The curtain's slot: the trade on top, and whatever is on offer underneath it.
 *
 * Three beats, and the same three at both ends of a run — which is why this is one
 * component and not two:
 *
 *   1. **The spinner.** Money is moving and nothing else is happening. No buttons,
 *      because offering a choice on top of a trade invites a second bet while the
 *      first is still being placed.
 *   2. **The receipt.** The trade landed. The spinner is gone and the figure stands
 *      in its place — in the space the player was already looking at, which is the
 *      whole reason it lives here and not nailed to the top of the screen. Still
 *      nothing to press: for these few seconds the number is the only thing on the
 *      curtain, because it is the only thing that happened.
 *   3. **The choice.** The money has been read — the two teams at kickoff, or the
 *      restart at the whistle.
 *
 * The receipt is *not* one of the alternatives below it. It renders above them, and
 * at the whistle it stays up while the restart joins it: the run is over, and what
 * it made is what the player came for. At kickoff it goes, because the pitch needs
 * the screen.
 *
 * Which means both branches below have to hold themselves back while it is up —
 * `showing` on the kickoff buttons, `ready` on the restart. They are one rule wearing
 * two names: nothing is on offer while the trade is being read. Drop either and the
 * buttons appear *under* the receipt the instant the trade settles.
 */
export default function TeamSelect({
  teams,
  trading,
  showing,
  closing,
  replay,
  ready,
  onPick,
}: {
  teams: Record<Side, string>;
  /** Money is moving, either way. Spinner. */
  trading: boolean;
  /** It landed, and is being read. Receipt — and still nothing to press. */
  showing: boolean;
  /** Which way it moved, for the spinner's label. */
  closing: boolean;
  /** The side the run that just ended was played for, or `null` before there has
      been one. Its presence is what makes this the game-over curtain rather than
      the kickoff one, and its value is the side the restart goes out for — the
      player already chose, and being made to choose again is not a retry. */
  replay: Side | null;
  /** The restart is on offer: the receipt has had its beat, and the button joins it
      on screen. Until then the game-over curtain is the card and nothing else. */
  ready: boolean;
  onPick: (side: Side) => void;
}) {
  return (
    <div className="relative flex min-h-[124px] w-full max-w-[280px] flex-col items-center justify-center gap-3">
      {/* The receipt, above whatever is on offer — not instead of it.

          It is not one of the three things below: once the trade has landed the card
          stays up, and the CTA arrives *under* it a beat later. The player reads what
          the run made while deciding whether to have another, which is the whole
          reason the two are on screen together. */}
      <TradeTicker show={showing} />

      {trading ? (
        <Spinner
          label={closing ? "Closing the position" : "Opening the position"}
        />
      ) : replay ? (
        /* One button, because the side is not the question any more — the run is
           over and the only thing on offer is another one, for the team they were
           already out for. The corner already has the door back to the reel.

           Held back until `ready`, so for the first beat of the game-over curtain the
           receipt is the only thing under the GAME OVER — and then the button joins
           it rather than replacing it. */
        ready && (
          <>
            <button
              type="button"
              onClick={() => onPick(replay)}
              className="mt-4 w-full border-4 border-neutral-100 bg-blood px-3 py-4 text-sm leading-tight text-neutral-100 uppercase transition-transform hover:scale-105 active:translate-y-1"
            >
              Play again
            </button>

            <button
              type="button"
              onClick={() =>
                onPick(
                  (["home", "away"] as const).find((t) => t !== replay) ??
                    replay,
                )
              }
              className="w-full px-3 py-2 text-sm leading-tight text-neutral-100 uppercase transition-transform hover:scale-105 active:translate-y-1"
            >
              Switch Sides
            </button>
          </>
        )
      ) : (
        /* The kickoff choice — and gone while the receipt is being read.

           `showing` is asked here for the same reason `ready` is asked above, and
           they are the two halves of one rule: nothing is on offer while the trade
           is on screen. Without it the buy landing drops `trading` to false and the
           chain falls straight through to these buttons, which then sit under the
           receipt for its whole beat — offering a second run while the first one's
           position is still being read. The game-over curtain never had that
           problem, because its button waits on `ready`; this one had nothing to wait
           on. */
        !showing &&
        (["home", "away"] as const).map((option) => (
          <button
            key={option}
            onClick={() => onPick(option)}
            className="relative w-full overflow-hidden border-4 border-neutral-100 bg-neutral-800 px-3 py-4 text-[10px] leading-tight text-neutral-100 uppercase transition-transform hover:scale-105 active:translate-y-1"
          >
            {/* The flag blown up to fill the button, as the carousel card does it
                behind a team's name. */}
            <Flag
              country={toCountry(teams[option])}
              className="absolute inset-0 opacity-30"
            />

            {/* Over the flag, and hard-shadowed: the flag underneath is busy and
                light in places, and a plain white word laid on it disappears into
                whichever stripe it lands on. */}
            <span className="relative text-sm">Play with {teams[option]}</span>
          </button>
        ))
      )}
    </div>
  );
}
