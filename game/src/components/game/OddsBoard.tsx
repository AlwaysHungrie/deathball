import type { Chances, Side } from "@/lib/odds";

/**
 * The three chances, as the market had them at this moment of the match.
 *
 * All three, not two: the draw is a real outcome and the numbers are only honest
 * because they sum to 100. Dropping it would leave two figures that add to
 * eighty-odd, which invites the reader to assume the rest is rounding.
 *
 * All zeros is the state before the first whistle and after the last — the match
 * is not being played, so the market is not saying anything. It is shown rather
 * than hidden, because a board that vanishes reads as a bug and a board of zeros
 * reads as an answer.
 *
 * Parked, not dead: nothing renders this today. The market still governs the run —
 * the shot is gated on `isFavourite`, which reads the same numbers — it is simply
 * not on show. It lives in a file of its own rather than commented out inside the
 * pitch, so putting it back is an import rather than an archaeology dig.
 */
export default function OddsBoard({
  home,
  away,
  chances,
  side,
}: {
  home: string;
  away: string;
  chances: Chances;
  /** The side the last run was played for, lit up. Null before any run. */
  side: Side | null;
}) {
  const rows: { key: Side | "draw"; name: string; pct: number }[] = [
    { key: "home", name: home, pct: chances.home },
    { key: "draw", name: "DRAW", pct: chances.draw },
    { key: "away", name: away, pct: chances.away },
  ];

  const closed = rows.every((row) => row.pct === 0);

  return (
    <div className="relative flex w-full max-w-[280px] flex-col gap-2 border-2 border-neutral-100/40 bg-neutral-950/70 px-3 py-3">
      <h2 className="text-center text-[8px] leading-none text-neutral-500 uppercase">
        {closed ? "No market" : "Chance of winning"}
      </h2>

      {rows.map(({ key, name, pct }) => {
        // The row he went out for. It is the one that decides whether he gets a
        // shot, so it is the one worth finding at a glance.
        const his = key === side;

        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              {/* Real team names run long — "Bosnia & Herzegovina" is not "SPAIN" —
                  so the name gives way and the number, which is the point, does
                  not. */}
              <span
                className={`truncate text-[9px] uppercase ${
                  his ? "text-neutral-100" : "text-neutral-500"
                }`}
              >
                {name}
              </span>
              <span
                className={`shrink-0 text-[10px] tabular-nums ${
                  his ? "text-neutral-100" : "text-neutral-500"
                }`}
              >
                {pct.toFixed(0)}%
              </span>
            </div>

            {/* The bar is the comparison; the number is the value. Reading three
                percentages against each other is work, and a length is not. */}
            <div className="h-1.5 w-full bg-neutral-800">
              <div
                className={`h-full ${his ? "bg-blood" : "bg-neutral-600"}`}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
