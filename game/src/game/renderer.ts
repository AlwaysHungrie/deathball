import {
  DIRT,
  DIRT_DARK,
  drawMarkings,
  GRASS,
  GRASS_DARK,
  makeTufts,
  type Tuft,
} from "./field";
import {
  AWARENESS_RADIUS,
  INFLUENCE_RADIUS,
  mudAlpha,
} from "./opponent";
import {
  GOAL_FPS,
  GOAL_FRAMES,
  GOAL_HEIGHT,
  GOAL_WIDTH,
  loadBall,
  loadGoal,
  loadMud,
  loadTeamSheet,
  MUD_HEIGHT,
  MUD_WIDTH,
  TEAMS,
  type Team,
} from "./sprites";
import type { World } from "./world";

/**
 * Drawing the world. Nothing here decides anything — it is handed a `World` and a
 * context, and puts one into the other.
 *
 * The split from `World` is what makes both readable: the rules of a run no
 * longer sit interleaved with `drawImage` calls, and the draw order — which is a
 * real design decision, see `paintBodies` — is no longer buried in the middle of
 * the physics.
 */

/** The influence spheres are a debugging aid, so they only exist in `next dev`. */
const DEBUG = process.env.NODE_ENV === "development";

/**
 * Drawn size of the goal. The frame is 168px across, so this puts the mouth a
 * shade wider than the six-yard box it stands in — which is about right, and
 * keeps it inside the touchlines on a phone.
 */
const GOAL_SCALE = 1.4;

/**
 * How far the goal's mouth sits *past* the goal line, in world pixels. The sprite
 * is drawn looking down at the goal from behind the player, so its open end is the
 * bottom edge of the frame and the net runs away from us. Nudging the mouth a
 * touch over the chalk sits the posts on the line rather than behind it.
 */
const GOAL_MOUTH = 6;

/** Everything the renderer needs off disk. Loaded once, then drawn every frame. */
export type Sprites = {
  /** Opponents wear whatever kit they were spawned in, so every sheet has to be
      on hand, not just the player's. */
  sheets: Map<Team, HTMLImageElement>;
  mud: HTMLImageElement | null;
  ball: HTMLImageElement | null;
  goal: HTMLImageElement | null;
};

/**
 * Load every sprite the pitch needs.
 *
 * Each one is dropped into the bag as it lands rather than awaited together: the
 * loop starts drawing immediately and simply skips whatever has not arrived yet,
 * so the pitch paints from the first frame instead of holding a blank canvas until
 * the slowest PNG is in.
 *
 * The returned `dispose` is not optional housekeeping. A sheet can land after the
 * component has unmounted — the loads are promises, and nothing cancels an image
 * decode — and writing it into a bag nobody is drawing from any more is a write
 * into a torn-down render. Calling `dispose` is what makes those writes no-ops.
 */
export function loadSprites(): { sprites: Sprites; dispose: () => void } {
  const sprites: Sprites = {
    sheets: new Map(),
    mud: null,
    ball: null,
    goal: null,
  };

  let live = true;

  for (const kit of TEAMS) {
    void loadTeamSheet(kit).then((img) => {
      if (live) sprites.sheets.set(kit, img);
    });
  }
  void loadMud().then((img) => {
    if (live) sprites.mud = img;
  });
  void loadBall().then((img) => {
    if (live) sprites.ball = img;
  });
  void loadGoal().then((img) => {
    if (live) sprites.goal = img;
  });

  return {
    sprites,
    dispose: () => {
      live = false;
    },
  };
}

export class Renderer {
  private tufts: Tuft[];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly sprites: Sprites,
    width: number,
  ) {
    this.tufts = makeTufts(width);
  }

  resize(width: number) {
    this.tufts = makeTufts(width);
  }

  /** @param now `performance.now()`, for sprite animations that run on a clock
      rather than on the world — the goal's net ripples whether or not anyone is
      playing. */
  draw(world: World, now: number) {
    const { ctx } = this;
    const { width, height, camera } = world;

    ctx.imageSmoothingEnabled = false;

    this.paintPitch(width, height, camera);
    this.paintGoal(width, height, camera, now);
    this.paintMud(world, camera);
    this.paintBodies(world, camera);

    if (DEBUG) this.paintInfluence(world, camera);
  }

  /** Grass fills the screen; the dirt band is painted over wherever the far end of
      the field has scrolled into view. */
  private paintPitch(width: number, height: number, camera: number) {
    const { ctx } = this;

    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, width, height);

    // Sparse grass tufts, under the chalk.
    for (const tuft of this.tufts) {
      const ty = tuft.y - camera;
      if (ty < -8 || ty > height) continue;
      ctx.fillStyle = tuft.dark ? GRASS_DARK : "#3d8f4d";
      ctx.fillRect(Math.round(tuft.x), Math.round(ty), tuft.w, tuft.h);
    }

    drawMarkings(ctx, width, height, camera);

    // Dirt caps the top of the field at world y <= 0.
    const dirtBottom = -camera;
    if (dirtBottom > 0) {
      ctx.fillStyle = DIRT;
      ctx.fillRect(0, 0, width, Math.round(dirtBottom));
      // Ragged seam so the grass/dirt edge isn't a ruler line.
      ctx.fillStyle = DIRT_DARK;
      for (let x = 0; x < width; x += 8) {
        const bite = ((x / 8) % 3) * 2;
        ctx.fillRect(x, Math.round(dirtBottom) - 4 - bite, 8, 4 + bite);
      }
    }
  }

  /**
   * The goal, straddling the far goal line at world y=0 — the mouth sitting on the
   * chalk and the frame standing back in the dirt, which is what it would look like
   * from up here. Drawn before the bodies so a footballer in front of it overlaps
   * it rather than being swallowed by the net.
   */
  private paintGoal(
    width: number,
    height: number,
    camera: number,
    now: number,
  ) {
    const sheet = this.sprites.goal;
    if (!sheet) return;

    const goalW = GOAL_WIDTH * GOAL_SCALE;
    const goalH = GOAL_HEIGHT * GOAL_SCALE;
    // Anchor the mouth on the goal line and let the frame run back into the dirt,
    // so the net is the part the player is actually running at.
    const goalY = -camera - goalH + GOAL_MOUTH * GOAL_SCALE;
    if (goalY + goalH <= 0 || goalY >= height) return;

    const frame = Math.floor(now / 1000 / (1 / GOAL_FPS)) % GOAL_FRAMES;
    this.ctx.drawImage(
      sheet,
      frame * GOAL_WIDTH,
      0,
      GOAL_WIDTH,
      GOAL_HEIGHT,
      Math.round(width / 2 - goalW / 2),
      Math.round(goalY),
      goalW,
      goalH,
    );
  }

  /** Scuffs sit on the turf: over the chalk, under everybody's boots. */
  private paintMud(world: World, camera: number) {
    const sheet = this.sprites.mud;
    if (!sheet) return;

    const { ctx } = this;
    for (const scuff of world.mud) {
      const my = scuff.y - camera;
      if (my < -MUD_HEIGHT * scuff.scale || my > world.height) continue;
      const w = MUD_WIDTH * scuff.scale;
      const h = MUD_HEIGHT * scuff.scale;
      ctx.save();
      ctx.translate(scuff.x, my);
      ctx.rotate(scuff.angle);
      ctx.globalAlpha = mudAlpha(scuff);
      ctx.drawImage(sheet, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  /**
   * Everyone is drawn in one pass, sorted by world y, so a body further up the
   * pitch is overlapped by one nearer the camera instead of punching through it.
   * `Footballer.draw` anchors on x/y, so each is handed screen coordinates and then
   * put back.
   *
   * The ball is sorted in with them on the same y, which is what puts it in front
   * of the man when he's dribbling it — it's ahead of him, so it's nearer the
   * camera — and behind him when it's rolled away up the pitch. The one exception
   * is a ball held overhead: it sits *above* the player's head, so its own y is
   * well up the screen and the sort would tuck it in behind him. It's sorted on the
   * player instead — where it really is, as far as the pitch is concerned — while
   * still being drawn up where it floats. So `sortY` and the y it draws at are two
   * different questions.
   */
  private paintBodies(world: World, camera: number) {
    const { ctx } = this;
    const { player, opponents, ball, height } = world;

    type Drawable = { sortY: number; draw: () => void };
    const drawables: Drawable[] = [];

    for (const body of [player, ...opponents.map((o) => o.body)]) {
      const sheet = this.sprites.sheets.get(body.team);
      if (!sheet) continue;
      const screenY = body.y - camera;
      if (screenY < -120 || screenY > height + 120) continue;
      drawables.push({
        sortY: body.y,
        draw: () => {
          const worldY = body.y;
          body.y = screenY;
          body.draw(ctx, sheet);
          body.y = worldY;
        },
      });
    }

    const ballSheet = this.sprites.ball;
    if (ballSheet) {
      const screenY = ball.y - camera;
      if (screenY > -120 && screenY < height + 120) {
        drawables.push({
          // Stuck to him — over his head or out at his hip — it belongs on top of
          // the man carrying it, so it sorts a hair nearer the camera than his
          // feet. Its own y would tuck it in behind him.
          sortY: ball.state === "attached" ? player.y + 0.5 : ball.y,
          draw: () => ball.draw(ctx, ballSheet, screenY),
        });
      }
    }

    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const drawable of drawables) drawable.draw();
  }

  /** Spheres of influence, dev only. The wide ring is where a defender picks up the
      run and comes at the player; the tight one is where he commits. */
  private paintInfluence(world: World, camera: number) {
    const { ctx } = this;

    ctx.save();
    ctx.lineWidth = 1;
    for (const opponent of world.opponents) {
      const oy = opponent.y - camera;
      if (oy < -AWARENESS_RADIUS || oy > world.height + AWARENESS_RADIUS) {
        continue;
      }

      ctx.strokeStyle = opponent.spent
        ? "rgba(255,255,255,0.12)"
        : "rgba(120,200,255,0.35)";
      ctx.beginPath();
      ctx.arc(opponent.x, oy, AWARENESS_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = opponent.spent
        ? "rgba(255,255,255,0.25)"
        : opponent.sliding
          ? "rgba(255,80,80,0.9)"
          : "rgba(255,220,0,0.6)";
      ctx.beginPath();
      ctx.arc(opponent.x, oy, INFLUENCE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
