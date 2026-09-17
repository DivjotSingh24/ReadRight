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
// BETWEEN stories: we score each page, and when a story ends the child either
// moves up a level, stays, or quietly drops to easier stories
// (see lib/difficulty.ts), then a celebration screen introduces the next story.
//
// "use client" at the top means this component runs in the browser, which we
// need for buttons, state, the microphone and the voice.

import { useCallback, useEffect, useRef, useState } from "react";
import { stories, FIRST_STORY, type ReadingLevel, type Story } from "@/data/stories";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import {
  matchWords,
  readingAccuracy,
  readingProgress,
  type WordStatus,
} from "@/lib/matchWords";
import {
  decideLevelChange,
  nextLevel,
  pickNextStory,
  PAGES_TO_JUDGE,
  type LevelChange,
} from "@/lib/difficulty";
import { speak, stopSpeaking } from "@/lib/speak";
import CelebrationScreen, {
  pickCelebrationMessage,
  type CelebrationMessage,
} from "@/components/CelebrationScreen";
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

// Diagnostic panel: shows per-page accuracy, the saved scores and the level
// decision on screen, and logs the Next/Finish path to the console.
// Off for recording. Flip to true to bring it back.
const SHOW_DEBUG = false;

// Tailwind classes for each word status in the colored sentence.
// Missed words also get a wavy underline, so they stand out without relying on color alone.
const WORD_STYLES: Record<WordStatus, string> = {
  correct: "text-green-700",
  close: "text-amber-600",
  missed: "text-red-600 underline decoration-wavy decoration-red-400 underline-offset-8",
};

// What the celebration screen between stories needs to know.
type Celebration = {
  change: LevelChange;
  level: ReadingLevel;
  nextStory: Story;
  // Picked once when the story ends, then reused. If the screen and the voice
  // each picked their own, they would say different things.
  message: CelebrationMessage;
};

export default function Home() {
  // The story being read, and which of its pages we're on (0 = first page).
  const [story, setStory] = useState<Story>(FIRST_STORY);
  const [pageIndex, setPageIndex] = useState(0);

  // The child's current difficulty level, and the stories they've already had.
  const [level, setLevel] = useState<ReadingLevel>(FIRST_STORY.level);
  const [readStoryIds, setReadStoryIds] = useState<string[]>([]);

  // How well each page of THIS story went, keyed by page number (0 to 1).
  // Keyed rather than a plain list so going Back and forward again can't count
  // the same page twice.
  const [pageScores, setPageScores] = useState<Record<number, number>>({});

  // Set while the between-stories screen is showing; null during reading.
  const [celebration, setCelebration] = useState<Celebration | null>(null);

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

  // The score for the page on screen, graded from whatever has been heard so
  // far. Unlike wordResults this does NOT wait for the microphone to go quiet,
  // because scoring and displaying have different needs: the colored sentence
  // must wait (so unread words don't flash red), but the score must not (the
  // child may well press Next before the silence timer has fired).
  const pageAccuracy = transcript ? readingAccuracy(matchWords(pageText, transcript)) : null;

  // Every word they missed, in the order they appear in the sentence.
  const missedWords = wordResults ? wordResults.filter((result) => result.status === "missed") : [];

  // Does this page have anything to work on? Everything hint-related hangs off
  // this, so a page read perfectly shows no hint, no buttons and no leftovers
  // from an earlier attempt - there is simply nothing there to go stale.
  const hasMissedWords = missedWords.length > 0;

  // The one we're coaching right now. Once coachIndex runs past the end of the
  // list, this is null and the coaching stops.
  const currentTarget = missedWords[coachIndex] ?? null;
  const targetWord = currentTarget?.word ?? null;
  const targetHeard = currentTarget?.heard ?? null;

  // --- TEMPORARY debug values. Recomputed each render, nothing is stored. ---
  // Scores already saved, and the same list with the page on screen included -
  // which is exactly what finishStory would judge if you pressed Finish now.
  const debugSaved = scoresInOrder(pageScores);
  const debugWithThisPage = scoresInOrder(recordPageScore());
  const debugDecision = decideLevelChange(debugWithThisPage);

  // The words flagged on screen RIGHT NOW, exactly as the sentence renders them.
  // Kept in a ref so the coaching effect can re-check it at the moment it is
  // about to speak - by which time the grading may have changed underneath it.
  const missedWordsRef = useRef<string[]>([]);
  useEffect(() => {
    missedWordsRef.current = missedWords.map((result) => result.word);
  });

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

      // THE SAFETY CHECK. The grading can change while the hint is being
      // fetched: the recognizer often delivers the end of a sentence a moment
      // after we started grading, which re-grades words we thought were missed.
      // Without this, a hint requested for a word that was missing from a
      // half-finished transcript would still be spoken after that word had
      // turned green - the child hearing "sound out can" about a word they read
      // perfectly. Only ever speak about a word still flagged on screen.
      if (!missedWordsRef.current.includes(targetWord)) {
        setHint(null);
        return;
      }

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

  // Score the page they just read. Returns the updated scores so the caller can
  // use them straight away (React state updates aren't visible until the next render).
  // Every page the child moves on from is scored here, which is the one place
  // a page can be left: handleNext uses it for both Next and Finish.
  //
  // It grades whatever was heard even if the microphone is still on. That is
  // the fix for the bug where nothing was ever scored: this used to require
  // wordResults, which stays null until the mic goes quiet, so pressing Next
  // inside the 3-second silence window - the natural thing to do the moment a
  // child finishes a sentence - silently threw the whole page away.
  function recordPageScore(): Record<number, number> {
    if (pageAccuracy === null) return pageScores; // they never said anything here
    return { ...pageScores, [pageIndex]: pageAccuracy };
  }

  // Page scores in page order, which is the order lib/difficulty.ts expects.
  function scoresInOrder(scores: Record<number, number>): number[] {
    return Object.keys(scores)
      .map(Number)
      .sort((a, b) => a - b)
      .map((index) => scores[index]);
  }

  // The Next button: on the last page it finishes the story instead.
  function handleNext() {
    const updatedScores = recordPageScore();
    setPageScores(updatedScores);

    if (SHOW_DEBUG) {
      console.log("[debug] Next/Finish pressed", {
        pageIndex,
        isLastPage,
        scoredThisPage: wordResults !== null,
      });
    }

    if (isLastPage) {
      finishStory(updatedScores);
    } else {
      goToPage(pageIndex + 1);
    }
  }

  // End of a story: work out the next level, pick the next story, and show the
  // celebration screen.
  function finishStory(finalScores: Record<number, number>) {
    const change = decideLevelChange(scoresInOrder(finalScores));
    const newLevel = nextLevel(level, change);

    // At level 3 there's nowhere higher to go, so show the neutral
    // "Great reading!" instead of promising harder stories we can't hand out.
    // A "down" capped at level 1 still shows its own kind message: that one
    // never mentions levels, so there's nothing misleading about it.
    const shownChange: LevelChange = change === "up" && newLevel === level ? "same" : change;

    if (SHOW_DEBUG) {
      console.log("[debug] finishStory", {
        scores: scoresInOrder(finalScores),
        change,
        levelChange: `${level} -> ${newLevel}`,
        shownChange,
      });
    }

    const idsRead = [...readStoryIds, story.id];

    // One phrasing, chosen here, used by both the screen and the voice.
    const message = pickCelebrationMessage(shownChange);

    stopCoaching();
    resetSpeech();
    setReadStoryIds(idsRead);
    setLevel(newLevel);
    setCelebration({
      change: shownChange,
      level: newLevel,
      // story.id is passed so the story just finished is never handed back.
      nextStory: pickNextStory(stories, newLevel, idsRead, story.id),
      message,
    });

    speak(message.spoken);
  }

  // Leaving the celebration screen: start the next story from page 1 with a
  // clean slate of scores.
  function startNextStory() {
    if (!celebration) return;
    stopCoaching();
    resetSpeech();
    setStory(celebration.nextStory);
    setPageIndex(0);
    setPageScores({});
    setCelebration(null);
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
    // Belt and braces: the button is hidden when there is nothing to coach, so
    // this should be unreachable, but never ask for a correction to a sentence
    // the child read perfectly.
    if (!hasMissedWords) return;

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

  // Between stories we show the celebration screen instead of the reading page.
  if (celebration) {
    return (
      <CelebrationScreen
        message={celebration.message}
        change={celebration.change}
        level={celebration.level}
        nextStoryTitle={celebration.nextStory.title}
        onStart={startNextStory}
      />
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
      {/* Title */}
      <header className="text-center">
        <p className="text-lg font-bold uppercase tracking-widest text-teal-700">
          Reading Coach
        </p>
        <h1 className="mt-2 text-3xl font-bold">{story.title}</h1>
        <p className="mt-2 text-lg text-slate-500">Level {level}</p>
      </header>

      {/* ---------------------- DIAGNOSTIC PANEL ----------------------
          Hidden unless SHOW_DEBUG is on. Shows how the page was scored, what
          is saved, and the level decision - handy if the levelling ever looks
          wrong again. */}
      {SHOW_DEBUG && (
        <section className="rounded-2xl bg-slate-900 p-5 font-mono text-sm leading-6 text-slate-100">
          <p className="mb-2 font-bold text-amber-300">DEBUG - temporary</p>
          <p>
            story {story.id} (a level {story.level} story) &middot; child is on level {level}
          </p>
          <p>
            page {pageIndex + 1} of {story.pages.length} &middot; isLastPage={String(isLastPage)}{" "}
            &middot; button says &quot;{isLastPage ? "Finish ✓" : "Next →"}&quot;
          </p>
          <p>
            this page, graded live:{" "}
            {pageAccuracy === null
              ? "nothing heard yet - read the page"
              : `${Math.round(pageAccuracy * 100)}%`}
            {pageScores[pageIndex] !== undefined
              ? " (saved)"
              : pageAccuracy !== null
                ? " (saves when you press Next/Finish)"
                : ""}
          </p>
          <p>saved so far: [{debugSaved.map((s) => Math.round(s * 100) + "%").join(", ")}]</p>
          <p>
            scores this story: [
            {debugWithThisPage.map((s) => Math.round(s * 100) + "%").join(", ")}]
          </p>
          <p className="font-bold text-amber-300">
            decision if you pressed Finish now: {debugDecision.toUpperCase()}
            {debugWithThisPage.length < PAGES_TO_JUDGE &&
              ` (only ${debugWithThisPage.length} page(s) scored; needs ${PAGES_TO_JUDGE})`}
          </p>
          <p>
            coaching: missed={missedWords.length} &middot; coachIndex={coachIndex} &middot; target=
            {targetWord ?? "none"} &middot; listening={String(isListening)}
          </p>
        </section>
      )}

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
            <span className="text-red-600">● Let&apos;s practice this one</span>
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
          onClick={handleNext}
          className="rounded-2xl border-2 border-slate-300 bg-white px-8 py-4 text-xl font-bold"
        >
          {isLastPage ? "Finish ✓" : "Next →"}
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
            I&apos;m listening… read it out loud!
            <br />
            <span className="text-base text-slate-500">
              Take your time. I&apos;ll stop when you&apos;re done.
            </span>
          </p>
        )}

        {speechError && <p className="text-lg text-rose-600">{speechError}</p>}

        {/* Live transcript */}
        <div className="w-full rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-base font-bold text-slate-500">What I heard:</p>
          <p className="mt-2 min-h-10 text-2xl">
            {transcript || (
              <span className="text-slate-400">
                Press Start Reading, then read the page out loud.
              </span>
            )}
          </p>
        </div>
      </section>

      {/* Hints from the coach. They play automatically, one missed word at a
          time; these buttons are the manual backup.

          The whole section only exists while the page has a word to work on.
          That is what keeps a hint from an earlier attempt sitting under an
          all-green sentence: when the last red word goes, so does the hint,
          the "Hear it again" button and the "Get hint" button with it. */}
      {hasMissedWords && (
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
      )}
    </main>
  );
}
