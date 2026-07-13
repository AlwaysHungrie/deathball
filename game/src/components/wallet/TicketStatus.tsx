"use client";

import {
  getExplorerUrl,
  useWalletUi,
  useWalletUiWallet,
  type UiWallet,
  type UiWalletAccount,
} from "@wallet-ui/react";
import { Logout } from "pixelarticons/react/Logout";
import { Wallet } from "pixelarticons/react/Wallet";
import { useState } from "react";
import Dialog from "@/components/ui/Dialog";
import Spinner from "@/components/ui/Spinner";
import { useBuyTicket, type Ticket } from "@/hooks/use-ticket";
import { TICKET_IMAGE_URI } from "@/lib/ticket-assets";

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
  const { connected, wallet } = useWalletUi();

  // `connected` is only ever true with a wallet behind it, but nothing in the
  // type says so — hence the second check, which is really just how that fact is
  // told to the compiler.
  if (!connected || !wallet) return null;

  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
      <Badge ticket={ticket} onBuy={onBuy} />

      {/* Only with a ticket, because only then is there a game wallet to look
          at. Before that the button would have nowhere to go. */}
      {ticket.status === "owned" && (
        <GameWalletButton address={ticket.gameWallet} />
      )}

      <ExitButton wallet={wallet} />
    </div>
  );
}

/** Shared by both buttons in the corner, so they read as a pair. */
const iconButton =
  "border-2 border-neutral-100/70 bg-neutral-950/70 p-2 text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-neutral-950 active:translate-y-px";

/**
 * The game wallet, on the explorer.
 *
 * The *game* wallet — not the one the player connected. That is the whole point
 * of it: the connected wallet holds the ticket, but the game wallet is what
 * stakes and what wins, and it is the one whose balance this corner has been
 * reporting all along. Sending them to their own address here would be sending
 * them to look at the wrong money.
 *
 * The cluster is read rather than assumed, so the link lands on whichever one
 * the game is actually registered against — see `SolanaProvider`, where there is
 * only ever the one.
 */
function GameWalletButton({ address }: { address: string }) {
  const { cluster } = useWalletUi();

  return (
    <a
      href={getExplorerUrl({
        network: { id: cluster.id, url: cluster.url },
        path: `/address/${address}`,
        provider: "solana",
      })}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View game wallet on the explorer"
      title={`Game wallet: ${address}`}
      className={iconButton}
    >
      <Wallet width={20} height={20} aria-hidden />
    </a>
  );
}

/**
 * Leaving, and meaning it.
 *
 * wallet-ui's own `disconnect` — the one on the context — only forgets the
 * account. It does not tell the wallet anything, so the wallet goes on trusting
 * the site, and the site's own `AutoConnect` will happily ask it for that trust
 * again on the next render and be given it. The player presses EXIT and lands
 * right back where they were.
 *
 * So leaving is both: the account is forgotten, *and* the wallet is told through
 * its own `standard:disconnect`. The first is what the screen watches, and what
 * clears the saved key that `AutoConnect` reconnects from; the second revokes the
 * authorization behind it, so there is nothing left to be silently given back.
 *
 * The order is the whole subtlety, and it is forget-then-tell. Told first, the
 * wallet drops its accounts and re-announces itself synchronously, and wallet-ui
 * — which clears an account whose wallet no longer has it, and does so *in its
 * render body* — sets state as it renders, while this component's own `forget`
 * is still coming. That is two updates racing through one provider, and React
 * says so: "Cannot update a component while rendering a different component."
 * Forgetting first means there is no account left for it to trip over, and the
 * disconnect that follows is uneventful.
 *
 * It is a component and not a handler because `useWalletUiWallet` is a hook and
 * takes the wallet, and there is no wallet to give it until there is one — see
 * the guard above.
 */
function ExitButton({ wallet }: { wallet: UiWallet }) {
  const { disconnect: forget } = useWalletUi();
  const { disconnect: leave, isDisconnecting } = useWalletUiWallet({ wallet });

  async function onExit() {
    forget();

    try {
      await leave();
    } catch {
      // The wallet would not let go. The player is off the screen either way —
      // they have been forgotten, which is what they asked for. All that is lost
      // is the revocation, and the worst of that is that a later visit could
      // reconnect them, which is where they started.
    }
  }

  return (
    <button
      type="button"
      onClick={onExit}
      disabled={isDisconnecting}
      aria-label="Disconnect wallet"
      title="Disconnect wallet"
      // Red on hover, where its neighbour goes white: this is the one that ends
      // the session, and it should not be a coin-flip which of two identical
      // buttons the player is about to press.
      className={`${iconButton} hover:bg-blood hover:text-neutral-100 disabled:opacity-50`}
    >
      <Logout width={20} height={20} aria-hidden />
    </button>
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
  /** Settles the purchase and reports what it found — see `useTicket`. */
  onBought: () => Promise<Ticket>;
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
  /** Settles the purchase and reports what it found — see `useTicket`. It
      returns a ticket because the dialog cannot close until it is `owned`. */
  onBought: () => Promise<Ticket>;
}) {
  const buy = useBuyTicket(account);

  /* What the dialog is waiting on, and it is not one thing.

     `minting` is the wallet: the player signing, and the transaction going out.
     `funding` is everything after: the mint confirming on chain, the server
     seeing it, and the 0.05 SOL landing in the game wallet. The second is the
     longer wait and the one that used to be invisible — the dialog closed the
     moment the wallet returned, which is *before* any of it has happened. */
  const [stage, setStage] = useState<"idle" | "minting" | "funding">("idle");
  const [error, setError] = useState<string | null>(null);

  const pending = stage !== "idle";
  const priceSol = ticket.status === "none" ? ticket.priceSol : null;

  async function onBuy() {
    setStage("minting");
    setError(null);

    try {
      await buy();
    } catch (cause) {
      // Includes the player simply dismissing their wallet's popup, which is not
      // worth an alarm — it leaves the dialog open with the reason on it, and
      // they can try again.
      setError(
        cause instanceof Error ? cause.message : "Could not buy a ticket.",
      );
      setStage("idle");
      return;
    }

    /* Signed and sent — but not *bought*. The wallet returns as soon as the mint
       is on its way, and at that moment the player has paid and has nothing: the
       asset is unconfirmed, and the SOL that the ticket entitles them to has not
       been sent, because it is the server that sends it and only once it can see
       the mint on chain. Closing here, which is what this used to do, drops them
       back on a home screen that reads TICKET MISSING over a wallet they just
       paid from.

       So the dialog stays up, and the spinner with it, until a status read comes
       back holding a ticket and a funded wallet. `settle` is what waits — see
       `use-ticket`. */
    setStage("funding");

    const result = await onBought();

    if (result.status === "owned") {
      onClose();
      setStage("idle");
      return;
    }

    /* It did not land. The money is not lost — the mint is on chain or it is not,
       and if it is, the funding is owed and the next home-screen load will pay it,
       because `settle` reconciles against the chain rather than against anything
       we remembered. But it has not happened *yet*, and saying so is better than
       closing on a lie. */
    setError(
      result.status === "error"
        ? result.message
        : "The mint went through, but the ticket has not shown up yet. Reload in a moment — nothing is lost.",
    );
    setStage("idle");
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
            standing on the pitch behind this dialog.

            Served from the bucket, not from `public/`, so that what the player is
            shown before they buy is the very same file the NFT will point at
            afterwards. Two copies would be two things free to drift apart, and
            the one that matters is the one on chain. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={TICKET_IMAGE_URI}
          alt="Deathball World Cup Ticket"
          width={160}
          height={160}
          className="border-2 border-neutral-100/70 [image-rendering:pixelated]"
        />

        <p className="text-center text-[9px] leading-relaxed text-neutral-400">
          You need to buy a World Cup ticket{" "}
          {priceSol !== null && (
            <span className="text-neutral-100">{priceSol} SOL</span>
          )}{" "}
          in order to play.
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
          {/* The two waits are named, because they are not the same wait and the
              second is the long one. A player watching MINTING for fifteen
              seconds after their wallet has already closed would reasonably
              assume it had hung. */}
          {stage === "minting" ? (
            <>
              <span className="scale-50">
                <Spinner label="Minting your ticket" />
              </span>
              MINTING
            </>
          ) : stage === "funding" ? (
            <>
              <span className="scale-50">
                <Spinner label="Funding your game wallet" />
              </span>
              FUNDING WALLET
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
