import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [skill, stateReference, template] = await Promise.all([
  readFile(new URL("../../SKILL.md", import.meta.url), "utf8"),
  readFile(new URL("../../references/learning-state.md", import.meta.url), "utf8"),
  readFile(new URL("../../templates/LEARNING.md", import.meta.url), "utf8")
]);

test("the learner template exposes one canonical learning item collection", () => {
  assert.match(template, /^learning_items: \[\]$/m);
  assert.equal((template.match(/^learning_items:/gm) ?? []).length, 1);
});

test("the learning item contract retains evidence, support, status, and scheduling", () => {
  for (const field of ["type", "item", "meaning_or_use", "status", "due_date", "attempts", "response", "result", "support"]) {
    assert.match(stateReference, new RegExp(`(?:^|\\s)${field}:`), `missing ${field}`);
  }
  assert.match(stateReference, /support` \(`cued` or\s+`independent`\)/);
  assert.match(stateReference, /at least three correct independent attempts on different dates/);
  assert.match(stateReference, /update the existing entry instead of creating a duplicate/);
});

test("the teaching workflow selects due items and preserves legacy state", () => {
  assert.match(skill, /Select due review from `learning_items`/);
  assert.match(skill, /fall back to a due legacy `review_queue`/);
  assert.match(skill, /append the observed attempt to the same learning item/);
  assert.match(skill, /preserve legacy and unknown\s+fields/i);
});
