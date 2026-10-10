import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export const questionValidator = v.object({
  id: v.string(), label: v.string(), type: v.union(v.literal("text"), v.literal("choice"), v.literal("yesno")),
  required: v.boolean(), options: v.optional(v.array(v.string())),
});
export const answerArg = v.object({ id: v.string(), value: v.string() });
/** What a booking keeps: the question's words as they were when it was asked, so a later edit never rewrites history. */
export const answerValidator = v.object({ label: v.string(), type: v.union(v.literal("text"), v.literal("choice"), v.literal("yesno")), value: v.string() });

export type Question = { id: string; label: string; type: "text" | "choice" | "yesno"; required: boolean; options?: string[] };
export const MAX_QUESTIONS = 8;
const MAX_ANSWER = 500;

/** Cleans what a provider typed into the question editor. Choice options are trimmed, de-duplicated and counted. */
export function validateQuestions(input: { id: string; label: string; type: Question["type"]; required: boolean; options?: string[] }[] | undefined): Question[] {
  const list = input ?? [];
  if (list.length > MAX_QUESTIONS) throw new ConvexError(`Ask at most ${MAX_QUESTIONS} questions`);
  const seen = new Set<string>();
  return list.map((q) => {
    const label = q.label.trim();
    if (!label) throw new ConvexError("Every question needs its wording");
    if (label.length > 120) throw new ConvexError("A question is too long");
    if (!/^[a-z0-9]{1,16}$/.test(q.id) || seen.has(q.id)) throw new ConvexError("Invalid question");
    seen.add(q.id);
    if (q.type !== "choice") return { id: q.id, label, type: q.type, required: q.required };
    const options = [...new Set((q.options ?? []).map((o) => o.trim()).filter(Boolean))];
    if (options.length < 2 || options.length > 10) throw new ConvexError(`"${label}" needs 2 to 10 choices`);
    if (options.some((o) => o.length > 60)) throw new ConvexError("A choice is too long");
    return { id: q.id, label, type: "choice", required: q.required, options };
  });
}

/** Checks a customer's answers against the service's current questions and returns the snapshot to store. Blank optional answers are left out. */
export function snapshotAnswers(service: Doc<"services"> | null, given: { id: string; value: string }[] | undefined): { label: string; type: Question["type"]; value: string }[] {
  const questions = service?.questions ?? [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const values = new Map<string, string>();
  for (const a of given ?? []) {
    if (!byId.has(a.id) || values.has(a.id)) throw new ConvexError("These questions have changed. Go back and check your answers.");
    values.set(a.id, a.value.trim());
  }
  const out: { label: string; type: Question["type"]; value: string }[] = [];
  for (const q of questions) {
    const value = values.get(q.id) ?? "";
    if (!value) { if (q.required) throw new ConvexError(`Answer "${q.label}"`); continue; }
    if (value.length > MAX_ANSWER) throw new ConvexError(`Your answer to "${q.label}" is too long`);
    if (q.type === "choice" && !q.options?.includes(value)) throw new ConvexError(`Choose one of the options for "${q.label}"`);
    if (q.type === "yesno" && value !== "Yes" && value !== "No") throw new ConvexError(`Answer "${q.label}" with Yes or No`);
    out.push({ label: q.label, type: q.type, value });
  }
  return out;
}
