"use client";

// The main (and only) page of Reading Coach.
//
// The flow for one story page:
//   1. The child presses Start Reading and reads the sentence out loud.
//   2. We stop listening on our own once they've finished (see the two timers
//      below), or when they press Stop.
//   3. matchWords grades every word and colors the sentence.
//   4. Every missed word is coached in turn: fetch a hint from /api/coach,
//      say it out loud, wait for the voice to finish, then move to the next one.
//
// "use client" at the top means this component runs in the browser, which we
// need for buttons, state, the microphone and the voice.

import { useCallback, useEffect, useRef, useState } from "react";
import { story } from "@/data/story";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { matchWords, readingProgress, type WordStatus } from "@/lib/matchWords";
import { speak, stopSpeaking } from "@/lib/speak";
import type { CoachRequest, CoachResponse } from "@/app/api/coach/route";

// --- Tuning knobs. All the "how long do we wait" numbers live here. ---

// How quiet it has to be before we consider the child finished reading.
const SILENCE_MS = 3000;

// ...but we only stop that quickly once they've got this far through the
// sentence. Early readers pause a lot while sounding a word out, so a quiet
// moment near the start means "thinking", not "finished".
const MIN_PROGRESS_TO_AUTO_STOP = 0.8;

// If they're stuck part-way and stay quiet this long, stop anyway, whatever the
// progress. They're not reading any more, so let's go and help them.
const STUCK_SILENCE_MS = 8000;

// A last-resort cap, so the microphone can never stay on forever. Generous,
// because sounding out a whole sentence can genuinely take a while.
const MAX_LISTENING_MS = 45000;

// A breath between one spoken hint and the next.
const PAUSE_BETWEEN_HINTS_MS = 900;

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

  // The hint being shown, and whether we're waiting for one.
  const [hint, setHint] = useState<string | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);

  // Which missed word we're coaching right now (0 = the first missed word).
  const [coachIndex, setCoachIndex] = useState(0);

  // Microphone + live transcript (see lib/useSpeechRecognition.ts).
  const {
    transcript,
    isListening,
    error: speechError,
    startListening,
    stopListening,
    reset: resetSpeech,
  } = useSpeechRecognition();

  const page = story.pages[pageIndex];
  const pageText = page.text;
  const isFirstPage = pageIndex === 0;
  const isLastPage = pageIndex === story.pages.length - 1;

  // Once the child has stopped reading (and we heard something), grade each word.
  // We wait until they stop so words they haven't reached yet don't flash red.
  // matchWords is cheap, so we just recompute it on every render; no state needed.
  const wordResults = !isListening && transcript ? matchWords(pageText, transcript) : null;

  // Every word they missed, in the order they appear in the sentence.
  const missedWords = wordResults ? wordResults.filter((result) => result.status === "missed") : [];

  // The one we're coaching right now. Once coachIndex runs past the end of the
  // list, this is null and the coaching stops.
  const currentTarget = missedWords[coachIndex] ?? null;
  const targetWord = currentTarget?.word ?? null;
  const targetHeard = currentTarget?.heard ?? null;

  // Timer that moves on to the next missed word after a hint finishes playing.
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Remembers the last hint we asked for, so we never ask twice for the same one.
  const lastRequestRef = useRef<string | null>(null);

  // Ask our own server route for a hint. We never call Gemini from here: the key
  // lives on the server. Everything it needs is passed in, so the function never
  // goes stale (that's what useCallback with an empty dependency list gives us).
  const requestHint = useCallback(async (requestBody: CoachRequest): Promise<string | null> => {
    setIsLoadingHint(true);
    try {
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
      return data.hint;
    } catch (err) {
      console.error(err);
      setHint("Oops, the coach couldn't answer right now. Try again!");
      return null;
    } finally {
      setIsLoadingHint(false);
    }
  }, []);

  // AUTO-STOP 1 and 2: silence timers. Every new word heard re-runs this effect,
  // which restarts both timers, so a countdown only completes during real silence.
  useEffect(() => {
    if (!isListening) return;

    // 1. A short silence, but only if they've read most of the sentence.
    const finishedTimer = setTimeout(() => {
      if (readingProgress(pageText, transcript) >= MIN_PROGRESS_TO_AUTO_STOP) {
        stopListening();
      }
    }, SILENCE_MS);

    // 2. A long silence: they've stalled part-way, so stop and coach them.
    const stuckTimer = setTimeout(stopListening, STUCK_SILENCE_MS);

    return () => {
      clearTimeout(finishedTimer);
      clearTimeout(stuckTimer);
    };
  }, [isListening, transcript, pageText, stopListening]);

  // AUTO-STOP 3: the last-resort cap. Runs once per listening session, and is
  // never restarted by new words.
  useEffect(() => {
    if (!isListening) return;
    const timer = setTimeout(stopListening, MAX_LISTENING_MS);
    return () => clearTimeout(timer);
  }, [isListening, stopListening]);

  // COACHING QUEUE: fetch a hint for the current missed word, say it out loud,
  // and when the voice finishes, pause and move to the next missed word.
  useEffect(() => {
    if (!targetWord) return;

    // Don't ask twice for the same word in the same attempt. (React runs effects
    // twice in development, and any re-render would otherwise fire a second request.)
    const request = `${pageText}|${transcript}|${coachIndex}|${targetWord}`;
    if (lastRequestRef.current === request) return;
    lastRequestRef.current = request;

    let cancelled = false;

    requestHint({
      pageText,
      transcript,
      missedWord: targetWord,
      heardInstead: targetHeard,
    }).then((hintText) => {
      if (cancelled || !hintText) return;
      speak(hintText, () => {
        advanceTimerRef.current = setTimeout(
          () => setCoachIndex((index) => index + 1),
          PAUSE_BETWEEN_HINTS_MS,
        );
      });
    });

    return () => {
      cancelled = true;
    };
  }, [targetWord, targetHeard, coachIndex, pageText, transcript, requestHint]);

  // If the page is closed mid-hint, stop the voice and the timer.
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  function clearAdvanceTimer() {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }

  // Stop the coach talking and forget where we were in the queue.
  function stopCoaching() {
    clearAdvanceTimer();
    stopSpeaking();
    setHint(null);
    setCoachIndex(0);
    lastRequestRef.current = null;
  }

  // Move to another page and clear everything from the old one.
  function goToPage(newIndex: number) {
    stopCoaching();
    resetSpeech();
    setPageIndex(newIndex);
  }

  // Starting a new attempt: stop talking (otherwise the mic hears the coach)
  // and clear the old hints.
  function startReading() {
    stopCoaching();
    startListening();
  }

  // The manual backup button. It takes over from the queue, so the hint it
  // fetches is spoken without automatically advancing to the next word.
  function getHintNow() {
    clearAdvanceTimer();
    requestHint({
      pageText,
      transcript,
      missedWord: targetWord ?? "",
      heardInstead: targetHeard,
    }).then((hintText) => {
      if (hintText) speak(hintText);
    });
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
              pageText}
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
        {isListening ? (
          <button
            onClick={stopListening}
            className="rounded-full bg-rose-500 px-10 py-5 text-2xl font-bold text-white"
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={startReading}
            className="rounded-full bg-teal-600 px-10 py-5 text-2xl font-bold text-white"
          >
            🎤 Start Reading
          </button>
        )}

        {isListening && (
          <p className="text-center text-lg text-teal-700">
            Listening… read the sentence out loud!
            <br />
            <span className="text-base text-slate-500">I&apos;ll stop when you&apos;re done.</span>
          </p>
        )}

        {speechError && <p className="text-lg text-rose-600">{speechError}</p>}

        {/* Live transcript */}
        <div className="w-full rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-base font-bold text-slate-500">What I heard:</p>
          <p className="mt-2 min-h-10 text-2xl">
            {transcript || (
              <span className="text-slate-400">Press Start Reading and read the page.</span>
            )}
          </p>
        </div>
      </section>

      {/* Hints from the coach. They play automatically, one missed word at a
          time; these buttons are the manual backup. */}
      <section className="flex flex-col items-center gap-5">
        <div className="flex flex-wrap justify-center gap-4">
          <button
            onClick={getHintNow}
            disabled={isLoadingHint}
            className="rounded-full bg-amber-300 px-8 py-4 text-xl font-bold text-amber-950 disabled:opacity-60"
          >
            {isLoadingHint ? "Thinking…" : "💡 Get hint"}
          </button>

          {hint && (
            <button
              onClick={() => speak(hint)}
              className="rounded-full border-2 border-amber-300 px-8 py-4 text-xl font-bold text-amber-950"
            >
              🔊 Hear it again
            </button>
          )}
        </div>

        {hint && (
          <div className="w-full rounded-2xl bg-amber-50 p-6 text-center">
            {missedWords.length > 1 && (
              <p className="mb-2 text-lg text-amber-800">
                Word {Math.min(coachIndex + 1, missedWords.length)} of {missedWords.length}
              </p>
            )}
            <p className="text-2xl text-amber-950">{hint}</p>
          </div>
        )}
      </section>
    </main>
  );
}
