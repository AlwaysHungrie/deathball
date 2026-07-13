"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

const SECTION_COUNT = 3;

export default function HowToPlayPage() {
  const router = useRouter();
  const [section, setSection] = useState(0);

  const isLast = section === SECTION_COUNT - 1;

  const next = () => {
    if (isLast) {
      router.push("/");
    } else {
      setSection((s) => s + 1);
    }
  };

  return (
    <main className="relative flex h-full flex-col items-center overflow-hidden bg-neutral-900">
      {/* Story bars: current + past solid, future just outlined. */}
      <div className="mt-6 flex w-full max-w-xs gap-2 px-6">
        {Array.from({ length: SECTION_COUNT }).map((_, i) => (
          <div
            key={i}
            className={
              i <= section
                ? "h-1.5 flex-1 bg-blood"
                : "h-1.5 flex-1 border border-neutral-100"
            }
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        {section === 0 && (
          <>
            <h1 className="text-5xl leading-tight text-blood drop-shadow-[3px_3px_0_rgba(0,0,0,0.8)]">
              DEATH
              <br />
              BALL
            </h1>

            <div className="flex flex-col gap-4 text-[10px] leading-relaxed text-neutral-400">
              <p>Football like markets is a game of timing.</p>
              <p>
                In Deathball you get to play this game right alongside your team
                in their Fifa World Cup matches.
              </p>
              <p>
                When the game starts, you get the ball and an open position in
                any one of the many charts on Solana.
              </p>
              <p>
                As you dribble, the price fluctuates, you need to score a goal
                at the perfect time.
              </p>
            </div>
          </>
        )}

        {section === 1 && (
          <>
            <Image
              src="/txodds.png"
              alt="txodds"
              width={160}
              height={60}
              className="h-auto w-40"
            />

            <ol className="flex list-decimal flex-col gap-4 self-start pl-4 text-left text-[10px] leading-relaxed text-neutral-400">
              <li>
                In order to score a goal, you can either dribble past the
                defences to the goal.
              </li>
              <li>
                Or you get a chance to shoot from wherever you are, whenever you
                please.
              </li>
              <li>
                But only if your team is winning (winning odds powered by{" "}
                <a
                  href="https://txodds.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blood underline"
                >
                  TxLine
                </a>
                )
              </li>
            </ol>
            <p className="text-[10px] leading-relaxed text-neutral-400">
              Choose your team wisely to help you get the freedom to time your
              moves on the market.
            </p>
          </>
        )}

        {section === 2 && (
          <>
            <h1 className="text-3xl leading-tight text-blood drop-shadow-[3px_3px_0_rgba(0,0,0,0.8)]">
              CONTROLS
            </h1>

            <ul className="flex list-none flex-col gap-4 self-start text-left text-[10px] leading-relaxed text-neutral-400">
              <li className="before:content-['-_'] before:text-neutral-400">
                Do not tap anywhere to dribble straight.
              </li>
              <li className="before:content-['-_'] before:text-neutral-400">
                Tap sideways to move left/right.
              </li>
              <li className="before:content-['-_'] before:text-neutral-400">
                Double tap to jump.
              </li>
              <li className="before:content-['-_'] before:text-neutral-400">
                Defenders will tackle you, avoid them by jumping.
              </li>
              <li className="before:content-['-_'] before:text-neutral-400">
                Do not loose possesion of the ball.
              </li>
            </ul>
          </>
        )}

        <button
          onClick={next}
          className="mt-2 border-4 border-neutral-100 bg-blood px-3 py-3 text-[10px] text-neutral-100 transition-transform hover:scale-105 active:translate-y-1"
        >
          {section === 0
            ? "HOW TO SCORE A GOAL"
            : section === 1
              ? "CONTROLS"
              : "CLOSE"}
        </button>
      </div>
    </main>
  );
}
