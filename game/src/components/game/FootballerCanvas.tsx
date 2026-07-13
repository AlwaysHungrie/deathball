"use client";

import { useEffect, useRef } from "react";
import { bindTaps } from "@/game/input";
import { loadSprites, Renderer } from "@/game/renderer";
import type { GameState } from "@/game/state";
import type { Team } from "@/game/sprites";
import { World } from "@/game/world";

/**
 * The pitch.
 *
 * All this does is host a canvas and drive a loop. The run's rules live in
 * `World`, the drawing in `Renderer`, the gestures in `bindTaps` — this owns none
 * of them, it just steps one into the other once a frame and reports the ending
 * back to React.
 */
export default function FootballerCanvas({
  team = "sanlorenzo",
  state,
  onEnd,
  runId,
}: {
  team?: Team;
  state: GameState;
  /**
   * Fired the moment the run ends, however it ended.
   *
   * @param scored whether the ball crossed the far goal line between the posts at
   *   some point during the run — a goal, rather than a ball simply lost.
   */
  onEnd: (scored: boolean) => void;
  /** Bump to start a fresh run: the footballer goes back to his penalty spot. */
  runId: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* The loop is built once and reads these every frame. Holding them in refs is
     what keeps a state change from tearing down the loop and reloading every
     sprite — the loop closes over the ref, not over the value.

     Written during render, and it has to be. The obvious fix for the lint rule is
     to move these into an effect, and it is wrong: effects run *after* commit, so a
     `requestAnimationFrame` landing in the gap between the two would read the
     previous state. On `playing -> shooting` that is a frame of live play after the
     player has called for the shot — one more tick of defenders and ball on a world
     that is supposed to be frozen. The rule is guarding against refs that feed
     rendering; this one feeds a loop that never renders, and it needs the value on
     the next frame, not the next effect. */
  /* eslint-disable react-hooks/refs */
  const stateRef = useRef(state);
  stateRef.current = state;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  /* eslint-enable react-hooks/refs */

  const worldRef = useRef<World>(null);

  // A new run rewinds the footballer. Skipped on the first render, where the
  // loop's own setup already places him.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    worldRef.current?.reset();
  }, [runId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const world = new World(canvas.clientWidth, canvas.clientHeight, team);
    worldRef.current = world;

    const { sprites, dispose } = loadSprites();
    const renderer = new Renderer(ctx, sprites, world.width);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      world.resize(width, height);
      renderer.resize(width);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const unbind = bindTaps(canvas, {
      onJump: () => world.jump(),
      onStrafe: (x) => world.strafeTo(x),
      isPlaying: () => stateRef.current === "playing",
    });

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // `step` is latched: it says `true` on the one frame the run ends and never
      // again, so the page is told exactly once.
      if (world.step(dt, stateRef.current)) onEndRef.current(world.scored);

      renderer.draw(world, now);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      unbind();
      dispose();
      worldRef.current = null;
    };
  }, [team]);

  return (
    // touch-none keeps the browser's own double-tap-to-zoom off our gesture.
    <canvas ref={canvasRef} className="h-full w-full touch-none select-none" />
  );
}
