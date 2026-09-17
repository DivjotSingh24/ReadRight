// Adaptive difficulty: decides whether the child stays at their current level,
// moves up to harder stories, or drops back to easier ones.
//
// Pure number logic, no API calls, so it's easy to read, test and tune.

import type { ReadingLevel, Story } from "@/data/stories";

// --- Tuning knobs. Change these to make the app stricter or kinder. ---

// A page counts as "read well" at this accuracy or better.
export const LEVEL_UP_ACCURACY = 0.9;

// How many recent pages we look at before changing anything. One great page
// could be luck; two in a row is a pattern.
export const PAGES_TO_JUDGE = 2;

// If the recent pages average below this, the story is too hard.
export const LEVEL_DOWN_ACCURACY = 0.6;

export const LOWEST_LEVEL: ReadingLevel = 1;
export const HIGHEST_LEVEL: ReadingLevel = 3;

export type LevelChange = "up" | "same" | "down";

// `pageAccuracies` is one number per page read, from 0 to 1, oldest first.
export function decideLevelChange(pageAccuracies: number[]): LevelChange {
  // Not enough evidence yet, so don't move them anywhere.
  if (pageAccuracies.length < PAGES_TO_JUDGE) return "same";

  const recent = pageAccuracies.slice(-PAGES_TO_JUDGE);

  // Read every recent page well: ready for harder stories.
  if (recent.every((accuracy) => accuracy >= LEVEL_UP_ACCURACY)) return "up";

  // Struggling overall: quietly make things easier.
  const average = recent.reduce((total, accuracy) => total + accuracy, 0) / recent.length;
  if (average < LEVEL_DOWN_ACCURACY) return "down";

  return "same";
}

// Apply a change, never going past the easiest or hardest level.
export function nextLevel(current: ReadingLevel, change: LevelChange): ReadingLevel {
  if (change === "up") return Math.min(current + 1, HIGHEST_LEVEL) as ReadingLevel;
  if (change === "down") return Math.max(current - 1, LOWEST_LEVEL) as ReadingLevel;
  return current;
}

// Choose the next story at the given level, preferring one they haven't had yet.
export function pickNextStory(
  allStories: Story[],
  level: ReadingLevel,
  alreadyReadIds: string[],
): Story {
  const atThisLevel = allStories.filter((story) => story.level === level);
  if (atThisLevel.length === 0) return allStories[0]; // no stories at that level yet

  // If they've read them all, start the level again from the top.
  return atThisLevel.find((story) => !alreadyReadIds.includes(story.id)) ?? atThisLevel[0];
}
