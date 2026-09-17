"use client";

// The screen shown BETWEEN stories, once a story is finished.
//
// The WORDS are the whole point of this screen. A child should feel that the
// app noticed how they just read, so each outcome says something different and
// says why: reading well earns a bigger story, a wobbly story is named as
// tricky. Every message is spoken aloud as well as shown.
//
// Moving up is a big, happy moment. Moving down is honest but never shaming:
// it says the WORDS were hard, never that the child did badly, and it never
// mentions levels at all.

import type { ReadingLevel } from "@/data/stories";
import type { LevelChange } from "@/lib/difficulty";

export type CelebrationMessage = {
  emoji: string;
  title: string;
  line: string;
  spoken: string; // what speak() says: the title and line, read as one sentence
};

// Several phrasings per outcome, so a child who stays on the same level for
// three stories doesn't hear the same words three times.
//
// WRITING RULES: short sentences, words a 5-to-7-year-old knows, and warm
// rather than gushing. Praise the reading, not the child's cleverness. Never
// say "wrong", "mistake" or "failed", and never mention levels in a "down"
// message.
export const CELEBRATION_MESSAGES: Record<LevelChange, CelebrationMessage[]> = {
  // Read it really well: celebrate, and say what it has earned them.
  up: [
    {
      emoji: "⭐",
      title: "You leveled up!",
      line: "You read that so well. You're ready for bigger stories now!",
      spoken: "You leveled up! You read that so well. You're ready for bigger stories now!",
    },
    {
      emoji: "⭐",
      title: "Wow, you read that so well!",
      line: "You're ready for bigger stories now!",
      spoken: "Wow, you read that so well! You're ready for bigger stories now!",
    },
    {
      emoji: "⭐",
      title: "Look at you go!",
      line: "Your reading is getting so strong. Let's try a bigger story!",
      spoken: "Look at you go! Your reading is getting so strong. Let's try a bigger story!",
    },
    {
      emoji: "⭐",
      title: "You did it!",
      line: "You read those words beautifully. Time for a bigger story!",
      spoken: "You did it! You read those words beautifully. Time for a bigger story!",
    },
  ],

  // Read it well enough: encourage, and name that they're getting stronger.
  // Never a bare "Great reading!" with nothing behind it.
  same: [
    {
      emoji: "🎉",
      title: "Nice reading!",
      line: "Let's read another one and keep practicing.",
      spoken: "Nice reading! Let's read another one and keep practicing.",
    },
    {
      emoji: "🎉",
      title: "You're getting stronger!",
      line: "A little more practice and those words will be easy. Here's another story.",
      spoken:
        "You're getting stronger! A little more practice and those words will be easy. Here's another story.",
    },
    {
      emoji: "🎉",
      title: "Good work!",
      line: "You're getting better every time you read. Let's do one more.",
      spoken: "Good work! You're getting better every time you read. Let's do one more.",
    },
    {
      emoji: "🎉",
      title: "That was good reading!",
      line: "Let's keep going and practice a bit more.",
      spoken: "That was good reading! Let's keep going and practice a bit more.",
    },
  ],

  // Found it hard: say so kindly and honestly, so the child understands the
  // STORY was hard and that this is completely okay. No mention of levels.
  down: [
    {
      emoji: "🌈",
      title: "That one had some tricky words!",
      line: "Let's try a fun, easier one together.",
      spoken: "That one had some tricky words! Let's try a fun, easier one together.",
    },
    {
      emoji: "🌈",
      title: "Those were some tricky words!",
      line: "That's okay. Every reader meets hard words. Let's read a fun one.",
      spoken:
        "Those were some tricky words! That's okay. Every reader meets hard words. Let's read a fun one.",
    },
    {
      emoji: "🌈",
      title: "That was a hard one!",
      line: "You kept going, and that's what matters. Let's read a fun one.",
      spoken: "That was a hard one! You kept going, and that's what matters. Let's read a fun one.",
    },
    {
      emoji: "🌈",
      title: "Lots of tricky words in that story!",
      line: "Let's read a fun one together now.",
      spoken: "Lots of tricky words in that story! Let's read a fun one together now.",
    },
  ],
};

// Remembers the phrasing used last time for each outcome, so the same words
// never come round twice in a row.
const lastUsedTitle: Partial<Record<LevelChange, string>> = {};

// Pick one phrasing. Called ONCE when a story ends and the result stored, so
// the words on screen and the words spoken out loud can never disagree.
export function pickCelebrationMessage(change: LevelChange): CelebrationMessage {
  const options = CELEBRATION_MESSAGES[change];
  const notJustUsed = options.filter((message) => message.title !== lastUsedTitle[change]);

  // Fall back to the full set if filtering left nothing (only one phrasing).
  const pool = notJustUsed.length > 0 ? notJustUsed : options;
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  lastUsedTitle[change] = chosen.title;
  return chosen;
}

type Props = {
  message: CelebrationMessage;
  change: LevelChange;
  level: ReadingLevel;
  nextStoryTitle: string;
  onStart: () => void;
};

export default function CelebrationScreen({
  message,
  change,
  level,
  nextStoryTitle,
  onStart,
}: Props) {
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
