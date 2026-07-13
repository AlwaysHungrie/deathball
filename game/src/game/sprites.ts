export const FRAME_WIDTH = 16;
export const FRAME_HEIGHT = 20;

export type AnimationName =
  | "idle"
  | "walk_down"
  | "walk_up"
  | "walk_right"
  | "walk_left"
  | "death";

export type Animation = {
  row: number;
  frames: number[];
  fps: number;
  loop: boolean;
};

export const ANIMATIONS: Record<AnimationName, Animation> = {
  idle: { row: 0, frames: [0, 1, 2, 3], fps: 6, loop: true },
  walk_down: { row: 1, frames: [0, 1, 2, 3], fps: 10, loop: true },
  walk_up: { row: 2, frames: [0, 1, 2, 3], fps: 10, loop: true },
  walk_right: { row: 3, frames: [0, 1, 2, 3], fps: 10, loop: true },
  walk_left: { row: 4, frames: [0, 1, 2, 3], fps: 10, loop: true },
  death: { row: 5, frames: [0], fps: 1, loop: false },
};

export const TEAMS = [
  "sanlorenzo",
  "bocajuniors",
  "riverplate",
  "independiente",
  "argentina",
] as const;

export type Team = (typeof TEAMS)[number];

const cache = new Map<string, Promise<HTMLImageElement>>();

function load(src: string): Promise<HTMLImageElement> {
  const cached = cache.get(src);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load sprite: ${src}`));
    img.src = src;
  });

  cache.set(src, promise);
  return promise;
}

export function loadTeamSheet(team: Team): Promise<HTMLImageElement> {
  return load(`/sprites/footballers/${team}.png`);
}

/** The scuff a slide tackle grinds into the pitch. */
export const MUD_WIDTH = 17;
export const MUD_HEIGHT = 20;

export function loadMud(): Promise<HTMLImageElement> {
  return load("/sprites/items/mud.png");
}

/** The ball. Square frames, laid out in one row, tumbling top-over-bottom. */
export const BALL_SIZE = 12;
export const BALL_FRAMES = 8;

export function loadBall(): Promise<HTMLImageElement> {
  return load("/sprites/items/ball.png");
}

/**
 * The goal, from behind: four frames of the net rippling. One row, and the frame
 * is much wider than it is deep because we're looking down at it.
 */
export const GOAL_WIDTH = 168;
export const GOAL_HEIGHT = 90;
export const GOAL_FRAMES = 4;
export const GOAL_FPS = 6;

export function loadGoal(): Promise<HTMLImageElement> {
  return load("/sprites/goal.png");
}
