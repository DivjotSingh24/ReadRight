"use client";

// The main (and only) page of Reading Coach.
//
// It shows the story one page at a time, lets the kid move with Back/Next,
// listens while they read aloud, and can ask /api/coach for a hint.
//
// "use client" at the top means this component runs in the browser, which we
// need for buttons, state, and the microphone.

import { useState } from "react";
import { story } from "@/data/story";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { matchWords, type WordStatus } from "@/lib/matchWords";
import type { CoachRequest, CoachResponse } from "@/app/api/coach/route";

// Tailwind classes for each word status in the colored sentence.
// Missed words also get a wavy underline, so they stand out without relying on color alone.
const WORD_STYLES: Record<WordStatus, string> = {
  correct: "text-green-700",
  close: "text-amber-600",
  missed: "text-red-600 underline decoration-wavy decoration-red-400 underline-offset-8",
};

export default function Home() {
  // Which story page we're on (0 = first page).
  const [pageIndex, setPageIndex] = useState(0);

  // The hint from /api/coach, and whether we're waiting for it.
  const [hint, setHint] = useState<string | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);

  // Microphone + live transcript (see lib/useSpeechRecognition.ts).
  const speech = useSpeechRecognition();

  const page = story.pages[pageIndex];
  const isFirstPage = pageIndex === 0;
  const isLastPage = pageIndex === story.pages.length - 1;

  // Once the kid has stopped reading (and we heard something), grade each word.
  // We wait until they stop so words they haven't reached yet don't flash red.
  // matchWords is cheap, so we just recompute it on every render; no state needed.
  const wordResults =
    !speech.isListening && speech.transcript ? matchWords(page.text, speech.transcript) : null;

  // Move to another page and clear everything from the old one.
  function goToPage(newIndex: number) {
    speech.reset();
    setHint(null);
    setPageIndex(newIndex);
  }

  // Ask our own server route for a hint. We never call an AI from here directly.
  async function getHint() {
    setIsLoadingHint(true);
    try {
      const requestBody: CoachRequest = {
        pageText: page.text,
        transcript: speech.transcript,
      };
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        throw new Error(`Coach returned status ${response.status}`);
      }
      const data: CoachResponse = await response.json();
      setHint(data.hint);
    } catch (err) {
      console.error(err);
      setHint("Oops, the coach couldn't answer right now. Try again!");
    } finally {
      setIsLoadingHint(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
      {/* Title */}
      <header className="text-center">
        <p className="text-lg font-bold uppercase tracking-widest text-teal-700">
          Reading Coach
        </p>
        <h1 className="mt-2 text-3xl font-bold">{story.title}</h1>
      </header>

      {/* The story page */}
      <section className="rounded-3xl bg-white px-8 py-16 text-center shadow-sm">
        <p className="mb-6 text-lg text-slate-500">
          Page {pageIndex + 1} of {story.pages.length}
        </p>
        <p className="text-4xl leading-relaxed font-bold sm:text-5xl sm:leading-relaxed">
          {wordResults
            ? // After reading: each word colored by how it went.
              wordResults.map((result, i) => (
                <span key={i}>
                  {i > 0 && " "}
                  <span
                    className={WORD_STYLES[result.status]}
                    title={result.heard ? `I heard "${result.heard}"` : "Skipped"}
                  >
                    {result.word}
                  </span>
                </span>
              ))
            : // Before reading: the plain sentence.
              page.text}
        </p>

        {wordResults && (
          <p className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-lg">
            <span className="text-green-700">● Read it!</span>
            <span className="text-amber-600">● Close enough</span>
            <span className="text-red-600">● Let&apos;s try again</span>
          </p>
        )}
      </section>

      {/* Back / Next */}
      <nav className="flex justify-between gap-4">
        <button
          onClick={() => goToPage(pageIndex - 1)}
          disabled={isFirstPage}
          className="rounded-2xl border-2 border-slate-300 bg-white px-8 py-4 text-xl font-bold disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={() => goToPage(pageIndex + 1)}
          disabled={isLastPage}
          className="rounded-2xl border-2 border-slate-300 bg-white px-8 py-4 text-xl font-bold disabled:opacity-40"
        >
          Next →
        </button>
      </nav>

      {/* Reading aloud */}
      <section className="flex flex-col items-center gap-5">
        {speech.isListening ? (
          <button
            onClick={speech.stopListening}
            className="rounded-full bg-rose-500 px-10 py-5 text-2xl font-bold text-white"
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={speech.startListening}
            className="rounded-full bg-teal-600 px-10 py-5 text-2xl font-bold text-white"
          >
            🎤 Start Reading
          </button>
        )}

        {speech.isListening && (
          <p className="text-lg text-teal-700">Listening… read the sentence out loud!</p>
        )}

        {speech.error && <p className="text-lg text-rose-600">{speech.error}</p>}

        {/* Live transcript */}
        <div className="w-full rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-base font-bold text-slate-500">What I heard:</p>
          <p className="mt-2 min-h-10 text-2xl">
            {speech.transcript || (
              <span className="text-slate-400">Press Start Reading and read the page.</span>
            )}
          </p>
        </div>
      </section>

      {/* Hint from the coach (the /api/coach stub for now) */}
      <section className="flex flex-col items-center gap-5">
        <button
          onClick={getHint}
          disabled={isLoadingHint}
          className="rounded-full bg-amber-300 px-8 py-4 text-xl font-bold text-amber-950 disabled:opacity-60"
        >
          {isLoadingHint ? "Thinking…" : "💡 Get hint"}
        </button>

        {hint && (
          <p className="w-full rounded-2xl bg-amber-50 p-6 text-center text-2xl text-amber-950">
            {hint}
          </p>
        )}
      </section>
    </main>
  );
}
