"use client";

import { Volume } from "pixelarticons/react/Volume";
import { Volume3 } from "pixelarticons/react/Volume3";
import { useMusic } from "@/context/MusicProvider";

export default function MuteButton() {
  const { playing, toggle } = useMusic();
  const Icon = playing ? Volume3 : Volume;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Mute music" : "Unmute music"}
      aria-pressed={playing}
      className="absolute top-4 left-4 z-10 border-2 border-neutral-100/70 bg-neutral-950/70 p-2 text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-neutral-950 active:translate-y-px"
    >
      <Icon width={20} height={20} aria-hidden />
    </button>
  );
}
