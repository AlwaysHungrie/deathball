"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { LAMPORTS_PER_SOL } from "@/lib/stake";
import { useTrade, type Trade } from "@/context/TradeProvider";

/**
 * The money, on screen. A figure and a colour, and nothing else.
 *
 * It is what the wait turns into. The curtain holds a spinner while the trade is in
 * flight and this in the same slot once it lands — see `TeamSelect`, which owns the
 * slot and decides which of them is in it. So this places nothing itself: it is
 * given a spot, and it drops into it.
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

  /* Shown where the spinner was, and only once the spinner has gone.

     The badge is not furniture hung at the top of the screen — it is what the wait
     resolves *into*. The spinner stands in the curtain's slot while the trade is in
     flight, and when it lands the badge takes that exact space: the player's eye is
     already there, and the answer arrives where the question was asked. Hanging it
     at the top of the screen instead meant the figure appeared somewhere nobody was
     looking, next to a spinner still turning under it.

     So this renders in the flow of whatever places it, and `show` is the whole of
     the decision: the caller says when, because the caller is the one that knows
     the spinner is down. See `showing` in `use-run`.

     `opening` and `closing` are excluded on top of that, belt and braces: the badge
     has nothing to say until the chain has said it, and mounting the wrapper early
     would play the drop-in animation around an empty box. */
  const settled =
    trade.status === "open" ||
    trade.status === "closed" ||
    trade.status === "failed";

  return (
    <AnimatePresence>
      {show && settled && (
        <motion.div
          /* Drops in from above and lifts back out, so it arrives like the
             curtains do rather than fading in place. */
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none"
        >
          <Badge trade={trade} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Badge({ trade }: { trade: Trade }) {
  switch (trade.status) {
    /* Nothing, while either leg is in flight — the spinner has the curtain to
     * itself, and this is not rendered at all (see above).
     *
     * There used to be a badge here showing the stake — but the stake is a
     * constant, so it was a hardcoded figure standing in for a number nobody knew
     * yet, and it was *wrong* twice over: the fill costs more than the stake once
     * fees and the token account's rent are counted, and a buy that fails costs
     * nothing at all. Either way the player watched `-0.005 SOL` roll up and then
     * get replaced by something that contradicted it.
     *
     * So the badge says nothing until the chain has told us something. What appears
     * is either what actually moved, or ERROR. */
    case "opening":
    case "closing":
      return null;

    /* Bought. What the position actually cost the wallet — fees and the token
       account's rent included, which is why it is a number off the chain and not
       the stake constant. Negative, because it left. */
    case "open":
      return <Box tone="loss" to={-sol(trade.lamportsIn)} />;

    case "closed": {
      /* The sign of the P&L picks the colour — not the fact that money came back.
         Getting back less SOL than went out is a loss even though SOL came back,
         and a green badge would be lying about it. Grey is reserved for a position
         that moved not at all, which has no direction to colour.

         The colour, the arrow and the figure are all read off this one number, so
         they cannot disagree: a red box always carries a down arrow.

         Worth being honest about which way this usually lands: a round trip
         through a bonding curve pays pump's fee twice and the network's twice, so
         a run where the token did nothing at all comes back *red*. The player is
         betting the token moves enough to clear the spread. It mostly will not.
         That is a real bet rather than a decorative one, which is the point. */
      const pnl = sol(trade.pnl);
      const stake = sol(trade.lamportsIn);

      const tone = pnl === 0 ? "dead" : pnl > 0 ? "gain" : "loss";

      /* The SOL back, and — in brackets under it — what the run made as a share of
         what it cost. Two different numbers, and the second is the one the run was
         played for: the player can get 0.0071 SOL back off a 0.0073 SOL buy, and
         without the bracket that reads as money arriving rather than money lost.

         The stake goes with it, because the bracket is a percentage *of* something —
         and that something is what the buy cost, which is the only figure the profit
         means anything against. */
      return (
        <Box
          tone={tone}
          to={sol(trade.lamportsOut)}
          signed
          pnl={pnl}
          stake={stake}
        />
      );
    }

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

/** The box, and what is in it: the figure, and — on a closed position — the P&L. */
function Box({
  tone,
  to,
  signed = false,
  pnl,
  stake,
}: {
  tone: keyof typeof TONES;
  to: number;
  signed?: boolean;
  /** What the round trip made or lost. Only a closed position has one — the buy
      leg has nothing to compare itself against yet. */
  pnl?: number;
  /** What the buy cost, which is what the P&L is a percentage *of*. */
  stake?: number;
}) {
  return (
    <div
      role="status"
      className={`border-2 px-4 py-2 text-center tabular-nums ${TONES[tone]}`}
    >
      {/* Keyed on the figure, so a new one is a new counter and rolls from zero
          rather than inheriting the finished roll of the last. */}
      <Counter key={to} to={to} signed={signed} />

      {/* The result of the bet, in brackets under the money that came back.
          Bright — this is the one number the run was actually played for, and it
          is the only thing on the badge that carries a colour of its own rather
          than inheriting the box's.

          An arrow rather than a sign. `+` and `-` are two characters that differ by
          one stroke, at ten pixels, on a badge the player sees for three seconds;
          an arrow is a shape, and it is read rather than parsed. It carries the
          direction, so the figure itself is unsigned. */}
      {pnl !== undefined && stake !== undefined && (
        <div className={`mt-2 leading-none ${PNL_TONES[tone]}`}>
          ({percent(pnl, stake)})
        </div>
      )}
    </div>
  );
}

/**
 * What the run made, as a percentage of what it cost — with an arrow for the
 * direction.
 *
 * Always a percentage, never SOL. The P&L in SOL is a figure with six leading zeros
 * that changes in its last two digits: technically the truth, and unreadable in the
 * three seconds the badge is up. As a share of the stake it is `2.4%`, which is the
 * number a person actually holds in their head — and it is the honest denominator,
 * because the stake is what was risked to get it.
 *
 * Significant digits rather than decimal places, because a ratio has no fixed floor
 * to round against: `toFixed(2)` would flatten every move smaller than 0.01% to
 * `0.00%`, and at this stake that is most of them. `toPrecision` resolves whatever
 * it is handed — `0.0054%` on a move the SOL figure could not see at all, `3.3%` on
 * a real one — and `Number` strips the exponent form and trailing zeros it can
 * produce.
 *
 * A zero stake would make this a division by zero. It cannot happen — a position
 * that cost nothing was never opened — but the badge answers rather than printing
 * `Infinity%` if it ever does.
 */
function percent(pnl: number, stake: number): string {
  if (!stake) return "—";

  const value = (pnl / stake) * 100;
  const magnitude = Number(Math.abs(value).toPrecision(PERCENT_DIGITS));

  return `${arrow(value)}${magnitude}%`;
}

/** Up on a profit, down on a loss, and a dash when nothing moved — the direction as
    a shape rather than as a `+`/`-`, which at ten pixels differ by a single stroke. */
function arrow(value: number): string {
  if (value === 0) return "—";
  return value > 0 ? "▲" : "▼";
}

/** Significant digits in the percentage. Two is enough to tell a run that lost to
    the spread from one that lost to the market, and few enough that the bracket
    stays a glance rather than a read. */
const PERCENT_DIGITS = 2;

/* The bracketed P&L, brighter than the box it sits in — see `--blood-bright` in
   globals.css for why the red needs a lift here and the green does not.

   `dead` is a move too small for DECIMALS to resolve, so it stays grey rather than
   claiming a direction the digits cannot back up. */
const PNL_TONES = {
  loss: "text-blood-bright",
  gain: "text-cash-bright",
  dead: "text-neutral-500",
} as const;

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
