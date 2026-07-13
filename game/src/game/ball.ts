import type { Footballer } from "./footballer";
import { BALL_FRAMES, BALL_SIZE, FRAME_HEIGHT } from "./sprites";

/**
 * Where the ball is.
 *
 * - `free`     — out on the grass, doing whatever it was last kicked into. The
 *                only state anybody can touch it in, and only while it's stopped.
 * - `attached` — stuck to the player's sprite, because he's in the air or
 *                crossing the pitch. Inert: it can't be kicked, and it can't be
 *                taken. It just goes where he goes until he's done.
 */
export type BallState = "free" | "attached";

/** Drawn scale, matching the footballers' 4x. */
const SCALE = 4;

/**
 * Half the ball's *frame*, in world pixels — its collision size, and how far off
 * screen it has to get before it counts as gone. Deliberately a shade bigger than
 * the ball you can see, which is what BALL_DRAWN_RADIUS is for.
 */
export const BALL_RADIUS = (BALL_SIZE * SCALE) / 2;

/** The player's height on screen, which is what a ball over his head has to clear. */
const PLAYER_HEIGHT = FRAME_HEIGHT * SCALE;

/**
 * Half the width of the *body*, not of the frame it's drawn in.
 *
 * The footballer is 16px wide on the sheet but he doesn't fill it — the body
 * runs x=1..13, so his flank is 6px out from the middle, not 8. Measuring off
 * the frame instead hangs the ball two pixels of dead air away from him on each
 * side, and at 4x that's the gap you can see.
 */
const PLAYER_HALF_WIDTH = 6 * SCALE;

/**
 * The ball's drawn radius, likewise, is smaller than its frame: the sprite is
 * 12px square but the ball inside it spans x=1..10, so it's 5px across the
 * radius, not 6.
 */
const BALL_DRAWN_RADIUS = 5 * SCALE;

/**
 * How far up the pitch the ball sits when it's at his feet — at kickoff, and
 * every time it comes back down off him.
 *
 * This has to clear the *sprite*, not the man. He's drawn anchored on his boots,
 * so his body covers the whole of his height directly above the point he's
 * standing on: anything less and the ball he's supposedly dribbling spends its
 * life behind his chest.
 */
export const LEAD = PLAYER_HEIGHT + BALL_RADIUS + 16;

/** How near his boots have to get to a stopped ball to kick it. */
const KICK_RADIUS = 34;

/**
 * How hard the player hits it.
 *
 * Tuned against his run speed, not picked for feel: kicked this hard it rolls
 * ~95px and comes to rest about a LEAD ahead of him, and he runs it down in
 * under a second. Harder and it settles out of reach and the chase drags; softer
 * and it stops under his feet with the ball never really getting away.
 */
const KICK_SPEED = 420;

/** How hard a defender hits it on his feet — a clearance, not a pass. */
const CLEAR_SPEED = 1200;

/** ...and at full stretch, studs first, with his whole weight behind it. */
const SLIDE_CLEAR_SPEED = 620;

/** Speed lost per second, as the fraction of it surviving. */
const FRICTION = 0.05;

/** Below this it isn't rolling any more, it's just sitting there — and can be kicked. */
const STOP_SPEED = 40;

/** How far above his head the ball rides while he's in the air, resting on his hair. */
const OVERHEAD_LIFT = PLAYER_HEIGHT + BALL_DRAWN_RADIUS;

/**
 * How far out to the side it rides while he's crossing the pitch.
 *
 * Both halves measured off the pixels that are actually drawn, so the ball ends
 * up resting *against* his flank — his body edge, plus the ball's own radius, and
 * nothing else. Any constant added on top of that is just a gap.
 */
const SIDE_LIFT = PLAYER_HALF_WIDTH + BALL_DRAWN_RADIUS;

/**
 * Sprite frames advanced per world pixel travelled.
 *
 * A ball rolls rather than flicks through a loop, so the tumble is tied to the
 * ground it covers, not to a clock. The rate isn't a taste knob: a ball of
 * radius r covers its own circumference, 2πr, in exactly one revolution, so the
 * sheet has to play out over that distance and no other.
 */
const ROLL_RATE = BALL_FRAMES / (2 * Math.PI * BALL_RADIUS);

/**
 * Frames per second it turns over while stuck to him, where there's no ground to
 * roll against. It still spins — it's a ball, not a prop — but to its own clock.
 * Pitched to sit with the footballers' cycles, which run at 6–10fps.
 */
const ATTACHED_SPIN = 8;

export class Ball {
  x: number;
  y: number;

  state: BallState = "free";

  /** Velocity, world px/sec. Zero means it's sitting there to be kicked. */
  vx = 0;
  vy = 0;

  /** Where the tumble is up to, in frames. Fractional; drawn rounded down. */
  private spin = 0;

  /**
   * Whether it's attached *above* him rather than beside him. Only a ball over
   * his head is genuinely off the ground, and only that one casts a shadow — one
   * riding at his hip is still at grass height.
   */
  private lifted = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /**
   * Is it sitting still on the grass?
   *
   * This is the whole collision rule. A stopped ball is up for grabs — the player
   * can knock it on, a defender can hoof it away. A ball already in motion is
   * nobody's: it's been hit, and it travels until it stops. So a kick is never
   * fighting another kick, and there's no priority to arbitrate.
   */
  get kickable() {
    return this.state === "free" && this.vx === 0 && this.vy === 0;
  }

  /**
   * Put it somewhere, and roll it the distance it just covered getting there.
   *
   * For a ball being flown along a path by something other than its own velocity —
   * the shot. Writing x/y straight would slide it across the grass without turning
   * over, and the tumble is tied to ground covered, so it has to be told.
   */
  moveTo(x: number, y: number) {
    this.spin += Math.hypot(x - this.x, y - this.y) * ROLL_RATE;
    this.spin %= BALL_FRAMES;
    this.x = x;
    this.y = y;
  }

  /** Send it off along `angle` (canvas radians). Ignored unless it's sitting still. */
  kick(angle: number, speed: number) {
    if (!this.kickable) return;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  /**
   * A defender got a boot on it. He hits it harder off a slide, where the studs
   * arrive with his whole weight behind them.
   */
  clear(angle: number, sliding: boolean) {
    this.kick(angle, sliding ? SLIDE_CLEAR_SPEED : CLEAR_SPEED);
  }

  /** @param dt seconds since the last update */
  update(dt: number, player: Footballer) {
    const fromX = this.x;
    const fromY = this.y;

    // Anything he's doing that isn't running in a straight line takes the ball
    // out of play and sticks it to him. It rides there, untouchable, until he's
    // done — then it goes back to his feet and he knocks it on.
    const carrying = player.airborne || sideways(player);

    if (carrying) {
      this.state = "attached";
      this.vx = 0;
      this.vy = 0;
      this.lifted = player.airborne;

      if (this.lifted) {
        // Over his head, out of everyone's reach.
        this.x = player.x;
        this.y = player.y - OVERHEAD_LIFT;
      } else {
        // Out to the side he's crossing toward, so it leads him across.
        this.x = player.x + (player.facing === "left" ? -SIDE_LIFT : SIDE_LIFT);
        this.y = player.y;
      }
    } else {
      // He's back to running the ball up the pitch. If he was carrying it, it
      // drops to his feet and he knocks it straight on — it doesn't sit there
      // waiting for him to catch up to a ball he already had.
      if (this.state === "attached") {
        this.state = "free";
        this.lifted = false;
        this.x = player.x;
        this.y = player.y - LEAD;
        this.vx = 0;
        this.vy = 0;
        this.kick(UP, KICK_SPEED);
      }

      // Rolling out whatever it was last hit with. Exponential decay, so the
      // rate doesn't shift with the framerate. Once it's slow enough to be
      // walking pace it stops dead — a ball that creeps forever is a ball nobody
      // can ever kick again.
      const decay = FRICTION ** dt;
      this.vx *= decay;
      this.vy *= decay;
      if (Math.hypot(this.vx, this.vy) < STOP_SPEED) {
        this.vx = 0;
        this.vy = 0;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // His touch. Only a stopped ball, and only if he's alive to kick it.
      if (player.state === "alive" && this.kickable && this.within(player, KICK_RADIUS)) {
        this.kick(UP, KICK_SPEED);
      }
    }

    // Rolling spins against the ground it covered; stuck to him it spins to its
    // own clock, since there's no ground under it to roll on.
    if (this.state === "attached") {
      this.spin += ATTACHED_SPIN * dt;
    } else {
      this.spin += Math.hypot(this.x - fromX, this.y - fromY) * ROLL_RATE;
    }
    this.spin %= BALL_FRAMES;
  }

  /** Is `body` close enough to touch it? */
  within(body: { x: number; y: number }, radius: number) {
    return Math.hypot(this.x - body.x, this.y - body.y) <= radius;
  }

  /**
   * Has the ball left the screen for good?
   *
   * Off the sides or out the bottom and it's gone: he only ever runs *up* the
   * field, so he can never chase it down. The top edge doesn't count — that's the
   * goal end he's running at, and the ball being up there is the point.
   *
   * @param camera the world y currently at the top of the screen
   */
  offPitch(camera: number, width: number, height: number) {
    const screenY = this.y - camera;
    return (
      this.x < -BALL_RADIUS ||
      this.x > width + BALL_RADIUS ||
      screenY > height + BALL_RADIUS
    );
  }

  /**
   * Has it died on the dirt?
   *
   * World y=0 is the dirt/grass seam, so anything at or past it has crossed out
   * of the pitch and onto the brown. That alone isn't the end — a ball still
   * travelling could be one he's about to run onto — but a ball that has come to
   * rest up there is never coming back, and there's no pitch left in front of it
   * to kick it up. The far end is the one edge `offPitch` deliberately ignores,
   * so this is what closes it.
   */
  deadOnDirt() {
    return this.state === "free" && this.vx === 0 && this.vy === 0 && this.y <= 0;
  }

  /** @param screenY the ball's y with the camera already taken out of it */
  draw(ctx: CanvasRenderingContext2D, sheet: HTMLImageElement, screenY: number) {
    const size = BALL_SIZE * SCALE;

    // Up over his head it's genuinely off the ground, so it gets a shadow on the
    // turf beneath it. Without one it just reads as a ball that has teleported up
    // the screen. One riding at his hip is still at grass height, so it gets none.
    if (this.lifted) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(this.x, screenY + OVERHEAD_LIFT, size / 3, size / 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const frame = Math.floor(this.spin) % BALL_FRAMES;
    ctx.drawImage(
      sheet,
      frame * BALL_SIZE,
      0,
      BALL_SIZE,
      BALL_SIZE,
      // x/y is the middle of the ball, not a corner.
      Math.round(this.x - size / 2),
      Math.round(screenY - size / 2),
      size,
      size,
    );
  }
}

/** Up the pitch, in canvas radians — where the player always kicks it. */
const UP = -Math.PI / 2;

/** Is he crossing the pitch rather than running up it? */
function sideways(player: Footballer) {
  return player.facing === "left" || player.facing === "right";
}
