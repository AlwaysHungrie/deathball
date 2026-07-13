"use client";

/* Replay reel shown under the start-screen curtain.

   Infinite drag-driven carousel. The trick: render the deck three times back to
   back and wrap the x offset modulo one deck's width. Dragging past the last card
   silently lands you on the copy in the next deck, so the reel never hits an end
   and never needs constraints. On release we project the flick's velocity, round
   to the nearest card, and spring it to dead centre of the stage.

   The flags themselves live in ./flags, because the card that gets picked has to
   hand its countries on to the pitch. */

import { motion, useMotionValue, animate, type PanInfo } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Flag from "@/components/ui/Flag";
import type { Country } from "@/lib/flags";
import type { Match } from "@/lib/match";
import Spinner from "@/components/ui/Spinner";

const CARD_W = 300;
const CARD_H = 200;
const GAP = 16;
const STRIDE = CARD_W + GAP;

const SPINS = 2; // whole decks the opening throw travels before its random offset

/* Kick-off dates, as `25 JUN`. No year: the reel is one tournament, so the year
   is the same on every card and says nothing.

   Pinned to UTC rather than the reader's zone. The reel renders on the server
   before it renders in the browser, and the two do not share a timezone -- a
   local date would come back different on the client and hydration would tear.
   These are finished matches, so there is no clock to keep, only a day to name. */
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Day and month apart, so the card can set its own space between them. */
function matchDay(startTime: number): { day: string; month: string } {
  const parts = DATE_FMT.formatToParts(startTime);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return { day: find("day"), month: find("month") };
}

/* Decks rendered. We start in the middle one, so there must be enough copies on
   either side to cover the opening spin's travel without dragging empty track
   into view: one home deck, SPINS decks of runway ahead, and the same behind. */
const REPS = 2 * SPINS + 1;
const HOME = SPINS; // index of the deck we sit in

// How long the curtain takes to drop; the reel is thrown once it has settled.
const CURTAIN_MS = 700;

// How long the opening throw glides for, in seconds.
const SPIN_S = 2.4;

/* One half of a card: the flag bleeds past its box and the name sits on top. While
   the card is loading the flag stays put and only the name drops out. */
function Side({ country, loading }: { country: Country; loading: boolean }) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      <Flag country={country} className="absolute inset-0 opacity-30" />
      {!loading && (
        /* Real team names run long -- "Bosnia & Herzegovina" is not "SPAIN" -- so
           the name wraps and shrinks rather than pushing the card out of shape. */
        <span className="relative px-2 text-center text-xs leading-tight font-bold break-words text-neutral-100 uppercase drop-shadow-[2px_2px_0_rgba(0,0,0,0.9)]">
          {country}
        </span>
      )}
    </div>
  );
}

export default function ReplayCarousel({
  matches,
  onPick,
}: {
  /** Finished matches, newest first. The reel is one card per match. */
  matches: Match[];
  /**
   * The match on the card that was clicked. Resolves once its replay is ready to
   * play — the card spins for exactly as long as this takes, so the wait a player
   * sees is the wait the data actually costs. Rejecting puts the reel back.
   */
  onPick?: (match: Match) => Promise<void>;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  /* The deck is whatever the feed returned, so its width is not a constant. */
  const DECK = matches.length;
  const LOOP = DECK * STRIDE; // width of exactly one deck

  /* Which rendered card was picked (not which match — the same match appears once
     per deck, and only the card actually clicked should show the spinner). */
  const [picked, setPicked] = useState<number | null>(null);

  /* The same value, readable from a stale closure.

     `reseat` is handed to `animate` as an `onComplete` when a drag ends, which
     freezes whatever `picked` was at that moment. A card clicked while that spring
     is still settling would therefore be re-seated out from under its own spinner:
     the guard in `reseat` would read the captured `null`, shift the track by a
     whole deck, and leave the spinner on a different card — or on one now off
     screen. That is the "sometimes it shows, sometimes it doesn't". A ref is read
     at call time, so the guard sees the pick that actually exists. */
  const pickedRef = useRef<number | null>(null);

  /* A pick that failed. The card that was clicked says so and the reel unlatches,
     because the alternative is a spinner that turns forever over a match whose
     odds are never coming. */
  const [failed, setFailed] = useState<number | null>(null);

  /* The reel is inert until the opening throw has settled: grabbing a card that is
     still flying past is never a deliberate choice, and a drag mid-throw would
     cancel the animation — taking its onComplete, and the arming, with it. */
  const [armed, setArmed] = useState(false);

  /* A drag ends with a click on whatever card was under the cursor, so a pick has
     to be told apart from a release. Compare the pointer's down and up positions
     rather than listening for drag events: motion fires those for the opening
     spin too, which would latch the reel closed before the user ever touches it.

     Null until a pointer actually goes down on the track. It must not default to
     a coordinate: the handler that writes it lives on an element that is
     `pointer-events-none` until the opening throw has settled, so a first click
     can easily land its `pointerdown` on a dead track and its `pointerup` on a
     live one. With a `0` default the travel is then measured from the left edge of
     the screen — which is a drag by any reckoning, and the pick is thrown away.
     That is the first-click-does-nothing bug: no down, no measurement, and the
     absence has to be a state the check can see rather than a number that lies. */
  const pressX = useRef<number | null>(null);

  /* x-offset that puts card 0 dead centre: half the leftover stage width. Every
     snap target is this minus a whole number of strides. Measured rather than
     guessed so the first card is centred on first paint. Note this is the *only*
     thing shifting the track — no CSS padding, or the two would stack and the
     cards would sit one pad too far right. */
  const [center, setCenter] = useState(0);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;

    const measure = () => setCenter((el.offsetWidth - CARD_W) / 2);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Offset that centres card 0 of the home deck. Every landing slot is this minus
     a whole number of strides. */
  const origin = center - HOME * LOOP;

  /* Once a move settles we may be sitting in one of the outer decks. Re-seat on
     the identical card in the home deck: visually a no-op, but it hands the
     runway back so the next drag can never run off the ends. */
  const reseat = () => {
    // Re-seating swaps in the identical card from the home deck — invisible in
    // general, but it would move the spinner onto a different card. Once a pick
    // is showing, stay put; the reel is spent anyway.
    //
    // Read through the ref, not the state: this runs from an `onComplete` that
    // captured its scope when the drag ended, so `picked` here is whatever it was
    // *then* — and a card clicked mid-settle would be re-seated out from under its
    // own spinner.
    if (pickedRef.current !== null) return;

    const drift = origin - x.get();
    const wrapped = ((drift % LOOP) + LOOP) % LOOP;
    x.set(origin - wrapped);
  };

  /* Park on card 0, then — once the curtain has finished dropping — throw the
     reel. It travels a couple of whole decks plus a random offset and decelerates
     into its landing slot, so it reads as a spin that happened to stop somewhere
     rather than a jump to a chosen card. */
  const thrown = useRef(false);

  useEffect(() => {
    // Only ever throw once. `center` is refreshed by a ResizeObserver, and letting
    // a resize re-run this would reset the reel out from under a settled pick.
    // An empty deck makes LOOP zero, and every offset below divides by it.
    if (!center || !DECK || thrown.current) return;
    thrown.current = true;

    const start = center - HOME * LOOP;
    x.set(start);

    const index = SPINS * DECK + Math.floor(Math.random() * DECK);

    const throwIt = setTimeout(() => {
      animate(x, start - index * STRIDE, {
        duration: SPIN_S,
        ease: [0.16, 1, 0.3, 1], // long glide, hard decelerate at the end
        onComplete: () => {
          const drift = start - x.get();
          const wrapped = ((drift % LOOP) + LOOP) % LOOP;
          x.set(start - wrapped);
        },
      });
    }, CURTAIN_MS);

    /* Arm off the clock rather than the animation's onComplete. If the animation
       is ever cut short, onComplete never runs — and the reel would stay inert
       for good, with no way to click anything. */
    const arm = setTimeout(() => setArmed(true), CURTAIN_MS + SPIN_S * 1000);

    return () => {
      clearTimeout(throwIt);
      clearTimeout(arm);
    };
  }, [center, x, DECK, LOOP]);

  /* The snap currently settling, if there is one. Held so a pick can stop it: a
     card can be clicked while the reel is still springing into its slot, and a
     spring left running would carry the track — and the spinner riding on it —
     onwards under the cursor. */
  const settling = useRef<ReturnType<typeof animate> | null>(null);

  function snap(_: unknown, info: PanInfo) {
    // Project where the flick lands, then round to the nearest card slot.
    const projected = x.get() + info.velocity.x * 0.2;
    const index = Math.round((origin - projected) / STRIDE);

    settling.current = animate(x, origin - index * STRIDE, {
      type: "spring",
      stiffness: 320,
      damping: 34,
      restDelta: 0.5,
      onComplete: reseat,
    });
  }

  /* Anything under this much travel is a click, not a drag. */
  const SLOP = 6;

  async function pick(i: number, e: React.PointerEvent) {
    if (!armed || picked !== null) return;

    /* No recorded press means the track was not live when the finger went down —
       so nothing was dragged, and this is a click. Only a press we actually saw
       can be measured against; measuring against one we did not is how the first
       click on a freshly-thrown reel got thrown away as a drag. */
    const down = pressX.current;
    pressX.current = null;
    if (down !== null && Math.abs(e.clientX - down) > SLOP) return;

    /* The reel goes inert for the duration of the read: no dragging, no second
       pick, nothing that could move the track or start another fetch. The card
       that was clicked is the only thing doing anything, and it spins.

       Disarming is what makes the spinner reliable rather than lucky. A drag is
       what schedules a `reseat`, and a reseat shifts every card by a whole deck —
       so with the reel live, a stray drag during the fetch could still slide the
       spinning card out from under the cursor. Inert, it cannot. */
    setArmed(false);
    setPicked(i);
    pickedRef.current = i;
    setFailed(null);

    // Freeze the track where it stands. The click may have landed mid-settle, and
    // a spring left to finish would slide the card — spinner and all — onwards
    // from under the finger that chose it.
    settling.current?.stop();

    try {
      // The reel renders the deck several times over, so the card index has to
      // be folded back onto the match it's a copy of.
      await onPick?.(matches[i % DECK]);
    } catch {
      // The odds never came. Hand the reel back rather than leaving a spinner
      // turning over a replay that cannot be played.
      setPicked(null);
      pickedRef.current = null;
      setFailed(i);
      setArmed(true);
    }

    /* Note what is *not* here: an unlatch on success. The card must keep spinning
       through the navigation, or it flashes back to life for the frame between
       the odds landing and the route changing.

       So a spent reel stays spent, and it is the *caller* that hands it back — by
       remounting this component when the curtain reopens. That has to happen
       somewhere: the trip to the pitch does not unmount us (Next keeps the start
       screen in its router cache), so nothing here resets on its own, and assuming
       otherwise is what stranded the second pick — still latched, still spinning,
       `pick` returning early at the guard above, and no odds fetched for the new
       match at all. */
  }

  return (
    <div ref={viewport} className="overflow-hidden">
      <motion.div
        className={`flex ${
          armed
            ? "cursor-grab active:cursor-grabbing"
            : "pointer-events-none cursor-default"
        }`}
        style={{ x, gap: GAP }}
        drag={armed ? "x" : false}
        dragElastic={0}
        dragMomentum={false}
        onPointerDownCapture={(e) => {
          pressX.current = e.clientX;
        }}
        onDragEnd={snap}
      >
        {Array.from({ length: REPS * DECK }, (_, i) => {
          const match = matches[i % DECK];
          const loading = picked === i;
          const broke = failed === i;
          const { day, month } = matchDay(match.startTime);

          return (
            <div
              key={i}
              onPointerUp={(e) => void pick(i, e)}
              style={{ width: CARD_W, height: CARD_H }}
              className="relative flex shrink-0 items-stretch overflow-hidden border-4 border-neutral-100 bg-neutral-700"
            >
              {/* The flags stay lit through the load; only the names and the
                  divider drop out, and the spinner sits over the seam. */}
              <Side country={match.home} loading={loading} />

              {!loading && (
                /* Slanted divider. Same weight and colour as the card border, so
                   the card reads as one shape cut in two. */
                <div className="relative z-10 w-0">
                  <div className="absolute inset-y-[-25%] left-1/2 w-4 -translate-x-1/2 rotate-6 bg-neutral-100" />
                </div>
              )}

              <Side country={match.away} loading={loading} />

              {/* When it was played, across the foot of the card. Spans the whole
                  width rather than sitting in either half, since the date belongs
                  to the fixture and not to one of the two sides. */}
              {!loading && (
                <span className="absolute inset-x-0 bottom-2 z-10 flex justify-center gap-[2ch] text-[8px] leading-none font-bold text-neutral-100/70 uppercase drop-shadow-[2px_2px_0_rgba(0,0,0,0.9)]">
                  <span>{day}</span>
                  <span>{month}</span>
                </span>
              )}

              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <Spinner label="Loading replay" />
                </div>
              )}

              {/* The odds would not load. Said on the card that was clicked,
                  since that is where the player is looking — and the card is
                  live again, so saying it there also says "try me". */}
              {broke && (
                <div className="absolute inset-x-0 bottom-7 z-20 flex justify-center">
                  <span className="bg-blood px-1.5 py-1 text-[8px] leading-none font-bold text-neutral-100 uppercase">
                    No odds — try again
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
