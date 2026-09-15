// POST /api/coach
//
// ARCHITECTURE RULE: this route is the ONLY place in the app that will ever
// talk to an AI provider. React components call this route with
// fetch("/api/coach") and never call an AI directly. Because this code runs on
// the server, any API keys we add later stay secret and never reach the browser.
//
// DAY 1: this is a STUB. It reads the JSON the page sends, ignores it, and
// returns a hardcoded hint. To add real AI later, edit only this file.

// The shape of the JSON the page sends us.
export type CoachRequest = {
  pageText: string; // the sentence(s) the kid is supposed to read
  transcript: string; // what the speech recognition heard them say
};

// The shape of the JSON we send back.
export type CoachResponse = {
  hint: string;
};

export async function POST(request: Request) {
  // Parse the JSON body. If it isn't valid JSON, reply with a 400 error.
  let body: CoachRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  // Logs in the terminal running `npm run dev`, so you can see the wiring works.
  console.log("[/api/coach] received:", body);

  // TODO (later): send body.pageText and body.transcript to the AI here,
  // and put its answer in `hint`.
  const response: CoachResponse = {
    hint: "Great try! Point to each word with your finger as you read it.",
  };

  return Response.json(response);
}
