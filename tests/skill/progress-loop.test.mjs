import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTrace, reviewDueDate } from "./check.mjs";

const state = ({ due = "2026-09-24", legacy = "review_queue: []" } = {}) => `
current_lesson: null
completed_lessons: []
${legacy}
learning_items:
  - id: borrow-request
    type: sentence_pattern
    item: "Can I borrow your ...?"
    meaning_or_use: "make a polite borrowing request"
    status: cued
    due_date: ${due}
    attempts:
      - date: 2026-09-23
        prompt: "Ask for an eraser."
        response: "Can I borrow your eraser?"
        result: correct
        support: cued
last_studied: 2026-09-23
`;

function progressTrace(finalState, finalReply = "What would you say?") {
  return {
    scenarioId: "progress",
    turns: Array.from({ length: 7 }, (_, index) => ({
      turn: index + 1,
      exitCode: 0,
      reply: index === 6 ? finalReply : "Continue?",
      threadId: index < 6 ? "first" : "fresh",
      state: index >= 5 ? finalState : null
    }))
  };
}

test("canonical evidence passes without a legacy queue entry", () => {
  const checks = evaluateTrace(progressTrace(state()));
  assert.deepEqual(checks.filter(({ outcome }) => outcome === "fail"), []);
  assert.equal(checks.some(({ name }) => name === "Fresh-thread reply starts a due review task"), false);
});

test("an active legacy duplicate is rejected after canonical conversion", () => {
  const legacy = `review_queue:\n  - topic: borrow request\n    due: 2026-09-23`;
  const checks = evaluateTrace(progressTrace(state({ legacy })));
  assert.equal(checks.find(({ name }) => name.includes("legacy duplicate"))?.outcome, "fail");
});

test("a due canonical item requires a specific fresh-session review", () => {
  const checks = evaluateTrace(progressTrace(state({ due: "2026-09-23" }), "What would you say?"));
  assert.equal(checks.find(({ name }) => name === "Fresh-thread reply starts a due review task")?.outcome, "fail");
});

test("legacy due and due_date spellings are accepted", () => {
  assert.equal(reviewDueDate("learning_items: []\nreview_queue:\n  - due: 2026-09-22\n"), "2026-09-22");
  assert.equal(reviewDueDate("learning_items: []\nreview_queue:\n  - due_date: 2026-09-21\n"), "2026-09-21");
});
