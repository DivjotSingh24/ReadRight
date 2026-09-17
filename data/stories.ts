// All the stories, grouped into three difficulty levels.
//
// A story is a title plus a list of "pages". Each page holds the one or two
// sentences the child sees on screen at a time.
//
// WRITING RULES for new stories:
//   Level 1  - 3 to 5 words per sentence. Simple CVC and sight words (cat, run,
//              big, red). 3 to 4 pages.
//   Level 2  - Longer sentences, common words, simple blends (st, fl, gr).
//   Level 3  - Full sentences and richer vocabulary, still fine for grades 2-3.
//
// IMPORTANT: avoid heteronyms and words whose pronunciation is ambiguous
// ("wind", "read", "bow", "tear", "live", "close", "row", "present"). The
// phonics coaching sounds words out letter by letter, and those words have two
// different correct pronunciations, so a hint for them would be misleading.

export type ReadingLevel = 1 | 2 | 3;

export type StoryPage = {
  text: string;
};

export type Story = {
  id: string; // used to avoid handing out the same story twice
  level: ReadingLevel;
  title: string;
  pages: StoryPage[];
};

export const stories: Story[] = [
  // ----------------------------- LEVEL 1 -----------------------------
  {
    id: "red-hat",
    level: 1,
    title: "The Red Hat",
    pages: [
      { text: "Pam has a red hat." },
      { text: "The hat is big." },
      { text: "A cat sits on it!" },
      { text: "Pam holds the cat." },
    ],
  },
  {
    id: "jump-frog",
    level: 1,
    title: "Jump, Frog, Jump",
    pages: [
      { text: "A frog can jump." },
      { text: "The frog jumps up!" },
      { text: "Jump, frog, jump!" },
      { text: "We jump with the frog." },
    ],
  },

  // ----------------------------- LEVEL 2 -----------------------------
  {
    id: "lost-sock",
    level: 2,
    title: "The Lost Sock",
    pages: [
      { text: "Max cannot find his blue sock." },
      { text: "He looks under the bed and behind the chair." },
      { text: "The puppy has it! She wants to play." },
      { text: "Max grins and gets his sock back." },
    ],
  },
  {
    id: "pancake-morning",
    level: 2,
    title: "Pancake Morning",
    pages: [
      { text: "Nina helps her dad make pancakes." },
      { text: "She stirs the batter until it is smooth." },
      { text: "The first pancake flips high in the air!" },
      { text: "They eat them with berries and big smiles." },
    ],
  },

  // ----------------------------- LEVEL 3 -----------------------------
  {
    id: "night-sky-club",
    level: 3,
    title: "The Night Sky Club",
    pages: [
      { text: "Every Friday, Jasmine and her brother set up their telescope in the backyard." },
      { text: "They search the dark sky for planets, comets, and bright clusters of stars." },
      { text: "Last night they spotted a shooting star that flashed across the sky." },
      { text: "Jasmine wrote it in her notebook and gave it a name: Sparkle." },
    ],
  },
  {
    id: "garden-helper",
    level: 3,
    title: "The Garden Helper",
    pages: [
      { text: "Marcus planted tiny seeds along the sunny edge of the garden." },
      { text: "He watered them gently every morning before school." },
      { text: "After many weeks, green shoots pushed up through the soft brown soil." },
      { text: "By summer, bright sunflowers stood taller than Marcus himself!" },
    ],
  },
];

// Everyone starts on the easiest level.
export const FIRST_STORY = stories[0];
