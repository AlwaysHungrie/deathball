import {
  ANIMATIONS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type AnimationName,
  type Team,
} from "./sprites";

export type Direction = "up" | "down" | "left" | "right";

export type FootballerState = "alive" | "dead";

const WALK_ANIMATION: Record<Direction, AnimationName> = {
  up: "walk_up",
  down: "walk_down",
  left: "walk_left",
  right: "walk_right",
};

export type FootballerOptions = {
  team: Team;
  x: number;
  y: number;
  speed?: number;
  scale?: number;
};

/** Seconds a hop lasts, start to landing. */
const JUMP_DURATION = 0.8;

/** How much bigger he gets at the top of the hop. Subtle — this is a hop, not a leap. */
const JUMP_SCALE = 0.1;

/** How far the shadow shrinks away beneath him at full height. */
const SHADOW_SHRINK = 0.4;

/** Fraction of his speed he keeps at the apex of a hop. Jumping costs ground. */
const JUMP_DRAG = 0.45;

/** Seconds a slide tackle lasts, launch to standing back up. */
const SLIDE_DURATION = 0.7;

/**
 * How much smaller he gets at full stretch. The mirror of JUMP_SCALE: a hop
 * lifts him toward the lens, a slide puts him flat on the deck away from it.
 */
const SLIDE_SCALE = 0.1;

/** Multiple of his speed he carries at full stretch. A tackle is a lunge, not a jog. */
const SLIDE_LUNGE = 2.25;

/** The same rotation, expressed as the shortest way round: never more than half a turn. */
function shortestTurn(radians: number): number {
  const turn = radians % (Math.PI * 2);
  if (turn > Math.PI) return turn - Math.PI * 2;
  if (turn < -Math.PI) return turn + Math.PI * 2;
  return turn;
}

export class Footballer {
  readonly team: Team;
  x: number;
  y: number;
  speed: number;
  scale: number;

  facing: Direction = "down";
  state: FootballerState = "alive";

  private vx = 0;
  private vy = 0;
  private animation: AnimationName = "idle";
  private frameIndex = 0;
  private frameTimer = 0;

  /** Counts down while airborne; 0 means grounded. */
  private jumpTimer = 0;

  /** Counts down while stretched out in a tackle; 0 means on his feet. */
  private slideTimer = 0;

  /**
   * How far he turns to lie along the tackle, in canvas radians — the short way
   * round, boots already accounted for. Fixed at launch; draw() eases him into
   * it. Not the heading itself, which is what `move` is holding.
   */
  private slideAngle = 0;

  constructor({ team, x, y, speed = 60, scale = 4 }: FootballerOptions) {
    this.team = team;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.scale = scale;
  }

  /** Set the movement intent. Values are normalized, so diagonals are not faster. */
  move(dx: number, dy: number) {
    if (this.state !== "alive") {
      this.vx = 0;
      this.vy = 0;
      return;
    }

    const length = Math.hypot(dx, dy);
    if (length === 0) {
      this.vx = 0;
      this.vy = 0;
      return;
    }

    this.vx = (dx / length) * this.speed;
    this.vy = (dy / length) * this.speed;

    // Horizontal wins ties so strafing reads clearly.
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.facing = dx > 0 ? "right" : "left";
    } else {
      this.facing = dy > 0 ? "down" : "up";
    }
  }

  kill() {
    this.state = "dead";
    this.setAnimation("death");
  }

  /**
   * Put him back on his feet for a fresh run.
   *
   * More than flipping `state` back: he could have been killed mid-hop or halfway
   * through a tackle, and both of those are timers that outlive the death. Left
   * running, he'd respawn floating off the ground or lying flat on his face —
   * `slideStretch` pins a dead man at full stretch, so a corpse that isn't
   * properly stood back up stays down even once he's alive again.
   */
  revive() {
    this.state = "alive";
    this.jumpTimer = 0;
    this.slideTimer = 0;
    this.slideAngle = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = "down";
    this.setAnimation("idle");
  }

  get airborne() {
    return this.jumpTimer > 0;
  }

  /** Hop. Ignored mid-air, so a flurry of taps can't stack into a levitation. */
  jump() {
    if (this.state !== "alive" || this.airborne) return;
    this.jumpTimer = JUMP_DURATION;
  }

  /**
   * Height of the hop right now, 0 (grounded) to 1 (apex). A sine arc, so he
   * eases off the ground and back onto it rather than snapping.
   */
  private get jumpHeight() {
    if (!this.airborne) return 0;
    return Math.sin((1 - this.jumpTimer / JUMP_DURATION) * Math.PI);
  }

  get sliding() {
    return this.slideTimer > 0;
  }

  /**
   * Commit to a slide tackle. He goes wherever `move` last pointed him, and
   * `angle` (canvas radians) is the line he lies along as he goes — normally the
   * same heading, passed in so the caller keeps control of it.
   *
   * Ignored if he's already down, so a tackle can't be re-triggered halfway
   * through.
   */
  slide(angle: number) {
    if (this.state !== "alive" || this.sliding) return;
    this.slideTimer = SLIDE_DURATION;

    // He tips into the pose from upright, so what gets eased is the *turn* from
    // 0 — which means the turn has to be the short way round. atan2 hands back
    // anything in (-PI, PI], and the quarter-turn onto his boots can push that
    // past half a circle: left it raw, a tackle thrown up-and-left would spin
    // him nearly the whole way round to reach a pose a short lean away.
    this.slideAngle = shortestTurn(angle - Math.PI / 2);
  }

  /**
   * How far into the tackle he is, 0 (upright) to 1 (flat out). He goes down
   * along a quarter-sine — quick to leave his feet, easing as he lands — and
   * then he stays down: the tackle is the last thing he does.
   */
  private get slideStretch() {
    // Spent, and lying where he finished. Nothing brings him back up.
    if (this.state === "dead") return 1;
    if (!this.sliding) return 0;
    return Math.sin((1 - this.slideTimer / SLIDE_DURATION) * (Math.PI / 2));
  }

  /** @param dt seconds since the last update */
  update(dt: number) {
    // The hop rides on top of whatever he's already doing — it never touches the
    // walk cycle, only how fast that walk carries him.
    if (this.jumpTimer > 0) {
      this.jumpTimer = Math.max(0, this.jumpTimer - dt);
    }
    if (this.slideTimer > 0) {
      this.slideTimer = Math.max(0, this.slideTimer - dt);
    }

    if (this.state === "alive") {
      // He loses ground while airborne, most of it at the apex. Scaling the
      // velocity here rather than in move() keeps the drag honest whatever
      // speed the caller sets, and eases in and out with the arc.
      const drag = 1 - this.jumpHeight * (1 - JUMP_DRAG);
      // A tackle throws him along his own line of travel, fastest at full
      // stretch. It multiplies whatever move() set rather than replacing it, so
      // he slides where he was already headed.
      const lunge = 1 + this.slideStretch * (SLIDE_LUNGE - 1);
      this.x += this.vx * drag * lunge * dt;
      this.y += this.vy * drag * lunge * dt;

      // Down on the deck there is no walk cycle to run — he's a body, not a
      // pair of legs — so the tackle holds him on idle until he's up again.
      const moving = this.vx !== 0 || this.vy !== 0;
      if (this.sliding) {
        this.setAnimation("idle");
      } else {
        this.setAnimation(moving ? WALK_ANIMATION[this.facing] : "idle");
      }
    }

    const animation = ANIMATIONS[this.animation];
    if (animation.frames.length < 2) return;

    this.frameTimer += dt;
    const frameDuration = 1 / animation.fps;
    while (this.frameTimer >= frameDuration) {
      this.frameTimer -= frameDuration;
      const next = this.frameIndex + 1;
      this.frameIndex = animation.loop
        ? next % animation.frames.length
        : Math.min(next, animation.frames.length - 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, sheet: HTMLImageElement) {
    const animation = ANIMATIONS[this.animation];
    const column = animation.frames[this.frameIndex];

    const lift = this.jumpHeight;

    // Shadow stays on the ground at his feet and pulls in as he rises, which is
    // what actually sells the height — the sprite alone just reads as a zoom.
    if (lift > 0) {
      const radius = (FRAME_WIDTH * this.scale) / 3;
      ctx.save();
      ctx.globalAlpha = 0.35 * (1 - lift * 0.5);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(
        this.x,
        this.y - 2,
        radius * (1 - lift * SHADOW_SHRINK),
        radius * 0.3 * (1 - lift * SHADOW_SHRINK),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    // Scaling is the whole trick: with a top-down camera there's no vertical
    // axis to travel along, so distance from the lens has to stand in for
    // height. A hop grows him; a tackle, flat on the turf, shrinks him.
    const scale =
      this.scale * (1 + lift * JUMP_SCALE) * (1 - this.slideStretch * SLIDE_SCALE);
    const width = FRAME_WIDTH * scale;
    const height = FRAME_HEIGHT * scale;

    const stretch = this.slideStretch;

    if (stretch > 0) {
      // Laid out along the line of the tackle, boots first — that's the whole
      // point of a slide, the studs arrive before the man. slide() already put
      // the quarter turn onto his boots and took the short way round, so this is
      // just easing him over into it.
      ctx.save();
      // Spin about his middle, not his feet: pivoting on the boots would swing
      // his head through an arc the size of his body.
      ctx.translate(this.x, this.y - height / 2);
      ctx.rotate(this.slideAngle * stretch);
      ctx.drawImage(
        sheet,
        column * FRAME_WIDTH,
        animation.row * FRAME_HEIGHT,
        FRAME_WIDTH,
        FRAME_HEIGHT,
        -width / 2,
        -height / 2,
        width,
        height,
      );
      ctx.restore();
      return;
    }

    ctx.drawImage(
      sheet,
      column * FRAME_WIDTH,
      animation.row * FRAME_HEIGHT,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      // x/y is the footballer's feet, so anchor bottom-center.
      Math.round(this.x - width / 2),
      Math.round(this.y - height),
      width,
      height,
    );
  }

  private setAnimation(name: AnimationName) {
    if (this.animation === name) return;
    this.animation = name;
    this.frameIndex = 0;
    this.frameTimer = 0;
  }
}
