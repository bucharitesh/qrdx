import { APICallError } from "ai";

// What a visitor sees when the model provider fails mid-stream. The AI SDK
// forwards the provider's raw message by default ("API key not valid…"),
// which is meaningless to visitors and leaks setup details; the real error is
// logged by the route's onError.
export function streamErrorMessage(error: unknown): string {
  if (APICallError.isInstance(error) && error.statusCode === 429) {
    return "The AI is busy right now. Try again in a minute.";
  }
  return "AI generation isn't available right now. Please try again later.";
}
