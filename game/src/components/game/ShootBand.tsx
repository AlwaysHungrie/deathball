"use client";

import { FlagPattern } from "@/components/ui/Flag";
import type { Country } from "@/lib/flags";

/**
 * The shot: freezes the world where it stands.
 *
 * It sits in a band run right across the foot of the screen and over everything,
 * so it is under his thumb wherever the run has got to. The band is dark but
 * see-through, so the pitch keeps running underneath it, with his flag strung
 * across it as pennants — a hoarding behind the button rather than something
 * competing with it.
 *
 * The caller decides whether there is a shot to take at all. When the market does
 * not fancy his side the whole band goes with it — no button, no hoarding, no
 * explanation. The pitch simply offers nothing, and the way to find out why is to
 * look at the clock and wind it on.
 */
export default function ShootBand({
  colours,
  onShoot,
}: {
  /** The strip behind the button: the side being played for, not the home side —
      it is his hoarding, and he chose which one he is. */
  colours: Country;
  onShoot: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-5 z-50 flex justify-center overflow-clip bg-neutral-950/40 py-2">
      <FlagPattern country={colours} className="absolute inset-0 opacity-30" />

      <button
        onClick={onShoot}
        className="relative border-2 border-neutral-100 bg-blood px-4 py-2 text-sm text-neutral-100 transition-transform hover:scale-105 active:translate-y-1"
      >
        SHOOT
      </button>
    </div>
  );
}
