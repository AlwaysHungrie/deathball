"use client";

import { formatClock, type MatchClock } from "@/hooks/use-match-clock";

/**
 * The clock, where the wallet badge sits on the start screen — same box, same
 * weight, so the two read as one piece of furniture. Above the curtain, since it
 * keeps running behind it.
 *
 * Hold it to wind the match on at speed. A run is a couple of minutes and a match
 * is ninety, so at walking pace the market barely stirs; this is how you reach the
 * goals. Released on leave and on blur as well as on pointer-up — a press dragged
 * off the button, or interrupted by a tab-away, would otherwise leave the clock
 * stuck at speed with nothing holding it there.
 */
export default function MatchClockButton({
  elapsed,
  fast,
  press,
  release,
}: MatchClock) {
  return (
    <button
      type="button"
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onBlur={release}
      aria-label={`Match clock, ${formatClock(elapsed)}.`}
      className={`absolute top-4 right-4 z-50 border-2 px-2 py-2 text-[10px] tabular-nums transition-colors select-none active:translate-y-px ${
        fast
          ? "border-blood bg-blood text-neutral-100"
          : "border-neutral-100/70 bg-neutral-950/70 text-neutral-100"
      }`}
    >
      {formatClock(elapsed)}
      {/* The multiplier only exists while it applies, so the badge is never
          claiming a speed it is not running at. */}
      {fast && <span className="ml-1 opacity-70">16x</span>}
    </button>
  );
}
