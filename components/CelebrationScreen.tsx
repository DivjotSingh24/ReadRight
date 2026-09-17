"use client";

// The screen shown BETWEEN stories, once a story is finished.
//
// Moving up is a big, happy moment. Moving down is deliberately quiet: it never
// mentions levels or says anything went wrong, it just offers another story.

import type { ReadingLevel } from "@/data/stories";
import type { LevelChange } from "@/lib/difficulty";

// The words for each outcome, kept in one place so the screen and the spoken
// message can never drift apart.
export const CELEBRATION_MESSAGES: Record<
  LevelChange,
  { emoji: string; title: string; line: string; spoken: string }
> = {
  up: {
    emoji: "⭐",
    title: "You leveled up!",
    line: "You're ready for harder stories!",
    spoken: "You leveled up! You are ready for harder stories. Great job!",
  },
  same: {
    emoji: "🎉",
    title: "Great reading!",
    line: "Here comes another story.",
    spoken: "Great reading! Here comes another story.",
  },
  down: {
    emoji: "🌈",
    title: "Let's try a fun one!",
    line: "Here comes another story.",
    spoken: "Let's try a fun one!",
  },
};

type Props = {
  change: LevelChange;
  level: ReadingLevel;
  nextStoryTitle: string;
  onStart: () => void;
};

export default function CelebrationScreen({ change, level, nextStoryTitle, onStart }: Props) {
  const message = CELEBRATION_MESSAGES[change];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
      <section className="rounded-3xl bg-white px-8 py-16 text-center shadow-sm">
        {/* The star bounces on a level up, to make the moment feel bigger. */}
        <p className={`text-7xl ${change === "up" ? "animate-bounce" : ""}`}>{message.emoji}</p>

        <h1 className="mt-6 text-4xl font-bold sm:text-5xl">{message.title}</h1>
        <p className="mt-4 text-2xl text-slate-600">{message.line}</p>

        {/* Only a level UP names the level. Going down stays quiet about it. */}
        {change === "up" && (
          <p className="mt-8 inline-block rounded-full bg-teal-100 px-8 py-3 text-2xl font-bold text-teal-800">
            Level {level}
          </p>
        )}

        <p className="mt-10 text-xl text-slate-500">Next story</p>
        <p className="mt-1 text-2xl font-bold">{nextStoryTitle}</p>

        <button
          onClick={onStart}
          className="mt-8 rounded-full bg-teal-600 px-10 py-5 text-2xl font-bold text-white"
        >
          ▶ Start reading
        </button>
      </section>
    </main>
  );
}
