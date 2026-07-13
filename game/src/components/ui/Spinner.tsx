/* Eight pips on a ring that steps round in whole eighths. The pips are fixed to
   the ring and fade by position, so rotating the ring carries the bright head
   around with it.

   Stepped, not swept: a smooth 60fps sweep is the one modern thing that could
   appear on a screen where everything else moves in whole pixels. See `.pip-ring`
   in globals.css, which does the stepping.

   Lives here rather than in the reel because both the reel and the pitch wait on
   things now — the reel on a match's odds, the pitch on a swap confirming — and
   two waits that look different would read as two different kinds of wait. */
export default function Spinner({ label }: { label: string }) {
  const pips = 8;
  const radius = 13;

  return (
    <div role="status" aria-label={label} className="pip-ring relative h-8 w-8">
      {Array.from({ length: pips }, (_, i) => {
        const angle = (i / pips) * 2 * Math.PI - Math.PI / 2;
        return (
          <span
            key={i}
            className="absolute h-1.5 w-1.5 bg-neutral-100"
            style={{
              left: `calc(50% + ${Math.cos(angle) * radius}px - 3px)`,
              top: `calc(50% + ${Math.sin(angle) * radius}px - 3px)`,
              opacity: 0.2 + (i / (pips - 1)) * 0.8,
            }}
          />
        );
      })}
    </div>
  );
}
