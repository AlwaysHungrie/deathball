"use client";

import { useRouter } from "next/navigation";
import { Home } from "pixelarticons/react/Home";
import { useEffect } from "react";
import FootballerCanvas from "./FootballerCanvas";
import MatchClockButton from "./MatchClockButton";
import ShootBand from "./ShootBand";
import TeamSelect from "./TeamSelect";
import { useReplay } from "@/context/ReplayProvider";
import { useTrade } from "@/context/TradeProvider";
import { useMatchClock } from "@/hooks/use-match-clock";
import { useRun } from "@/hooks/use-run";
import { toCountry } from "@/lib/flags";
import { chancesAt, isFavourite } from "@/lib/odds";

/**
 * The pitch, and everything hung on it.
 *
 * This is composition and nothing else: the run and the money it rides on are
 * `useRun`, the clock is `useMatchClock`, the market is `@/lib/odds`, and each
 * piece of furniture is its own component. What is left here is the one thing that
 * genuinely belongs to the screen — which of them is on show, and when.
 */
export default function GameScreen() {
  const router = useRouter();

  /* The match this run is played against. This is the only source: nothing is read
     from the URL, so a pitch without a replay is a pitch with no match on it at all
     — see the guard below. */
  const { replay } = useReplay();
  const { trade } = useTrade();

  const clock = useMatchClock();
  const { state, runId, scored, side, trading, showing, ready, play, end, shoot } =
    useRun();

  /* No replay, no match. Nothing is read from the URL, so this route is reachable
     only by being sent here from the reel — and a hard reload is a new process,
     which empties the context. There is no pitch to draw and nothing to play
     against, so go back and pick one.

     In an effect rather than in render: a redirect is a side effect, and calling it
     mid-render is React shouting at you about it. */
  useEffect(() => {
    if (!replay) router.replace("/");
  }, [replay, router]);

  /* On the way out, per the effect above. Every hook has run by now — the return is
     below all of them, which is the whole reason it sits here and not up with the
     redirect it belongs to. */
  if (!replay) return null;

  /* Everything below can now assume a match. The two teams, and which of them he is
     out there for — both off the replay, which is the only place they live. */
  const teams = { home: replay.match.home, away: replay.match.away };
  // The strip he wears is the side he is playing for, not the home side.
  const colours = toCountry(teams[side]);

  /* The shot is on the market's say-so: you may only shoot for a team while the
     market has them ahead of both the draw and the opposition. So the run is a hunt
     for that window, and the clock is how you go looking for it. */
  const canShoot = isFavourite(chancesAt(replay, clock.elapsed), side);

  const curtain = state === "paused" || state === "ended";

  return (
    <main className="relative h-full w-full overflow-hidden">
      <FootballerCanvas
        state={state}
        onEnd={end}
        runId={runId}
        team="sanlorenzo"
      />

      {/* The position is not drawn here. It belongs to the curtain's one slot — see
          `TeamSelect`, which shows the spinner, then the figure, then the buttons, in
          the same place and in that order. It used to hang at the top of the screen,
          which put the answer somewhere the player was not looking and left it up
          alongside a spinner still turning for the same trade. */}

      <MatchClockButton {...clock} />

      {state === "playing" && canShoot && (
        <ShootBand colours={colours} onShoot={shoot} />
      )}

      {/* The pitch keeps drawing underneath — the curtain just washes it out.
          `shooting` is frozen too, but it gets no curtain: the pitch is the thing
          he's lining the shot up against. */}
      {curtain && (
        <div className="curtain-settle absolute inset-0 flex flex-col items-center justify-center gap-8">
          <div
            aria-hidden
            className="absolute inset-0 bg-linear-to-b from-black via-black/80 to-black/60"
          />

          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Back to the start"
            className="absolute top-4 left-4 z-10 border-2 border-neutral-100/70 bg-neutral-950/70 p-2 text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-neutral-950 active:translate-y-px"
          >
            <Home width={20} height={20} aria-hidden />
          </button>

          <h1 className="relative text-center text-5xl leading-tight text-blood drop-shadow-[3px_3px_0_rgba(0,0,0,0.8)]">
            {state === "ended" ? (
              scored ? (
                "GOAL"
              ) : (
                <>
                  GAME
                  <br />
                  OVER
                </>
              )
            ) : (
              "PICK YOUR TEAM"
            )}
          </h1>

          {/* The odds board is hidden for now. It still governs the run — the shot is
              gated on `isFavourite`, which reads the same market — it is simply not on
              show. Put it back by rendering `@/components/game/OddsBoard` here. */}

          {/* The curtain's one slot: the spinner while the trade is in flight, the
              figure it settled at, and then — and only then — something to press.
              Identical at both ends of the run, which is why it is one component and
              not two. `ended` is what tells it the choice on the far side is a
              restart rather than a kickoff, and which side to restart for. */}
          <TeamSelect
            teams={teams}
            trading={trading}
            showing={showing}
            closing={trade.status === "closing"}
            replay={state === "ended" ? side : null}
            ready={ready}
            onPick={(option) => void play(option)}
          />
        </div>
      )}
    </main>
  );
}
