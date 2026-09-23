import assert from "node:assert/strict";
import test from "node:test";
import { activeLegacyEntries, evaluateTrace, reviewDueDate } from "./check.mjs";

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

function progressTrace(finalState, {
  finalReply = "What would you say?",
  localDate = "2026-09-23",
  stateBefore = finalState
} = {}) {
  return {
    scenarioId: "progress",
    turns: Array.from({ length: 7 }, (_, index) => ({
      turn: index + 1,
      exitCode: 0,
      reply: index === 6 ? finalReply : "Continue?",
      threadId: index < 6 ? "first" : "fresh",
      localDate: index === 6 ? localDate : "2026-09-23",
      stateBefore: index === 6 ? stateBefore : null,
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

test("legacy conversion retires the source without losing unknown or unrelated entries", () => {
  const legacyBefore = `current_lesson: null
completed_lessons: []
learning_items: []
review_queue:
  - topic: borrow request
    due: 2026-09-23
    learner_example: "my blue ruler"
  - topic: pronunciation confidence
    due_date: 2026-09-25
    coach_note: "learner asked to revisit"
last_studied: 2026-09-22
`;
  const legacy = `review_queue:
  - topic: borrow request
    due: 2026-09-23
    learner_example: "my blue ruler"
    status: retired
    retired_reason: migrated
    canonical_id: borrow-request
  - topic: pronunciation confidence
    due_date: 2026-09-25
    coach_note: "learner asked to revisit"`;
  const converted = state({ legacy });
  const checks = evaluateTrace(progressTrace(converted, {
    finalReply: "请用 borrow 写一句话。",
    stateBefore: legacyBefore
  }));
  assert.deepEqual(checks.filter(({ outcome }) => outcome === "fail"), []);
  assert.match(converted, /learner_example: "my blue ruler"/);
  assert.match(converted, /canonical_id: borrow-request/);
  assert.deepEqual(activeLegacyEntries(legacy).map((entry) => entry.match(/topic:\s*([^\n]+)/)?.[1]), ["pronunciation confidence"]);
  assert.match(activeLegacyEntries(legacy)[0], /coach_note: "learner asked to revisit"/);
});

test("a seeded overdue item requires a specific fresh-session review from pre-turn state", () => {
  const seeded = state({ due: "2026-09-23" });
  const checks = evaluateTrace(progressTrace(state({ due: "2026-09-25" }), {
    finalReply: "What would you say?",
    localDate: "2026-09-24",
    stateBefore: seeded
  }));
  assert.equal(checks.find(({ name }) => name === "Fresh-thread reply starts a due review task")?.outcome, "fail");
});

test("legacy due and due_date spellings are accepted", () => {
  assert.equal(reviewDueDate("learning_items: []\nreview_queue:\n  - due: 2026-09-22\n"), "2026-09-22");
  assert.equal(reviewDueDate("learning_items: []\nreview_queue:\n  - due_date: 2026-09-21\n"), "2026-09-21");
});
