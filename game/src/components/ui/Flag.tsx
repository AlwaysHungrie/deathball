/* A country's flag, cut out of the sprite sheet.

   Two ways we use one: blown up as a backdrop behind a country's name, or
   scattered as a row of little pennants along a strip. Both live here so nobody
   has to remember the `imageRendering` that keeps them 8-bit.

   The one rule everything here exists to honour: the element showing a flag must
   be exactly that flag's size. The sheet is a continuous strip -- flags sit
   shoulder to shoulder with no gutter -- so an element even one pixel wider than
   its flag shows the neighbouring country through the gap. `no-repeat` does not
   save you, because the bleed is not a repeat; it is the next flag along, in the
   same image. Size the window to the flag and clip everything else. */

import { FLAG_H, FLAG_SHEET, flagSprite, type Country } from "@/lib/flags";

/** The sheet's own dimensions. Every scale is a multiple of these. */
const SHEET_W = 1024;
const SHEET_H = 112;

/** One pennant, in px. Small enough to read as a motif rather than a flag. */
const PENNANT_H = 18;

/** Air between them. */
const PENNANT_GAP = 8;

/**
 * One flag, at `scale` screen pixels per sheet pixel.
 *
 * The returned style pins the element to exactly `cell.w x FLAG_H` scaled up.
 * Callers must not override width or height -- that is the whole bleed guard.
 */
function spriteStyle(
  cell: { x: number; y: number; w: number },
  scale: number,
): React.CSSProperties {
  return {
    width: cell.w * scale,
    height: FLAG_H * scale,
    backgroundImage: `url(${FLAG_SHEET})`,
    backgroundPosition: `${cell.x * scale}px ${cell.y * scale}px`,
    backgroundSize: `${SHEET_W * scale}px ${SHEET_H * scale}px`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  };
}

/**
 * A flag as a backdrop, blown up to fill the box the caller puts it in.
 *
 * Two elements. The outer div is the caller's box and does the clipping; the
 * inner one is the flag, sized to exactly `cell.w x FLAG_H` at `scale` and
 * centred. Painting the flag straight onto the caller's box is the bug this is
 * written to avoid: the box is wider than the flag, and the sheet obligingly
 * fills the remainder with whatever country is next along the strip.
 *
 * `scale` is screen pixels per sheet pixel, and it is a plain number rather than
 * anything derived from the box: the flag is 16px tall, so a scale of 14 gives a
 * 224px-tall flag, which covers the carousel's 200px card with room to spare.
 * The overflow is the point -- it is what makes the flag bleed to the edges --
 * and the parent clips it.
 *
 * Note the outer div takes the caller's className *whole*, including its
 * positioning. It deliberately does not add `relative`: the callers position
 * this thing with `absolute inset-0`, and a `relative` of our own would land on
 * the same CSS property and fight it -- which collapses the box to no height at
 * all, and paints nothing.
 */
export default function Flag({
  country,
  scale = 14,
  className = "",
}: {
  country: Country;
  /** Screen pixels per sheet pixel. The flag is 16 sheet-pixels tall. */
  scale?: number;
  /** Where it sits and how big the clipping box is -- the caller owns that. */
  className?: string;
}) {
  const cell = flagSprite(country);
  if (!cell) return null;

  return (
    <div aria-hidden className={`overflow-hidden ${className}`}>
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={spriteStyle(cell, scale)}
      />
    </div>
  );
}

/**
 * The same flag, over and over, as separate little rectangles with air between
 * them. Fills whatever it's put in -- the row wraps, so it works as a strip or a
 * whole panel.
 *
 * The pennants are real elements rather than a repeating background, because a
 * repeated background tiles edge to edge with no way to put air between the
 * copies -- and the air is the point.
 */
export function FlagPattern({
  country,
  className = "",
}: {
  country: Country;
  className?: string;
}) {
  const cell = flagSprite(country);
  if (!cell) return null;

  // Each pennant keeps the flag's own aspect ratio. The sheet's flags are not a
  // common width -- Switzerland is square, Nepal is a pennant already -- so
  // forcing one width would squash half of them.
  const scale = PENNANT_H / FLAG_H;
  const style = spriteStyle(cell, scale);

  return (
    <div
      aria-hidden
      className={`flex flex-wrap content-center justify-center -rotate-6 ${className}`}
      style={{ gap: PENNANT_GAP }}
    >
      {/* Enough to overflow any strip we'd put this in; the overflow is clipped. */}
      {Array.from({ length: 56 }, (_, i) => (
        <div key={i} className="shrink-0" style={style} />
      ))}
    </div>
  );
}
