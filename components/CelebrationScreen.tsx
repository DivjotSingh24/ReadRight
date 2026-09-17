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

// A few confetti dots, scattered by hand rather than at random so the layout is
// the same every time and nothing lands on the words. Purely decorative.
const CONFETTI = [
  { top: "8%", left: "8%", size: 16, color: "var(--sunshine)" },
  { top: "16%", left: "88%", size: 12, color: "var(--berry)" },
  { top: "34%", left: "4%", size: 10, color: "var(--primary)" },
  { top: "70%", left: "92%", size: 14, color: "var(--sunshine)" },
  { top: "84%", left: "12%", size: 11, color: "var(--berry)" },
  { top: "56%", left: "95%", size: 9, color: "var(--primary)" },
];

export default function CelebrationScreen({
  message,
  change,
  level,
  nextStoryTitle,
  onStart,
}: Props) {
  // Only a level up gets the full party. The other two are warm and calm - a
  // child who found the story hard does not need fireworks.
  const isLevelUp = change === "up";

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
      <section className="rc-card relative overflow-hidden px-6 py-14 text-center sm:px-12 sm:py-20">
        {/* A soft wash of colour behind the whole card. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: isLevelUp
              ? "radial-gradient(520px 320px at 50% 0%, var(--primary-wash) 0%, transparent 72%)"
              : "radial-gradient(520px 320px at 50% 0%, var(--surface-soft) 0%, transparent 72%)",
          }}
        />

        {isLevelUp &&
          CONFETTI.map((dot, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="rc-confetti"
              style={{
                top: dot.top,
                left: dot.left,
                width: dot.size,
                height: dot.size,
                background: dot.color,
              }}
            />
          ))}

        <div className="relative">
          {/* The star bounces on a level up, to make the moment feel bigger. */}
          <p className={`text-7xl sm:text-8xl ${isLevelUp ? "animate-bounce" : ""}`}>
            {message.emoji}
          </p>

          <h1 className="mt-8 text-3xl leading-tight font-bold sm:text-5xl">{message.title}</h1>
          <p
            className="mx-auto mt-5 max-w-xl text-xl leading-relaxed sm:text-2xl"
            style={{ color: "var(--ink-soft)" }}
          >
            {message.line}
          </p>

          {/* Only a level UP names the level. Going down stays quiet about it. */}
          {isLevelUp && (
            <p className="rc-pill mt-9 inline-block px-9 py-3 text-2xl">Level {level}</p>
          )}

          <div className="mt-12">
            <p
              className="text-sm font-bold tracking-[0.2em] uppercase"
              style={{ color: "var(--ink-soft)" }}
            >
              Next story
            </p>
            <p className="mt-2 text-2xl font-bold sm:text-3xl">{nextStoryTitle}</p>
          </div>

          <button
            onClick={onStart}
            className="rc-btn rc-btn-primary mt-10 px-12 py-5 text-2xl"
          >
            &#9654; Start reading
          </button>
        </div>
      </section>
    </main>
  );
}
