"use client";

import { address, createSolanaRpc } from "@solana/kit";
import { useWalletUi } from "@wallet-ui/react";
import { useCallback, useEffect, useState } from "react";

const LAMPORTS_PER_SOL = 1_000_000_000n;

type SolBalance =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; amount: string };

export function useSolBalance() {
  const { account, cluster } = useWalletUi();
  const [balance, setBalance] = useState<SolBalance>({ status: "loading" });

  const address_ = account?.address;
  const url = cluster.url;

  // Bumping this refetches. Going through state rather than calling the fetch
  // directly keeps every setBalance behind an await, which is what the
  // set-state-in-effect rule wants to see.
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!address_) return;
    const owner = address(address_);

    // Drops the response if the account or cluster changes while it is in flight,
    // so a slow request for the old wallet cannot overwrite the new one.
    let cancelled = false;

    async function load() {
      try {
        const rpc = createSolanaRpc(url);
        // SOL is native, so it lives on the account itself rather than in a token
        // account — one call, no mint, no summing.
        const { value } = await rpc.getBalance(owner).send();
        if (cancelled) return;
        setBalance({ status: "ready", amount: formatSol(BigInt(value)) });
      } catch (error) {
        if (cancelled) return;
        setBalance({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to load balance",
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address_, url, nonce]);

  return { balance, refresh };
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
