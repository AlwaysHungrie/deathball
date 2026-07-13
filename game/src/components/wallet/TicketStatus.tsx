"use client";

import { useWalletUi, type UiWalletAccount } from "@wallet-ui/react";
import { useState } from "react";
import Dialog from "@/components/ui/Dialog";
import Spinner from "@/components/ui/Spinner";
import { useBuyTicket, type Ticket } from "@/hooks/use-ticket";

const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * The badge, top-right of the stage.
 *
 * It shows the ticket rather than the wallet. A player's own SOL balance is not
 * the interesting number here — it is not what the game stakes and not what a
 * goal wins back. What matters is whether they have bought in, and what is in
 * the game wallet that buying in funded. Before the ticket, there is nothing to
 * report but the price of one.
 *
 * The ticket is passed in rather than read here. `StartScreen` needs the same
 * answer for its primary button, and one read handed to both is one answer;
 * two reads would be two, free to disagree.
 */
export default function TicketStatus({
  ticket,
  onBuy,
}: {
  ticket: Ticket;
  onBuy: () => void;
}) {
  const { connected, disconnect } = useWalletUi();

  if (!connected) return null;

  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
      <Badge ticket={ticket} onBuy={onBuy} />

      <button
        type="button"
        onClick={disconnect}
        aria-label="Disconnect wallet"
        className="border-2 border-neutral-100/70 bg-neutral-950/70 px-2 py-2 text-[10px] text-neutral-100 transition-colors hover:bg-blood hover:text-neutral-100 active:translate-y-px"
      >
        EXIT
      </button>
    </div>
  );
}

/** One badge, whatever the ticket is doing. */
function Badge({ ticket, onBuy }: { ticket: Ticket; onBuy: () => void }) {
  const frame =
    "border-2 border-neutral-100/70 bg-neutral-950/70 px-2 py-2 text-[10px] text-neutral-100 tabular-nums";

  switch (ticket.status) {
    case "owned":
      // The game wallet's balance — the money that actually gets bet.
      return (
        <span className={frame} title={`Game wallet: ${ticket.gameWallet}`}>
          <span className="mr-1 text-blood">◆</span>
          {formatSol(ticket.lamports)} <span className="opacity-60">SOL</span>
        </span>
      );

    case "none":
      // The only badge that is a button: with no ticket there is no balance
      // worth reporting, so the space is better spent saying so — and the
      // primary button downstairs is the one that sells one.
      return (
        <button
          type="button"
          onClick={onBuy}
          className={`${frame} transition-colors hover:bg-blood active:translate-y-px`}
        >
          TICKET MISSING
        </button>
      );

    case "error":
      return (
        <span className={frame} title={ticket.message}>
          <span className="text-blood">ERR</span>
        </span>
      );

    default:
      // loading, disconnected — nothing to say yet.
      return (
        <span className={frame}>
          <span className="opacity-60">…</span>
        </span>
      );
  }
}

/**
 * The sale.
 *
 * One signature does the whole purchase: the payment and the mint are two
 * instructions in one transaction, so they cannot come apart — the player
 * cannot pay without minting or mint without paying.
 *
 * The 0.05 SOL is not in that transaction. It is sent by the server afterwards,
 * once it can see the mint on chain, which is why this calls `onBought` rather
 * than declaring the balance itself: the refresh is what triggers the payout and
 * then reports it. A player who closes the tab in between still gets it — the
 * next load reconciles. See `settle` in `ticket.ts`.
 */
export function BuyTicketDialog({
  open,
  ticket,
  onClose,
  onBought,
}: {
  open: boolean;
  ticket: Ticket;
  onClose: () => void;
  onBought: () => void;
}) {
  const { account } = useWalletUi();

  /* No account, no dialog — and the guard has to be here, in a component that
     does not itself call `useBuyTicket`.

     That hook reaches into the account it is given, so calling it without one
     throws. It is a hook, so it cannot be skipped or deferred; the only way to
     not call it is to not render the thing that calls it. Hence the split: this
     component decides whether there is a wallet, and `Buying` below does the
     buying, and only ever mounts once the answer is yes. On the server, where
     there is no wallet at all, that is what keeps the page renderable. */
  if (!account) return null;

  return (
    <Buying
      open={open}
      account={account}
      ticket={ticket}
      onClose={onClose}
      onBought={onBought}
    />
  );
}

/** The dialog proper. Mounts only with an account in hand — see above. */
function Buying({
  open,
  account,
  ticket,
  onClose,
  onBought,
}: {
  open: boolean;
  account: UiWalletAccount;
  ticket: Ticket;
  onClose: () => void;
  onBought: () => void;
}) {
  const buy = useBuyTicket(account);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceSol = ticket.status === "none" ? ticket.priceSol : null;

  async function onBuy() {
    setPending(true);
    setError(null);

    try {
      await buy();
      onBought();
      onClose();
    } catch (cause) {
      // Includes the player simply dismissing their wallet's popup, which is not
      // worth an alarm — it leaves the dialog open with the reason on it, and
      // they can try again.
      setError(
        cause instanceof Error ? cause.message : "Could not buy a ticket.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      // A mint in flight has been signed and sent; closing the dialog would not
      // call it back, it would just hide it. So the dialog holds until it lands.
      onClose={pending ? () => {} : onClose}
      title="WORLD CUP TICKET"
    >
      <div className="flex flex-col items-center gap-4">
        {/* The artwork itself — the same goal and the same idling footballer
            standing on the pitch behind this dialog. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nft/ticket.gif"
          alt="Deathball World Cup Ticket"
          width={160}
          height={160}
          className="border-2 border-neutral-100/70 [image-rendering:pixelated]"
        />

        <p className="text-center text-[9px] leading-relaxed text-neutral-400">
          Mint the ticket to play.
          {priceSol !== null && (
            <>
              {" "}
              It costs{" "}
              <span className="text-neutral-100">{priceSol} SOL</span> —
            </>
          )}{" "}
          and <span className="text-neutral-100">0.05 SOL</span> of that goes
          straight into your game wallet to bet with.
        </p>

        {error && (
          <p className="text-center text-[9px] leading-relaxed text-blood">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onBuy}
          disabled={pending}
          className="flex items-center gap-2 border-4 border-neutral-100 bg-blood px-4 py-3 text-[10px] text-neutral-100 transition-transform hover:scale-105 active:translate-y-1 disabled:opacity-50 disabled:hover:scale-100"
        >
          {pending ? (
            <>
              <span className="scale-50">
                <Spinner label="Minting your ticket" />
              </span>
              MINTING
            </>
          ) : priceSol !== null ? (
            `MINT — ${priceSol} SOL`
          ) : (
            "MINT"
          )}
        </button>
      </div>
    </Dialog>
  );
}

/** Lamports to a display string: always 2+ decimals, but never rounds real value
    away — a dust balance of 0.00042 SOL reads as 0.00042, not 0.00. */
function formatSol(lamports: bigint): string {
  const whole = (lamports / LAMPORTS_PER_SOL).toLocaleString("en-US");
  const fraction = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${whole}.${fraction}`;
}
