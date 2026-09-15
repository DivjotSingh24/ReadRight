// The sample story for Day 1.
//
// A story is a title plus a list of "pages". Each page holds one or two short
// sentences, which is all the app shows on screen at a time.
// Later this could come from a database or an AI, but for now it's hardcoded.

export type StoryPage = {
  text: string;
};

export type Story = {
  title: string;
  pages: StoryPage[];
};

export const story: Story = {
  title: "Sam and the Red Kite",
  pages: [
    { text: "Sam has a red kite." },
    { text: "The wind is big. Up, up, up goes the kite!" },
    { text: "Oh no! The kite is stuck in a tree." },
    { text: "Dad helps Sam get it down. Sam is glad." },
  ],
};
