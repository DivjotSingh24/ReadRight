"use client";

// A small React hook that wraps the browser's Web Speech API.
//
// It gives the page:
//   - transcript:     the words heard so far (updates live while the kid talks)
//   - isListening:    true while the microphone is on
//   - error:          a friendly message if something went wrong, otherwise null
//   - startListening: turn the mic on and start a fresh transcript
//   - stopListening:  turn the mic off (keeps the words heard so far)
//   - reset:          turn the mic off AND clear everything (used when changing pages)
//
// Note: Chrome and Edge support this (as `webkitSpeechRecognition`), and so
// does Safari. Firefox does not. Chrome sends the audio to Google's servers to
// turn it into text, so it needs an internet connection.

import { useEffect, useRef, useState } from "react";

// --- Minimal TypeScript types for the Web Speech API ---
// TypeScript doesn't ship types for speech recognition, so we describe just
// the parts we use.

type SpeechResultEvent = {
  // A list of results. Each result is a list of guesses; [0] is the best guess.
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechErrorEvent = {
  error: string; // e.g. "not-allowed", "no-speech", "aborted"
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void; // stop listening, but still deliver the last words heard
  abort(): void; // stop listening and throw away any pending words
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

// Find the speech recognition class in this browser, or null if there isn't one.
function getSpeechRecognitionClass(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// --- The hook ---

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The current recognition object. A ref (not state) because changing it
  // shouldn't re-render the page.
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // If the page goes away while listening, turn the microphone off.
  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  function startListening() {
    const SpeechRecognition = getSpeechRecognitionClass();
    if (!SpeechRecognition) {
      setError("Sorry, this browser can't listen yet. Please try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true; // keep listening through short pauses
    recognition.interimResults = true; // show words while the kid is still talking

    // Called every time the browser has new (or updated) words.
    // We rebuild the whole transcript from all results so far.
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return; // we stopped it on purpose
      if (event.error === "not-allowed") {
        setError("The microphone is blocked. Please allow microphone access and try again.");
      } else if (event.error === "no-speech") {
        setError("I didn't hear anything. Try again!");
      } else {
        setError(`Something went wrong while listening (${event.error}).`);
      }
    };

    // Called when listening ends for any reason (we stopped it, an error,
    // or the browser gave up after a long silence).
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    setTranscript("");
    setError(null);
    recognition.start();
    setIsListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
  }

  function reset() {
    // abort() instead of stop() so leftover words from the old page
    // don't show up after we've cleared the transcript.
    recognitionRef.current?.abort();
    setTranscript("");
    setError(null);
  }

  return { transcript, isListening, error, startListening, stopListening, reset };
}
