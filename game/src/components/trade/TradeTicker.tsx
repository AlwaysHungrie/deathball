"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { LAMPORTS_PER_SOL } from "@/lib/stake";
import { useTrade, type Trade } from "@/context/TradeProvider";

/**
 * The money, on screen. A figure and a colour, and nothing else.
 *
 * Red on the way out, green on the way back — and the green is only green if the
 * player is actually up, which is the one honest thing this badge does. It is the
 * same box as the wallet balance and the match clock: bordered, dark, tabular,
 * pixel-font. One piece of furniture in three places.
 *
 * It reads in **SOL**, not dollars, and that is not a cosmetic choice. The token
 * being traded is a random pump.fun mint on devnet, and nothing prices those —
 * there is no oracle, and there could not be, because the tokens are worthless by
 * construction. A dollar figure here would be a number this component invented.
 * SOL is what actually left the wallet, so SOL is what it says.
 *
 * There is deliberately no caption. Everything the badge has to say is said by
 * the number and its colour, and a line of explanatory text under a figure that
 * large is the interface apologising for not being clear. The player knows what
 * a red negative means without being told.
 *
 * The number counts rather than appears. A figure that simply pops into place
 * reads as a label; a figure that ticks reads as a transaction, and the whole
 * point of the mechanic is that a real one is happening.
 *
 * Every figure it shows is a figure the chain reported. Nothing here is the
 * stake, or any other number known before the fact: the badge is silent while the
 * buy is in flight and speaks only once there is a settled transaction to speak
 * about — which is either the SOL that actually left the wallet, or ERROR.
 */
export default function TradeTicker({ show }: { show: boolean }) {
  const { trade } = useTrade();

  /* Only on the curtains — never over live play.

     The trade is settled *between* runs: bought on the team-select curtain,
     cashed out on the game-over one. While the ball is moving there is nothing
     happening to the money at all, so a badge hanging over the pitch would be a
     stale figure competing with the game for the one thing the player has to
     spare, which is attention. It leaves when the ball does, and comes back when
     the ball stops.

     `opening` is off as well as `idle`. The badge has nothing to say until the
     buy has settled, and mounting the wrapper early would play the drop-in
     animation around an empty box — so the figure, when it finally arrives, would
     appear in place with no entrance of its own. It waits, and then it drops. */
  const on = show && trade.status !== "idle" && trade.status !== "opening";

  return (
    <AnimatePresence>
      {on && (
        <motion.div
          /* Drops in from above and lifts back out, so it arrives like the
             curtains do rather than fading in place. */
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          /* Above the curtain, not level with it: at the same z the badge is
             painted over by the wash and the trade happens invisibly, which is
             the one thing this component exists not to do. */
          className="pointer-events-none absolute top-16 left-1/2 z-200 -translate-x-1/2"
        >
          <Badge trade={trade} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Badge({ trade }: { trade: Trade }) {
  switch (trade.status) {
    /* Nothing, while the buy is in flight.
     *
     * There used to be a badge here showing the stake — but the stake is a
     * constant, so it was a hardcoded figure standing in for a number nobody knew
     * yet, and it was *wrong* twice over: the fill costs more than the stake once
     * fees and the token account's rent are counted, and a buy that fails costs
     * nothing at all. Either way the player watched `-0.005 SOL` roll up and then
     * get replaced by something that contradicted it.
     *
     * So the badge now says nothing until the chain has told us something. What
     * appears next is either what was actually deducted, or ERROR. */
    case "opening":
      return null;

    case "open":
      return <Box tone="loss" to={-sol(trade.lamportsIn)} />;

    case "closing":
      return <Box tone="loss" to={-sol(trade.lamportsIn)} />;

    case "closed": {
      /* The sign of the P&L picks the colour — not the fact that money came back.
         Getting back less SOL than went out is a loss even though SOL came back,
         and a green badge would be lying about it.

         Flat is whatever the figure cannot show. The badge resolves to DECIMALS
         places, so a P&L smaller than one unit of the last digit is a move the
         player has no way of seeing — and colouring the badge over a change that
         is not on screen is the interface knowing something it will not say.
         Anything the digits *can* show gets a colour; anything they cannot is
         grey. The threshold and the display are therefore the same decision, and
         cannot drift apart.

         Worth being honest about which way this usually lands: a round trip
         through a bonding curve pays pump's fee twice and the network's twice, so
         a run where the token did nothing at all comes back *red*. The player is
         betting the token moves enough to clear the spread. It mostly will not.
         That is a real bet rather than a decorative one, which is the point. */
      const FLAT_SOL = 10 ** -DECIMALS;
      const pnl = sol(trade.pnl);

      const tone =
        Math.abs(pnl) < FLAT_SOL ? "dead" : pnl > 0 ? "gain" : "loss";

      return <Box tone={tone} to={sol(trade.lamportsOut)} signed />;
    }

    /* He died, so the position was never sold: the tokens sit in the game wallet
       and the ticket naming them is gone. The badge does not perform a settlement
       it never made — the figure stays at what was staked, negative.

       Stranded, and — unlike the version of this game that traded one fixed token
       — not coming back. Each run buys a *different* random mint, so a later goal
       sells only its own and cannot sweep up what past deaths left behind. The
       badge does not say that in words, because it does not say anything in
       words. */
    case "lost":
      return <Box tone="loss" to={-sol(trade.lamportsIn)} />;

    /* The trade call failed — the curve rejected the buy, the wallet is empty, no
       wallet is connected, the RPC fell over. This is the *only* thing on screen
       when a position does not open, and it is the only thing that puts a word on
       the badge: there is no figure to show, because nothing moved, and an empty
       box would read as a bug.

       Grey rather than red. Red is the colour of losing money, and a trade that
       never happened did not lose any — it is a fault, not a loss. */
    case "failed":
      return (
        <div
          role="status"
          className="border-2 border-neutral-100/40 bg-neutral-950/90 px-3 py-2 text-center text-sm text-neutral-400"
        >
          ERROR
        </div>
      );

    default:
      return null;
  }
}

/** Lamports, as the server reports them — a string, because JSON has no bigint —
    into the SOL the badge shows. Signed: a P&L arrives negative on a loss. */
function sol(lamports: string): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/* Loss is the house red; gain is `--cash`, which exists for exactly this and is
   not the grass (see globals.css). Dead is neither.

   The winning badge glows. Money coming back is the one genuinely good thing that
   can happen in a game about dying, so it gets a lift the other two do not: a
   losing badge is furniture, a winning one is an event. */
const TONES = {
  loss: "border-blood bg-neutral-950/90 text-blood",
  gain: "border-cash bg-neutral-950/90 text-cash shadow-[0_0_16px_rgba(61,220,132,0.35)]",
  dead: "border-neutral-100/40 bg-neutral-950/90 text-neutral-400",
} as const;

/** The box, and the one thing in it. */
function Box({
  tone,
  to,
  signed = false,
}: {
  tone: keyof typeof TONES;
  to: number;
  signed?: boolean;
}) {
  return (
    <div
      role="status"
      className={`border-2 px-4 py-2 text-center tabular-nums ${TONES[tone]}`}
    >
      {/* Keyed on the figure, so a new one is a new counter and rolls from zero
          rather than inheriting the finished roll of the last. */}
      <Counter key={to} to={to} signed={signed} />
    </div>
  );
}

/**
 * A dollar figure that counts up to itself.
 *
 * Stepped, not smooth: it lands on twelve discrete values on its way to the final
 * one, so it reads as a counter rolling rather than a number being eased. The
 * rest of the game animates in whole pixels and the spinner turns in whole
 * eighths — a buttery 60fps tween in the middle of that would be the one modern
 * thing on the screen.
 */
function Counter({ to, signed }: { to: number; signed: boolean }) {
  const still = useReducedMotion();

  /* How far along the roll is, 0 to 1 — not the figure itself. The roll always
     starts here, because a new target remounts this component (see the `key` at
     the call site) rather than restarting a counter in place. That is what keeps
     the effect below free of a reset: fresh state is what mounting means. */
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Reduced motion gets the answer, not the performance. The interval is never
    // started, and the render below reads the target straight through.
    if (still) return;

    const STEPS = 12;
    const EVERY_MS = 40;

    let step = 0;
    const id = setInterval(() => {
      step += 1;
      setProgress(step / STEPS);
      if (step >= STEPS) clearInterval(id);
    }, EVERY_MS);

    return () => clearInterval(id);
  }, [still]);

  const shown = still ? to : to * progress;

  return <Figure text={lamports(shown, signed)} />;
}

/**
 * A figure whose moving digits are the ones you can see.
 *
 * `+0.005012 SOL` is technically the whole truth and practically a wall — a dozen
 * characters that look identical run to run, with the only thing that ever changes
 * buried in the middle of them. So the figure is split: `+0.005` at full weight,
 * because that is the stake and it is what the player is tracking, and the trailing
 * digits smaller and dimmer, because that is the market and it is the only part
 * that moves.
 *
 * The result reads as one number at a glance and as two on inspection, which is
 * exactly the relationship the two halves have. Nothing is hidden — a big move
 * pushes into the bold part on its own, and the badge starts changing where the
 * eye was already looking.
 */
function Figure({ text }: { text: string }) {
  /* Everything past the stake's own precision. `toFixed(DECIMALS)` guarantees
     exactly DECIMALS digits after the point, and the unit is a fixed suffix, so
     the tail is a known length and this is arithmetic rather than parsing. */
  const cut = text.length - UNIT.length - (DECIMALS - STAKE_PLACES);

  return (
    <span className="leading-none">
      <span className="text-lg">{text.slice(0, cut)}</span>
      {/* The market's digits, and the unit. Dimmed rather than hidden: they are
          the point, but they are not the headline. */}
      <span className="text-[10px] opacity-70">{text.slice(cut)}</span>
    </span>
  );
}

/**
 * How many decimals the money is shown to.
 *
 * Six, which is a lot of places for a number and the right number of places for
 * this one. The stake is 0.005 SOL, so three places renders it exactly and shows
 * nothing else ever — every run would read `-0.005` then `+0.005` and the market
 * may as well not exist. The move has to be visible below the stake's own
 * precision or the mechanic is invisible.
 *
 * Six places resolves a move of about 0.02% of the stake. A bonding curve at this
 * size moves considerably more than that on a single other trade landing in the
 * same minute, so this is comfortably fine enough to show what the token did.
 */
const DECIMALS = 6;

/** Decimals in the bold half: `0.005`, which is exactly the stake and is what the
    player is tracking. The remaining `DECIMALS - STAKE_PLACES` are the market —
    see `Figure`. */
const STAKE_PLACES = 3;

/** Spelled out, because the number alone is meaningless. It is the one word on
    the badge and it is doing real work: `0.005` could be anything. */
const UNIT = " SOL";

/**
 * Money, as money — but at the precision the money actually moves at.
 *
 * The sign is explicit on a cashed-out position, where the player is being told a
 * direction and not just a figure.
 */
function lamports(value: number, signed: boolean): string {
  const sign = value < 0 ? "-" : signed ? "+" : "";
  return `${sign}${Math.abs(value).toFixed(DECIMALS)}${UNIT}`;
}
