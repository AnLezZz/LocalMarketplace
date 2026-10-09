import { ConvexError } from "convex/values";

/** Runs a Convex call from a server action and turns failures into a message for the page. */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const message = e instanceof ConvexError && typeof e.data === "string" ? e.data : "Something went wrong. Please try again.";
    return { ok: false, message };
  }
}
