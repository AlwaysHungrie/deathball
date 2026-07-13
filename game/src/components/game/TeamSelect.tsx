"use client";

import Flag from "@/components/ui/Flag";
import Spinner from "@/components/ui/Spinner";
import { toCountry } from "@/lib/flags";
import type { Side } from "@/lib/odds";

/**
 * Pick a side, and that is the run.
 *
 * There is no neutral "play" any more: the shot is gated on the market fancying
 * whoever you went out for, so choosing is the first move of the game rather than
 * a setting to get past.
 *
 * Each button wears its own team's flag rather than the house red, so the choice
 * is made by looking at the two of them rather than by reading them.
 *
 * While money is moving there are no buttons at all — only the spinner, and the
 * badge above it counting. The trade is the one thing happening, and offering a
 * choice on top of it would invite a second bet while the first is still being
 * placed. The slot keeps its height either way, so the curtain does not jump when
 * the buttons come back.
 */
export default function TeamSelect({
  teams,
  trading,
  closing,
  onPick,
}: {
  teams: Record<Side, string>;
  /** Money is moving, either way. Buttons out, spinner in. */
  trading: boolean;
  /** Which way it is moving, for the spinner's label. */
  closing: boolean;
  onPick: (side: Side) => void;
}) {
  return (
    <div className="relative flex min-h-[124px] w-full max-w-[280px] flex-col items-center justify-center gap-2">
      {trading ? (
        <Spinner
          label={closing ? "Closing the position" : "Opening the position"}
        />
      ) : (
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
