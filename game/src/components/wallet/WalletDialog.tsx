"use client";

import {
  useWalletUi,
  useWalletUiWallet,
  type UiWallet,
} from "@wallet-ui/react";
import Dialog from "@/components/ui/Dialog";

/** Wallet picker. One row per wallet the browser has announced. */
export default function WalletDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { wallets } = useWalletUi();

  return (
    <Dialog open={open} onClose={onClose} title="CONNECT WALLET">
      {wallets.length === 0 ? (
        <p className="text-center text-[9px] leading-relaxed text-neutral-400">
          No wallets found. Install Phantom, Solflare or Backpack, then reload.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {wallets.map((wallet) => (
            <li key={`${wallet.name}:${wallet.version}`}>
              <WalletRow wallet={wallet} onConnected={onClose} />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** A row is its own component because connecting is a hook, and hooks cannot be
    called inside the map. */
function WalletRow({
  wallet,
  onConnected,
}: {
  wallet: UiWallet;
  onConnected: () => void;
}) {
  const { connect, isConnecting } = useWalletUiWallet({ wallet });

  async function onClick() {
    try {
      await connect();
      onConnected();
    } catch {
      // The user dismissed the wallet's own approval popup. Nothing to report —
      // leave the dialog open so they can pick again.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isConnecting}
      className="flex w-full items-center gap-3 border-2 border-neutral-100/70 px-3 py-3 text-left text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-neutral-950 active:translate-y-px disabled:opacity-50"
    >
      {/* Wallet-supplied data URI, so next/image would only get in the way. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wallet.icon} alt="" width={20} height={20} aria-hidden />
      <span className="text-[10px]">{wallet.name}</span>
      {isConnecting && (
        <span className="ml-auto text-[8px] opacity-60">…</span>
      )}
    </button>
  );
}
