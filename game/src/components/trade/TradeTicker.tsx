"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { STAKE_USD } from "@/lib/stake";
import { useTrade, type Trade } from "@/context/TradeProvider";

/**
 * The money, on screen. A figure and a colour, and nothing else.
 *
 * Red on the way out, green on the way back — and the green is only green if the
 * player is actually up, which is the one honest thing this badge does. It is the
 * same box as the wallet balance and the match clock: bordered, dark, tabular,
 * pixel-font. One piece of furniture in three places.
 *
 * There is deliberately no caption. Everything the badge has to say is said by
 * the number and its colour, and a line of explanatory text under a figure that
 * large is the interface apologising for not being clear. The player knows what
 * -$0.05 in red means without being told.
 *
 * The number counts rather than appears. A figure that simply pops into place
 * reads as a label; a figure that ticks reads as a transaction, and the whole
 * point of the mechanic is that a real one is happening.
 */
export default function TradeTicker({ show }: { show: boolean }) {
  const { trade } = useTrade();

  /* Only on the curtains — never over live play.

     The trade is settled *between* runs: bought on the team-select curtain,
     cashed out on the game-over one. While the ball is moving there is nothing
     happening to the money at all, so a badge hanging over the pitch would be a
     stale figure competing with the game for the one thing the player has to
     spare, which is attention. It leaves when the ball does, and comes back when
     the ball stops. */
  const on = show && trade.status !== "idle";

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
    /* The stake, before the fill is known. It is what the game is about to spend,
       not what it spent — the settled figure replaces it a moment later, and is
       usually the same to the cent. */
    case "opening":
      return <Box tone="loss" to={-STAKE_USD} />;

    case "open":
      return <Box tone="loss" to={-trade.usdIn} />;

    case "closing":
      return <Box tone="loss" to={-trade.usdIn} />;

    case "closed": {
      /* The sign of the P&L picks the colour — not the fact that money came back.
         Getting 4.9 cents back for a nickel is a loss, and a green badge would be
         lying about it.

         Flat is whatever the figure cannot show. The badge resolves to DECIMALS
         places, so a P&L smaller than one unit of the last digit is a move the
         player has no way of seeing — and colouring the badge over a change that
         is not on screen is the interface knowing something it will not say.
         Anything the digits *can* show gets a colour; anything they cannot is
         grey. The threshold and the display are therefore the same decision, and
         cannot drift apart.

         This used to be half a cent, back when the figure showed two places. That
         made almost every run grey, which was honest but useless: BONK moves, and
         the badge was refusing to admit it.

         A goal that dug dead positions out of the wallet is green regardless. The
         player just got back money they had already been told was gone, and what
         BONK did in the last two minutes is noise beside it. */
      const FLAT_USD = 10 ** -DECIMALS;

      const tone =
        trade.rescued > 0
          ? "gain"
          : Math.abs(trade.pnl) < FLAT_USD
            ? "dead"
            : trade.pnl > 0
              ? "gain"
              : "loss";

      return <Box tone={tone} to={trade.usdOut} signed />;
    }

    /* He died, so the position was never sold: the tokens sit in the wallet and
       the ticket naming them is gone. The badge does not perform a settlement it
       never made — the figure stays at what was staked, negative.

       Stranded, though, not burned: the next goal sells the wallet's whole
       holding, so this five cents is waiting to be won back with the rest of the
       pile. The badge does not say that in words, because it does not say
       anything in words. */
    case "lost":
      return <Box tone="loss" to={-trade.usdIn} />;

    /* No trade happened at all — no key, no route, or a wallet drained by too
       many deaths. Grey, not red: red is the colour of losing money, and a trade
       that never happened did not lose any.

       The one place a word is unavoidable. There is no figure to show, because
       nothing moved, and an empty box would read as a bug. */
    case "failed":
      return (
        <div
          role="status"
          className="border-2 border-neutral-100/40 bg-neutral-950/90 px-3 py-2 text-center text-sm text-neutral-400"
        >
          NO TRADE
        </div>
      );

    default:
      return null;
  }
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

  return <Figure text={dollars(shown, signed)} />;
}

/**
 * A dollar figure whose moving digits are the ones you can see.
 *
 * `+$0.05005` is technically the whole truth and practically a wall — nine
 * characters that look identical run to run, with the only thing that ever
 * changes buried at the end of them. So the figure is split: `+$0.05` at full
 * weight, because that is the stake and it is what the player is tracking, and
 * the trailing digits smaller and dimmer, because that is the market and it is
 * the only part that moves.
 *
 * The result reads as one number at a glance and as two on inspection, which is
 * exactly the relationship the two halves have. Nothing is hidden — a big move
 * pushes into the bold part on its own, and the badge starts changing where the
 * eye was already looking.
 */
function Figure({ text }: { text: string }) {
  // Everything past the cents. `toFixed(DECIMALS)` guarantees exactly DECIMALS
  // digits after the point, so the tail is a fixed length and this is arithmetic
  // rather than parsing.
  const cut = text.length - (DECIMALS - CENTS);

  return (
    <span className="leading-none">
      <span className="text-lg">{text.slice(0, cut)}</span>
      {/* The market's digits. Dimmed rather than hidden: they are the point, but
          they are not the headline. */}
      <span className="text-[10px] opacity-70">{text.slice(cut)}</span>
    </span>
  );
}

/**
 * How many decimals the money is shown to.
 *
 * Five, not two. Two is the number of decimals dollars have, and it is completely
 * useless here: a five-cent position needs BONK to move *ten percent* before
 * `$0.05` becomes `$0.06`, so at two places the badge is a constant and the whole
 * mechanic is invisible. Every run reads `-$0.05` then `+$0.05` and the market may
 * as well not exist.
 *
 * Five places resolves a 0.1% move, which is the scale BONK actually wanders at
 * over the couple of minutes a run lasts. The cost is a long number — but a long
 * number that changes beats a short one that cannot.
 */
const DECIMALS = 5;

/** Decimals in the bold half: `$0.05`, which is the stake and is what the player
    is tracking. The remaining `DECIMALS - CENTS` are the market — see `Figure`. */
const CENTS = 2;

/**
 * Money, as money — but at the precision the money actually moves at.
 *
 * The sign is explicit on a cashed-out position, where the player is being told a
 * direction and not just a figure.
 */
function dollars(value: number, signed: boolean): string {
  const sign = value < 0 ? "-" : signed ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(DECIMALS)}`;
}
