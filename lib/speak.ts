"use client";

// Reads text out loud using the browser's built-in speech synthesis.
// (Different from speech RECOGNITION in useSpeechRecognition.ts: that one
// listens, this one talks.) Supported in every modern browser.
//
// Only one thing is ever spoken at a time: starting a new one cancels whatever
// was already talking, so hints never overlap.

// A bit slower than normal talking speed, which is easier for a young child
// to follow. 1 is normal; 0.5 is half speed.
const SPEAKING_RATE = 0.85;

// If the browser has no voice at all, we still need to tell the caller
// "finished" after a moment, otherwise a queue of hints would stall forever.
const NO_VOICE_PAUSE_MS = 1500;

// The utterance being spoken right now. We keep it so we can ignore the
// "finished" events of an utterance that was cancelled or replaced.
let currentUtterance: SpeechSynthesisUtterance | null = null;

// Say `text` out loud. `onDone` (optional) runs once the voice finishes.
// It does NOT run if the speech was cancelled or replaced by another hint.
export function speak(text: string, onDone?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    if (onDone) setTimeout(onDone, NO_VOICE_PAUSE_MS);
    return;
  }

  // Stop whatever is being said first, so two hints never talk over each other.
  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = SPEAKING_RATE;
  utterance.pitch = 1.1; // slightly higher: sounds friendlier
  utterance.lang = "en-US";

  // "end" and "error" both mean we've stopped talking. Ignore them if this
  // utterance is no longer the current one (it was cancelled or replaced).
  const finish = () => {
    if (currentUtterance !== utterance) return;
    currentUtterance = null;
    onDone?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  // Forget the current utterance FIRST, so its "finished" event is ignored
  // and nothing treats a cancellation as "the hint finished playing".
  currentUtterance = null;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}
