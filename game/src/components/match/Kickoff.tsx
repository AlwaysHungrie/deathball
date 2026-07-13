"use client";

import Image from "next/image";
import { PITCH_TYPE } from "./Fixture";
import { useNow } from "@/hooks/use-now";
import { isLive, type Match } from "@/lib/match";

/** Time to kick-off as `00d 00h 00m`. Null once the match has started. */
function countdownTo(startTime: number, now: number): string | null {
  const remaining = startTime - now;
  if (remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(days)}d ${pad(hours)}h ${pad(minutes % 60)}m`;
}

/** Right of the footballer: when they play, or that they already are. */
export default function Kickoff({ match }: { match: Match }) {
  const now = useNow();

  // Live is decided by the clock, not by the feed's `GameState`: that field goes
  // stale, and there are fixtures still flagged in-progress days after kick-off.
  // Same rule the server sorts the reel by, so the two cannot disagree about what
  // is on right now -- see `isLive` in `@/lib/match`.
  const live = now !== null && isLive(match, now);

  const countdown = now === null ? null : countdownTo(match.startTime, now);

  return (
    <div className={PITCH_TYPE}>
      {live ? (
        <div className="flex items-center justify-center gap-1.5 text-blood">
          {/* The dot is the only thing on the pitch that moves on its own, which
              is the whole point of it. */}
          <span className="inline-block h-1.5 w-1.5 animate-pulse bg-blood" />
          Live Now
        </div>
      ) : (
        /* Tabular figures: without them every digit is a different width and the
           countdown jitters sideways once a second. Nowrap so the label and the
           clock stay on one line however narrow the strip gets. */
        <div className="flex flex-col items-center leading-none whitespace-nowrap tabular-nums">
          {/* Sprite art: `data-pixel` is what stops the browser smoothing it, and
              `unoptimized` stops Next re-encoding a 38x45 sprite into a blurrier
              one. Half-size so it sits with the lettering rather than over it. */}
          <Image
            src="/sprites/items/trophy.png"
            alt=""
            width={19}
            height={22}
            unoptimized
            data-pixel
            className="mb-1"
          />
          <div className="text-[10px] text-neutral-950/50">Starts in </div>
          {/* Empty until the clock is set on the client. */}
          <div className="mt-1 text-[11px] tracking-tighter">
            {countdown ?? "--d --h --m"}
          </div>
        </div>
      )}
    </div>
  );
}
