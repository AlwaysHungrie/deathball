"use client";

import { Close } from "pixelarticons/react/Close";
import ReplayCarousel from "./ReplayCarousel";
import type { MatchesResponse } from "@/app/api/matches/route";
import type { Match } from "@/lib/match";

/**
 * The curtain the reel hangs on.
 *
 * Drops from above, dark at the top and clearing by the pitch so the grass stays
 * lit. Carries the "no live games" notice and the replay reel, so it takes pointer
 * events — but only where it has content.
 */
export default function ReplayCurtain({
  matches,
  reelId,
  onPick,
  onClose,
}: {
  /** Null while the feed is still in flight. */
  matches: MatchesResponse | null;
  /** The carousel's `key`. Bumping it hands back a spent reel — see the start
      screen, which owns it and explains why. */
  reelId: number;
  onPick: (match: Match) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="curtain pointer-events-none absolute inset-0 z-100 flex flex-col">
      {/* The wash is its own layer *behind* the content. Putting the gradient on the
          flex container instead would tint the cards and the divider along with it. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-b from-black to-black/70"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close replays"
        className="pointer-events-auto absolute top-4 right-4 z-10 border-2 border-neutral-100/70 bg-neutral-950/70 p-2 text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-neutral-950 active:translate-y-px"
      >
        <Close width={20} height={20} aria-hidden />
      </button>

      {/* The line depends on whether there is football on right now, which is a thing
          we actually know -- so it says so rather than always apologising for a quiet
          day. */}
      <p className="pointer-events-auto relative mt-16 px-8 text-center text-[10px] leading-relaxed text-neutral-300">
        {matches === null
          ? "Loading matches…"
          : matches.next?.live
            ? `${matches.next.home} vs ${matches.next.away} is live now. Or replay one of these.`
            : "Oh no, looks like there are no games live at the moment. However you can still enjoy one of the replays."}
      </p>

      {/* No deck, no reel. An empty carousel is a blank strip of nothing, which reads
          as a broken page rather than an empty one. */}
      {matches && matches.played.length > 0 && (
        <div className="pointer-events-auto relative mt-10">
          <ReplayCarousel
            key={reelId}
            matches={matches.played}
            onPick={onPick}
          />
        </div>
      )}
    </div>
  );
}
