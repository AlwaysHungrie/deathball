"use client";

import { useWalletUi } from "@wallet-ui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import GoalPost from "@/components/game/GoalPost";
import IdlePlayer from "@/components/game/IdlePlayer";
import Fixture from "@/components/match/Fixture";
import Kickoff from "@/components/match/Kickoff";
import ReplayCurtain from "@/components/match/ReplayCurtain";
import MuteButton from "@/components/ui/MuteButton";
import TicketStatus, {
  BuyTicketDialog,
} from "@/components/wallet/TicketStatus";
import WalletDialog from "@/components/wallet/WalletDialog";
import { WrongNetworkDialog } from "@/components/wallet/WalletStatus";
import { MusicProvider } from "@/context/MusicProvider";
import { useReplay } from "@/context/ReplayProvider";
import { useTrade } from "@/context/TradeProvider";
import { useMatches } from "@/hooks/use-matches";
import { useTicket } from "@/hooks/use-ticket";
import type { Match } from "@/lib/match";

export default function StartScreen() {
  const router = useRouter();
  const { connected } = useWalletUi();
  const { load } = useReplay();
  const { reset: resetTrade } = useTrade();

  const matches = useMatches();

  /* The ticket is read once, here, and handed down to both the things that care
     about it: the badge in the corner and the primary button. Reading it in each
     of them instead would be two requests for one answer, and — worse — two
     answers, free to disagree with each other about whether the player has
     bought in. */
  const { ticket, settle: settleTicket } = useTicket();

  const [started, setStarted] = useState(false);
  const [picking, setPicking] = useState(false);
  const [buying, setBuying] = useState(false);

  // The match whose odds are being read. Picking one also kills the footballer
  // idling on the pitch, so this doubles as the "a pick has been made" flag.
  const [picked, setPicked] = useState<Match | null>(null);

  /* Bumped every time the reel is opened, and used as the carousel's `key`.

     Coming back from a run does not unmount this screen — Next keeps it in the
     router cache — so a spent reel would otherwise still be sitting there latched
     on its last pick, spinner and all, refusing to take another. Remounting it is
     the reset: the pick state lives inside it, and a new key gives it a new one.
     (It also re-throws the reel, which is right — a fresh visit deserves one.) */
  const [reelId, setReelId] = useState(0);

  /** Open the reel, and hand it back if it was spent. */
  const openReel = () => {
    setPicked(null);
    setReelId((id) => id + 1);
    setStarted(true);
    // The last run's badge goes with it. Coming back from a run does not unmount
    // this screen, so a closed position would otherwise still be sitting there
    // announcing what the *previous* run made while this one is being picked.
    resetTrade();
  };

  /* Picking a card reads that match's odds, and the game does not start until they
     are in — the run is played against the market, so there is nothing to play
     without one. The wait a player sees is the wait the data costs.

     The carousel awaits this: while it is pending the card spins, and if it throws
     the card says so and the reel unlatches. So a failure is reported by rethrowing,
     not swallowed — but `picked` is cleared on the way out, or the footballer would
     stay dead over a pick that never happened. */
  async function pick(match: Match) {
    setPicked(match);

    try {
      await load(match);
    } catch (error) {
      setPicked(null);
      throw error;
    }

    /* No trade here. The stake is placed on the pitch, against the *run* — see
       `useRun`. Picking a match is choosing what to play, not starting to play it: a
       player who picks a replay and then sits on the team-select curtain has not
       kicked off, and buying at this point would leave a position open across a
       screen where nothing is happening.

       It also means a second run on the same replay is a second bet, which is what
       it should be — the reel is picked once, but the pitch can be played over and
       over. */

    // Nothing in the URL: the context is carrying the match and its odds, and it is
    // mounted above both routes, so it survives the trip. `/game` is therefore not
    // reloadable — it bounces back here when it finds no replay — which is the price
    // of not having a second, lesser copy of the truth in the address bar for the two
    // to disagree over.
    router.push("/game");
  }

  return (
    <MusicProvider>
      <main className="relative flex h-full flex-col items-center overflow-hidden bg-neutral-900">
        <MuteButton />
        {/* The ticket, not the balance: what a player has in their own wallet is
            not what the game plays with. See `TicketStatus`. */}
        <TicketStatus ticket={ticket} onBuy={() => setBuying(true)} />

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="text-5xl leading-tight text-blood drop-shadow-[3px_3px_0_rgba(0,0,0,0.8)]">
            DEATH
            <br />
            BALL
          </h1>
          <p className="text-[10px] leading-relaxed text-neutral-400">
            Every goal... is a scream.
          </p>

          {/* No wallet, no ticket, no match. The primary button carries whichever
              step the player is actually on, so there is only ever one way
              forward — and buying in is now one of those steps: an unticketed
              player has no game wallet to stake from, so there is nothing for
              START to start. */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2">
              {!connected ? (
                <button
                  onClick={() => setPicking(true)}
                  className="mt-2 border-4 border-neutral-100 bg-blood px-3 py-3 text-[10px] text-neutral-100 transition-transform hover:scale-105 active:translate-y-1"
                >
                  CONNECT WALLET
                </button>
              ) : ticket.status === "none" ? (
                <button
                  onClick={() => setBuying(true)}
                  className="mt-2 border-4 border-neutral-100 bg-blood px-3 py-3 text-[10px] text-neutral-100 transition-transform hover:scale-105 active:translate-y-1"
                >
                  BUY WORLDCUP TICKET
                </button>
              ) : ticket.status === "owned" ? (
                <button
                  onClick={openReel}
                  className="mt-2 border-4 border-neutral-100 bg-blood px-4 py-3 text-sm text-neutral-100 transition-transform hover:scale-105 active:translate-y-1"
                >
                  START
                </button>
              ) : (
                // Still being read. The button says what it is waiting on rather
                // than going absent — it is about to become one of the three
                // above, and swapping it out and back would make the screen jump.
                <button
                  disabled
                  className="mt-2 border-4 border-neutral-100 bg-blood px-3 py-3 text-[10px] text-neutral-100 disabled:opacity-50"
                >
                  CHECKING TICKET
                </button>
              )}
              <button className="mt-2 border-4 border-neutral-100 px-3 py-3 text-[10px] text-neutral-400 transition-transform hover:scale-105 active:translate-y-1">
                HOW TO PLAY
              </button>
            </div>

            {/* Not an error — nothing has gone wrong, the player simply has not
                bought in yet. So it reads as the price of entry, in the same
                muted grey as the rest of the copy on this screen. */}
            {connected && ticket.status === "none" && (
              <p className="text-[9px] leading-relaxed text-neutral-400">
                You need to buy a World Cup ticket (0.06 SOL) in order to play.
              </p>
            )}
          </div>
        </div>

        {/* Pitch strip. The goal stands on the grass with its mouth at the top edge;
            the player stands in front of it, so the two overlap. */}
        <div className="relative h-[120px] w-full border-t-4 border-neutral-950/40 bg-pitch">
          {/* Scenery, so it sits outside the row and behind everything in it. */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 translate-y-[-24px] scale-40">
            <GoalPost scale={2} />
          </div>

          {/* Fixture, footballer, clock: one row, standing on one line of grass. The
              flanks are equal `flex-1` halves either side of his fixed-width canvas,
              which is what keeps him dead centre no matter how long a team's name runs.
              The fixture is gone once a replay is picked -- the run is what matters
              then, not what is on next. */}
          <div className="absolute inset-x-4 bottom-6 flex items-end justify-center gap-2 sm:inset-x-4">
            <div className="flex flex-1 justify-center">
              {matches?.next && !picked && <Fixture match={matches.next} />}
            </div>
            <IdlePlayer dead={picked !== null} />
            <div className="flex flex-1 justify-center">
              {matches?.next && !picked && <Kickoff match={matches.next} />}
            </div>
          </div>
        </div>

        {started && (
          <ReplayCurtain
            matches={matches}
            reelId={reelId}
            onPick={pick}
            onClose={() => setStarted(false)}
          />
        )}

        <WalletDialog open={picking} onClose={() => setPicking(false)} />

        {/* Buying is not over when the wallet says so. The mint lands in the
            player's wallet, but the 0.05 SOL it pays for is sent by the server
            afterwards, once it can see the mint on chain — so the dialog holds
            its spinner until a read comes back with a ticket *and* a funded game
            wallet. `settle` is that read, and it is what the dialog awaits. */}
        <BuyTicketDialog
          open={buying}
          ticket={ticket}
          onClose={() => setBuying(false)}
          onBought={settleTicket}
        />

        <WrongNetworkDialog />
      </main>
    </MusicProvider>
  );
}
