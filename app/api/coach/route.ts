// POST /api/coach
//
// ARCHITECTURE RULE: this route is the ONLY place in the app that talks to an
// AI provider. React components call it with fetch("/api/coach") and never call
// Gemini directly. This code runs on the server, so GEMINI_API_KEY stays secret
// and is never sent to the browser.
//
// The route asks Gemini for a warm phonics hint about ONE word the child
// missed. If Gemini fails for any reason (no key, rate limit, network, timeout,
// empty answer), we fall back to a hint we build locally, so the child ALWAYS
// gets a usable hint.

import { GoogleGenAI } from "@google/genai";

// The JSON the page sends us.
export type CoachRequest = {
  pageText: string; // the sentence the child was reading
  transcript: string; // everything the recognizer heard
  missedWord: string; // the one word to help with, e.g. "kite!"
  heardInstead?: string | null; // what the recognizer heard instead, if anything
};

// The JSON we send back.
export type CoachResponse = {
  hint: string;
  source: "gemini" | "local"; // which one produced the hint (handy for debugging)
};

// Fast, free-tier model. A hint is one short sentence, so the smallest, quickest
// model is plenty. (The older 1.5/2.0/2.5 flash models are retired: calling
// gemini-2.5-flash-lite now returns a 404 for new API keys.)
const MODEL = "gemini-3.5-flash-lite";

// Don't make a child wait forever: if Gemini is slow, give up and use the local
// hint. Measured round trip is around 5 seconds, so 8 leaves some headroom.
const TIMEOUT_MS = 8000;

const SYSTEM_INSTRUCTION = `You are a warm, patient reading coach for a child aged 5 to 7 who is reading out loud.

You will be told one word the child needs help with. Give a single hint that helps them sound that word out.

Rules:
- ONE or TWO short sentences, spoken simply, as if you are talking to the child. Don't explain; just help them say the word.
- ALWAYS begin with the FIRST sound of the word, then build up to the whole word. Never lead with the ending sound or a spelling pattern.
- Break the word into TWO or THREE natural sound chunks, the way a reading teacher would. Keep blends and vowel sounds together instead of spelling out single letters.
- Use only sounds that are really in the word. Never add a sound that isn't there, and never name silent letters.
- Example for "wind": That word starts with a w sound... w-ind... wind!
- Example for "kite": That word starts with a k sound... k-ite... kite!
- Example for "glad": That word starts with a g sound... gl-ad... glad!
- Be warm and encouraging, and celebrate effort. Never shame the child, never call it a mistake or an error.
- Reply with ONLY the hint text: no preamble, no quotation marks, no emoji.`;

export async function POST(request: Request) {
  // Parse the JSON body. If it isn't valid JSON, reply with a 400 error.
  let body: CoachRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const missedWord = cleanWord(body.missedWord ?? "");

  // A phonics hint only makes sense when we know which word to help with.
  // If nothing was missed, just cheer, and don't spend an API call on it.
  if (!missedWord) {
    const response: CoachResponse = {
      hint: "You read that beautifully! Keep going.",
      source: "local",
    };
    return Response.json(response);
  }

  // Always ready as a backup.
  const localHint = generateLocalHint(missedWord);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[/api/coach] GEMINI_API_KEY is not set - using the local hint.");
    return Response.json({ hint: localHint, source: "local" } satisfies CoachResponse);
  }

  try {
    const hint = await generateGeminiHint(apiKey, body.pageText, missedWord, body.heardInstead);
    // Logged on success too, so the terminal shows at a glance whether hints are
    // really coming from Gemini or quietly falling back to the local ones.
    console.log(`[/api/coach] hint from ${MODEL} for "${missedWord}"`);
    return Response.json({ hint, source: "gemini" } satisfies CoachResponse);
  } catch (error) {
    // Rate limit, network trouble, bad key, timeout, empty answer... it doesn't
    // matter which: the child still gets a hint.
    console.warn(`[/api/coach] Gemini failed (${describeError(error)}) - using the local hint.`);
    return Response.json({ hint: localHint, source: "local" } satisfies CoachResponse);
  }
}

// Built once and reused, so repeated hints don't pay to set up a client each time.
let cachedClient: GoogleGenAI | null = null;
function getClient(apiKey: string): GoogleGenAI {
  cachedClient ??= new GoogleGenAI({ apiKey });
  return cachedClient;
}

// Ask Gemini for the hint. Throws if anything goes wrong; the caller falls back.
async function generateGeminiHint(
  apiKey: string,
  pageText: string,
  missedWord: string,
  heardInstead: string | null | undefined,
): Promise<string> {
  const ai = getClient(apiKey);

  const prompt = [
    `The child is reading this sentence: "${pageText}"`,
    `The word they need help with is: "${missedWord}"`,
    heardInstead ? `It sounded like they said "${heardInstead}" instead.` : null,
    `Give your hint for "${missedWord}".`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const interaction = await ai.interactions.create(
    {
      model: MODEL,
      input: prompt,
      system_instruction: SYSTEM_INSTRUCTION,
      generation_config: {
        max_output_tokens: 120, // a hint is one or two sentences
        thinking_level: "minimal", // no need to deliberate; keeps it fast and cheap
      },
    },
    // No retries: if the first try fails, the local hint is faster than a
    // second round trip, and the child is waiting.
    { timeout: TIMEOUT_MS, maxRetries: 0 },
  );

  const hint = interaction.output_text?.trim();
  if (!hint) {
    throw new Error("Gemini returned an empty hint");
  }
  return hint;
}

// The fallback hint, built with plain string logic: no API call, no key, no cost.
// "kite!" -> Let's try "kite" together. It starts with the "k" sound: k-i-t-e... kite. You can do it!
export function generateLocalHint(word: string): string {
  const clean = cleanWord(word);
  if (!clean) return "Give it a try! You're doing great.";

  const firstLetter = clean[0].toLowerCase();
  const spelledOut = clean.toLowerCase().split("").join("-"); // kite -> k-i-t-e

  return `Let's try "${clean}" together. It starts with the "${firstLetter}" sound: ${spelledOut}... ${clean}. You can do it!`;
}

// Pull the readable reason out of a Gemini error, so the server log gets one
// useful line ("API key not valid...") instead of a huge dumped object.
function describeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "body" in error) {
    const message = String((error as { body: unknown }).body).match(/"message":\s*"([^"]+)"/);
    if (message) return message[1];
  }
  return error instanceof Error ? error.message : String(error);
}

// Strip punctuation and spaces so "kite!" and " Kite " both become "kite".
function cleanWord(word: string): string {
  return word.replace(/[^a-zA-Z0-9']/g, "");
}
