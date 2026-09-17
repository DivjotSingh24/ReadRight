// Word-level reading check.
//
// Compares the sentence the child was supposed to read with what the speech
// recognizer heard, and gives every expected word a status:
//   "correct" - they said exactly this word
//   "close"   - they said something that SOUNDS like it (probably fine; the
//               recognizer often mishears correct reading, e.g. "boat" -> "board")
//   "missed"  - they skipped it, or said something clearly different
//
// This is a PURE function: just string logic, runs in the browser, no API calls.
//
// HOW IT WORKS
// 1. Normalize both texts (lowercase, strip punctuation) and split into words.
// 2. ALIGN spoken words to expected words, in order, using an edit-distance
//    table over whole words (see matchWords below). This is what keeps one
//    skipped word from shifting every later word to "missed".
// 3. Grade each expected word by the spoken word it got paired with.

export type WordStatus = "correct" | "close" | "missed";

export type WordResult = {
  word: string; // the expected word as written in the story, e.g. "kite!"
  status: WordStatus;
  heard: string | null; // the spoken word it was paired with, or null if skipped
};

// How "expensive" each choice is when lining up the two word lists.
// The alignment picks the cheapest overall line-up.
const PAIR_COST: Record<WordStatus, number> = {
  correct: 0, // same word: free
  close: 0.5, // sounds alike: nearly free
  missed: 1, // different word
};
const GAP_COST = 1; // an expected word nobody said, or an extra spoken word

export function matchWords(expectedText: string, transcript: string): WordResult[] {
  // Keep the original expected words for display, plus a normalized copy for
  // comparing. (Tokens that are only punctuation, like "-", are dropped.)
  const expectedWords = expectedText.split(/\s+/).filter((w) => normalize(w) !== "");
  const expected = expectedWords.map(normalize);
  const spoken = transcript.split(/\s+/).map(normalize).filter((w) => w !== "");

  const n = expected.length;
  const m = spoken.length;

  // --- Step 1: fill the table ---
  // cost[i][j] = cheapest way to line up the first i expected words
  //              with the first j spoken words.
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) cost[i][0] = i * GAP_COST; // all skipped
  for (let j = 1; j <= m; j++) cost[0][j] = j * GAP_COST; // all extra

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + PAIR_COST[compareWord(expected[i - 1], spoken[j - 1])], // pair them
        cost[i - 1][j] + GAP_COST, // expected word was skipped
        cost[i][j - 1] + GAP_COST, // spoken word was extra
      );
    }
  }

  // --- Step 2: walk back from the bottom-right corner to see which choice
  // produced each cell, and record what happened to each expected word. ---
  const results: WordResult[] = expectedWords.map((word) => ({
    word,
    status: "missed",
    heard: null,
  }));

  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const status = compareWord(expected[i - 1], spoken[j - 1]);
    if (cost[i][j] === cost[i - 1][j - 1] + PAIR_COST[status]) {
      // Paired: grade the expected word by what was said.
      results[i - 1] = { word: expectedWords[i - 1], status, heard: spoken[j - 1] };
      i--;
      j--;
    } else if (cost[i][j] === cost[i - 1][j] + GAP_COST) {
      // Skipped: stays "missed" with heard = null.
      i--;
    } else {
      // Extra spoken word: nothing to grade, just move past it.
      j--;
    }
  }
  // Any expected words left over (i > 0) were never reached, so they stay "missed".

  return results;
}

// How far through the sentence the child has got, as 0 to 1.
//
// It looks at the LAST word we managed to match, not how many matched, so a
// word they got wrong in the middle doesn't make it look like they never
// finished. Used to decide whether a silence means "done reading" or just
// "thinking about the next word".
export function readingProgress(expectedText: string, transcript: string): number {
  const results = matchWords(expectedText, transcript);
  if (results.length === 0) return 1;

  let lastMatched = -1;
  results.forEach((result, index) => {
    if (result.status !== "missed") lastMatched = index;
  });

  return (lastMatched + 1) / results.length;
}

// Lowercase and remove everything that isn't a letter or digit.
// "Kite!" -> "kite", "Don't" -> "dont"
function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Grade one expected word against one spoken word (both already normalized).
function compareWord(expected: string, spoken: string): WordStatus {
  if (expected === spoken) return "correct";
  if (soundsAlike(expected, spoken)) return "close";
  return "missed";
}

// WHY EDIT DISTANCE (and not Soundex/Metaphone)?
// Phonetic codes like Soundex are all-or-nothing: if one sound differs, the
// codes differ and it's a total mismatch. Speech-recognizer mistakes are
// usually "one sound off" (boat -> board, sailed -> saled), and Soundex even
// fails on boat/board (B300 vs B630). Edit distance measures HOW far off a word
// is, so small slips count as close. We first run both words through a few
// spelling-to-sound rules so homophones that look different (right/write,
// knight/night) also line up.
function soundsAlike(a: string, b: string): boolean {
  const x = simplifySpelling(a);
  const y = simplifySpelling(b);

  // Must start with the same sound. Recognizer slips usually keep the first
  // sound; real reading mistakes often change it (cat -> hat).
  if (x[0] !== y[0]) return false;

  // Longer words may differ by more letters. Very short words must match
  // exactly, otherwise "is" and "it" would count as close.
  const longer = Math.max(x.length, y.length);
  const allowedEdits = longer <= 2 ? 0 : longer <= 4 ? 1 : 2;

  return editDistance(x, y) <= allowedEdits;
}

// A few English spelling rules that turn letters into rough sounds, so words
// spelled differently but said the same end up spelled the same.
function simplifySpelling(word: string): string {
  let s = word;
  s = s.replace(/^kn/, "n"); // knight -> night
  s = s.replace(/^wr/, "r"); // write -> rite
  s = s.replace(/^wh/, "w"); // when -> wen
  s = s.replace(/ph/g, "f"); // phone -> fone
  s = s.replace(/igh/g, "i"); // night -> nit
  s = s.replace(/ck/g, "k"); // duck -> duk
  s = s.replace(/c(?=[eiy])/g, "s"); // city -> sity
  s = s.replace(/c/g, "k"); // cat -> kat
  if (s.length > 3 && /[^aeiou]e$/.test(s)) s = s.slice(0, -1); // silent e: kite -> kit
  s = s.replace(/(.)\1+/g, "$1"); // double letters: ball -> bal
  return s;
}

// Levenshtein distance: the fewest single-letter insertions, deletions, or
// substitutions needed to turn one word into the other. "boat" -> "board" = 2.
function editDistance(a: string, b: string): number {
  // d[i][j] = distance between the first i letters of a and first j letters of b
  const d: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j - 1] + substitution,
        d[i - 1][j] + 1, // delete a letter
        d[i][j - 1] + 1, // insert a letter
      );
    }
  }
  return d[a.length][b.length];
}
