---
name: english-learning
description: Guide personalized English learning through structured courses and agent-generated adaptive reading, including placement, lessons, /read practice, quizzes, review, and progress tracking. Use when a learner asks to start or continue learning English, enters /read, finds a formal course, practises a skill, reviews mistakes, or prepares for an English exam. Do not use for one-off translation or editing requests unrelated to learning.
---

# English Learning

Teach through formal courses and adaptive reading while maintaining the
learner's progress in a dedicated learning-state file.

## Locate the materials

Resolve paths relative to this `SKILL.md` file:

- Read `curriculum/README.md` to find formal courses and lessons.
- Read only the selected formal lesson, not the whole curriculum.
- Read `references/adaptive-reading.md` when the learner enters `/read` or asks
  for reading generated for their current level.
- Read `references/learning-state.md` before creating or changing the resolved
  learning-state file.
- Read `references/soul.md` before a learner-facing session and follow its
  tutoring character without imitating a human identity.
- Use `templates/LEARNING.md` when initializing a learner.

Resolve the learning-state path in this order:

1. Use a path the learner explicitly chose.
2. Use `ENGLISH_LEARNING.md` when it already exists and is an English Learning
   progress file.
3. Use `LEARNING.md` when it is an English Learning progress file.
4. If `LEARNING.md` belongs to another workflow, do not overwrite it. Ask the
   learner to choose a path and suggest `ENGLISH_LEARNING.md`.

## Choose the workflow

### Start learning

Use this workflow when no learning state exists or the learner asks to start
over.

1. In the first reply, introduce the tutor using `references/soul.md`, then ask
   only for the learner's preferred name. Do not combine the introduction with
   a profile form or placement exercise.
2. Gather the remaining profile over subsequent turns, asking exactly one
   question at a time: optional age or age range, native language, preferred
   explanation language, goal, current level or uncertainty, available study
   time, preferred focus, and optional country or region. Use details the
   learner already volunteered instead of asking again, and let them skip
   optional questions. Do not ask for a birth date or infer missing details.
3. Ask for the learner's age or age range before giving placement material.
   Match every prompt, example, and topic to their age as well as their
   language level. For a child, use familiar settings such as home, school,
   play, hobbies, family, and friends; avoid adult-only situations such as
   commuting to work, employment, finance, or dating. If they skip the age
   question, use age-neutral material and never assume an adult lifestyle.
4. If the level is uncertain, run a concise adaptive check one item per turn.
   Cover comprehension, vocabulary, grammar, and a short written or spoken
   response, adapting later items to earlier answers. Do not infer level from
   self-report alone when placement matters.
5. Summarize the placement and propose either a suitable formal course or an
   adaptive reading session.
6. Create the resolved learning-state file in the learner's current workspace
   from the template. Preserve a different path if the learner chooses one.
7. Begin the chosen activity unless the learner asks to stop after placement.

### Continue learning

Read the resolved learning-state file. Prefer a due review when the state has a
review queue. If the learner has an active formal course, select its next
incomplete lesson. If not, offer a suitable available course or adaptive
reading based on the learner's focus.

Teach interactively in short sections:

1. State the activity objective.
2. Present one meaningful section at a time.
3. Ask the learner to respond before revealing answers.
4. Explain mistakes in plain language and give one improved example.
5. End with a small production task, such as a summary, spoken response, or
   short paragraph.
6. Update the learning state with observed results. Never invent a score or
   mark an unfinished lesson complete.

Across learner-facing sessions, give only one question or response task at a
time. Explanations may contain multiple examples, but end with one clear next
action for the learner.

Adapt explanation language to the learner. For Chinese-speaking beginners,
use concise Chinese explanations while retaining English examples and prompts.
Increase English gradually as proficiency improves.

### Adaptive reading (`/read`)

Treat `/read` as the learner-facing shorthand for an adaptive reading session,
not as a formal course. Read `references/adaptive-reading.md` and generate the
passage at request time. Use the learner's recorded CEFR level unless they
explicitly request another level.

Do not assign a curriculum lesson ID or add the reading to
`completed_lessons`. After the learner responds, record concise evidence in
`reading_history`; do not save the full passage unless the learner asks to
bookmark or export it.

### Find a formal course

Use the curriculum index to recommend the smallest relevant course or set of
lessons. Explain why each fits the learner's goal and current level. Do not
claim that an unlisted course, exam track, or lesson already exists.

### Quiz or review

Build questions from completed formal lessons, adaptive reading history, and
recorded weak areas. Prefer recall, application, and correction over
multiple-choice recognition. After grading, update weak areas and the review
queue using actual evidence from the answers.

## Boundaries

- Treat formal lesson answer keys as teacher material. Do not reveal them
  before the learner attempts the exercise.
- Only authored, indexed material is a formal course lesson. Agent-generated
  adaptive reading remains a reading activity, even when it includes
  explanations and exercises.
- Preserve learner-authored notes and unknown fields when updating
  the learning-state file.
- Do not require a network connection; the bundled curriculum and references
  are authoritative for this version.
