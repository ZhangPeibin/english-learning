# Learning State

The resolved learning-state file is the durable record for one learner. It is
normally `LEARNING.md`. When that path belongs to another workflow, use a path
chosen by the learner, such as `ENGLISH_LEARNING.md`. Read this reference before
creating or updating the file.

## Rules

- Keep YAML valid and dates in `YYYY-MM-DD` format.
- Use exact lesson IDs from `curriculum/README.md`.
- Record only observed results. Do not invent scores, study time, or completion.
- Preserve learner notes and fields not defined here.
- Keep `weak_areas` specific enough to guide a future exercise.
- Add a learning item only after the learner has attempted or used it. Teaching
  material alone is not response evidence.
- Keep one canonical `learning_items` entry for each vocabulary item, grammar
  point, or sentence pattern. Match entries by normalized meaning and use, not
  spelling alone; update the existing entry instead of creating a duplicate.
- Append an attempt only when the learner actually responded. Record whether
  the response was independent or followed a prompt, hint, model, correction,
  answer choice, or other cue.
- `independent` means the learner responded to a neutral recall or application
  question without an answer-bearing hint in that turn. Instructions, context,
  and a neutral question do not make a response cued. A model answer, target
  form, correction, answer choice, completion frame, or hint that reveals part
  of the answer makes the response `cued`.
- Do not convert a cued success into independent success. Do not mark an item
  mastered after one correct response or after a correction the tutor supplied.
- After every review attempt, update the same item's `due_date`; do not add a
  second learning item or duplicate review entry.
- Treat `review_queue` as a legacy field. Its date may be named `due_date` or
  `due`. Read it when `learning_items` is absent or has no due items. If an
  equivalent canonical item exists, remove the legacy entry from the active
  queue and append it unchanged under a `legacy_review_history` wrapper that
  records the canonical item's ID. Otherwise, after the learner attempts a
  selected legacy vocabulary, grammar, or sentence-pattern item, create the
  canonical item and archive the legacy entry the same way. Archived entries
  never schedule reviews. Preserve every existing history entry, append rather
  than replace, and leave unrelated queue entries intact. The wrapper keeps
  migration metadata separate so learner-authored fields such as `status`,
  `retired_reason`, and `canonical_id` cannot collide or be overwritten. New
  review records belong in `learning_items`.
- A legacy topic outside vocabulary, grammar, or sentence patterns does not
  belong in `learning_items`. Review it from `review_queue`, append or update
  its observed result without deleting unknown fields, and replace its `due`
  or `due_date` after the attempt. Do not duplicate or archive it unless a
  canonical representation for that topic type is defined later.
- Keep adaptive readings out of `completed_lessons` and `current_lesson`.
- Store only useful adaptive-reading metadata by default, not generated passages.
- Record only profile details the learner provides. Do not infer age, location,
  nationality, or language from their writing.
- Use profile details for appropriate personalization, never for cultural or
  ability stereotypes.

## Fields

- `learner`: optional profile details used to personalize teaching.
  - `preferred_name`: how the learner wants to be addressed.
  - `age_or_age_range`: optional age information in the learner's own terms.
  - `country_or_region`: optional location context, not assumed nationality.
  - `native_language`: the learner's first or strongest language.
  - `explanation_language`: the language to use for teaching explanations.
- `goal`: the learner's stated outcome.
- `level`: current CEFR estimate, or `unplaced` before assessment.
- `focus`: ordered list of priorities.
- `study_minutes_per_session`: the learner's available time.
- `current_lesson`: lesson being studied, or `null`.
- `completed_lessons`: evidence-bearing completion records.
- `reading_preferences`: topics and presentation choices for reading practice.
- `reading_history`: concise records of completed adaptive reading sessions.
- `weak_areas`: recurring or important difficulties observed in responses.
- `learning_items`: canonical evidence and review schedule for vocabulary,
  grammar, and sentence patterns.
- `review_queue`: legacy review records retained for compatibility.
- `legacy_review_history`: append-only wrappers for legacy entries removed
  from the active queue after canonical migration. History never schedules a
  review.

Scores are optional integers from 0 to 100. Omit a score when the activity did
not produce enough evidence for one.

Each `reading_history` entry may contain `date`, `level`, `topic`, `result`,
`new_vocabulary`, and `notes`. It must not use a formal curriculum lesson ID.

Each `legacy_review_history` entry contains `canonical_id` and `legacy_entry`.
Copy the complete source queue entry beneath `legacy_entry` without renaming,
removing, or overwriting any of its fields:

```yaml
legacy_review_history:
  - canonical_id: borrow-request
    legacy_entry:
      topic: polite borrowing request
      due: 2026-09-23
      status: learner-authored value
```

## Learning items

Each `learning_items` entry has this shape:

```yaml
- id: borrow-request
  type: sentence_pattern
  item: "Can I borrow your ...?"
  meaning_or_use: "make a polite request to borrow something"
  status: cued
  due_date: 2026-09-24
  attempts:
    - date: 2026-09-23
      prompt: "Ask a classmate for an eraser."
      response: "Can I borrow your eraser?"
      result: correct
      support: cued
```

- `id` is a stable, concise identifier. Reuse it across later attempts.
- `type` is `vocabulary`, `grammar`, or `sentence_pattern`.
- `item` names the word, grammar point, or reusable pattern.
- `meaning_or_use` distinguishes items that have the same spelling but a
  different meaning or function.
- `status` is `needs_work`, `cued`, `independent`, or `mastered`.
- `due_date` is the next review date in `YYYY-MM-DD` format, calculated from
  the attempt's `date` in the learner's local calendar. Ask for the learner's
  timezone or local date only when the date boundary is uncertain and affects
  scheduling; do not infer a location from language.
- `attempts` is an append-only list of observed learner responses. Each attempt
  records `date`, the concise `prompt`, the learner's actual `response`,
  `result` (`correct`, `partial`, or `incorrect`), and `support` (`cued` or
  `independent`). Preserve additional attempt fields if present.

Use these conservative scheduling defaults unless the learner has explicitly
chosen different review intervals. An existing item's current `due_date` is
not an interval override: after each attempt, replace it with the newly
calculated date. Preserve an explicit learner interval preference and apply it
from the current attempt date.

- Incorrect or partial: set `status: needs_work` and review the next day.
- Correct with any cue: set `status: cued` and review the next day.
- First correct independent response: set `status: independent` and review in
  3 days.
- A later correct independent response on a different date and in a new
  example: keep `status: independent` and review in 7 days.
- Only after at least three correct independent attempts on different dates and
  in varied examples: set `status: mastered` and review in 14 days.

When choosing an activity, first select a due learning item whose `due_date` is
today or earlier. Prefer the earliest date, then `needs_work`, `cued`,
`independent`, and `mastered` in that order. Ask for recall or application in a
new example without exposing the saved answer. If no learning item is due, use
the ordinary course or adaptive-practice workflow. A learner may still ask to
review an item before its due date.
