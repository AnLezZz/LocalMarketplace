"use client";
import { useState } from "react";

export type Question = { id: string; label: string; type: "text" | "choice" | "yesno"; required: boolean; options?: string[] };
const MAX = 8;
const newId = () => Math.random().toString(36).slice(2, 10);

/** The questions a provider asks before a booking. The whole list travels as one JSON field that the server action reads. */
export default function ServiceQuestionFields({ questions: initial = [] }: { questions?: Question[] }) {
  const [rows, setRows] = useState<(Question & { text: string })[]>(initial.map((q) => ({ ...q, text: (q.options ?? []).join("\n") })));
  const patch = (id: string, change: Partial<Question & { text: string }>) => setRows((r) => r.map((q) => (q.id === id ? { ...q, ...change } : q)));
  const value = JSON.stringify(rows.map(({ text, ...q }) => ({ ...q, ...(q.type === "choice" ? { options: text.split("\n") } : { options: undefined }) })));
  return (
    <fieldset className="svc-q">
      <legend className="field__label">Questions for the customer (optional)</legend>
      <p className="field__hint">Ask what you need to know before a job, such as the number of rooms. Answers are saved with each booking.</p>
      <input type="hidden" name="questions" value={value} />
      {rows.map((q, i) => (
        <div className="svc-q__row" key={q.id}>
          <div className="field"><label htmlFor={`ql-${q.id}`} className="field__label">Question {i + 1}</label>
            <input id={`ql-${q.id}`} value={q.label} maxLength={120} placeholder="e.g. How many rooms need painting?" onChange={(e) => patch(q.id, { label: e.target.value })} /></div>
          <div className="svc-q__opts">
            <div className="field"><label htmlFor={`qt-${q.id}`} className="field__label">Answer type</label>
              <select id={`qt-${q.id}`} value={q.type} onChange={(e) => patch(q.id, { type: e.target.value as Question["type"] })}>
                <option value="text">Short answer</option><option value="choice">Choose one</option><option value="yesno">Yes or no</option>
              </select></div>
            <label className="svc-q__req"><input type="checkbox" checked={q.required} onChange={(e) => patch(q.id, { required: e.target.checked })} />Required</label>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setRows((r) => r.filter((x) => x.id !== q.id))} aria-label={`Remove question ${i + 1}`}>Remove</button>
          </div>
          {q.type === "choice" && (
            <div className="field"><label htmlFor={`qo-${q.id}`} className="field__label">Choices (one per line, 2 to 10)</label>
              <textarea id={`qo-${q.id}`} rows={3} value={q.text} onChange={(e) => patch(q.id, { text: e.target.value })} placeholder={"Matte\nGloss"} /></div>
          )}
        </div>
      ))}
      <button type="button" className="btn btn--secondary btn--sm" disabled={rows.length >= MAX} onClick={() => setRows((r) => [...r, { id: newId(), label: "", type: "text", required: false, text: "" }])}>
        {rows.length >= MAX ? `Up to ${MAX} questions` : "Add a question"}
      </button>
    </fieldset>
  );
}
