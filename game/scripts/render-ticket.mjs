/**
 * Renders the world cup ticket's artwork: the start screen, standing still.
 *
 * The NFT shows what the player already knows — the goal with its net rippling,
 * the footballer idling in front of it, both on the strip of grass at the bottom
 * of the home screen. It is the same two spritesheets the game itself draws
 * from, composited here into the one animated image an NFT is allowed to be.
 *
 * Both loops happen to be four frames at six frames a second, so they line up
 * without any resampling: frame N of the GIF is frame N of each. That is luck,
 * but it is load-bearing luck — a goal on a different cadence would need the
 * frame count to be the lowest common multiple of the two.
 *
 * Output is committed, not generated at build time. The art is fixed, the
 * sprites are fixed, and an NFT whose image can change between deploys is not
 * really an NFT. Re-run only if the sprites themselves change:
 *
 *     node scripts/render-ticket.mjs
 */

import { createCanvas, loadImage } from "canvas";
// gifenc ships CommonJS, so its exports arrive on the default rather than as
// named ones.
import gifenc from "gifenc";
import { writeFileSync } from "node:fs";

const { GIFEncoder, quantize, applyPalette } = gifenc;

/* -- the sheets ------------------------------------------------------------ */

const GOAL = { w: 168, h: 90, frames: 4 };

/** The footballer's sheet: 16x20 cells, and idle is the top row. See `sprites.ts`. */
const PLAYER = { w: 16, h: 20, frames: 4, row: 0 };

/** San Lorenzo, which is the jersey the home screen's idle player wears. */
const TEAM = "sanlorenzo";

/* -- the picture ----------------------------------------------------------- */

/** Square, because every wallet and marketplace crops to one anyway. */
const SIZE = 512;

/** Six frames a second, as both animations run in game. */
const FPS = 6;
const DELAY_MS = 1000 / FPS;

const PITCH = "#2f7a3f";
const NIGHT = "#171717"; // neutral-900, the screen the game sits on

/** Blown up to fill the frame. Integer, so the pixels stay pixels. */
const GOAL_SCALE = 2;

/**
 * The footballer is 16x20 against a goal 168 wide, so drawing both at the same
 * scale leaves him an ant in front of it. He is the subject of the picture, so
 * he is scaled past what the geometry would give him until he reads as one —
 * the goal is scenery, and scenery can afford to be wrong.
 */
const PLAYER_SCALE = 8;

/** Where the grass starts. The goal stands on it and the player in front of it,
    which is the whole composition — same as the home screen's pitch strip.
    High, because the sky is empty and the grass is where everything happens. */
const HORIZON = Math.round(SIZE * 0.3);

async function main() {
  const goal = await loadImage("public/sprites/goal.png");
  const player = await loadImage(`public/sprites/footballers/${TEAM}.png`);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const gif = GIFEncoder();

  for (let frame = 0; frame < GOAL.frames; frame++) {
    // Sky, then grass. Two flat bands — the home screen has no gradient here
    // either, and a pixel-art scene does not want one.
    ctx.fillStyle = NIGHT;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = PITCH;
    ctx.fillRect(0, HORIZON, SIZE, SIZE - HORIZON);

    // The goal, dead centre, its mouth sitting on the horizon.
    const goalW = GOAL.w * GOAL_SCALE;
    const goalH = GOAL.h * GOAL_SCALE;
    const goalX = Math.round((SIZE - goalW) / 2);
    const goalY = Math.round(HORIZON - goalH * 0.55);
    ctx.drawImage(
      goal,
      frame * GOAL.w, 0, GOAL.w, GOAL.h,
      goalX, goalY, goalW, goalH,
    );

    // The footballer, in front of it and on the grass. Anchored at his feet, as
    // `Footballer.draw` anchors him — bottom-centre, not top-left.
    const playerW = PLAYER.w * PLAYER_SCALE;
    const playerH = PLAYER.h * PLAYER_SCALE;
    const feetY = Math.round(SIZE * 0.88);
    ctx.drawImage(
      player,
      frame * PLAYER.w, PLAYER.row * PLAYER.h, PLAYER.w, PLAYER.h,
      Math.round((SIZE - playerW) / 2), feetY - playerH, playerW, playerH,
    );

    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    /* Pixel art is a handful of colours, so the palette is exact rather than
       approximate — quantizing to 256 loses nothing here, and the GIF comes out
       small enough that it can sit in /public without anyone minding. */
    const palette = quantize(data, 256);
    const indexed = applyPalette(data, palette);
    gif.writeFrame(indexed, SIZE, SIZE, { palette, delay: DELAY_MS });
  }

  gif.finish();
  writeFileSync("public/nft/ticket.gif", Buffer.from(gif.bytes()));
  console.log(`wrote public/nft/ticket.gif — ${GOAL.frames} frames at ${FPS}fps`);

  /* Writing the file is no longer the end of it. Nothing reads this path any
     more: the ticket's artwork is served from the bucket, because that is where
     the on-chain metadata points and the app is not allowed to be the thing that
     has to stay up for an NFT to keep working. What is on disk is the source; what
     is in the bucket is what exists. Re-rendering without uploading changes
     nothing anyone can see. */
  console.log(
    "\nnot live yet — upload it:\n" +
      "  npx wrangler r2 object put deathball-nft/ticket.gif \\\n" +
      "    --file=public/nft/ticket.gif --content-type=image/gif --remote",
  );
}

await main();
